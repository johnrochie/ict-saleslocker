// ============================================================
// ICT SalesIQ — GET /api/autotask/probe
// Temporary diagnostic: discover an Autotask entity's fields
// and return a sample of records. Admin only. Delete after use.
// Usage: GET /api/autotask/probe?entity=SalesActivities
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { AutotaskClient } from '@/lib/autotask/client'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const url    = new URL(request.url)
  const entity = url.searchParams.get('entity') ?? 'SalesActivities'

  // Optional: ?filter=[{"op":"exist","field":"opportunityID"}] to target
  // specific records instead of the lowest-ID (usually oldest) rows.
  const filterParam = url.searchParams.get('filter')
  let filter: unknown[] = [{ op: 'gte', field: 'id', value: 1 }]
  if (filterParam) {
    try {
      filter = JSON.parse(filterParam)
    } catch {
      return NextResponse.json({ error: 'filter param must be valid JSON' }, { status: 400 })
    }
  }

  if (!AutotaskClient.isConfigured()) {
    return NextResponse.json({ error: 'Autotask not configured' }, { status: 503 })
  }

  const client = new AutotaskClient()

  try {
    const fields = await client.getEntityFields(entity)
    const base   = await client.getBaseUrl()
    const res    = await fetch(`${base}/${entity}/query`, {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'UserName':           process.env.AUTOTASK_USERNAME!,
        'Secret':             process.env.AUTOTASK_SECRET!,
        'ApiIntegrationCode': process.env.AUTOTASK_INTEGRATION_CODE ?? '',
      },
      body: JSON.stringify({ filter }),
    })
    const sample = res.ok
      ? await res.json()
      : { error: res.status, body: await res.text().catch(() => '') }

    return NextResponse.json({
      entity,
      filterUsed:    filter,
      fieldCount:    fields.length,
      fields:        fields.map(f => ({ name: f.name, dataType: f.dataType, isPickList: f.isPickList })),
      sampleCount:   sample?.items?.length ?? 0,
      sampleRecords: sample?.items?.slice(0, 5) ?? sample,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
