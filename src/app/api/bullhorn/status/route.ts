// ============================================================
// ICT SalesIQ — GET /api/bullhorn/status
// Confirms whether Bullhorn is connected and makes one live call
// to prove the stored session actually works.
// ============================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectedSession, bullhornGet, isBullhornConfigured } from '@/lib/bullhorn/client'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!isBullhornConfigured()) {
    return NextResponse.json({ connected: false, error: 'Bullhorn not configured' }, { status: 503 })
  }

  try {
    const { restUrl } = await getConnectedSession()
    const corp = await bullhornGet<{ data?: Array<{ name?: string }> }>('/query/Corporation', {
      fields: 'id,name',
      count: '1',
    })

    return NextResponse.json({
      connected: true,
      restUrl,
      organisationName: corp.data?.[0]?.name ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bullhorn status check failed'
    return NextResponse.json({ connected: false, error: message }, { status: 500 })
  }
}
