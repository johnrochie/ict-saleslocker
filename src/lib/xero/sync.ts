// ============================================================
// ICT SalesIQ — Xero Sync
// ============================================================

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { getConnectedClient } from './client'
import type { Contact } from 'xero-node'

const PAGE_SIZE = 200

function transformContact(c: Contact) {
  return {
    xero_contact_id: c.contactID,
    account_number:  c.accountNumber ?? null,
    name:            c.name ?? '',
    email:           c.emailAddress ?? null,
    status:          c.contactStatus ?? null,
    is_customer:     c.isCustomer ?? null,
    is_supplier:     c.isSupplier ?? null,
    raw:             c as unknown as Record<string, unknown>,
  }
}

export interface SyncResult {
  entity: string
  fetched: number
  upserted: number
}

export async function syncContacts(): Promise<SyncResult> {
  const { xero, tenantId } = await getConnectedClient()
  const admin = createAdminSupabaseClient()

  const all: Contact[] = []
  let page = 1

  while (true) {
    const response = await xero.accountingApi.getContacts(
      tenantId,
      undefined, // ifModifiedSince
      undefined, // where
      undefined, // order
      undefined, // IDs
      page,
      false, // includeArchived
      false, // summaryOnly
      undefined, // searchTerm
      PAGE_SIZE
    )
    const batch = response.body.contacts ?? []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }

  if (all.length === 0) {
    return { entity: 'contacts', fetched: 0, upserted: 0 }
  }

  const rows = all.map(transformContact)

  const { error } = await admin.from('xero_contacts').upsert(rows, { onConflict: 'xero_contact_id' })

  if (error) {
    // Batch upsert failed — fall back to row-by-row so one bad record
    // doesn't block the rest, matching the Autotask sync's resilience pattern.
    console.warn(`[xero/sync] Batch contact upsert failed (${error.message}) — falling back to row-by-row`)
    let upserted = 0
    for (const row of rows) {
      const { error: rowError } = await admin
        .from('xero_contacts')
        .upsert(row, { onConflict: 'xero_contact_id' })
      if (rowError) {
        console.error(`[xero/sync] Failed to upsert contact ${row.xero_contact_id}: ${rowError.message}`)
      } else {
        upserted++
      }
    }
    return { entity: 'contacts', fetched: all.length, upserted }
  }

  return { entity: 'contacts', fetched: all.length, upserted: rows.length }
}
