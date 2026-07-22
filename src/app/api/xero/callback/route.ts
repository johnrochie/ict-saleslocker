// ============================================================
// ICT SalesIQ — GET /api/xero/callback
// Xero redirects here after consent. Exchanges the auth code
// for a token set and stores it, one row per connected tenant.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { handleCallback } from '@/lib/xero/client'

export async function GET(request: NextRequest) {
  try {
    const tenants = await handleCallback(request.url)
    return NextResponse.json({
      connected: true,
      tenants: tenants.map((t) => ({ tenantId: t.tenantId, tenantName: t.tenantName })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Xero callback failed'
    console.error('[api/xero/callback] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
