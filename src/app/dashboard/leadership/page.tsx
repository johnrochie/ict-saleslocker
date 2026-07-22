import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import LeadershipClient from './LeadershipClient'

export const revalidate = 0

function fmtD(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmtEuro(n: number | null): string {
  if (!n && n !== 0) return '€0.00'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return sign + '€' + abs.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOpp(opp: any) {
  return {
    'Company':                  opp.company || '',
    'Opportunity':              opp.opportunity_name || '',
    'Opportunity Owner':        opp.opportunity_owner || '',
    'Account Manager':          opp.account_manager || '',
    'Opportunity Category':     opp.category || '',
    'Stage':                    opp.stage || '',
    'Status':                   opp.status || '',
    'Create Date':              fmtD(opp.created_date),
    'Projected Close Date':     fmtD(opp.projected_close_date),
    'Closed Date':              fmtD(opp.closed_date),
    'Revenue (Total)':          fmtEuro(opp.revenue_total),
    'Revenue (One-Time)':       fmtEuro(opp.revenue_one_time),
    'Cost (Total)':             fmtEuro(opp.cost_total),
    'Gross Profit':             fmtEuro(opp.gross_profit),
    'Gross Profit Percentage':  `${((opp.gross_margin_pct as number) || 0).toFixed(2)}%`,
    'Age (in days)':            String(opp.age_days || 0),
  }
}

export default async function LeadershipPage() {
  const supabase = await createClient()
  const admin    = createAdminSupabaseClient()
  const year     = new Date().getFullYear()

  // wonOpps unbounded exceeds the Supabase/PostgREST 1000-row default cap
  // (1650+ won deals all-time) — paginate to avoid silently dropping the rest.
  const [
    wonOpps,
    pipeOpps,
    { data: categoryTargetsRaw },
  ] = await Promise.all([
    fetchAllRows(supabase, (client, from, to) => client
      .from('opportunities').select('*').eq('normalised_status', 'won')
      .order('closed_date', { ascending: false }).order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows(supabase, (client, from, to) => client
      .from('opportunities').select('*')
      .eq('normalised_status', 'pipeline')
      .order('revenue_total', { ascending: false }).order('id', { ascending: true })
      .range(from, to)),
    admin.from('category_revenue_targets')
      .select('category_name, gl_code, annual_revenue_target, is_framework, sort_order')
      .eq('year', year)
      .order('sort_order'),
  ])

  const winsData       = wonOpps.map(mapOpp)
  const pipeData       = pipeOpps.map(mapOpp)
  const categoryTargets = (categoryTargetsRaw || []).map(ct => ({
    category_name:         ct.category_name as string,
    gl_code:               ct.gl_code as string | null,
    annual_revenue_target: (ct.annual_revenue_target as number) || 0,
    is_framework:          ct.is_framework as boolean,
    sort_order:            ct.sort_order as number,
  }))

  return <LeadershipClient winsData={winsData} pipeData={pipeData} categoryTargets={categoryTargets} />
}
