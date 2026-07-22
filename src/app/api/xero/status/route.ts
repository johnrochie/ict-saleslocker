// ============================================================
// ICT SalesIQ — GET /api/xero/status
// Confirms whether Xero is connected and makes one live call
// to prove the stored token actually works.
// ============================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectedClient, isXeroConfigured } from '@/lib/xero/client'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!isXeroConfigured()) {
    return NextResponse.json({ connected: false, error: 'Xero not configured' }, { status: 503 })
  }

  try {
    const { xero, tenantId } = await getConnectedClient()
    const response = await xero.accountingApi.getOrganisations(tenantId)
    const org = response.body.organisations?.[0]

    return NextResponse.json({
      connected: true,
      tenantId,
      organisationName: org?.name ?? null,
      organisationCountry: org?.countryCode ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Xero status check failed'
    return NextResponse.json({ connected: false, error: message }, { status: 500 })
  }
}
