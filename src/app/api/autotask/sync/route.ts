// ============================================================
// ICT SalesLocker — POST /api/autotask/sync  (manual trigger)
//                   GET  /api/autotask/sync  (Vercel cron)
// ============================================================
// Manual POST: requires admin or sales_manager session
// Vercel cron GET: requires Authorization: Bearer CRON_SECRET
// v4 — always full sync (no lastModifiedDate on Opportunities)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { AutotaskClient } from '@/lib/autotask/client'
import { syncOpportunities } from '@/lib/autotask/sync'

// ── Vercel cron: GET with Authorization: Bearer CRON_SECRET ──
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  return runSync('cron')
}

// ── Manual trigger: POST from authenticated user ──────────────
export async function POST(request: NextRequest) {
  // Suppress unused warning — request used for auth check below
  void request

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return runSync(user.email ?? user.id)
}

// ── Shared sync runner ────────────────────────────────────────
// v5 — clear last sync time before each run so the full-scan filter is always used.
// The Opportunities entity has no lastModifiedDate field; incremental filters fail.
async function runSync(triggeredBy: string) {
  if (!AutotaskClient.isConfigured()) {
    return NextResponse.json(
      {
        error: 'Autotask not configured.',
        hint: 'Add AUTOTASK_USERNAME, AUTOTASK_SECRET, AUTOTASK_INTEGRATION_CODE to environment variables.',
      },
      { status: 503 }
    )
  }

  // Mark any previous successful sync logs as superseded so getLastSyncTime()
  // returns null and the sync always runs a full scan (companyID >= 1).
  // This is required because the Autotask Opportunities entity has no
  // lastModifiedDate field — incremental filters cause a 500 error.
  const admin = createAdminSupabaseClient()
  await admin
    .from('import_logs')
    .update({ status: 'superseded' })
    .eq('filename', 'autotask-api')
    .eq('status', 'success')
  console.log('[api/autotask/sync] Cleared previous sync logs — forcing full scan')

  try {
    const result = await syncOpportunities(triggeredBy)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[api/autotask/sync] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
