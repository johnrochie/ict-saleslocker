// ============================================================
// ICT SalesIQ — POST /api/xero/sync  (manual trigger)
//                   GET  /api/xero/sync  (Vercel cron)
// ============================================================
// Manual POST: requires admin or sales_manager session
// Vercel cron GET: requires Authorization: Bearer CRON_SECRET
// v1 — Contacts only
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { isXeroConfigured } from '@/lib/xero/client'
import { syncContacts } from '@/lib/xero/sync'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  return runSync()
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

  return runSync()
}

async function runSync() {
  if (!isXeroConfigured()) {
    return NextResponse.json(
      {
        error: 'Xero not configured.',
        hint: 'Add XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI to environment variables.',
      },
      { status: 503 }
    )
  }

  try {
    const contactsResult = await syncContacts()
    return NextResponse.json({ results: [contactsResult] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Xero sync failed'
    console.error('[api/xero/sync] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
