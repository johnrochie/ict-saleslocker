// ============================================================
// ICT SalesIQ — Autotask Meetings Sync (CompanyToDos + CompanyNotes)
// ============================================================
// Replaces the manual "To-Do & Note Search" CSV upload on the Weekly
// Report. Autotask splits this across two entities:
//   - CompanyToDos — scheduled/upcoming meetings (query-only)
//   - CompanyNotes — meetings that already took place (a completed
//     To-Do converts into a Note)
// Both share an actionType picklist; we filter to Meeting-type values
// and merge the two entities into one feed, same as the CSV did.
// ============================================================

import type { AutotaskClient } from './client'
import type { AutotaskCompanyToDo, AutotaskCompanyNote } from './types'
import { resolveLabel, type PicklistMap } from './picklists'

const MEETING_LABELS = ['Meeting', 'Account Management Meeting']

export interface MeetingLookupMaps {
  companies: Map<number, { name: string; accountManagerId: number | null }>
  resources: Map<number, string>
  opportunities: Map<number, string>       // id -> title
  contacts: Map<number, string>            // id -> "First Last"
}

// ── Resolve the actionType picklist for an entity and return the IDs
//    that match "Meeting" / "Account Management Meeting" ────────────
async function meetingActionTypeIds(client: AutotaskClient, entity: string): Promise<number[]> {
  const fields = await client.getEntityFields(entity)
  const field  = fields.find(f => f.name.toLowerCase() === 'actiontype')
  if (!field?.picklistValues?.length) {
    console.warn(`[autotask/meetings] No actionType picklist found for ${entity}`)
    return []
  }
  return field.picklistValues
    .filter(v => v.isActive && MEETING_LABELS.some(l => v.label.includes(l)))
    .map(v => parseInt(v.value, 10))
}

function toDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  return dateStr.slice(0, 10)
}

function toTimeOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const t = dateStr.slice(11, 16)
  return t || null
}

function transformToDo(
  raw: AutotaskCompanyToDo,
  actionTypeLabels: PicklistMap,
  maps: MeetingLookupMaps
): Record<string, unknown> {
  const company = maps.companies.get(raw.companyID)
  return {
    source:          'todo',
    autotask_id:     raw.id,
    company:         company?.name ?? `Account#${raw.companyID}`,
    opportunity:     raw.opportunityID != null ? (maps.opportunities.get(raw.opportunityID) ?? null) : null,
    contact:         raw.contactID != null ? (maps.contacts.get(raw.contactID) ?? null) : null,
    assigned_to:     raw.assignedToResourceID != null ? (maps.resources.get(raw.assignedToResourceID) ?? null) : null,
    action_type:     resolveLabel(actionTypeLabels, raw.actionType, null),
    classification:  null,
    start_date:      toDateOnly(raw.startDateTime),
    start_time:       toTimeOnly(raw.startDateTime),
    description:     raw.activityDescription?.trim() ?? null,
    last_imported_at: new Date().toISOString(),
  }
}

function transformNote(
  raw: AutotaskCompanyNote,
  actionTypeLabels: PicklistMap,
  maps: MeetingLookupMaps
): Record<string, unknown> {
  const company = maps.companies.get(raw.companyID)
  return {
    source:          'note',
    autotask_id:     raw.id,
    company:         company?.name ?? `Account#${raw.companyID}`,
    opportunity:     raw.opportunityID != null ? (maps.opportunities.get(raw.opportunityID) ?? null) : null,
    contact:         raw.contactID != null ? (maps.contacts.get(raw.contactID) ?? null) : null,
    assigned_to:     raw.assignedResourceID != null ? (maps.resources.get(raw.assignedResourceID) ?? null) : null,
    action_type:     resolveLabel(actionTypeLabels, raw.actionType, null),
    classification:  null,
    start_date:      toDateOnly(raw.startDateTime),
    start_time:       toTimeOnly(raw.startDateTime),
    description:     raw.note?.trim() ?? null,
    last_imported_at: new Date().toISOString(),
  }
}

export interface MeetingSyncResult {
  rows_processed: number
  rows_upserted:  number
  rows_skipped:   number
  errors:         Array<{ row: number; message: string }>
}

export async function syncMeetings(
  client: AutotaskClient,
  admin: ReturnType<typeof import('@/lib/supabase/server').createAdminSupabaseClient>,
  maps: MeetingLookupMaps
): Promise<MeetingSyncResult> {
  const result: MeetingSyncResult = { rows_processed: 0, rows_upserted: 0, rows_skipped: 0, errors: [] }

  // ── 1. Resolve actionType picklists for both entities ───────
  const [todoActionIds, noteActionIds] = await Promise.all([
    meetingActionTypeIds(client, 'CompanyToDos'),
    meetingActionTypeIds(client, 'CompanyNotes'),
  ])

  if (todoActionIds.length === 0 && noteActionIds.length === 0) {
    result.errors.push({ row: 0, message: 'No Meeting actionType picklist values found on CompanyToDos/CompanyNotes' })
    return result
  }

  const [todoFields, noteFields] = await Promise.all([
    client.getEntityFields('CompanyToDos'),
    client.getEntityFields('CompanyNotes'),
  ])
  const todoActionLabels: PicklistMap = new Map(
    (todoFields.find(f => f.name.toLowerCase() === 'actiontype')?.picklistValues ?? [])
      .map(v => [parseInt(v.value, 10), v.label])
  )
  const noteActionLabels: PicklistMap = new Map(
    (noteFields.find(f => f.name.toLowerCase() === 'actiontype')?.picklistValues ?? [])
      .map(v => [parseInt(v.value, 10), v.label])
  )

  // ── 2. Fetch both entities filtered to Meeting action types ─
  const records: Record<string, unknown>[] = []

  if (todoActionIds.length > 0) {
    const todos = await client.queryAll<AutotaskCompanyToDo>('CompanyToDos', [
      { op: 'in', field: 'actionType', value: todoActionIds },
    ])
    console.log(`[autotask/meetings] Fetched ${todos.length} CompanyToDos (meetings)`)
    todos.forEach(t => records.push(transformToDo(t, todoActionLabels, maps)))
  }

  if (noteActionIds.length > 0) {
    const notes = await client.queryAll<AutotaskCompanyNote>('CompanyNotes', [
      { op: 'in', field: 'actionType', value: noteActionIds },
    ])
    console.log(`[autotask/meetings] Fetched ${notes.length} CompanyNotes (meetings)`)
    notes.forEach(n => records.push(transformNote(n, noteActionLabels, maps)))
  }

  result.rows_processed = records.length
  if (records.length === 0) return result

  // ── 3. Batch upsert on (source, autotask_id) ────────────────
  const BATCH_SIZE = 500
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await admin
      .from('meetings')
      .upsert(batch, { onConflict: 'source,autotask_id', ignoreDuplicates: false })

    if (error) {
      // Same defensive pattern as the Opportunities sync: retry row-by-row
      // so one colliding record can't take out the rest of the batch.
      for (const row of batch) {
        const { error: rowError } = await admin
          .from('meetings')
          .upsert(row, { onConflict: 'source,autotask_id', ignoreDuplicates: false })
        if (rowError) {
          result.errors.push({
            row: i,
            message: `${row.source as string} ${row.autotask_id as number} (${row.company as string}): ${rowError.message}`,
          })
          result.rows_skipped++
          continue
        }
        result.rows_upserted++
      }
      continue
    }

    result.rows_upserted += batch.length
  }

  return result
}
