// ============================================================
// ICT SalesIQ — Autotask charges/billing sync (customer side)
// Read-only against Autotask. Writes only to autotask_* tables.
// Reuses AutotaskClient but nothing else from src/lib/autotask/.
//
// Two modes:
//  - full        : first run, or forced. Pulls charges/billing items
//                  from 1 Jan of (this year - AUTOTASK_QPO_WINDOW_YEARS).
//  - incremental : every run after a successful full one. Pulls only
//                  rows created/changed in the last
//                  AUTOTASK_QPO_LOOKBACK_DAYS (default 45), so legacy
//                  data isn't re-fetched. The lookback overlaps the
//                  daily cron on purpose, so a missed run self-heals.
//
// Field names follow the spec and are validated by use: the full run
// worked against the live instance on first deploy.
// ============================================================

import { AutotaskClient, FILTER_ALL } from '@/lib/autotask/client'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  transformCharge, transformBillingItem, transformTicket, transformInvoice,
} from './transform'
import type {
  AutotaskTicketCharge, AutotaskBillingItem, AutotaskTicketLite, AutotaskInvoiceLite,
  ChargesSyncResult,
} from './types'

export const QPO_LOG_FILE = 'autotask-charges'

const BATCH_SIZE = 500
const ID_CHUNK   = 200   // ids per "in" filter when fetching referenced rows

const WINDOW_YEARS  = Number(process.env.AUTOTASK_QPO_WINDOW_YEARS ?? 1)
const LOOKBACK_DAYS = Number(process.env.AUTOTASK_QPO_LOOKBACK_DAYS ?? 45)

type Admin  = ReturnType<typeof createAdminSupabaseClient>
type Errors = ChargesSyncResult['errors']
type Mode   = ChargesSyncResult['mode']

async function upsertBatches(
  admin: Admin, table: string, rows: Record<string, unknown>[], errors: Errors,
): Promise<number> {
  // Dedupe on autotask_id so one batch can't hit the same row twice.
  const byId = new Map<number, Record<string, unknown>>()
  rows.forEach(r => byId.set(r.autotask_id as number, r))
  const unique = Array.from(byId.values())

  let done = 0
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    const { error } = await admin.from(table).upsert(batch, { onConflict: 'autotask_id' })
    if (error) errors.push({ row: i, message: `${table}: ${error.message}` })
    else done += batch.length
  }
  return done
}

function msg(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 160) : String(err)
}

// Run one or more filters against an entity and merge the results by id.
// Used for incremental mode, where "new OR changed" is expressed as separate
// queries rather than an untested nested OR filter.
async function queryUnion<T extends { id?: number }>(
  client: AutotaskClient, entity: string, filters: unknown[][], errors: Errors,
): Promise<T[]> {
  const byId = new Map<number, T>()
  for (const f of filters) {
    try {
      const rows = await client.queryAll<T>(entity, f)
      rows.forEach(r => { if (r.id != null) byId.set(r.id, r) })
    } catch (err) {
      errors.push({ row: 0, message: `${entity}: query failed (${msg(err)})` })
    }
  }
  return Array.from(byId.values())
}

// Full mode: windowed query, falling back to unfiltered if Autotask rejects the field.
async function queryWithFallback<T extends { id?: number }>(
  client: AutotaskClient, entity: string,
  windowed: unknown[], fallback: unknown[], errors: Errors,
): Promise<T[]> {
  try {
    return await client.queryAll<T>(entity, windowed)
  } catch (err) {
    errors.push({ row: 0, message: `${entity}: windowed query failed, fetched unfiltered instead (${msg(err)})` })
    return await client.queryAll<T>(entity, fallback)
  }
}

async function fetchByIds<T extends { id?: number }>(
  client: AutotaskClient, entity: string, ids: number[],
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    out.push(...await client.queryAll<T>(entity, [{ op: 'in', field: 'id', value: chunk }]))
  }
  return out
}

// A full run is needed until one has completed cleanly. 'partial' and
// 'failed' runs don't count, so a bad first run is retried in full.
async function hasCompletedFullRun(admin: Admin): Promise<boolean> {
  const { data } = await admin
    .from('import_logs')
    .select('id')
    .eq('filename', QPO_LOG_FILE)
    .eq('status', 'success')
    .limit(1)
    .maybeSingle()
  return !!data
}

export async function syncCharges(triggeredBy: string, opts: { forceFull?: boolean } = {}): Promise<ChargesSyncResult> {
  const startMs = Date.now()
  const client  = new AutotaskClient()
  const admin   = createAdminSupabaseClient()
  const errors: Errors = []

  const mode: Mode = opts.forceFull || !(await hasCompletedFullRun(admin)) ? 'full' : 'incremental'

  const fullSince = new Date(Date.UTC(new Date().getUTCFullYear() - WINDOW_YEARS, 0, 1)).toISOString()
  const recentSince = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const since = mode === 'full' ? fullSince : recentSince
  console.log(`[autotask-qpo/sync] starting ${mode}. since=${since} triggeredBy=${triggeredBy}`)

  // ── 1. Charges + billing items ───────────────────────────────
  let charges: AutotaskTicketCharge[]
  let billingItems: AutotaskBillingItem[]

  if (mode === 'full') {
    ;[charges, billingItems] = await Promise.all([
      queryWithFallback<AutotaskTicketCharge>(
        client, 'TicketCharges',
        [{ op: 'gte', field: 'createDate', value: since }],
        FILTER_ALL, errors,
      ),
      queryWithFallback<AutotaskBillingItem>(
        client, 'BillingItems',
        [{ op: 'exist', field: 'ticketChargeID' }, { op: 'gte', field: 'itemDate', value: since }],
        [{ op: 'exist', field: 'ticketChargeID' }], errors,
      ),
    ])
  } else {
    // New charges, charges whose cost status moved, billing items dated
    // recently, and billing items posted (invoiced) recently — the last one
    // catches old charges that were only just invoiced.
    ;[charges, billingItems] = await Promise.all([
      queryUnion<AutotaskTicketCharge>(client, 'TicketCharges', [
        [{ op: 'gte', field: 'createDate', value: since }],
        [{ op: 'gte', field: 'statusLastModifiedDate', value: since }],
      ], errors),
      queryUnion<AutotaskBillingItem>(client, 'BillingItems', [
        [{ op: 'exist', field: 'ticketChargeID' }, { op: 'gte', field: 'itemDate', value: since }],
        [{ op: 'exist', field: 'ticketChargeID' }, { op: 'gte', field: 'postedDate', value: since }],
      ], errors),
    ])
  }
  console.log(`[autotask-qpo/sync] fetched ${charges.length} charges, ${billingItems.length} billing items`)

  // ── 2. Only the tickets and invoices these rows point at ─────
  const ticketIds  = [...new Set([
    ...charges.map(c => c.ticketID), ...billingItems.map(b => b.ticketID),
  ].filter((n): n is number => typeof n === 'number'))]
  const invoiceIds = [...new Set(
    billingItems.map(b => b.invoiceID).filter((n): n is number => typeof n === 'number'),
  )]

  const [tickets, invoices] = await Promise.all([
    fetchByIds<AutotaskTicketLite>(client, 'Tickets', ticketIds).catch(err => {
      errors.push({ row: 0, message: `Tickets: ${msg(err)}` })
      return [] as AutotaskTicketLite[]
    }),
    fetchByIds<AutotaskInvoiceLite>(client, 'Invoices', invoiceIds).catch(err => {
      errors.push({ row: 0, message: `Invoices: ${msg(err)}` })
      return [] as AutotaskInvoiceLite[]
    }),
  ])

  // Company names: only the companies these tickets belong to, not the whole table.
  const companyIds = [...new Set(tickets
    .map(t => t.companyID ?? t.accountID)
    .filter((n): n is number => typeof n === 'number'))]
  const companies = await fetchByIds<{ id: number; companyName: string }>(client, 'Companies', companyIds)
    .catch(err => {
      errors.push({ row: 0, message: `Companies: ${msg(err)}` })
      return [] as Array<{ id: number; companyName: string }>
    })
  const companyNames = new Map(companies.map(c => [c.id, c.companyName]))
  console.log(`[autotask-qpo/sync] fetched ${tickets.length} tickets, ${invoices.length} invoices, ${companies.length} companies`)

  // ── 3. Write ─────────────────────────────────────────────────
  const tCount = await upsertBatches(admin, 'autotask_tickets_lite',
    tickets.map(t => transformTicket(t, companyNames)), errors)
  const cCount = await upsertBatches(admin, 'autotask_ticket_charges',
    charges.map(transformCharge), errors)
  const iCount = await upsertBatches(admin, 'autotask_invoices_lite',
    invoices.map(transformInvoice), errors)
  const bCount = await upsertBatches(admin, 'autotask_billing_items',
    billingItems.map(transformBillingItem), errors)

  const written = tCount + cCount + iCount + bCount
  const status: ChargesSyncResult['status'] =
    errors.length === 0 ? 'success' : written > 0 ? 'partial' : 'failed'

  await admin.from('import_logs').insert({
    imported_by:    triggeredBy,
    filename:       QPO_LOG_FILE,
    rows_processed: charges.length + billingItems.length,
    rows_inserted:  written,
    rows_updated:   0,
    rows_skipped:   0,
    error_count:    errors.length,
    errors:         errors.length > 0 ? errors : null,
    status,
  })

  return {
    mode,
    charges: cCount, billing_items: bCount, tickets: tCount, invoices: iCount,
    errors, status, window_since: since, duration_ms: Date.now() - startMs,
  }
}
