import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

function stageNum(s: string | null): number {
  if (!s) return 0
  const m = s.match(/Stage\s*(\d)/i)
  return m ? parseInt(m[1]) : 0
}

type Movement = 'won' | 'lost' | 'advanced' | 'regressed' | 'slipped' | 'new' | 'removed' | 'unchanged'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const snapshotName = searchParams.get('name')
  if (!snapshotName) return NextResponse.json({ error: 'name parameter required' }, { status: 400 })

  const adminClient = createAdminSupabaseClient()

  // Fetch snapshot
  const { data: snapshotRows, error: snapErr } = await adminClient
    .from('pipeline_snapshots')
    .select('*')
    .eq('snapshot_name', snapshotName)

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 })
  if (!snapshotRows?.length) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })

  // Fetch current opportunities (all statuses, not portal)
  const { data: currentOpps, error: currErr } = await adminClient
    .from('opportunities')
    .select('composite_key, company, opportunity_name, account_manager, category, stage, normalised_status, revenue_total, gross_profit, projected_close_date')
    .neq('normalised_status', 'portal')

  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 })

  const currentMap = new Map(
    (currentOpps || []).map((o) => [o.composite_key, o])
  )

  const movements: {
    composite_key: string
    company: string
    opportunity_name: string
    account_manager: string | null
    category: string | null
    movement: Movement
    prev_stage: string | null
    curr_stage: string | null
    prev_status: string
    curr_status: string
    revenue: number
    prev_close: string | null
    curr_close: string | null
  }[] = []

  // Classify snapshot deals
  for (const prev of snapshotRows) {
    const curr = currentMap.get(prev.composite_key)

    let movement: Movement = 'unchanged'

    if (!curr) {
      movement = 'removed'
    } else if (curr.normalised_status === 'won') {
      movement = 'won'
    } else if (curr.normalised_status === 'lost') {
      movement = 'lost'
    } else if (prev.normalised_status === 'pipeline' && curr.normalised_status !== 'pipeline') {
      movement = 'regressed'
    } else {
      const prevSN = stageNum(prev.stage)
      const currSN = stageNum(curr.stage)
      if (currSN > prevSN) {
        movement = 'advanced'
      } else if (currSN < prevSN && currSN > 0) {
        movement = 'regressed'
      } else if (prev.projected_close_date && curr.projected_close_date) {
        const days = (new Date(curr.projected_close_date).getTime() - new Date(prev.projected_close_date).getTime()) / 86400000
        if (days > 14) movement = 'slipped'
      }
    }

    movements.push({
      composite_key:    prev.composite_key,
      company:          prev.company,
      opportunity_name: prev.opportunity_name,
      account_manager:  prev.account_manager,
      category:         prev.category,
      movement,
      prev_stage:       prev.stage,
      curr_stage:       curr?.stage ?? null,
      prev_status:      prev.normalised_status,
      curr_status:      curr?.normalised_status ?? 'removed',
      revenue:          prev.revenue_total,
      prev_close:       prev.projected_close_date,
      curr_close:       curr?.projected_close_date ?? null,
    })
  }

  // Find new deals (in current pipeline but not in snapshot)
  const snapshotKeys = new Set(snapshotRows.map((r) => r.composite_key))
  for (const curr of (currentOpps || [])) {
    if (!snapshotKeys.has(curr.composite_key) && curr.normalised_status === 'pipeline') {
      movements.push({
        composite_key:    curr.composite_key,
        company:          curr.company,
        opportunity_name: curr.opportunity_name,
        account_manager:  curr.account_manager,
        category:         curr.category,
        movement:         'new',
        prev_stage:       null,
        curr_stage:       curr.stage,
        prev_status:      'new',
        curr_status:      curr.normalised_status,
        revenue:          curr.revenue_total,
        prev_close:       null,
        curr_close:       curr.projected_close_date,
      })
    }
  }

  return NextResponse.json({ movements })
}
