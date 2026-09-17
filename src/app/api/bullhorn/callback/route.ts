// ============================================================
// ICT SalesIQ — GET /api/bullhorn/callback
// Bullhorn redirects here after consent with ?code=... Exchanges
// the code for an OAuth token, opens a REST session, and stores it.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { handleCallback } from '@/lib/bullhorn/client'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
  }

  try {
    await handleCallback(code)
    return NextResponse.json({ connected: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bullhorn callback failed'
    console.error('[api/bullhorn/callback] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
