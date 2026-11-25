// ============================================================
// ICT SalesIQ — new customer engagements sync
// Stores recently created Autotask Companies and Quotes so the
// Monthly Business Performance Review can list customers created in the
// last 30 days that have a quote against them.
//
// Companies are already fetched by the opportunity sync, so they are
// passed in rather than queried again. Only companies created inside the
// rolling window are written; rows stay once written, so older reports
// keep their history. Quotes are queried by createDate for the same window.
// Failures here are non-fatal for the opportunity sync.
// ============================================================

import type { AutotaskClient } from './client'
import type { createAdminSupabaseClient } from '@/lib/supabase/server'
import type { AutotaskCompany, AutotaskOpportunity } from './types'

export const CUSTOMERS_LOG_FILE = 'autotask-customers'

const BATCH_SIZE  = 500
// Long enough to cover a few months of monthly reports plus a missed run.
const WINDOW_DAYS = Number(process.env.AUTOTASK_NEW_CUSTOMER_WINDOW_DAYS ?? 400)

type Admin = ReturnType<typeof createAdminSupabaseClient>

export interface CustomersSyncResult {
  customers: number
  quotes: number
  errors: { row: number; message: string }[]
}

interface AutotaskQuote {
  id: number
  name?: string | null
  opportunityID?: number | null
  companyID?: number | null
  accountID?: number | null
  createDate?: string | null
  [key: string]: unknown
}

function msg(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 160) : String(err)
}

function toIso(s: unknown): string | null {
  if (typeof s !== 'string' || !s) return null
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

async function upsertBatches(
  admin: Admin, table: string, rows: Record<string, unknown>[], errors: CustomersSyncResult['errors'],
): Promise<number> {
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await admin.from(table).upsert(batch, { onConflict: 'autotask_id' })
    if (error) errors.push({ row: i, message: `${table}: ${error.message}` })
    else done += batch.length
  }
  return done
}

export async function syncNewCustomers(
  client: AutotaskClient,
  admin: Admin,
  companies: AutotaskCompany[],
  opportunities: AutotaskOpportunity[],
  triggeredBy: string,
): Promise<CustomersSyncResult> {
  const errors: CustomersSyncResult['errors'] = []
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)

  // ── Companies created inside the window ──────────────────────
  const customerRows = companies
    .filter(c => {
      const iso = toIso(c.createDate)
      return iso != null && new Date(iso) >= since
    })
    .map(c => ({
      autotask_id:  c.id,
      company_name: c.companyName?.trim() || `Account#${c.id}`,
      create_date:  toIso(c.createDate),
      is_active:    c.isActive ?? null,
    }))

  // ── Quotes created inside the window ─────────────────────────
  let quotes: AutotaskQuote[] = []
  try {
    quotes = await client.queryAll<AutotaskQuote>('Quotes', [
      { op: 'gte', field: 'createDate', value: since.toISOString() },
    ])
  } catch (err) {
    errors.push({ row: 0, message: `Quotes: query failed (${msg(err)})` })
  }

  // A quote belongs to an opportunity, and the opportunity to a company.
  const companyOfOpp = new Map<number, number>()
  opportunities.forEach(o => {
    const cid = o.accountID ?? (o.companyID as number | undefined)
    if (cid != null) companyOfOpp.set(o.id, cid)
  })

  const quoteRows = quotes.map(q => {
    const direct = q.companyID ?? q.accountID ?? null
    const viaOpp = q.opportunityID != null ? companyOfOpp.get(q.opportunityID) ?? null : null
    return {
      autotask_id:    q.id,
      name:           q.name ?? null,
      opportunity_id: q.opportunityID ?? null,
      company_id:     viaOpp ?? direct,
      create_date:    toIso(q.createDate),
      raw:            q,
    }
  })

  const [customers, quoteCount] = [
    await upsertBatches(admin, 'autotask_customers', customerRows, errors),
    await upsertBatches(admin, 'autotask_quotes', quoteRows, errors),
  ]

  await admin.from('import_logs').insert({
    imported_by:    triggeredBy,
    filename:       CUSTOMERS_LOG_FILE,
    rows_processed: customerRows.length + quoteRows.length,
    rows_inserted:  customers + quoteCount,
    rows_updated:   0,
    rows_skipped:   0,
    error_count:    errors.length,
    errors:         errors.length > 0 ? errors : null,
    status:         errors.length === 0 ? 'success' : customers + quoteCount > 0 ? 'partial' : 'failed',
  })

  return { customers, quotes: quoteCount, errors }
}
