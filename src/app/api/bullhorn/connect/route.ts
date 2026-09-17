// ============================================================
// ICT SalesIQ — GET /api/bullhorn/connect
// Redirects an authorised admin/sales_manager to the Bullhorn
// consent screen to start the OAuth2 flow.
// ============================================================

import { NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { getConsentUrl, isBullhornConfigured } from '@/lib/bullhorn/client'

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
    return NextResponse.redirect(getConsentUrl())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build Bullhorn consent URL'
    console.error('[api/bullhorn/connect] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
