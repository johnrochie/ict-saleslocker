import { createClient } from '@/lib/supabase/server'
import MetricCard from '@/components/dashboard/MetricCard'
import CategoryBreakdown from '@/components/dashboard/CategoryBreakdown'
import OwnerBreakdown from '@/components/dashboard/OwnerBreakdown'
import RiskPanel from '@/components/dashboard/RiskPanel'
import { formatCompact, formatPercent } from '@/lib/utils/formatting'

export const revalidate = 0 // always fresh data

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch all non-portal opportunities
  const { data: opps } = await supabase
    .from('opportunities')
    .select('*')
    .neq('normalised_status', 'portal')

  const rows = opps ?? []

  // ── Compute metrics ───────────────────────────────────────
  const pipeline = rows.filter((r) => r.normalised_status === 'pipeline')
  const won      = rows.filter((r) => r.normalised_status === 'won')
  const lost     = rows.filter((r) => r.normalised_status === 'lost')
  const onHold   = rows.filter((r) =>
    r.normalised_status === 'on_hold' || r.normalised_status === 'on_hold_stale'
  )

  const sum = (arr: typeof rows, field: string) =>
    arr.reduce((acc, r) => acc + (r[field] ?? 0), 0)

  const pipelineRevenue  = sum(pipeline, 'revenue_total')
  const wonRevenue       = sum(won,      'revenue_total')
  const lostRevenue      = sum(lost,     'revenue_total')
  const wonGP            = sum(won,      'gross_profit')
  const totalGP          = sum([...won, ...pipeline], 'gross_profit')

  const closedTotal = won.length + lost.length
  const winRate     = closedTotal > 0 ? (won.length / closedTotal) * 100 : 0

  const overdueCount = pipeline.filter((r) => r.is_overdue).length
  const staleCount   = rows.filter(
    (r) => r.normalised_status === 'on_hold_stale'
  ).length
  const costMissing  = rows.filter((r) => r.cost_missing).length

  // Weighted pipeline (stage weights applied)
  const { data: stageWeights } = await supabase
    .from('stage_weights')
    .select('stage, weight_pct')

  const weightMap = Object.fromEntries(
    (stageWeights ?? []).map((sw) => [sw.stage, sw.weight_pct / 100])
  )
  const weightedPipeline = pipeline.reduce((acc, r) => {
    const weight = weightMap[r.stage ?? ''] ?? 0
    return acc + (r.revenue_total ?? 0) * weight
  }, 0)

  // Category breakdown (pipeline only)
  const categoryMap: Record<string, { revenue: number; count: number; gp: number }> = {}
  pipeline.forEach((r) => {
    const cat = r.category ?? 'Uncategorised'
    if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, count: 0, gp: 0 }
    categoryMap[cat].revenue += r.revenue_total ?? 0
    categoryMap[cat].count   += 1
    categoryMap[cat].gp      += r.gross_profit ?? 0
  })
  const categoryData = Object.entries(categoryMap)
    .map(([name, vals]) => ({ name, ...vals }))
    .sort((a, b) => b.revenue - a.revenue)

  // Owner breakdown (pipeline + won, by account_manager)
  const ownerMap: Record<string, {
    pipeline_rev: number; won_rev: number; pipeline_gp: number; won_gp: number; count: number
  }> = {}
  ;[...pipeline, ...won].forEach((r) => {
    const owner = r.account_manager ?? r.opportunity_owner ?? 'Unassigned'
    if (!ownerMap[owner]) ownerMap[owner] = {
      pipeline_rev: 0, won_rev: 0, pipeline_gp: 0, won_gp: 0, count: 0
    }
    if (r.normalised_status === 'pipeline') {
      ownerMap[owner].pipeline_rev += r.revenue_total ?? 0
      ownerMap[owner].pipeline_gp  += r.gross_profit  ?? 0
    } else {
      ownerMap[owner].won_rev += r.revenue_total ?? 0
      ownerMap[owner].won_gp  += r.gross_profit  ?? 0
    }
    ownerMap[owner].count++
  })
  const ownerData = Object.entries(ownerMap)
    .map(([name, vals]) => ({ name, ...vals }))
    .sort((a, b) => (b.won_rev + b.pipeline_rev) - (a.won_rev + a.pipeline_rev))

  // Overdue opportunities
  const overdueOpps = pipeline
    .filter((r) => r.is_overdue)
    .sort((a, b) => new Date(a.projected_close_date).getTime() - new Date(b.projected_close_date).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Key Metrics ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active Pipeline"
          value={formatCompact(pipelineRevenue)}
          subValue={`${pipeline.length} opportunities`}
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <MetricCard
          label="Won Revenue"
          value={formatCompact(wonRevenue)}
          subValue={`${won.length} deals closed`}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricCard
          label="Gross Profit (Won)"
          value={formatCompact(wonGP)}
          subValue={wonRevenue > 0 ? `${formatPercent((wonGP / wonRevenue) * 100)} margin` : '—'}
          color="navy"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricCard
          label="Win Rate"
          value={formatPercent(winRate, 0)}
          subValue={`${won.length}W / ${lost.length}L of ${closedTotal} closed`}
          color={winRate >= 50 ? 'green' : 'amber'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
      </div>

      {/* ── Secondary Metrics ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Weighted Pipeline"
          value={formatCompact(weightedPipeline)}
          subValue="Stage-probability adjusted"
          color="brand"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          }
        />
        <MetricCard
          label="Lost Revenue"
          value={formatCompact(lostRevenue)}
          subValue={`${lost.length} lost deals`}
          color="red"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricCard
          label="On Hold"
          value={onHold.length.toString()}
          subValue={`${staleCount} stale (Quarantine)`}
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricCard
          label="Data Issues"
          value={costMissing.toString()}
          subValue="Opportunities with missing cost"
          color={costMissing > 0 ? 'red' : 'gray'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* ── Breakdowns ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryBreakdown data={categoryData} />
        <OwnerBreakdown data={ownerData} />
      </div>

      {/* ── Risk Panel ────────────────────────────────────── */}
      {overdueOpps.length > 0 && (
        <RiskPanel opportunities={overdueOpps} />
      )}
    </div>
  )
}
