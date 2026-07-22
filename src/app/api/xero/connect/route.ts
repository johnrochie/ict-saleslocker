// ============================================================
// ICT SalesIQ — GET /api/xero/connect
// Redirects an authorised admin/sales_manager to the Xero
// consent screen to start the OAuth2 flow.
// ============================================================

import { NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { getConsentUrl, isXeroConfigured } from '@/lib/xero/client'

export async function GET() {
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
    const url = await getConsentUrl()
    return NextResponse.redirect(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build Xero consent URL'
    console.error('[api/xero/connect] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
