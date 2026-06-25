import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { opportunity_id } = await request.json()
  if (!opportunity_id) return NextResponse.json({ error: 'opportunity_id required' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  // Fetch opportunity
  const { data: opp } = await admin
    .from('opportunities')
    .select('id, autotask_id, company, opportunity_name, gross_margin_pct, revenue_total, normalised_status')
    .eq('id', opportunity_id)
    .single()

  if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  // Fetch threshold
  const { data: setting } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'po_approval_margin_threshold')
    .single()

  const threshold = parseFloat(setting?.value ?? '20')

  if ((opp.gross_margin_pct ?? 0) >= threshold) {
    return NextResponse.json(
      { error: `Margin ${opp.gross_margin_pct?.toFixed(1)}% is above threshold ${threshold}% — no approval required` },
      { status: 400 }
    )
  }

  // Check for existing pending request
  const { data: existing } = await admin
    .from('po_approvals')
    .select('id, status')
    .eq('opportunity_id', opportunity_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A pending approval request already exists for this opportunity' }, { status: 409 })
  }

  const { data, error } = await admin
    .from('po_approvals')
    .insert({
      opportunity_id,
      autotask_id:      opp.autotask_id,
      company:          opp.company,
      opportunity_name: opp.opportunity_name,
      requested_by:     user.email ?? user.id,
      gross_margin_pct: opp.gross_margin_pct,
      revenue_total:    opp.revenue_total,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, approval: data })
}
