// ============================================================
// ICT SalesLocker — Autotask REST API Client
// ============================================================
// Handles:
//  - Zone URL detection (per-tenant API base URL)
//  - Authentication headers
//  - Paginated entity queries
//  - Entity field/picklist fetching
// ============================================================

import type {
  AutotaskField,
  AutotaskQueryResponse,
} from './types'

// Zone detection is cached for the lifetime of the module
// (one module instance per serverless invocation — fine)
let cachedBaseUrl: string | null = null

export class AutotaskClient {
  private readonly username: string
  private readonly secret: string
  private readonly integrationCode: string  // Optional — omitted from headers if not set

  constructor() {
    this.username        = process.env.AUTOTASK_USERNAME         ?? ''
    this.secret          = process.env.AUTOTASK_SECRET           ?? ''
    this.integrationCode = process.env.AUTOTASK_INTEGRATION_CODE ?? ''

    if (!this.username || !this.secret) {
      throw new Error(
        'Autotask credentials missing. Set AUTOTASK_USERNAME and AUTOTASK_SECRET.'
      )
    }
  }

  // ── Static helper so callers can check config before constructing ──
  // Integration code is optional — only username + secret are required to attempt a sync.
  static isConfigured(): boolean {
    return !!(
      process.env.AUTOTASK_USERNAME &&
      process.env.AUTOTASK_SECRET
    )
  }

  // ── Auth headers added to every request ──────────────────────────
  // ApiIntegrationCode is included only when set — Autotask may require it
  // depending on your tenant configuration.
  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'UserName':     this.username,
      'Secret':       this.secret,
    }
    if (this.integrationCode) {
      headers['ApiIntegrationCode'] = this.integrationCode
    }
    return headers
  }

  // ── Detect zone URL (cached across calls in same invocation) ──────
  async getBaseUrl(): Promise<string> {
    if (cachedBaseUrl) return cachedBaseUrl

    const url =
      `https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation` +
      `?user=${encodeURIComponent(this.username)}`

    const res = await fetch(url, { headers: this.authHeaders() })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `Autotask zone detection failed (${res.status}). ` +
        `Check AUTOTASK_USERNAME is correct. Response: ${body.slice(0, 200)}`
      )
    }

    const data = await res.json() as { url: string; webUrl?: string }
    // url ends with /v1.0/ — strip trailing slash for cleaner concatenation
    cachedBaseUrl = (data.url ?? data.webUrl ?? '').replace(/\/+$/, '')
    return cachedBaseUrl
  }

  // ── Generic GET ───────────────────────────────────────────────────
  async get<T>(path: string): Promise<T> {
    const base = await this.getBaseUrl()
    const res = await fetch(`${base}/${path}`, { headers: this.authHeaders() })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 300)}`)
    }

    return res.json() as Promise<T>
  }

  // ── Paginated query — returns ALL matching items ──────────────────
  // Uses POST /Entity/query for first page, then follows nextPageUrl
  async queryAll<T>(entity: string, filter: unknown[]): Promise<T[]> {
    const base  = await this.getBaseUrl()
    const items: T[] = []

    // ── First page ───────────────────────────────────────────────────
    const firstRes = await fetch(`${base}/${entity}/query`, {
      method:  'POST',
      headers: this.authHeaders(),
      body:    JSON.stringify({ filter }),
    })

    if (!firstRes.ok) {
      const body = await firstRes.text().catch(() => '')
      throw new Error(
        `Query ${entity} failed (${firstRes.status}): ${body.slice(0, 300)}`
      )
    }

    const firstPage = await firstRes.json() as AutotaskQueryResponse<T>
    items.push(...(firstPage.items ?? []))

    // ── Subsequent pages (nextPageUrl is a full URL, called as GET) ──
    let nextUrl = firstPage.pageDetails?.nextPageUrl ?? null

    while (nextUrl) {
      const res = await fetch(nextUrl, { headers: this.authHeaders() })

      if (!res.ok) {
        // Don't throw — return what we have so far and warn
        console.warn(`[autotask] Pagination stopped at: ${nextUrl} (${res.status})`)
        break
      }

      const page = await res.json() as AutotaskQueryResponse<T>
      items.push(...(page.items ?? []))
      nextUrl = page.pageDetails?.nextPageUrl ?? null
    }

    return items
  }

  // ── Fetch field definitions (includes picklist values) ───────────
  async getEntityFields(entity: string): Promise<AutotaskField[]> {
    const data = await this.get<{ fields: AutotaskField[] }>(
      `${entity}/entityInformation/fields`
    )
    return data.fields ?? []
  }
}

// ── "Get all records" filter helper ──────────────────────────────
// Autotask requires at least one filter condition. id >= 0 matches everything.
export const FILTER_ALL: unknown[] = [{ op: 'gte', field: 'id', value: 0 }]

// ── "Active records only" filter ─────────────────────────────────
export const FILTER_ACTIVE: unknown[] = [{ op: 'eq', field: 'isActive', value: true }]
