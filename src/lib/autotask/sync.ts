// ============================================================
// ICT SalesLocker — Autotask Sync Orchestrator
// ============================================================
// Full flow:
//  1. Determine full vs incremental sync from import_logs
//  2. Fetch reference data (picklists, resources, companies)
//  3. Query opportunities (all, or since last successful sync)
//  4. Transform each opportunity
//  5. Batch upsert to Supabase (conflict on autotask_id)
//  6. Log result to import_logs
// ============================================================

import { AutotaskClient, FILTER_ALL, FILTER_ACTIVE } from './client'
import { fetchOpportunityPicklists } from './picklists'
import { buildResourceMap, buildCompanyMap, transformOpportunity } from './transform'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import type { AutotaskOpportunity, AutotaskCompany, AutotaskResource, SyncResult } from './types'

const BATCH_SIZE       = 500
const SYNC_LOG_FILE    = 'autotask-api'  // identifies API syncs in import_logs

// ── Determine when the last successful sync ran ───────────────
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

// ── Log sync result to import_logs ────────────────────────────
async function logSync(
  result: Omit<SyncResult, 'duration_ms' | 'sync_type'>,
  triggeredBy: string,
  syncType: 'full' | 'incremental',
  durationMs: number
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
      result.errors.length === 0 ? 'success'
      : result.rows_inserted + result.rows_updated > 0 ? 'partial'
      : 'error',
  })
}

// ── Main sync function ────────────────────────────────────────
export async function syncOpportunities(triggeredBy: string): Promise<SyncResult> {
  const startMs = Date.now()
  const client  = new AutotaskClient()
  const admin   = createAdminSupabaseClient()

  // ── 1. Determine sync type ──────────────────────────────────
  const lastSyncAt = await getLastSyncTime()
  const syncType: 'full' | 'incremental' = lastSyncAt ? 'incremental' : 'full'

  console.log(`[autotask/sync] Starting ${syncType} sync. Triggered by: ${triggeredBy}`)
  if (lastSyncAt) {
    console.log(`[autotask/sync] Fetching records updated since: ${lastSyncAt}`)
  }

  // ── 2. Fetch reference data in parallel ────────────────────
  const oppFilter = lastSyncAt
    ? [{ op: 'gte', field: 'lastActivityDate', value: lastSyncAt }]
    : FILTER_ALL

  const [picklists, resources, companies, rawOpps] = await Promise.all([
    fetchOpportunityPicklists(client),
    client.queryAll<AutotaskResource>('Resources', FILTER_ACTIVE),
    client.queryAll<AutotaskCompany>('Companies',  FILTER_ALL),
    client.queryAll<AutotaskOpportunity>('Opportunities', oppFilter),
  ])

  console.log(
    `[autotask/sync] Fetched: ${rawOpps.length} opps, ` +
    `${companies.length} companies, ${resources.length} resources`
  )

  const result: Omit<SyncResult, 'duration_ms' | 'sync_type'> = {
    rows_processed: rawOpps.length,
    rows_inserted:  0,
    rows_updated:   0,
    rows_skipped:   0,
    errors:         [],
    status:         'success',
  }

  // Nothing to sync — still log so incremental works next time
  if (rawOpps.length === 0) {
    await logSync(result, triggeredBy, syncType, Date.now() - startMs)
    return { ...result, sync_type: syncType, duration_ms: Date.now() - startMs }
  }

  // ── 3. Build lookup maps ────────────────────────────────────
  const resourceMap = buildResourceMap(resources)
  const companyMap  = buildCompanyMap(companies)

  const maps = { picklists, resources: resourceMap, companies: companyMap }

  // ── 4. Transform rows ───────────────────────────────────────
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

  // ── 5. Batch upsert ─────────────────────────────────────────
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    const { data, error } = await admin
      .from('opportunities')
      .upsert(batch, {
        onConflict:       'autotask_id',
        ignoreDuplicates: false,
      })
      .select('id, created_at, updated_at')

    if (error) {
      // Fallback: try composite_key upsert (for records already in DB from CSV)
      const { data: data2, error: error2 } = await admin
        .from('opportunities')
        .upsert(batch, {
          onConflict:       'composite_key',
          ignoreDuplicates: false,
        })
        .select('id, created_at, updated_at')

      if (error2) {
        const msg = `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error2.message}`
        result.errors.push({ row: i, message: msg })
        result.rows_skipped += batch.length
        console.error(`[autotask/sync] ${msg}`)
        continue
      }

      // Count inserts vs updates from fallback result
      countResults(data2, result)
      continue
    }

    countResults(data, result)
  }

  // ── 6. Log and return ───────────────────────────────────────
  result.status =
    result.errors.length === 0 ? 'success'
    : result.rows_inserted + result.rows_updated > 0 ? 'partial'
    : 'failed'

  await logSync(result, triggeredBy, syncType, Date.now() - startMs)

  const final: SyncResult = {
    ...result,
    sync_type:   syncType,
    duration_ms: Date.now() - startMs,
  }

  console.log(
    `[autotask/sync] Done. ` +
    `${result.rows_inserted} inserted, ${result.rows_updated} updated, ` +
    `${result.rows_skipped} skipped. ${Date.now() - startMs}ms`
  )

  return final
}

// ── Helper: count inserts vs updates from Supabase response ──
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
