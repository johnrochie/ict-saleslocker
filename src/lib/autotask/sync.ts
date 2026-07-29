// ============================================================
// ICT SalesIQ — Autotask Sync Orchestrator
// v5 — always full sync (Opportunities has no lastModifiedDate)
// ============================================================

import { AutotaskClient, FILTER_ALL, FILTER_ACTIVE } from './client'
import { fetchOpportunityPicklists } from './picklists'
import { buildResourceMap, buildCompanyMap, transformOpportunity } from './transform'
import { syncMeetings } from './meetings'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import type { AutotaskOpportunity, AutotaskCompany, AutotaskResource, AutotaskContact, SyncResult } from './types'

const BATCH_SIZE      = 1000
const SYNC_LOG_FILE   = 'autotask-api'
const MEETINGS_LOG_FILE = 'autotask-meetings'

// Opportunities untouched (lastActivityDate unchanged) for longer than this
// are considered settled — already synced once, no need to re-write them on
// every run. Override with AUTOTASK_SYNC_AGE_CUTOFF_YEARS if needed.
const AGE_CUTOFF_YEARS = Number(process.env.AUTOTASK_SYNC_AGE_CUTOFF_YEARS ?? 2)
const AGE_CUTOFF_MS    = AGE_CUTOFF_YEARS * 365 * 86_400_000

// Existing DB snapshot used to detect "aged and unchanged" opportunities —
// keyed by autotask_id, value is the last_activity we stored for it.
async function fetchExistingActivitySnapshot(
  admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<Map<number, string | null>> {
  try {
    const rows = await fetchAllRows<{ autotask_id: number; last_activity: string | null }>(
      admin,
      (client, from, to) => client
        .from('opportunities')
        .select('autotask_id, last_activity')
        .not('autotask_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    )
    return new Map(rows.map(r => [r.autotask_id, r.last_activity]))
  } catch (err) {
    console.warn(`[autotask/sync] Existing snapshot fetch failed (non-fatal, all records will be processed): ${err instanceof Error ? err.message : err}`)
    return new Map()
  }
}

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

  // ── 2-5. Fetch opportunities, picklists, resources, companies and
  // contacts concurrently — these are all independent reads, and running
  // them in sequence was the single biggest contributor to sync runs
  // exceeding the platform's function timeout.
  const oppFilter = [{ op: 'gte', field: 'companyID', value: 1 }]

  const companiesPromise: Promise<AutotaskCompany[]> = client
    .queryAll<AutotaskCompany>('Companies', FILTER_ALL)
    .catch(async () => {
      console.warn('[autotask/sync] Companies entity failed, trying Accounts...')
      try {
        return await client.queryAll<AutotaskCompany>('Accounts', FILTER_ALL)
      } catch (err2) {
        console.warn(`[autotask/sync] Company lookup unavailable (non-fatal): ${err2 instanceof Error ? err2.message : err2}`)
        return []
      }
    })

  const resourcesPromise: Promise<AutotaskResource[]> = client
    .queryAll<AutotaskResource>('Resources', FILTER_ACTIVE)
    .catch(err => {
      console.warn(`[autotask/sync] Resources fetch failed (non-fatal): ${err instanceof Error ? err.message : err}`)
      return []
    })

  const contactsPromise: Promise<AutotaskContact[]> = client
    .queryAll<AutotaskContact>('Contacts', FILTER_ACTIVE)
    .catch(err => {
      console.warn(`[autotask/sync] Contacts fetch failed (non-fatal): ${err instanceof Error ? err.message : err}`)
      return []
    })

  const [rawOpps, picklists, resources, companies, contacts, existingActivity] = await Promise.all([
    client.queryAll<AutotaskOpportunity>('Opportunities', oppFilter),
    fetchOpportunityPicklists(client),
    resourcesPromise,
    companiesPromise,
    contactsPromise,
    fetchExistingActivitySnapshot(admin),
  ])
  console.log(`[autotask/sync] Fetched ${rawOpps.length} opportunities`)
  console.log(`[autotask/sync] Fetched ${resources.length} resources`)
  console.log(`[autotask/sync] Fetched ${companies.length} companies`)
  console.log(`[autotask/sync] Fetched ${contacts.length} contacts`)
  console.log(`[autotask/sync] Existing DB snapshot: ${existingActivity.size} opportunities`)

  const result: Omit<SyncResult, 'duration_ms' | 'sync_type'> = {
    rows_processed: rawOpps.length,
    rows_inserted:  0,
    rows_updated:   0,
    rows_skipped:   0,
    rows_unchanged: 0,
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

  const cutoffMs = Date.now() - AGE_CUTOFF_MS

  rawOpps.forEach((opp, idx) => {
    try {
      if (!opp.title?.trim()) {
        result.errors.push({ row: idx + 1, message: `ID ${opp.id}: Missing opportunity title` })
        result.rows_skipped++
        return
      }

      // Skip aged, unchanged opportunities — already in the DB, last touched
      // (per Autotask's lastActivityDate, falling back to createDate) before
      // the cutoff, and that date hasn't moved since we last stored it. Still
      // fetched from Autotask every run (the API doesn't support filtering
      // Opportunities by date), but skipping the write here is what actually
      // cuts sync time — most of the record volume is settled, years-old deals.
      if (existingActivity.has(opp.id)) {
        const referenceMs = opp.lastActivityDate
          ? new Date(opp.lastActivityDate).getTime()
          : opp.createDate ? new Date(opp.createDate).getTime() : null

        // Compare as timestamps, not strings — Postgres/PostgREST returns
        // timestamptz values as "...+00:00", while JS's toISOString() produces
        // "...Z" for the same instant. A string comparison here almost never
        // matches even when nothing changed.
        const existingRaw = existingActivity.get(opp.id)
        const existingMs  = existingRaw ? new Date(existingRaw).getTime() : null
        const currentMs   = opp.lastActivityDate ? new Date(opp.lastActivityDate).getTime() : null
        const unchanged   = existingMs === currentMs

        if (referenceMs != null && referenceMs < cutoffMs && unchanged) {
          result.rows_unchanged++
          return
        }
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

  // ── 9. Sync meetings (CompanyToDos + CompanyNotes) ──────────
  // Bundled into the same cron run as Opportunities so there's a single
  // sync trigger, but logged as its own import_logs row for visibility.
  let meetingsResult: SyncResult['meetings']
  try {
    const contactMap = new Map(
      contacts.map(c => [c.id, `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || `Contact#${c.id}`])
    )
    const opportunityMap = new Map(rawOpps.map(o => [o.id, o.title?.trim() ?? `Opportunity#${o.id}`]))

    const mResult = await syncMeetings(client, admin, {
      companies:     companyMap,
      resources:     resourceMap,
      opportunities: opportunityMap,
      contacts:      contactMap,
    })
    console.log(
      `[autotask/meetings] Done: ${mResult.rows_upserted} upserted, ${mResult.rows_skipped} skipped ` +
      `(processed ${mResult.rows_processed})`
    )
    meetingsResult = mResult

    await admin.from('import_logs').insert({
      imported_by:    triggeredBy,
      filename:       MEETINGS_LOG_FILE,
      rows_processed: mResult.rows_processed,
      rows_inserted:  mResult.rows_upserted,
      rows_updated:   0,
      rows_skipped:   mResult.rows_skipped,
      error_count:    mResult.errors.length,
      errors:         mResult.errors.length > 0 ? mResult.errors : null,
      status:
        mResult.errors.length === 0                    ? 'success'
        : mResult.rows_upserted > 0                    ? 'partial'
        : 'failed',
    })
  } catch (err) {
    console.error(`[autotask/meetings] Sync failed: ${err instanceof Error ? err.message : err}`)
    meetingsResult = { rows_processed: 0, rows_upserted: 0, rows_skipped: 0, errors: [{ row: 0, message: err instanceof Error ? err.message : 'Unknown error' }] }
    await admin.from('import_logs').insert({
      imported_by: triggeredBy,
      filename:    MEETINGS_LOG_FILE,
      status:      'failed',
      error_count: 1,
      errors:      [{ row: 0, message: err instanceof Error ? err.message : 'Unknown error' }],
    })
  }

  // ── 10. Log and return ──────────────────────────────────────
  result.status =
    result.errors.length === 0                        ? 'success'
    : result.rows_inserted + result.rows_updated > 0  ? 'partial'
    : 'failed'

  await logSync(result, triggeredBy)

  const final: SyncResult = {
    ...result,
    sync_type:   syncType,
    duration_ms: Date.now() - startMs,
    meetings:    meetingsResult,
  }

  console.log(
    `[autotask/sync] Done: ${result.rows_inserted} inserted, ` +
    `${result.rows_updated} updated, ${result.rows_skipped} skipped, ` +
    `${result.rows_unchanged} unchanged (aged, not re-written). ` +
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
