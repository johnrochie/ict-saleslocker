import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeadershipClient from '@/app/dashboard/leadership/LeadershipClient'

export const revalidate = 0

const RETAIL_REPS = ['Desmond, Tom', 'Ganly, Peter']

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

export default async function RetailLeadershipPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'sales_manager'].includes(profile?.role || '')) redirect('/dashboard')

  const [
    { data: wonOpps },
    { data: pipeOpps },
  ] = await Promise.all([
    admin.from('opportunities')
      .select('*')
      .in('account_manager', RETAIL_REPS)
      .in('status', ['Closed', 'Implemented'])
      .order('closed_date', { ascending: false }),
    admin.from('opportunities')
      .select('*')
      .in('account_manager', RETAIL_REPS)
      .eq('status', 'Active')
      .order('revenue_total', { ascending: false }),
  ])

  const winsData = (wonOpps || []).map(mapOpp)
  const pipeData = (pipeOpps || []).map(mapOpp)

  return (
    <LeadershipClient
      winsData={winsData}
      pipeData={pipeData}
      categoryTargets={[]}
      reportTitle="ICT Retail Leadership"
    />
  )
}
