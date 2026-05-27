// ============================================================
// ICT SalesLocker — POST /api/autotask/sync  (manual trigger)
//                   GET  /api/autotask/sync  (Vercel cron)
// ============================================================
// Manual POST: requires admin or sales_manager session
// Vercel cron GET: requires Authorization: Bearer CRON_SECRET
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
// v3 — dual dedup + DO NOTHING fallback
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

  try {
    const result = await syncOpportunities(triggeredBy)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[api/autotask/sync] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
