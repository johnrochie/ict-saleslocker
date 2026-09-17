// ============================================================
// ICT SalesIQ — Bullhorn API Client
// ============================================================
//
// Bullhorn's auth is a two-step layer on top of standard OAuth2:
//   1. Authorization Code grant (BULLHORN_AUTH_URL /authorize and
//      /token) gets a refreshable access_token, same shape as Xero.
//   2. That access_token must then be exchanged for a REST session
//      (BULLHORN_LOGIN_URL /login), which returns a BhRestToken +
//      a per-session restUrl. The REST session is short-lived
//      (~1hr) and separate from the OAuth token — refreshing the
//      OAuth token does NOT refresh the REST session; a fresh
//      /login call is required whenever it lapses.
//
// BULLHORN_AUTH_URL / BULLHORN_LOGIN_URL default to Bullhorn's
// standard entry points. Some instances (older accounts, certain
// data centres) use a different host — confirm against this
// account's Bullhorn REST API documentation if login fails.

import { createAdminSupabaseClient } from '@/lib/supabase/server'

const AUTH_URL = process.env.BULLHORN_AUTH_URL ?? 'https://auth.bullhornstaffing.com/oauth'
const LOGIN_URL = process.env.BULLHORN_LOGIN_URL ?? 'https://rest.bullhornstaffing.com/rest-services/login'

// REST sessions are documented as ~1hr and slide forward on use;
// treat 50 minutes as the safe re-login point.
const REST_SESSION_TTL_MS = 50 * 60 * 1000

export function isBullhornConfigured(): boolean {
  return !!(
    process.env.BULLHORN_CLIENT_ID &&
    process.env.BULLHORN_CLIENT_SECRET &&
    process.env.BULLHORN_REDIRECT_URI
  )
}

function requireConfig() {
  if (!isBullhornConfigured()) {
    throw new Error(
      'Bullhorn credentials missing. Set BULLHORN_CLIENT_ID, BULLHORN_CLIENT_SECRET, BULLHORN_REDIRECT_URI.'
    )
  }
}

export function getConsentUrl(state = 'saleslocker'): string {
  requireConfig()
  const params = new URLSearchParams({
    client_id: process.env.BULLHORN_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.BULLHORN_REDIRECT_URI!,
    state,
  })
  return `${AUTH_URL}/authorize?${params.toString()}`
}

interface BullhornSession {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string // ISO
  bhRestToken: string
  restUrl: string
  restTokenExpiresAt: string // ISO
}

async function saveSession(session: BullhornSession) {
  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('bullhorn_tokens').insert({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    token_expires_at: session.accessTokenExpiresAt,
    bh_rest_token: session.bhRestToken,
    rest_url: session.restUrl,
    rest_token_expires_at: session.restTokenExpiresAt,
  })
  if (error) throw new Error(`Failed to save Bullhorn session: ${error.message}`)
}

async function restLogin(accessToken: string): Promise<{ bhRestToken: string; restUrl: string }> {
  const params = new URLSearchParams({ version: '2.0', access_token: accessToken })
  const res = await fetch(`${LOGIN_URL}?${params.toString()}`)
  if (!res.ok) throw new Error(`Bullhorn REST login failed: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return { bhRestToken: body.BhRestToken, restUrl: body.restUrl }
}

async function exchangeCode(code: string) {
  requireConfig()
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.BULLHORN_CLIENT_ID!,
    client_secret: process.env.BULLHORN_CLIENT_SECRET!,
    redirect_uri: process.env.BULLHORN_REDIRECT_URI!,
  })
  const res = await fetch(`${AUTH_URL}/token?${params.toString()}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Bullhorn token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function refreshOAuthToken(refreshToken: string) {
  requireConfig()
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.BULLHORN_CLIENT_ID!,
    client_secret: process.env.BULLHORN_CLIENT_SECRET!,
  })
  const res = await fetch(`${AUTH_URL}/token?${params.toString()}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Bullhorn token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

// Completes the OAuth consent flow: exchanges the auth code for a token,
// immediately opens a REST session with it, and stores both. Called from
// the callback route.
export async function handleCallback(code: string): Promise<BullhornSession> {
  const token = await exchangeCode(code)
  const { bhRestToken, restUrl } = await restLogin(token.access_token)
  const now = Date.now()

  const session: BullhornSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessTokenExpiresAt: new Date(now + token.expires_in * 1000).toISOString(),
    bhRestToken,
    restUrl,
    restTokenExpiresAt: new Date(now + REST_SESSION_TTL_MS).toISOString(),
  }
  await saveSession(session)
  return session
}

// Loads the most recently stored session, refreshing the OAuth token
// and/or re-establishing the REST session as needed, and returns the
// { restUrl, bhRestToken } pair ready to use against the REST API.
export async function getConnectedSession(): Promise<{ restUrl: string; bhRestToken: string }> {
  const admin = createAdminSupabaseClient()
  const { data: stored, error } = await admin
    .from('bullhorn_tokens')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load Bullhorn session: ${error.message}`)
  if (!stored) throw new Error('No Bullhorn connection found. Visit /api/bullhorn/connect to authorise.')

  const oauthExpired = new Date(stored.token_expires_at).getTime() < Date.now()
  const restExpired =
    !stored.rest_token_expires_at || new Date(stored.rest_token_expires_at).getTime() < Date.now()

  if (oauthExpired) {
    const refreshed = await refreshOAuthToken(stored.refresh_token)
    const login = await restLogin(refreshed.access_token)
    const session: BullhornSession = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      bhRestToken: login.bhRestToken,
      restUrl: login.restUrl,
      restTokenExpiresAt: new Date(Date.now() + REST_SESSION_TTL_MS).toISOString(),
    }
    await saveSession(session)
    return { restUrl: session.restUrl, bhRestToken: session.bhRestToken }
  }

  if (restExpired) {
    const login = await restLogin(stored.access_token)
    const session: BullhornSession = {
      accessToken: stored.access_token,
      refreshToken: stored.refresh_token,
      accessTokenExpiresAt: stored.token_expires_at,
      bhRestToken: login.bhRestToken,
      restUrl: login.restUrl,
      restTokenExpiresAt: new Date(Date.now() + REST_SESSION_TTL_MS).toISOString(),
    }
    await saveSession(session)
    return { restUrl: session.restUrl, bhRestToken: session.bhRestToken }
  }

  return { restUrl: stored.rest_url, bhRestToken: stored.bh_rest_token }
}

// Thin GET helper for Bullhorn's `query` REST endpoints — appends
// BhRestToken automatically. `path` is relative to restUrl, e.g.
// '/query/JobOrder'.
export async function bullhornGet<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
  const { restUrl, bhRestToken } = await getConnectedSession()
  const query = new URLSearchParams({ ...params, BhRestToken: bhRestToken })
  const res = await fetch(`${restUrl}${path}?${query.toString()}`)
  if (!res.ok) throw new Error(`Bullhorn API error on ${path}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}
