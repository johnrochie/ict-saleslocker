// ============================================================
// ICT SalesLocker — GET /api/autotask/status
// ============================================================
// Returns Autotask sync configuration status + last sync info.
// Used by the Upload Data page to show current state.
// ============================================================

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { AutotaskClient } from '@/lib/autotask/client'

export async function GET() {
  const configured = AutotaskClient.isConfigured()

  if (!configured) {
    return NextResponse.json({ configured: false, last_sync: null })
  }

  // Fetch last sync log entry (success or partial)
  const admin = createAdminSupabaseClient()
  const { data: lastLog } = await admin
    .from('import_logs')
    .select('imported_at, rows_processed, rows_inserted, rows_updated, rows_skipped, status, error_count')
    .eq('filename', 'autotask-api')
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Also get total opportunity count from DB
  const { count } = await admin
    .from('opportunities')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    configured: true,
    last_sync: lastLog
      ? {
          at:             lastLog.imported_at,
          status:         lastLog.status,
          rows_processed: lastLog.rows_processed,
          rows_inserted:  lastLog.rows_inserted,
          rows_updated:   lastLog.rows_updated,
          rows_skipped:   lastLog.rows_skipped,
          error_count:    lastLog.error_count,
        }
      : null,
    total_opportunities: count ?? 0,
  })
}
