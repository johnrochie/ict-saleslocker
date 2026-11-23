// ============================================================
// ICT SalesIQ — /api/autotask-qpo/sync
//   GET  : Vercel cron, Authorization: Bearer CRON_SECRET
//   POST : manual trigger, admin or sales_manager session
// Syncs ticket charges + billing items (customer side).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { AutotaskClient } from '@/lib/autotask/client'
import { syncCharges } from '@/lib/autotask-qpo/sync'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  return runSync('cron')
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = createAdminSupabaseClient()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return await runSync(user.email ?? user.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync request failed'
    console.error('[api/autotask-qpo/sync] Auth/setup error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function runSync(triggeredBy: string) {
  if (!AutotaskClient.isConfigured()) {
    return NextResponse.json(
      { error: 'Autotask not configured.', hint: 'Set AUTOTASK_USERNAME, AUTOTASK_SECRET, AUTOTASK_INTEGRATION_CODE.' },
      { status: 503 },
    )
  }
  try {
    return NextResponse.json(await syncCharges(triggeredBy))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[api/autotask-qpo/sync] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
