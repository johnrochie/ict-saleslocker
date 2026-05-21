// ============================================================
// ICT SalesLocker — Autotask Picklist Resolution
// ============================================================
// Fetches entity field definitions and builds label maps.
// These are installation-specific, so we fetch live per sync.
// ============================================================

import type { AutotaskClient } from './client'

export type PicklistMap = Map<number, string>

export interface OpportunityPicklists {
  status:         PicklistMap  // Opportunity.status     → "Active", "Closed", "Lost" …
  stage:          PicklistMap  // Opportunity.stage      → "Proposal", "Negotiation" …
  category:       PicklistMap  // opportunityCategoryID  → "Managed Services", "Cloud" …
  classification: PicklistMap  // Opportunity.classification
  lineOfBusiness: PicklistMap  // Opportunity.lineOfBusiness
  rating:         PicklistMap  // Opportunity.rating
}

// ── Build a Map<id, label> for one field ─────────────────────
function buildPicklistMap(
  fields: Awaited<ReturnType<AutotaskClient['getEntityFields']>>,
  fieldName: string
): PicklistMap {
  const field = fields.find(
    f => f.name.toLowerCase() === fieldName.toLowerCase()
  )
  if (!field?.picklistValues?.length) {
    console.warn(`[autotask/picklists] No picklist values found for field: ${fieldName}`)
    return new Map()
  }
  return new Map(
    field.picklistValues
      .filter(v => v.isActive)
      .map(v => [parseInt(v.value, 10), v.label])
  )
}

// ── Fetch all picklists for the Opportunities entity ─────────
export async function fetchOpportunityPicklists(
  client: AutotaskClient
): Promise<OpportunityPicklists> {
  const fields = await client.getEntityFields('Opportunities')

  return {
    status:         buildPicklistMap(fields, 'status'),
    stage:          buildPicklistMap(fields, 'stage'),
    category:       buildPicklistMap(fields, 'opportunityCategoryID'),
    classification: buildPicklistMap(fields, 'classification'),
    lineOfBusiness: buildPicklistMap(fields, 'lineOfBusiness'),
    rating:         buildPicklistMap(fields, 'rating'),
  }
}

// ── Resolve a picklist int → label (with safe fallback) ──────
export function resolveLabel(
  map: PicklistMap,
  value: number | null | undefined,
  fallback: string | null = null
): string | null {
  if (value == null) return fallback
  return map.get(value) ?? fallback
}
