// ============================================================
// ICT SalesIQ — Autotask API → DB Record Transformer
// ============================================================
// Converts a raw AutotaskOpportunity (from REST API) into the
// same DB record shape produced by the CSV parser.
// ============================================================

import type { AutotaskOpportunity, AutotaskCompany, AutotaskResource } from './types'
import type { OpportunityPicklists } from './picklists'
import { resolveLabel } from './picklists'
import type { NormalisedStatus } from '@/types'

// ── Lookup maps passed in from the sync orchestrator ─────────
export interface LookupMaps {
  picklists: OpportunityPicklists
  resources: Map<number, string>                               // id → "Last, First"
  companies: Map<number, { name: string; accountManagerId: number | null }>
}

// ── Build lookup maps from fetched reference data ────────────
export function buildResourceMap(resources: AutotaskResource[]): Map<number, string> {
  return new Map(
    resources.map(r => [
      r.id,
      `${r.lastName ?? ''}, ${r.firstName ?? ''}`.replace(/^,\s*/, '').trim() || `Resource#${r.id}`,
    ])
  )
}

export function buildCompanyMap(
  companies: AutotaskCompany[]
): Map<number, { name: string; accountManagerId: number | null }> {
  return new Map(
    companies.map(c => [
      c.id,
      {
        name:             c.companyName?.trim() || `Account#${c.id}`,
        accountManagerId: c.ownerResourceID ?? null,
      },
    ])
  )
}

// ── Status normalisation (mirrors parser.ts logic but on strings) ──
// Must stay in sync with normaliseStatus() in csv/parser.ts
const EXCLUDED_REPS = ['Portal, OGP', 'Desmond, Tom', 'Ganly, Peter']

export function normaliseStatusFromStrings(args: {
  statusLabel:   string
  stageLabel:    string
  accountManager: string | null
  opportunityOwner: string | null
}): NormalisedStatus {
  const { statusLabel, stageLabel, accountManager, opportunityOwner } = args

  if (
    EXCLUDED_REPS.includes(accountManager ?? '') ||
    EXCLUDED_REPS.includes(opportunityOwner ?? '')
  ) return 'portal'

  if (statusLabel === 'Closed' || statusLabel === 'Implemented') return 'won'
  if (statusLabel === 'Lost')              return 'lost'
  if (statusLabel === 'Not Ready To Buy')  return 'on_hold'
  if (stageLabel  === 'Quarantine')        return 'on_hold_stale'
  if (statusLabel === 'Active')            return 'pipeline'

  return 'pipeline'
}

// ── Composite key — same format as CSV parser ────────────────
function buildCompositeKey(
  companyName: string,
  title: string,
  createDate: string | null
): string {
  const company = companyName.toLowerCase().trim()
  const opp     = (title || '').toLowerCase().trim()
  const date    = (createDate || '').split('T')[0]
  return `${company}||${opp}||${date}`
}

// ── Date helpers ──────────────────────────────────────────────
// Extract the date part from an API date string without UTC conversion.
// Autotask may return dates as "2026-06-09T00:00:00+01:00" (Irish midnight),
// which new Date(...).toISOString() shifts to "2026-06-08T23:00:00Z" — one day early.
// Slicing the string directly preserves the calendar date as stored in Autotask.
function toDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  return dateStr.slice(0, 10)
}

// ── Main transform ────────────────────────────────────────────
export function transformOpportunity(
  opp: AutotaskOpportunity,
  maps: LookupMaps
): Record<string, unknown> {
  const { picklists, resources, companies } = maps

  // ── Resolve company + account manager ────────────────────────
  // Autotask field may be 'accountID' or 'companyID' depending on instance version
  const accountId        = opp.accountID ?? (opp as Record<string, unknown>).companyID as number | undefined
  const company          = accountId != null ? companies.get(accountId) : undefined
  const companyName      = company?.name ?? (accountId != null ? `Account#${accountId}` : 'Unknown Account')
  const accountManagerId = company?.accountManagerId ?? null
  const accountManager   = accountManagerId ? (resources.get(accountManagerId) ?? null) : null
  const opportunityOwner = opp.ownerResourceID ? (resources.get(opp.ownerResourceID) ?? null) : null

  // ── Resolve picklists ─────────────────────────────────────────
  const statusLabel        = resolveLabel(picklists.status,         opp.status,              'Active')!
  const stageLabel         = resolveLabel(picklists.stage,          opp.stage,               null)
  const categoryLabel      = resolveLabel(picklists.category,       opp.opportunityCategoryID, null)
  const classificationLabel = resolveLabel(picklists.classification, opp.classification as number | null, null)
  const lobLabel           = resolveLabel(picklists.lineOfBusiness,  opp.lineOfBusiness,      null)
  const ratingLabel        = resolveLabel(picklists.rating,          opp.rating,              null)

  // ── Normalise status ──────────────────────────────────────────
  const normalisedStatus = normaliseStatusFromStrings({
    statusLabel,
    stageLabel:    stageLabel ?? '',
    accountManager,
    opportunityOwner,
  })

  // ── Financials ────────────────────────────────────────────────
  const revenueTotal = Number(opp.amount)           || 0
  const costTotal    = Number(opp.cost)             || 0
  const grossProfit  = opp.grossProfit != null
    ? Number(opp.grossProfit)
    : revenueTotal - costTotal
  const grossMarginPct = revenueTotal > 0
    ? (grossProfit / revenueTotal) * 100
    : 0

  // One-time amounts — only set if the API actually returns these fields.
  // onetimeRevenue / setupFee are not present in all Autotask instances;
  // falling back to opp.amount produces misleading data (87% of deals wrong).
  const raw = opp as Record<string, unknown>
  const revenueOneTime = raw.onetimeRevenue != null ? Number(raw.onetimeRevenue)
    : raw.setupFee     != null ? Number(raw.setupFee)
    : null
  const costOneTime = raw.onetimeCost != null ? Number(raw.onetimeCost) : null

  // ── Computed fields ───────────────────────────────────────────
  const ageDays = opp.createDate
    ? Math.floor((Date.now() - new Date(opp.createDate).getTime()) / 86_400_000)
    : null

  const isOverdue =
    normalisedStatus === 'pipeline' &&
    !!opp.projectedCloseDate &&
    (Date.now() - new Date(opp.projectedCloseDate).getTime()) / 86_400_000 > 7

  return {
    // ── Identity ──────────────────────────────────────────────
    autotask_id:      opp.id,
    composite_key:    buildCompositeKey(companyName, opp.title, opp.createDate),

    // ── Core fields ───────────────────────────────────────────
    company:              companyName,
    opportunity_name:     opp.title?.trim() ?? '',
    opportunity_owner:    opportunityOwner,
    account_manager:      accountManager,
    category:             categoryLabel,
    classification:       classificationLabel,
    stage:                stageLabel,
    status:               statusLabel,
    normalised_status:    normalisedStatus,

    // ── Dates ─────────────────────────────────────────────────
    // created_date / last_activity are TIMESTAMPTZ — keep full ISO string.
    // projected_close_date / closed_date are DATE — use toDateOnly() to avoid
    // timezone shifts that move dates one day earlier.
    created_date:         opp.createDate         ? new Date(opp.createDate).toISOString()         : null,
    projected_close_date: opp.projectedCloseDate  ? toDateOnly(opp.projectedCloseDate)             : null,
    // closed_date fallback for won deals.
    // NOTE: lastActivity is intentionally excluded — it updates on every deal touch,
    // so using it as a close date proxy moves deals into the wrong reporting week.
    //   1. closedDate — authoritative (populated by Autotask when deal is won)
    //   2. projectedCloseDate — approximation; better than null, keeps deal visible
    //   3. undefined — never overwrite an existing DB value with null
    closed_date: (() => {
      if (normalisedStatus !== 'won') return undefined
      const closedDate =
        (raw.closedDate as string | null) ??
        (raw.closeDate  as string | null)
      if (closedDate) return toDateOnly(closedDate)
      const projDate = toDateOnly(
        (raw.projectedCloseDate as string | null) ??
        (raw.estimatedCloseDate as string | null)
      )
      if (projDate) return projDate
      return undefined
    })(),
    last_activity:        opp.lastActivityDate    ? new Date(opp.lastActivityDate).toISOString()    : null,

    // ── Financials ────────────────────────────────────────────
    revenue_total:    revenueTotal,
    revenue_one_time: revenueOneTime,
    cost_total:       costTotal,
    cost_one_time:    costOneTime,
    gross_profit:     grossProfit,
    gross_margin_pct: grossMarginPct,

    // ── Extra fields ──────────────────────────────────────────
    age_days:         ageDays,
    contact:          null,    // Contacts lookup not yet implemented
    description:      opp.description?.trim() ?? null,
    line_of_business: lobLabel,
    product_category: null,    // May be a UDF in some AT installations
    market:           null,
    rating:           ratingLabel,

    // ── Data quality flags ────────────────────────────────────
    cost_missing:       revenueTotal > 0 && costTotal === 0,
    is_negative_margin: grossProfit < 0,
    is_overdue:         isOverdue,

    last_imported_at: new Date().toISOString(),
  }
}
