// ============================================================
// ICT SalesLocker — Core Types
// ============================================================

export type NormalisedStatus =
  | 'pipeline'
  | 'on_hold'
  | 'on_hold_stale'
  | 'won'
  | 'lost'
  | 'portal'

export type UserRole = 'admin' | 'sales_manager' | 'sales_rep' | 'read_only'

// -- Opportunity ---------------------------------------------
export interface Opportunity {
  id: string
  autotask_id: number | null   // Set by API sync; null for CSV-imported records
  composite_key: string

  company: string
  opportunity_name: string
  opportunity_owner: string | null
  account_manager: string | null

  category: string | null
  classification: string | null
  stage: string | null
  status: string | null
  normalised_status: NormalisedStatus

  created_date: string | null
  projected_close_date: string | null
  closed_date: string | null
  last_activity: string | null

  revenue_total: number
  revenue_one_time: number
  cost_total: number
  cost_one_time: number
  gross_profit: number
  gross_margin_pct: number

  age_days: number | null
  contact: string | null
  description: string | null
  line_of_business: string | null
  product_category: string | null
  market: string | null
  rating: string | null

  cost_missing: boolean
  is_negative_margin: boolean
  is_overdue: boolean

  last_imported_at: string
  created_at: string
  updated_at: string
}

// -- Stage Weight --------------------------------------------
export interface StageWeight {
  stage: string
  weight_pct: number
  display_order: number
}

// -- Profile -------------------------------------------------
export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  autotask_name: string | null
  created_at: string
  updated_at: string
}

// -- Import Log ----------------------------------------------
export interface ImportLog {
  id: string
  imported_at: string
  imported_by: string | null
  filename: string | null
  rows_processed: number
  rows_inserted: number
  rows_updated: number
  rows_skipped: number
  error_count: number
  errors: Array<{ row: number; message: string }> | null
  status: 'success' | 'partial' | 'failed'
}

// -- Dashboard Metrics ---------------------------------------
export interface DashboardMetrics {
  pipeline_revenue: number
  pipeline_count: number
  won_revenue: number
  won_count: number
  won_gross_profit: number
  lost_revenue: number
  lost_count: number
  total_gross_profit: number
  win_rate: number
  overdue_count: number
  stale_count: number
  weighted_pipeline: number
}

// -- CSV Row (raw parsed from Autotask export) ---------------
export interface AutotaskCsvRow {
  Company: string
  Opportunity: string
  'Opportunity Owner': string
  'Account Manager': string
  'Opportunity Category': string
  Classification: string
  Stage: string
  'Create Date': string
  'Projected Close Date': string
  'Revenue (Total)': string
  'Age (in days)': string
  Contact: string
  Description: string
  Status: string
  'Cost (Total)': string
  'Revenue (One-Time)': string
  'Gross Profit': string
  'Last Activity': string
  'Line of Business': string
  'Product Category': string
  'Gross Profit Percentage': string
  'Cost (One-Time)': string
  'Closed Date': string
  Market: string
  Rating: string
}

// -- Import Result -------------------------------------------
export interface ImportResult {
  rows_processed: number
  rows_inserted: number
  rows_updated: number
  rows_skipped: number
  errors: Array<{ row: number; message: string }>
  status: 'success' | 'partial' | 'failed'
}
