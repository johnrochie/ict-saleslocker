import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const adminClient = createAdminSupabaseClient()
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json()
  const { snapshot_name, snapshot_date } = body

  if (!snapshot_name?.trim()) {
    return NextResponse.json({ error: 'Snapshot name is required' }, { status: 400 })
  }

  // Check name not already used
  const { data: existing } = await adminClient
    .from('pipeline_snapshots')
    .select('id')
    .eq('snapshot_name', snapshot_name.trim())
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'A snapshot with this name already exists. Please use a different name.' },
      { status: 409 }
    )
  }

  // Fetch all non-portal pipeline + on_hold opportunities
  const { data: opps, error: oppsError } = await adminClient
    .from('opportunities')
    .select('*')
    .in('normalised_status', ['pipeline', 'on_hold', 'on_hold_stale'])
    .neq('account_manager', 'Portal, OGP')

  if (oppsError) {
    return NextResponse.json({ error: 'Failed to fetch opportunities: ' + oppsError.message }, { status: 500 })
  }

  if (!opps || opps.length === 0) {
    return NextResponse.json({ error: 'No active pipeline data to snapshot' }, { status: 400 })
  }

  // Build snapshot rows
  const snapshotRows = opps.map((opp) => ({
    snapshot_name:    snapshot_name.trim(),
    snapshot_date:    snapshot_date || new Date().toISOString().slice(0, 10),
    taken_by:         user.email,
    composite_key:    opp.composite_key,
    company:          opp.company,
    opportunity_name: opp.opportunity_name,
    account_manager:  opp.account_manager,
    opportunity_owner: opp.opportunity_owner,
    category:         opp.category,
    stage:            opp.stage,
    status:           opp.status,
    normalised_status: opp.normalised_status,
    revenue_total:    opp.revenue_total,
    gross_profit:     opp.gross_profit,
    gross_margin_pct: opp.gross_margin_pct,
    projected_close_date: opp.projected_close_date,
    age_days:         opp.age_days,
  }))

  // Insert in batches
  const BATCH = 500
  for (let i = 0; i < snapshotRows.length; i += BATCH) {
    const { error } = await adminClient
      .from('pipeline_snapshots')
      .insert(snapshotRows.slice(i, i + BATCH))

    if (error) {
      return NextResponse.json({ error: 'Failed to save snapshot: ' + error.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    snapshot_name: snapshot_name.trim(),
    snapshot_date: snapshot_date || new Date().toISOString().slice(0, 10),
    deals_saved: snapshotRows.length,
  })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const adminClient = createAdminSupabaseClient()

  // Return distinct snapshot names with counts
  const { data, error } = await adminClient
    .from('pipeline_snapshots')
    .select('snapshot_name, snapshot_date, taken_by, created_at')
    .order('snapshot_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate by name
  const seen = new Set<string>()
  const snapshots: { name: string; date: string; taken_by: string | null; created_at: string; count?: number }[] = []

  for (const row of (data || [])) {
    if (!seen.has(row.snapshot_name)) {
      seen.add(row.snapshot_name)
      snapshots.push({
        name: row.snapshot_name,
        date: row.snapshot_date,
        taken_by: row.taken_by,
        created_at: row.created_at,
      })
    }
  }

  // Get counts
  for (const s of snapshots) {
    const { count } = await adminClient
      .from('pipeline_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_name', s.name)
    s.count = count ?? 0
  }

  return NextResponse.json({ snapshots })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const adminClient = createAdminSupabaseClient()
  const { data: profile } = await adminClient
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required to delete snapshots' }, { status: 403 })
  }

  const { snapshot_name } = await request.json()
  await adminClient.from('pipeline_snapshots').delete().eq('snapshot_name', snapshot_name)

  return NextResponse.json({ success: true })
}
