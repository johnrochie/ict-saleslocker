// ============================================================
// ICT SalesIQ — Bullhorn Sync Orchestrator
// ============================================================
// v1 — pulls open Job Orders, the Job Submissions against them,
// and recently-started Placements, upserting each into
// bullhorn_job_orders / bullhorn_submissions / bullhorn_placements.
//
// NOTE: the `where` clause syntax below (Bullhorn's query API is
// SQL-like but has its own quirks around nested-field filters and
// IN lists) and the nested `fields` selectors should be verified
// against this Bullhorn instance the first time real credentials
// are connected — adjust here if a query 400s.

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { bullhornGet } from './client'
import {
  transformJobOrder,
  transformSubmission,
  transformPlacement,
  type BullhornJobOrderRaw,
  type BullhornSubmissionRaw,
  type BullhornPlacementRaw,
} from './transform'

const SYNC_LOG_PREFIX = 'bullhorn-api'
// How far back to pull Placements each run, so the Placements tab keeps a
// rolling window of recent history without re-fetching the entire archive.
const PLACEMENT_LOOKBACK_DAYS = 400

export interface SyncResult {
  entity: string
  fetched: number
  upserted: number
}

async function logSync(entity: string, fetched: number, upserted: number, error: string | null, triggeredBy: string) {
  const admin = createAdminSupabaseClient()
  await admin.from('import_logs').insert({
    imported_by: triggeredBy,
    filename: `${SYNC_LOG_PREFIX}-${entity}`,
    rows_processed: fetched,
    rows_inserted: upserted,
    rows_updated: 0,
    rows_skipped: Math.max(fetched - upserted, 0),
    error_count: error ? 1 : 0,
    errors: error ? [{ row: 0, message: error }] : null,
    status: error ? 'error' : 'success',
  })
}

async function syncJobOrders(triggeredBy: string): Promise<{ result: SyncResult; openIds: number[] }> {
  const admin = createAdminSupabaseClient()
  const fields =
    'id,title,isOpen,isDeleted,dateAdded,employmentType,salary,status,' +
    'address(city),clientCorporation(name),clientContact(firstName,lastName),' +
    'publicDescription,description'

  let error: string | null = null
  let jobOrders: BullhornJobOrderRaw[] = []
  try {
    const res = await bullhornGet<{ data: BullhornJobOrderRaw[] }>('/query/JobOrder', {
      fields,
      where: 'isDeleted=false',
      count: '500',
    })
    jobOrders = res.data ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : 'Bullhorn JobOrder fetch failed'
  }

  let upserted = 0
  if (jobOrders.length > 0 && !error) {
    const rows = jobOrders.map(transformJobOrder)
    const { error: dbError, count } = await admin
      .from('bullhorn_job_orders')
      .upsert(rows, { onConflict: 'bullhorn_id', count: 'exact' })
    if (dbError) error = dbError.message
    else upserted = count ?? rows.length
  }

  const openIds = jobOrders.filter((j) => j.isOpen && !j.isDeleted).map((j) => j.id)
  await logSync('job_orders', jobOrders.length, upserted, error, triggeredBy)
  if (error) throw new Error(`Bullhorn JobOrder sync failed: ${error}`)

  return { result: { entity: 'job_orders', fetched: jobOrders.length, upserted }, openIds }
}

async function syncSubmissions(jobOrderIds: number[], triggeredBy: string): Promise<SyncResult> {
  const admin = createAdminSupabaseClient()

  if (jobOrderIds.length === 0) {
    await logSync('submissions', 0, 0, null, triggeredBy)
    return { entity: 'submissions', fetched: 0, upserted: 0 }
  }

  const fields = 'id,status,dateAdded,dateWebResponse,comments,jobOrder(id),candidate(id,firstName,lastName)'

  let error: string | null = null
  let submissions: BullhornSubmissionRaw[] = []
  try {
    const res = await bullhornGet<{ data: BullhornSubmissionRaw[] }>('/query/JobSubmission', {
      fields,
      where: `jobOrder.id IN (${jobOrderIds.join(',')})`,
      count: '500',
    })
    submissions = res.data ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : 'Bullhorn JobSubmission fetch failed'
  }

  let upserted = 0
  if (submissions.length > 0 && !error) {
    const rows = submissions.map(transformSubmission)
    const { error: dbError, count } = await admin
      .from('bullhorn_submissions')
      .upsert(rows, { onConflict: 'bullhorn_id', count: 'exact' })
    if (dbError) error = dbError.message
    else upserted = count ?? rows.length
  }

  await logSync('submissions', submissions.length, upserted, error, triggeredBy)
  if (error) throw new Error(`Bullhorn JobSubmission sync failed: ${error}`)

  return { entity: 'submissions', fetched: submissions.length, upserted }
}

async function syncPlacements(triggeredBy: string): Promise<SyncResult> {
  const admin = createAdminSupabaseClient()
  const cutoffMs = Date.now() - PLACEMENT_LOOKBACK_DAYS * 86_400_000
  const fields = 'id,dateBegin,employmentType,salary,jobOrder(id,title,clientCorporation(name)),candidate(firstName,lastName)'

  let error: string | null = null
  let placements: BullhornPlacementRaw[] = []
  try {
    const res = await bullhornGet<{ data: BullhornPlacementRaw[] }>('/query/Placement', {
      fields,
      where: `dateBegin > ${cutoffMs}`,
      count: '500',
    })
    placements = res.data ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : 'Bullhorn Placement fetch failed'
  }

  let upserted = 0
  if (placements.length > 0 && !error) {
    const rows = placements.map(transformPlacement)
    const { error: dbError, count } = await admin
      .from('bullhorn_placements')
      .upsert(rows, { onConflict: 'bullhorn_id', count: 'exact' })
    if (dbError) error = dbError.message
    else upserted = count ?? rows.length
  }

  await logSync('placements', placements.length, upserted, error, triggeredBy)
  if (error) throw new Error(`Bullhorn Placement sync failed: ${error}`)

  return { entity: 'placements', fetched: placements.length, upserted }
}

// Runs the full Bullhorn sync: Job Orders first (so we know which are open),
// then Job Submissions scoped to those open Job Orders, then recent
// Placements. Each step logs its own import_logs row.
export async function syncAll(triggeredBy: string): Promise<SyncResult[]> {
  const { result: jobOrdersResult, openIds } = await syncJobOrders(triggeredBy)
  const submissionsResult = await syncSubmissions(openIds, triggeredBy)
  const placementsResult = await syncPlacements(triggeredBy)
  return [jobOrdersResult, submissionsResult, placementsResult]
}
