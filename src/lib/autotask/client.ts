// ============================================================
// ICT SalesLocker — Autotask REST API Client
// ============================================================

import type { AutotaskField, AutotaskQueryResponse } from './types'

let cachedBaseUrl: string | null = null

export class AutotaskClient {
  private readonly username: string
  private readonly secret: string
  private readonly integrationCode: string

  constructor() {
    this.username        = process.env.AUTOTASK_USERNAME         ?? ''
    this.secret          = process.env.AUTOTASK_SECRET           ?? ''
    this.integrationCode = process.env.AUTOTASK_INTEGRATION_CODE ?? ''

    if (!this.username || !this.secret) {
      throw new Error('Autotask credentials missing. Set AUTOTASK_USERNAME and AUTOTASK_SECRET.')
    }
  }

  static isConfigured(): boolean {
    return !!(process.env.AUTOTASK_USERNAME && process.env.AUTOTASK_SECRET)
  }

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
    // Zone URL may or may not include /v1.0 — normalise to always have it
    const raw = (data.url ?? data.webUrl ?? '').replace(/\/+$/, '')
    cachedBaseUrl = raw.includes('/v1.0') ? raw : `${raw}/v1.0`
    console.log(`[autotask/client] Base URL: ${cachedBaseUrl}`)
    return cachedBaseUrl
  }

  async get<T>(path: string): Promise<T> {
    const base = await this.getBaseUrl()
    const res = await fetch(`${base}/${path}`, { headers: this.authHeaders() })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`GET ${base}/${path} -> ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.json() as Promise<T>
  }

  async queryAll<T>(entity: string, filter: unknown[]): Promise<T[]> {
    const base     = await this.getBaseUrl()
    const items: T[] = []
    const queryUrl = `${base}/${entity}/query`

    const firstRes = await fetch(queryUrl, {
      method:  'POST',
      headers: this.authHeaders(),
      body:    JSON.stringify({ filter }),
    })

    if (!firstRes.ok) {
      const body = await firstRes.text().catch(() => '')
      throw new Error(
        `Query ${entity} failed (${firstRes.status}) at ${queryUrl} -- ${body.slice(0, 200)}`
      )
    }

    const firstPage = await firstRes.json() as AutotaskQueryResponse<T>
    items.push(...(firstPage.items ?? []))

    let nextUrl = firstPage.pageDetails?.nextPageUrl ?? null
    while (nextUrl) {
      const res = await fetch(nextUrl, { headers: this.authHeaders() })
      if (!res.ok) {
        console.warn(`[autotask] Pagination stopped at: ${nextUrl} (${res.status})`)
        break
      }
      const page = await res.json() as AutotaskQueryResponse<T>
      items.push(...(page.items ?? []))
      nextUrl = page.pageDetails?.nextPageUrl ?? null
    }

    return items
  }

  async getEntityFields(entity: string): Promise<AutotaskField[]> {
    const data = await this.get<{ fields: AutotaskField[] }>(
      `${entity}/entityInformation/fields`
    )
    return data.fields ?? []
  }
}

export const FILTER_ALL: unknown[]    = [{ op: 'gte', field: 'id', value: 1 }]
export const FILTER_ACTIVE: unknown[] = [{ op: 'eq',  field: 'isActive', value: true }]
