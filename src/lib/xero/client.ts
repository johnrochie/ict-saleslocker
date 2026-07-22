// ============================================================
// ICT SalesIQ — Xero API Client
// ============================================================

import { XeroClient, TokenSet } from 'xero-node'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

// Xero replaced the broad accounting.transactions/accounting.settings scopes
// with a granular set for apps created after 2 March 2026. Starting with a
// minimal, high-confidence set to prove connectivity — Purchase Orders scope
// name is unconfirmed and will be added once this set is verified working.
const SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.contacts',
  'accounting.settings',
  'accounting.invoices.read',
  'offline_access',
]

export function isXeroConfigured(): boolean {
  return !!(
    process.env.XERO_CLIENT_ID &&
    process.env.XERO_CLIENT_SECRET &&
    process.env.XERO_REDIRECT_URI
  )
}

function newXeroClient(): XeroClient {
  if (!isXeroConfigured()) {
    throw new Error(
      'Xero credentials missing. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI.'
    )
  }
  return new XeroClient({
    clientId: process.env.XERO_CLIENT_ID!,
    clientSecret: process.env.XERO_CLIENT_SECRET!,
    redirectUris: [process.env.XERO_REDIRECT_URI!],
    scopes: SCOPES,
  })
}

export async function getConsentUrl(): Promise<string> {
  const xero = newXeroClient()
  await xero.initialize()
  return xero.buildConsentUrl()
}

async function saveToken(tenantId: string, tenantName: string | null, tokenSet: TokenSet) {
  const admin = createAdminSupabaseClient()
  const expiresAt = new Date(
    (tokenSet.expires_at ?? Math.floor(Date.now() / 1000) + 1800) * 1000
  ).toISOString()

  const { error } = await admin.from('xero_tokens').upsert(
    {
      tenant_id: tenantId,
      tenant_name: tenantName,
      access_token: tokenSet.access_token,
      refresh_token: tokenSet.refresh_token,
      id_token: tokenSet.id_token ?? null,
      scope: Array.isArray(tokenSet.scope) ? tokenSet.scope.join(' ') : (tokenSet.scope ?? null),
      token_type: tokenSet.token_type ?? null,
      expires_at: expiresAt,
    },
    { onConflict: 'tenant_id' }
  )
  if (error) throw new Error(`Failed to save Xero token: ${error.message}`)
}

// Completes the OAuth consent flow and stores one token row per connected
// Xero organisation (tenant). Called from the callback route.
export async function handleCallback(callbackUrl: string) {
  const xero = newXeroClient()
  await xero.initialize()
  const tokenSet = await xero.apiCallback(callbackUrl)
  await xero.setTokenSet(tokenSet)
  const tenants = await xero.updateTenants(false)

  for (const tenant of tenants) {
    await saveToken(tenant.tenantId, tenant.tenantName ?? null, tokenSet)
  }

  return tenants
}

// Loads the stored token for the connected tenant, refreshing it first if
// expired, and returns a ready-to-use client + tenantId.
export async function getConnectedClient(): Promise<{ xero: XeroClient; tenantId: string }> {
  const admin = createAdminSupabaseClient()
  const { data: stored, error } = await admin
    .from('xero_tokens')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load Xero token: ${error.message}`)
  if (!stored) throw new Error('No Xero connection found. Visit /api/xero/connect to authorise.')

  const xero = newXeroClient()
  await xero.initialize()

  const tokenSet = new TokenSet({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    id_token: stored.id_token ?? undefined,
    scope: stored.scope ?? undefined,
    token_type: stored.token_type ?? undefined,
    expires_at: Math.floor(new Date(stored.expires_at).getTime() / 1000),
  })

  await xero.setTokenSet(tokenSet)

  if (tokenSet.expired()) {
    const refreshed = await xero.refreshToken()
    await saveToken(stored.tenant_id, stored.tenant_name, refreshed)
  }

  return { xero, tenantId: stored.tenant_id }
}
