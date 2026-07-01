// ============================================================
// ICT SalesIQ — Autotask Sync Orchestrator
// v5 — always full sync (Opportunities has no lastModifiedDate)
// ============================================================

import { AutotaskClient, FILTER_ALL, FILTER_ACTIVE } from './client'
import { fetchOpportunityPicklists } from './picklists'
import { buildResourceMap, buildCompanyMap, transformOpportunity } from './transform'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import type { AutotaskOpportunity, AutotaskCompany, AutotaskResource, SyncResult } from './types'

const BATCH_SIZE    = 500
const SYNC_LOG_FILE = 'autotask-api'

async function getLastSyncTime(): Promise<string | null> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('import_logs')
    .select('imported_at')
    .eq('filename', SYNC_LOG_FILE)
    .eq('status', 'success')
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.imported_at ?? null
}

async function logSync(
  result: Omit<SyncResult, 'duration_ms' | 'sync_type'>,
  triggeredBy: string,
) {
  const admin = createAdminSupabaseClient()
  await admin.from('import_logs').insert({
    imported_by:    triggeredBy,
    filename:       SYNC_LOG_FILE,
    rows_processed: result.rows_processed,
    rows_inserted:  result.rows_inserted,
    rows_updated:   result.rows_updated,
    rows_skipped:   result.rows_skipped,
    error_count:    result.errors.length,
    errors:         result.errors.length > 0 ? result.errors : null,
    status:
      result.errors.length === 0                          ? 'success'
      : result.rows_inserted + result.rows_updated > 0   ? 'partial'
      : 'error',
  })
}

export async function syncOpportunities(triggeredBy: string): Promise<SyncResult> {
  const startMs = Date.now()
  const client  = new AutotaskClient()
  const admin   = createAdminSupabaseClient()

  // ── 1. Sync type ────────────────────────────────────────────
  // The Autotask Opportunities entity has no lastModifiedDate or equivalent
  // queryable modification field — always run a full sync.
  // On Vercel Hobby (daily cron, 500-record API page limit) this is fast and correct.
  const lastSyncAt = await getLastSyncTime()
  const syncType   = 'full' as const
  console.log(`[autotask/sync] v5 starting ${syncType} sync. lastSyncAt=${lastSyncAt ?? 'none'}. triggeredBy=${triggeredBy}`)

  // ── 2. Fetch opportunities (always full) ────────────────────
  const oppFilter = [{ op: 'gte', field: 'companyID', value: 1 }]

  const rawOpps = await client.queryAll<AutotaskOpportunity>('Opportunities', oppFilter)
  console.log(`[autotask/sync] Fetched ${rawOpps.length} opportunities`)

  // ── 3. Fetch picklists ──────────────────────────────────────
  const picklists = await fetchOpportunityPicklists(client)

  // ── 4. Fetch resources (non-fatal) ──────────────────────────
  let resources: AutotaskResource[] = []
  try {
    resources = await client.queryAll<AutotaskResource>('Resources', FILTER_ACTIVE)
    console.log(`[autotask/sync] Fetched ${resources.length} resources`)
  } catch (err) {
    console.warn(`[autotask/sync] Resources fetch failed (non-fatal): ${err instanceof Error ? err.message : err}`)
  }

  // ── 5. Fetch companies ──────────────────────────────────────
  let companies: AutotaskCompany[] = []
  try {
    companies = await client.queryAll<AutotaskCompany>('Companies', FILTER_ALL)
    console.log(`[autotask/sync] Fetched ${companies.length} companies`)
  } catch {
    console.warn('[autotask/sync] Companies entity failed, trying Accounts...')
    try {
      companies = await client.queryAll<AutotaskCompany>('Accounts', FILTER_ALL)
      console.log(`[autotask/sync] Fetched ${companies.length} accounts`)
    } catch (err2) {
      console.warn(`[autotask/sync] Company lookup unavailable (non-fatal): ${err2 instanceof Error ? err2.message : err2}`)
    }
  }

  const result: Omit<SyncResult, 'duration_ms' | 'sync_type'> = {
    rows_processed: rawOpps.length,
    rows_inserted:  0,
    rows_updated:   0,
    rows_skipped:   0,
    errors:         [],
    status:         'success',
  }

  if (rawOpps.length === 0) {
    await logSync(result, triggeredBy)
    return { ...result, sync_type: syncType, duration_ms: Date.now() - startMs }
  }

  // ── 6. Build lookup maps ────────────────────────────────────
  const resourceMap = buildResourceMap(resources)
  const companyMap  = buildCompanyMap(companies)
  const maps = { picklists, resources: resourceMap, companies: companyMap }

  // ── 7. Transform rows ───────────────────────────────────────
  const records: Record<string, unknown>[] = []

  rawOpps.forEach((opp, idx) => {
    try {
      if (!opp.title?.trim()) {
        result.errors.push({ row: idx + 1, message: `ID ${opp.id}: Missing opportunity title` })
        result.rows_skipped++
        return
      }
      records.push(transformOpportunity(opp, maps))
    } catch (err) {
      result.errors.push({
        row: idx + 1,
        message: `ID ${opp.id}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
      result.rows_skipped++
    }
  })

  // ── 7b. Dedup by autotask_id, then by composite_key ────────
  // Prevents "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const seenIds = new Map<number, Record<string, unknown>>()
  records.forEach(r => {
    const aid = r.autotask_id as number
    if (aid != null) seenIds.set(aid, r)
  })
  const afterIdDedup = Array.from(seenIds.values())

  const seenKeys = new Map<string, Record<string, unknown>>()
  afterIdDedup.forEach(r => {
    const ck = (r.composite_key as string) ?? String(r.autotask_id)
    seenKeys.set(ck, r)
  })
  const dedupedRecords = Array.from(seenKeys.values())

  console.log(`[autotask/sync] After dedup: ${dedupedRecords.length} (raw: ${records.length})`)

  // ── 8. Batch upsert ─────────────────────────────────────────
  // Upsert on autotask_id — the authoritative key for API records.
  // Updates existing API records in place; inserts new ones without
  // creating duplicates alongside any remaining CSV-imported rows.
  for (let i = 0; i < dedupedRecords.length; i += BATCH_SIZE) {
    const batch = dedupedRecords.slice(i, i + BATCH_SIZE)

    const { data, error } = await admin
      .from('opportunities')
      .upsert(batch, { onConflict: 'autotask_id', ignoreDuplicates: false })
      .select('id, created_at, updated_at')

    if (error) {
      // A single row can collide with another record on the composite_key
      // unique constraint (e.g. same company + title + create date under a
      // different autotask_id) — ON CONFLICT only covers autotask_id, so
      // Postgres rejects the whole multi-row INSERT. Retry row-by-row so one
      // bad record can't take out the other ~499 legitimate ones with it.
      console.warn(
        `[autotask/sync] Batch ${Math.floor(i / BATCH_SIZE) + 1} upsert failed (${error.message}) — retrying row-by-row`
      )
      for (const row of batch) {
        const { data: rowData, error: rowError } = await admin
          .from('opportunities')
          .upsert(row, { onConflict: 'autotask_id', ignoreDuplicates: false })
          .select('id, created_at, updated_at')

        if (rowError) {
          console.error(`[autotask/sync] Row upsert failed (autotask_id ${row.autotask_id}): ${rowError.message}`)
          result.errors.push({
            row: i,
            message: `autotask_id ${row.autotask_id} (${row.company as string} / ${row.opportunity_name as string}): ${rowError.message}`,
          })
          result.rows_skipped++
          continue
        }
        countResults(rowData, result)
      }
      continue
    }

    countResults(data, result)
  }

  // ── 9. Log and return ───────────────────────────────────────
  result.status =
    result.errors.length === 0                        ? 'success'
    : result.rows_inserted + result.rows_updated > 0  ? 'partial'
    : 'failed'

  await logSync(result, triggeredBy)

  const final: SyncResult = {
    ...result,
    sync_type:   syncType,
    duration_ms: Date.now() - startMs,
  }

  console.log(
    `[autotask/sync] Done: ${result.rows_inserted} inserted, ` +
    `${result.rows_updated} updated, ${result.rows_skipped} skipped. ` +
    `${final.duration_ms}ms`
  )

  return final
}

function countResults(
  data: Array<{ created_at: string; updated_at: string }> | null,
  result: { rows_inserted: number; rows_updated: number }
) {
  if (!data) return
  data.forEach(rec => {
    const diffMs = Math.abs(
      new Date(rec.updated_at).getTime() - new Date(rec.created_at).getTime()
    )
    if (diffMs < 2000) result.rows_inserted++
    else               result.rows_updated++
  })
}
