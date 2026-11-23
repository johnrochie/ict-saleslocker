// ============================================================
// ICT SalesIQ — Autotask charges/billing sync (customer side)
// Read-only against Autotask. Writes only to autotask_* tables.
// Reuses AutotaskClient but nothing else from src/lib/autotask/.
//
// Not yet validated against the live instance (see spec section 8).
// Window filters are tried first and fall back to an unfiltered
// pull if Autotask rejects the field name, so a wrong field guess
// costs time, not a failed sync.
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
const ID_CHUNK   = 200   // ids per "in" filter when fetching referenced tickets/invoices

// Rolling window: charges / billing items from 1 Jan of (this year - N).
// Default 1 = this year plus last year, enough for YTD and year-on-year.
const WINDOW_YEARS = Number(process.env.AUTOTASK_QPO_WINDOW_YEARS ?? 1)

type Admin = ReturnType<typeof createAdminSupabaseClient>
type Errors = ChargesSyncResult['errors']

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

// Try a windowed query; if Autotask rejects the filter field, fall back to
// the unwindowed filter rather than failing the whole sync.
async function queryWithFallback<T extends { id?: number }>(
  client: AutotaskClient, entity: string,
  windowed: unknown[], fallback: unknown[], errors: Errors,
): Promise<T[]> {
  try {
    return await client.queryAll<T>(entity, windowed)
  } catch (err) {
    errors.push({
      row: 0,
      message: `${entity}: windowed query failed, fetched unfiltered instead (${err instanceof Error ? err.message.slice(0, 160) : err})`,
    })
    return await client.queryAll<T>(entity, fallback)
  }
}

async function fetchByIds<T extends { id?: number }>(
  client: AutotaskClient, entity: string, ids: number[],
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    const rows = await client.queryAll<T>(entity, [{ op: 'in', field: 'id', value: chunk }])
    out.push(...rows)
  }
  return out
}

export async function syncCharges(triggeredBy: string): Promise<ChargesSyncResult> {
  const startMs = Date.now()
  const client  = new AutotaskClient()
  const admin   = createAdminSupabaseClient()
  const errors: Errors = []

  const since = new Date(Date.UTC(new Date().getUTCFullYear() - WINDOW_YEARS, 0, 1)).toISOString()
  console.log(`[autotask-qpo/sync] starting. since=${since} triggeredBy=${triggeredBy}`)

  // ── 1. Charges + billing items (independent fetches) ─────────
  const [charges, billingItems, companies] = await Promise.all([
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
    client.queryAll<{ id: number; companyName: string }>('Companies', FILTER_ALL)
      .catch(err => {
        errors.push({ row: 0, message: `Companies: ${err instanceof Error ? err.message.slice(0, 160) : err}` })
        return [] as Array<{ id: number; companyName: string }>
      }),
  ])
  console.log(`[autotask-qpo/sync] fetched ${charges.length} charges, ${billingItems.length} billing items, ${companies.length} companies`)

  const companyNames = new Map(companies.map(c => [c.id, c.companyName]))

  // ── 2. Only the tickets and invoices these rows point at ─────
  const ticketIds  = [...new Set([
    ...charges.map(c => c.ticketID), ...billingItems.map(b => b.ticketID),
  ].filter((n): n is number => typeof n === 'number'))]
  const invoiceIds = [...new Set(
    billingItems.map(b => b.invoiceID).filter((n): n is number => typeof n === 'number'),
  )]

  const [tickets, invoices] = await Promise.all([
    fetchByIds<AutotaskTicketLite>(client, 'Tickets', ticketIds).catch(err => {
      errors.push({ row: 0, message: `Tickets: ${err instanceof Error ? err.message.slice(0, 160) : err}` })
      return [] as AutotaskTicketLite[]
    }),
    fetchByIds<AutotaskInvoiceLite>(client, 'Invoices', invoiceIds).catch(err => {
      errors.push({ row: 0, message: `Invoices: ${err instanceof Error ? err.message.slice(0, 160) : err}` })
      return [] as AutotaskInvoiceLite[]
    }),
  ])
  console.log(`[autotask-qpo/sync] fetched ${tickets.length} tickets, ${invoices.length} invoices`)

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
    charges: cCount, billing_items: bCount, tickets: tCount, invoices: iCount,
    errors, status, window_since: since, duration_ms: Date.now() - startMs,
  }
}
