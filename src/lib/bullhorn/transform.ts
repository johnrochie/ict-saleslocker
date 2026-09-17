// ============================================================
// ICT SalesIQ — Bullhorn transform (raw API record -> DB row)
// ============================================================
//
// CV_SENT_STATUSES lists the common Bullhorn default JobSubmission
// pipeline statuses. This account's actual status values may differ
// (Bullhorn Admin > Business Rules > Field Mapping > Job Submission
// Status is fully customisable per instance) — confirm and adjust
// this list once connected to the live account.
const CV_SENT_STATUSES = [
  'Submitted',
  'Sent to Client',
  'Client Review',
  'Interviewing',
  'Interview Scheduled',
  'Offer',
  'Placed',
]

export interface BullhornJobOrderRaw {
  id: number
  title: string
  isOpen: boolean
  isDeleted: boolean
  dateAdded: number | null
  employmentType: string | null
  salary: number | string | null
  status: string | null
  address?: { city?: string | null } | null
  clientCorporation?: { name?: string | null } | null
  clientContact?: { firstName?: string | null; lastName?: string | null } | null
  publicDescription?: string | null
  description?: string | null
}

export function transformJobOrder(j: BullhornJobOrderRaw) {
  const hiringManager = j.clientContact
    ? [j.clientContact.firstName, j.clientContact.lastName].filter(Boolean).join(' ')
    : ''

  return {
    bullhorn_id: j.id,
    title: j.title,
    company_name: j.clientCorporation?.name ?? null,
    hiring_manager: hiringManager || null,
    location: j.address?.city ?? null,
    salary: j.salary != null && j.salary !== '' ? String(j.salary) : null,
    employment_type: j.employmentType ?? null,
    status: j.status ?? null,
    is_open: !!j.isOpen && !j.isDeleted,
    date_added: j.dateAdded ? new Date(j.dateAdded).toISOString() : null,
    notes: j.publicDescription ?? j.description ?? null,
    raw: j as unknown as Record<string, unknown>,
  }
}

export interface BullhornSubmissionRaw {
  id: number
  status: string | null
  dateAdded: number | null
  dateWebResponse?: number | null
  comments?: string | null
  jobOrder: { id: number }
  candidate?: { id: number; firstName?: string | null; lastName?: string | null } | null
}

export function transformSubmission(s: BullhornSubmissionRaw) {
  const candidateName = s.candidate
    ? [s.candidate.firstName, s.candidate.lastName].filter(Boolean).join(' ')
    : ''

  return {
    bullhorn_id: s.id,
    job_order_bullhorn_id: s.jobOrder.id,
    candidate_bullhorn_id: s.candidate?.id ?? null,
    candidate_name: candidateName || null,
    status: s.status ?? null,
    cv_sent: !!s.status && CV_SENT_STATUSES.includes(s.status),
    date_added: s.dateAdded ? new Date(s.dateAdded).toISOString() : null,
    date_web_response: s.dateWebResponse ? new Date(s.dateWebResponse).toISOString() : null,
    comments: s.comments ?? null,
    raw: s as unknown as Record<string, unknown>,
  }
}

export interface BullhornPlacementRaw {
  id: number
  dateBegin: number | null
  employmentType: string | null
  salary?: number | string | null
  jobOrder?: { id: number; title?: string | null; clientCorporation?: { name?: string | null } | null } | null
  candidate?: { firstName?: string | null; lastName?: string | null } | null
}

export function transformPlacement(p: BullhornPlacementRaw) {
  const candidateName = p.candidate
    ? [p.candidate.firstName, p.candidate.lastName].filter(Boolean).join(' ')
    : ''

  return {
    bullhorn_id: p.id,
    job_order_bullhorn_id: p.jobOrder?.id ?? null,
    candidate_name: candidateName || null,
    role_title: p.jobOrder?.title ?? null,
    company_name: p.jobOrder?.clientCorporation?.name ?? null,
    start_date: p.dateBegin ? new Date(p.dateBegin).toISOString() : null,
    employment_type: p.employmentType ?? null,
    notes: null as string | null,
    raw: p as unknown as Record<string, unknown>,
  }
}
