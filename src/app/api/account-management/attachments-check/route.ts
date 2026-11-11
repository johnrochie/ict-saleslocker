// ============================================================
// ICT SalesIQ — GET /api/account-management/attachments-check
// Temporary diagnostic (admin only, read-only): do completed Account
// Management meetings (Autotask CompanyNotes) have attachments, such as
// the visit questionnaire? Returns counts, a per-AM split and file names.
// Optional: ?days=90 (look-back window, default 90)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { AutotaskClient } from '@/lib/autotask/client'
import { AM_MEETING_TYPE, repDisplayName } from '@/lib/config'

export const maxDuration = 60

interface Note { id: number; companyID: number; assignedResourceID: number | null; actionType: number; startDateTime: string | null }
interface Attachment { id: number; parentID?: number; title?: string; fullPath?: string; attachmentType?: string; contentType?: string; fileSize?: number; attachDate?: string; [k: string]: unknown }

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  if (!AutotaskClient.isConfigured()) return NextResponse.json({ error: 'Autotask not configured' }, { status: 503 })

  const days  = Math.min(730, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 90))
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const client = new AutotaskClient()

  // 1. Account Management Meeting action type on CompanyNotes
  const noteFields = await client.getEntityFields('CompanyNotes')
  const amIds = (noteFields.find(f => f.name.toLowerCase() === 'actiontype')?.picklistValues ?? [])
    .filter(v => v.isActive && v.label.includes(AM_MEETING_TYPE)).map(v => parseInt(v.value, 10))
  if (amIds.length === 0) return NextResponse.json({ error: `No "${AM_MEETING_TYPE}" action type found on CompanyNotes` }, { status: 404 })

  const notes = await client.queryAll<Note>('CompanyNotes', [
    { op: 'in',  field: 'actionType', value: amIds },
    { op: 'gte', field: 'startDateTime', value: since },
  ])

  const [resources, companies] = await Promise.all([
    client.queryAll<{ id: number; firstName: string; lastName: string }>('Resources', [{ op: 'gte', field: 'id', value: 1 }]),
    client.queryAll<{ id: number; companyName: string }>('Companies', [{ op: 'gte', field: 'id', value: 1 }]),
  ])
  const resName = new Map(resources.map(r => [r.id, `${r.lastName}, ${r.firstName}`]))
  const coName  = new Map(companies.map(c => [c.id, c.companyName]))

  // 2. Attachments on those notes. The parent field name is checked against
  //    the entity's own field list so a wrong guess is reported, not hidden.
  let attachFields: string[] = []
  try { attachFields = (await client.getEntityFields('CompanyNoteAttachments')).map(f => f.name) }
  catch (e) { return NextResponse.json({ error: `CompanyNoteAttachments entity not available: ${e instanceof Error ? e.message : e}`, meetings: notes.length }, { status: 502 }) }

  const parentField = attachFields.find(f => /^parent(id)?$/i.test(f)) ?? 'parentID'
  const attachments: Attachment[] = []
  const ids = notes.map(n => n.id)
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      attachments.push(...await client.queryAll<Attachment>('CompanyNoteAttachments', [{ op: 'in', field: parentField, value: chunk }]))
    }
  } catch (e) {
    return NextResponse.json({
      error: `Attachment query failed: ${e instanceof Error ? e.message : e}`,
      parentFieldUsed: parentField, attachmentEntityFields: attachFields, meetings: notes.length,
    }, { status: 502 })
  }

  const byNote = new Map<number, Attachment[]>()
  attachments.forEach(a => { const k = Number(a[parentField]); byNote.set(k, [...(byNote.get(k) ?? []), a]) })

  const perAm = new Map<string, { meetings: number; withAttachment: number }>()
  const meetings = notes.map(n => {
    const am = n.assignedResourceID != null ? (resName.get(n.assignedResourceID) ?? `Resource#${n.assignedResourceID}`) : 'Unassigned'
    const files = byNote.get(n.id) ?? []
    const row = perAm.get(am) ?? { meetings: 0, withAttachment: 0 }
    row.meetings++; if (files.length) row.withAttachment++
    perAm.set(am, row)
    return {
      id: n.id, date: n.startDateTime?.slice(0, 10) ?? null, am: repDisplayName(am),
      company: coName.get(n.companyID) ?? `Account#${n.companyID}`,
      attachments: files.map(f => `${f.title ?? ''}${f.fullPath ? ` (${f.fullPath})` : ''}`.trim()),
    }
  }).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  return NextResponse.json({
    since, meetings: notes.length,
    withAttachments: meetings.filter(m => m.attachments.length > 0).length,
    totalAttachments: attachments.length,
    byAccountManager: [...perAm.entries()].map(([am, v]) => ({ am: repDisplayName(am), ...v })),
    attachmentEntityFields: attachFields,
    sampleAttachment: attachments[0]
      ? { title: attachments[0].title, attachmentType: attachments[0].attachmentType, contentType: attachments[0].contentType, fileSize: attachments[0].fileSize, attachDate: attachments[0].attachDate }
      : null,
    recent: meetings.slice(0, 40),
  })
}
