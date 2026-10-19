import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { RETAIL_REP_KEYS, isSalesTeamDeal, weekBounds } from '@/lib/config'

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
    { data: closedPortalDeals },
    { data: closingDeals },
    { data: newEngagements },
    { data: lastWeekMeetings },
    { data: thisWeekMeetings },
  ] = await Promise.all([
    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, closed_date')
      .eq('normalised_status', 'won')
      .gte('closed_date', lastWeek.from).lte('closed_date', lastWeek.to)
      .order('revenue_total', { ascending: false }),
    // Closed Portal/OGP deals are classed 'portal' and kept out of the query above.
    // Fetched separately so the page can show or hide them (see filter below).
    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, closed_date')
      .eq('normalised_status', 'portal')
      .in('status', ['Closed', 'Implemented'])
      .gte('closed_date', lastWeek.from).lte('closed_date', lastWeek.to),
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
    admin.from('meetings')
      .select('company, opportunity, contact, assigned_to, action_type, classification, start_date, start_time, description')
      .gte('start_date', lastWeek.from).lte('start_date', lastWeek.to)
      .order('start_date', { ascending: true }),
    admin.from('meetings')
      .select('company, opportunity, contact, assigned_to, action_type, classification, start_date, start_time, description')
      .gte('start_date', thisWeek.from).lte('start_date', thisWeek.to)
      .order('start_date', { ascending: true }),
  ])

  // Portal/OGP deals count only when a sales rep is on them. Retail reps'
  // deals (Desmond/Ganly) stay out of this report entirely.
  const portalClosed = (closedPortalDeals || [])
    .filter(d =>
      isSalesTeamDeal(d.account_manager, d.opportunity_owner) &&
      !RETAIL_REP_KEYS.includes(d.account_manager || '') &&
      !RETAIL_REP_KEYS.includes(d.opportunity_owner || ''))
    .map(d => ({ ...d, is_portal: true }))

  return NextResponse.json({
    lastWeek,
    thisWeek,
    closedDeals:      [...(closedDeals || []).filter(d => isSalesTeamDeal(d.account_manager, d.opportunity_owner)), ...portalClosed]
                        .sort((a, b) => (b.revenue_total ?? 0) - (a.revenue_total ?? 0)),
    closingDeals:     (closingDeals     || []).filter(d => isSalesTeamDeal(d.account_manager, d.opportunity_owner)),
    newEngagements:   (newEngagements   || []).filter(d => isSalesTeamDeal(d.account_manager, d.opportunity_owner)),
    lastWeekMeetings: lastWeekMeetings  || [],
    thisWeekMeetings: thisWeekMeetings  || [],
  })
}
