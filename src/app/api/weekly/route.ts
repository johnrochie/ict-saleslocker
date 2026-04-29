import { NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

// Sales team filter — update when team changes
const SALES_TEAM = [
  'Maciejska, Barbara',
  'Conboy, John',
  'Dowdall, James',
  "O'Hora, Evan",
  'Roche, John',
  'Taylor, Jamie',
]

function isTeamDeal(deal: { account_manager: string | null; opportunity_owner: string | null }): boolean {
  return SALES_TEAM.includes(deal.account_manager || '') || SALES_TEAM.includes(deal.opportunity_owner || '')
}

function weekBounds(weekOffset: number) {
  const today = new Date()
  const dow = today.getDay()
  const toMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + toMonday + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return {
    from: monday.toISOString().slice(0, 10),
    to:   sunday.toISOString().slice(0, 10),
    label: monday.toLocaleDateString('en-IE', { day: '2-digit', month: 'short' }) +
           ' - ' + sunday.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }),
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const lastWeek = weekBounds(-1)
  const thisWeek = weekBounds(0)

  const [
    { data: closedDeals },
    { data: closingDeals },
    { data: newEngagements },
  ] = await Promise.all([
    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, closed_date')
      .eq('normalised_status', 'won')
      .gte('closed_date', lastWeek.from)
      .lte('closed_date', lastWeek.to)
      .order('revenue_total', { ascending: false }),

    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, projected_close_date')
      .eq('normalised_status', 'pipeline')
      .gte('projected_close_date', thisWeek.from)
      .lte('projected_close_date', thisWeek.to)
      .order('revenue_total', { ascending: false }),

    admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, category, stage, created_date')
      .gte('created_date', lastWeek.from + 'T00:00:00')
      .lte('created_date', lastWeek.to + 'T23:59:59')
      .neq('normalised_status', 'portal')
      .order('created_date', { ascending: false }),
  ])

  return NextResponse.json({
    lastWeek,
    thisWeek,
    closedDeals:    (closedDeals    || []).filter(isTeamDeal),
    closingDeals:   (closingDeals   || []).filter(isTeamDeal),
    newEngagements: (newEngagements || []).filter(isTeamDeal),
  })
}
