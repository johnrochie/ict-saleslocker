// ============================================================
// ICT SalesLocker — Autotask CSV Parser & Ingest Engine
// ============================================================
// Handles:
//  - Euro currency strings  (€1,234,567.89 → number)
//  - DD/MM/YYYY HH:MM dates → ISO
//  - Status / stage normalisation
//  - Composite key generation
//  - Data quality flagging
//  - Upsert logic via Supabase
// ============================================================

import Papa from 'papaparse'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import type { AutotaskCsvRow, ImportResult, NormalisedStatus } from '@/types'

// ── Overdue threshold (days past projected close) ────────────
const OVERDUE_THRESHOLD_DAYS = 7
// ── Stale threshold (days since last activity) ───────────────
// (stored on the record for dashboard use — not computed here)

// ── Currency string → number ─────────────────────────────────
// Handles: "€1,234,567.89" | "€0.00" | "" | undefined
function parseCurrency(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 0
  const cleaned = raw.replace(/[€,\s]/g, '').trim()
  if (cleaned === '' || cleaned === '-') return 0
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

// ── Percentage string → number ───────────────────────────────
// Handles: "7.00%" | "100.00%" | "-122.62%"
function parsePercent(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 0
  const cleaned = raw.replace('%', '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

// ── Date string → ISO string or null ─────────────────────────
// Handles: "21/04/2026 02:10 PM" | "04/05/2026" | ""
function parseDate(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null

  // Strip time component if present
  const datePart = raw.trim().split(' ')[0]
  const [day, month, year] = datePart.split('/')

  if (!day || !month || !year) return null

  // Build ISO date — check validity
  const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  if (isNaN(d.getTime())) return null

  // If time component present, parse it too
  if (raw.includes(':')) {
    const timePart = raw.trim().split(' ').slice(1).join(' ') // "02:10 PM"
    const fullDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${convertTo24h(timePart)}`
    const fullDate = new Date(fullDateStr)
    return isNaN(fullDate.getTime()) ? d.toISOString() : fullDate.toISOString()
  }

  return d.toISOString().split('T')[0] // date only
}

function convertTo24h(timeStr: string): string {
  // "02:10 PM" → "14:10:00"
  const [time, meridiem] = timeStr.split(' ')
  if (!time) return '00:00:00'
  const [hours, minutes] = time.split(':').map(Number)

  let h = hours
  if (meridiem === 'PM' && hours !== 12) h = hours + 12
  if (meridiem === 'AM' && hours === 12) h = 0

  return `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

// ── Composite key ────────────────────────────────────────────
// Unique identifier for CSV upserts (no Autotask ID in export)
function buildCompositeKey(row: AutotaskCsvRow): string {
  const company = (row.Company || '').trim().toLowerCase()
  const opp = (row.Opportunity || '').trim().toLowerCase()
  const date = (row['Create Date'] || '').trim().split(' ')[0] // date part only
  return `${company}||${opp}||${date}`
}

// ── Status normalisation ─────────────────────────────────────
// Maps raw Autotask status + stage → SalesLocker normalised_status
function normaliseStatus(row: AutotaskCsvRow): NormalisedStatus {
  const status = (row.Status || '').trim()
  const stage  = (row.Stage  || '').trim()
  const accountManager = (row['Account Manager'] || '').trim()

  // Portal, OGP entries — grouped separately
  if (accountManager === 'Portal, OGP') return 'portal'

  // Won
  if (status === 'Closed' || status === 'Implemented') return 'won'

  // Lost
  if (status === 'Lost') return 'lost'

  // On Hold — explicit
  if (status === 'Not Ready To Buy') return 'on_hold'

  // On Hold — stale (Quarantine stage = 90+ days no update)
  if (stage === 'Quarantine') return 'on_hold_stale'

  // Active = Pipeline
  if (status === 'Active') return 'pipeline'

  // Default fallback
  return 'pipeline'
}

// ── Overdue check ────────────────────────────────────────────
function isOverdue(row: AutotaskCsvRow, normalisedStatus: NormalisedStatus): boolean {
  if (normalisedStatus !== 'pipeline') return false

  const closeDateStr = (row['Projected Close Date'] || '').trim()
  if (!closeDateStr) return false

  const closeDate = parseDate(closeDateStr)
  if (!closeDate) return false

  const close = new Date(closeDate)
  const today = new Date()
  const diffDays = (today.getTime() - close.getTime()) / (1000 * 60 * 60 * 24)

  return diffDays > OVERDUE_THRESHOLD_DAYS
}

// ── Cost missing flag ─────────────────────────────────────────
// Flag when revenue > 0 but cost is 0 (likely unentered, not genuine 0-cost)
function isCostMissing(revenue: number, cost: number): boolean {
  return revenue > 0 && cost === 0
}

// ── Transform CSV row → DB record ────────────────────────────
function transformRow(row: AutotaskCsvRow, rowIndex: number): {
  record: Record<string, unknown>
  error: string | null
} {
  try {
    if (!row.Company?.trim() || !row.Opportunity?.trim()) {
      return { record: {}, error: 'Missing Company or Opportunity name' }
    }

    const normalisedStatus = normaliseStatus(row)
    const revenueTotal     = parseCurrency(row['Revenue (Total)'])
    const costTotal        = parseCurrency(row['Cost (Total)'])
    const revenueOneTime   = parseCurrency(row['Revenue (One-Time)'])
    const costOneTime      = parseCurrency(row['Cost (One-Time)'])
    const grossProfit      = parseCurrency(row['Gross Profit'])
    const grossMarginPct   = parsePercent(row['Gross Profit Percentage'])

    const record = {
      composite_key:        buildCompositeKey(row),
      company:              row.Company?.trim(),
      opportunity_name:     row.Opportunity?.trim(),
      opportunity_owner:    row['Opportunity Owner']?.trim() || null,
      account_manager:      row['Account Manager']?.trim() || null,
      category:             row['Opportunity Category']?.trim() || null,
      classification:       row.Classification?.trim() || null,
      stage:                row.Stage?.trim() || null,
      status:               row.Status?.trim() || null,
      normalised_status:    normalisedStatus,

      created_date:         parseDate(row['Create Date']),
      projected_close_date: parseDate(row['Projected Close Date']),
      closed_date:          parseDate(row['Closed Date']),
      last_activity:        parseDate(row['Last Activity']),

      revenue_total:        revenueTotal,
      revenue_one_time:     revenueOneTime,
      cost_total:           costTotal,
      cost_one_time:        costOneTime,
      gross_profit:         grossProfit,
      gross_margin_pct:     grossMarginPct,

      age_days:             parseInt(row['Age (in days)'] || '0') || null,
      contact:              row.Contact?.trim() || null,
      description:          row.Description?.trim() || null,
      line_of_business:     row['Line of Business']?.trim() || null,
      product_category:     row['Product Category']?.trim() || null,
      market:               row.Market?.trim() || null,
      rating:               row.Rating?.trim() || null,

      cost_missing:         isCostMissing(revenueTotal, costTotal),
      is_negative_margin:   grossProfit < 0,
      is_overdue:           isOverdue(row, normalisedStatus),

      last_imported_at:     new Date().toISOString(),
    }

    return { record, error: null }
  } catch (err) {
    return {
      record: {},
      error: `Row ${rowIndex}: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ── Main ingest function ─────────────────────────────────────
export async function ingestCsv(
  csvContent: string,
  filename: string,
  importedBy: string
): Promise<ImportResult> {
  const result: ImportResult = {
    rows_processed: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    errors: [],
    status: 'success',
  }

  // Parse CSV
  const parsed = Papa.parse<AutotaskCsvRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  if (parsed.errors.length > 0) {
    result.errors.push({ row: 0, message: `CSV parse error: ${parsed.errors[0].message}` })
    result.status = 'failed'
    return result
  }

  const rows = parsed.data
  result.rows_processed = rows.length

  if (rows.length === 0) {
    result.status = 'failed'
    result.errors.push({ row: 0, message: 'CSV file contains no data rows' })
    return result
  }

  // Transform all rows
  const validRecords: Record<string, unknown>[] = []

  rows.forEach((row, idx) => {
    const { record, error } = transformRow(row, idx + 2) // +2 for header row
    if (error) {
      result.errors.push({ row: idx + 2, message: error })
      result.rows_skipped++
    } else {
      validRecords.push(record)
    }
  })

  if (validRecords.length === 0) {
    result.status = 'failed'
    return result
  }

  // Upsert to Supabase in batches of 500
  const supabase = createAdminSupabaseClient()
  const BATCH_SIZE = 500

  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const batch = validRecords.slice(i, i + BATCH_SIZE)

    const { data, error } = await supabase
      .from('opportunities')
      .upsert(batch, {
        onConflict: 'composite_key',
        ignoreDuplicates: false, // update existing records
      })
      .select('id, created_at, updated_at')

    if (error) {
      result.errors.push({
        row: i,
        message: `Database error (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`,
      })
      result.rows_skipped += batch.length
      continue
    }

    // Count inserts vs updates by checking created_at vs updated_at proximity
    if (data) {
      data.forEach((record) => {
        const created = new Date(record.created_at).getTime()
        const updated = new Date(record.updated_at).getTime()
        const diffMs = Math.abs(updated - created)
        if (diffMs < 2000) {
          result.rows_inserted++
        } else {
          result.rows_updated++
        }
      })
    }
  }

  // Log the import
  await supabase.from('import_logs').insert({
    imported_by:   importedBy,
    filename:      filename,
    rows_processed: result.rows_processed,
    rows_inserted:  result.rows_inserted,
    rows_updated:   result.rows_updated,
    rows_skipped:   result.rows_skipped,
    error_count:    result.errors.length,
    errors:         result.errors.length > 0 ? result.errors : null,
    status:         result.errors.length === 0
      ? 'success'
      : result.rows_inserted + result.rows_updated > 0
        ? 'partial'
        : 'failed',
  })

  result.status = result.errors.length === 0
    ? 'success'
    : result.rows_inserted + result.rows_updated > 0
      ? 'partial'
      : 'failed'

  return result
}
