// ============================================================
// ICT SalesIQ — GET /api/autotask-qpo/status
// Last charges sync + row counts. Signed-in users only.
// ============================================================

import { NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { AutotaskClient } from '@/lib/autotask/client'
import { QPO_LOG_FILE } from '@/lib/autotask-qpo/sync'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const count = async (table: string) =>
    (await admin.from(table).select('*', { count: 'exact', head: true })).count ?? 0

  const [{ data: lastLog }, charges, billing, tickets, invoices] = await Promise.all([
    admin.from('import_logs')
      .select('imported_at, rows_processed, rows_inserted, status, error_count, errors')
      .eq('filename', QPO_LOG_FILE)
      .order('imported_at', { ascending: false })
      .limit(1).maybeSingle(),
    count('autotask_ticket_charges'),
    count('autotask_billing_items'),
    count('autotask_tickets_lite'),
    count('autotask_invoices_lite'),
  ])

  return NextResponse.json({
    configured: AutotaskClient.isConfigured(),
    last_sync: lastLog ?? null,
    counts: { charges, billing_items: billing, tickets, invoices },
  })
}
