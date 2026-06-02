// ============================================================
// ICT SalesLocker — Autotask REST API Types
// ============================================================

// ── Raw API response shape for Opportunities ─────────────────
// Field names follow Autotask REST API v1.0 conventions.
// Picklist fields (status, stage, etc.) are integer IDs resolved
// at sync time via the entity fields endpoint.
export interface AutotaskOpportunity {
  id: number
  title: string                         // Opportunity name
  accountID?: number                    // → Companies.id (some instances use companyID instead)
  companyID?: number                    // → Companies.id (alias used by some Autotask instances)
  ownerResourceID: number               // Opportunity Owner → Resources.id
  contactID: number | null              // → Contacts.id (optional lookup)
  status: number                        // Picklist int
  stage: number                         // Picklist int
  probability: number
  amount: number                        // Total revenue
  cost: number                          // Total cost
  grossProfit?: number | null           // May be returned directly
  projectedCloseDate: string | null
  createDate: string | null
  closedDate: string | null
  lastActivityDate: string | null       // Used for incremental sync
  description: string | null
  opportunityCategoryID: number | null  // Picklist int
  classification: number | null         // Picklist int
  lineOfBusiness: number | null         // Picklist int
  rating: number | null                 // Picklist int
  // One-time amounts (may or may not be present depending on AT version)
  setupFee?: number | null
  monthlyCost?: number | null
  // Catch-all for additional fields returned by the API
  [key: string]: unknown
}

// ── Raw Company record ────────────────────────────────────────
export interface AutotaskCompany {
  id: number
  companyName: string
  ownerResourceID: number | null        // Account Manager → Resources.id
  isActive?: boolean
  [key: string]: unknown
}

// ── Raw Resource (user / rep) ─────────────────────────────────
export interface AutotaskResource {
  id: number
  firstName: string
  lastName: string
  isActive: boolean
  [key: string]: unknown
}

// ── Entity field definition (for picklist resolution) ─────────
export interface AutotaskField {
  name: string
  dataType: string
  isPickList: boolean
  picklistValues?: Array<{
    value: string
    label: string
    isActive: boolean
    isDefaultValue: boolean
  }>
}

// ── API pagination response wrapper ──────────────────────────
export interface AutotaskQueryResponse<T> {
  items: T[]
  pageDetails?: {
    count: number
    requestCount: number
    prevPageUrl: string | null
    nextPageUrl: string | null
  }
}

// ── Sync result (extends ImportResult for reuse) ─────────────
export interface SyncResult {
  rows_processed: number
  rows_inserted: number
  rows_updated: number
  rows_skipped: number
  errors: Array<{ row: number; message: string }>
  status: 'success' | 'partial' | 'failed'
  sync_type: 'full' | 'incremental'
  duration_ms: number
}
