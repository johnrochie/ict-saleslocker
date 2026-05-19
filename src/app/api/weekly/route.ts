import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { SALES_TEAM_KEYS, isSalesTeamDeal, weekBounds } from '@/lib/config'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const offset   = parseInt(new URL(request.url).searchParams.get('offset') || '0')
  const admin    = createAdminSupabaseClient()
  const lastWeek = weekBounds(-1 + offset)
  const thisWeek = weekBounds(offset)

  const [
    { data: closedDeals },
    { data: closingDeals },
    { data: newEngagements },
  ] = await Promise.all([
    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, closed_date')
      .eq('normalised_status', 'won')
      .gte('closed_date', lastWeek.from).lte('closed_date', lastWeek.to)
      .order('revenue_total', { ascending: false }),
    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, projected_close_date')
      .eq('normalised_status', 'pipeline')
      .gte('projected_close_date', thisWeek.from).lte('projected_close_date', thisWeek.to)
      .order('revenue_total', { ascending: false }),
    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, category, stage, created_date')
      .gte('created_date', lastWeek.from + 'T00:00:00').lte('created_date', lastWeek.to + 'T23:59:59')
      .neq('normalised_status', 'portal')
      .order('created_date', { ascending: false }),
  ])

  return NextResponse.json({
    lastWeek,
    thisWeek,
    closedDeals:    (closedDeals    || []).filter(d => isSalesTeamDeal(d.account_manager, d.opportunity_owner)),
    closingDeals:   (closingDeals   || []).filter(d => isSalesTeamDeal(d.account_manager, d.opportunity_owner)),
    newEngagements: (newEngagements || []).filter(d => isSalesTeamDeal(d.account_manager, d.opportunity_owner)),
  })
}
