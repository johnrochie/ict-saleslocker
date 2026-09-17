// ============================================================
// ICT SalesIQ — POST /api/bullhorn/sync  (manual trigger)
//                   GET  /api/bullhorn/sync  (Vercel cron)
// ============================================================
// Manual POST: requires admin or sales_manager session
// Vercel cron GET: requires Authorization: Bearer CRON_SECRET
// v1 — Job Orders, Job Submissions, Placements
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { isBullhornConfigured } from '@/lib/bullhorn/client'
import { syncAll } from '@/lib/bullhorn/sync'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  return runSync('cron')
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

async function runSync(triggeredBy: string) {
  if (!isBullhornConfigured()) {
    return NextResponse.json(
      {
        error: 'Bullhorn not configured.',
        hint: 'Add BULLHORN_CLIENT_ID, BULLHORN_CLIENT_SECRET, BULLHORN_REDIRECT_URI to environment variables.',
      },
      { status: 503 }
    )
  }

  try {
    const results = await syncAll(triggeredBy)
    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bullhorn sync failed'
    console.error('[api/bullhorn/sync] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
