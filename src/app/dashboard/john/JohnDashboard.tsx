'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Opportunity } from '@/types'
import MorningBrief from './MorningBrief'
import ActionList from './ActionList'
import DealTimeline from './DealTimeline'
import WinLossAnalysis from './WinLossAnalysis'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(n: number) { return `${n.toFixed(1)}%` }

function StatCard({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour: string }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${colour} p-5 shadow-sm`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function OppRow({ opp }: { opp: Opportunity }) {
  const statusColour: Record<string, string> = {
    won:         'bg-green-100 text-green-700',
    pipeline:    'bg-blue-100 text-blue-700',
    on_hold:     'bg-amber-100 text-amber-700',
    on_hold_stale: 'bg-red-100 text-red-700',
    lost:        'bg-gray-100 text-gray-500',
    portal:      'bg-purple-100 text-purple-700',
  }
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="py-2.5 px-3 text-sm text-gray-800 max-w-[220px] truncate">{opp.opportunity_name}</td>
      <td className="py-2.5 px-3 text-sm text-gray-600 truncate">{opp.company}</td>
      <td className="py-2.5 px-3 text-sm text-gray-500">{opp.category ?? '—'}</td>
      <td className="py-2.5 px-3 text-sm font-medium text-gray-900">{euros(opp.revenue_total)}</td>
      <td className="py-2.5 px-3 text-sm text-gray-500">{pct(opp.gross_margin_pct)}</td>
      <td className="py-2.5 px-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColour[opp.normalised_status] ?? 'bg-gray-100 text-gray-500'}`}>
          {opp.normalised_status.replace(/_/g, ' ')}
        </span>
      </td>
    </tr>
  )
}

type Tab = 'sales' | 'team' | 'ops' | 'financial' | 'marketing'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sales',     label: 'Sales',     icon: '📈' },
  { id: 'team',      label: 'Team',      icon: '👥' },
  { id: 'ops',       label: 'Ops',       icon: '⚙️' },
  { id: 'financial', label: 'Financial', icon: '💰' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
]

export default function JohnDashboard({
  wins, pipeline, all,
}: {
  wins: Opportunity[]
  pipeline: Opportunity[]
  all: Opportunity[]
}) {
  const [tab, setTab] = useState<Tab>('sales')

  const metrics = useMemo(() => {
    const totalWinRev  = wins.reduce((s, o) => s + o.revenue_total, 0)
    const totalPipeRev = pipeline.reduce((s, o) => s + o.revenue_total, 0)
    const totalWinGP   = wins.reduce((s, o) => s + o.gross_profit, 0)
    const avgMargin    = wins.length ? wins.reduce((s, o) => s + o.gross_margin_pct, 0) / wins.length : 0
    const negMargin    = all.filter(o => o.is_negative_margin).length
    const overdue      = pipeline.filter(o => o.is_overdue).length
    const lostCount    = all.filter(o => o.normalised_status === 'lost').length
    const wonCount     = wins.length
    const winRate      = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0
    const topCategories = Object.entries(
      wins.reduce((acc: Record<string, number>, o) => {
        const k = o.category ?? 'Uncategorised'
        acc[k] = (acc[k] ?? 0) + o.revenue_total
        return acc
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 5)

    return { totalWinRev, totalPipeRev, totalWinGP, avgMargin, negMargin, overdue, winRate, wonCount, lostCount, topCategories }
  }, [wins, pipeline, all])

  return (
    <div className="space-y-5">
      {/* Morning brief — always visible, above tabs */}
      <MorningBrief all={all} wins={wins} pipeline={pipeline} />

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">John Roche · Personal view across Sales, Team, Ops, Financial &amp; Marketing</p>
        </div>
        <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">
          {all.length} records loaded
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── SALES TAB ── */}
      {tab === 'sales' && (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Wins Revenue"  value={euros(metrics.totalWinRev)}  sub={`${metrics.wonCount} deals closed`}              colour="border-green-500" />
            <StatCard label="Pipeline Value"      value={euros(metrics.totalPipeRev)} sub={`${pipeline.length} active opps`}               colour="border-blue-500"  />
            <StatCard label="Win Rate"            value={pct(metrics.winRate)}        sub={`${metrics.wonCount}W / ${metrics.lostCount}L`}  colour="border-purple-500" />
            <StatCard label="Avg Win Margin"      value={pct(metrics.avgMargin)}      sub="gross margin on wins"                            colour="border-teal-500"  />
          </div>

          {/* Action list */}
          <ActionList pipeline={pipeline} all={all} />

          {/* Deal timeline */}
          <DealTimeline pipeline={pipeline} />

          {/* Win/Loss analysis */}
          <WinLossAnalysis wins={wins} all={all} />

          {/* Recent wins + top pipeline */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-sm">Recent Wins</h2>
                <Link href="/dashboard/pipeline" className="text-xs text-brand-500 hover:underline">View all →</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="py-2 px-3 text-left">Opportunity</th>
                    <th className="py-2 px-3 text-left">Company</th>
                    <th className="py-2 px-3 text-left">Category</th>
                    <th className="py-2 px-3 text-left">Revenue</th>
                    <th className="py-2 px-3 text-left">GM%</th>
                    <th className="py-2 px-3 text-left">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {wins.slice(0, 8).map(o => <OppRow key={o.id} opp={o} />)}
                    {wins.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">No wins data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-sm">Top Pipeline</h2>
                <Link href="/dashboard/pipeline" className="text-xs text-brand-500 hover:underline">View all →</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="py-2 px-3 text-left">Opportunity</th>
                    <th className="py-2 px-3 text-left">Company</th>
                    <th className="py-2 px-3 text-left">Category</th>
                    <th className="py-2 px-3 text-left">Revenue</th>
                    <th className="py-2 px-3 text-left">GM%</th>
                    <th className="py-2 px-3 text-left">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {pipeline.slice(0, 8).map(o => <OppRow key={o.id} opp={o} />)}
                    {pipeline.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">No pipeline data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Top categories bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Top Categories by Won Revenue</h2>
            <div className="space-y-3">
              {metrics.topCategories.map(([cat, rev], i) => {
                const max = metrics.topCategories[0]?.[1] ?? 1
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                    <span className="text-sm text-gray-700 w-40 truncate">{cat}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${(rev / max) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-24 text-right">{euros(rev)}</span>
                  </div>
                )
              })}
              {metrics.topCategories.length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── TEAM TAB ── */}
      {tab === 'team' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Pipeline"  value={euros(metrics.totalPipeRev)} sub={`${pipeline.length} opportunities`} colour="border-blue-500"   />
            <StatCard label="Total Won"       value={euros(metrics.totalWinRev)}  sub={`${metrics.wonCount} deals`}        colour="border-green-500"  />
            <StatCard label="Overdue Opps"    value={String(metrics.overdue)}     sub="past projected close"               colour="border-red-400"    />
            <StatCard label="Negative Margin" value={String(metrics.negMargin)}   sub="deals needing review"               colour="border-amber-500"  />
          </div>

          {/* Rep scorecard */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Rep Scorecard</h2>
              <p className="text-xs text-gray-400 mt-0.5">Performance by opportunity owner</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2 px-4 text-left">Rep</th>
                  <th className="py-2 px-4 text-right">Won Rev</th>
                  <th className="py-2 px-4 text-right">Pipeline</th>
                  <th className="py-2 px-4 text-right">Win Rate</th>
                  <th className="py-2 px-4 text-right">Avg Deal</th>
                  <th className="py-2 px-4 text-right">Avg GM%</th>
                  <th className="py-2 px-4 text-right">Overdue</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    const repMap = new Map<string, { wins: Opportunity[]; pipe: Opportunity[]; losses: Opportunity[] }>()
                    all.forEach(o => {
                      const rep = o.opportunity_owner ?? o.account_manager ?? 'Unassigned'
                      if (!repMap.has(rep)) repMap.set(rep, { wins: [], pipe: [], losses: [] })
                      const r = repMap.get(rep)!
                      if (o.normalised_status === 'won') r.wins.push(o)
                      else if (o.normalised_status === 'lost') r.losses.push(o)
                      else r.pipe.push(o)
                    })
                    return Array.from(repMap.entries())
                      .sort((a, b) =>
                        b[1].wins.reduce((s, o) => s + o.revenue_total, 0) -
                        a[1].wins.reduce((s, o) => s + o.revenue_total, 0)
                      )
                      .map(([rep, d]) => {
                        const wonRev  = d.wins.reduce((s, o) => s + o.revenue_total, 0)
                        const pipeRev = d.pipe.reduce((s, o) => s + o.revenue_total, 0)
                        const total   = d.wins.length + d.losses.length
                        const wr      = total > 0 ? (d.wins.length / total) * 100 : 0
                        const avgDeal = d.wins.length > 0 ? wonRev / d.wins.length : 0
                        const avgGM   = d.wins.length > 0 ? d.wins.reduce((s, o) => s + o.gross_margin_pct, 0) / d.wins.length : 0
                        const overdue = d.pipe.filter(o => o.is_overdue).length
                        return (
                          <tr key={rep} className="hover:bg-gray-50">
                            <td className="py-2.5 px-4 text-sm font-medium text-gray-800">{rep}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-gray-900 font-medium">{euros(wonRev)}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-blue-600">{euros(pipeRev)}</td>
                            <td className="py-2.5 px-4 text-sm text-right">
                              <span className={`font-semibold ${wr >= 60 ? 'text-green-600' : wr >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                                {total > 0 ? pct(wr) : '—'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-sm text-right text-gray-600">{avgDeal > 0 ? euros(avgDeal) : '—'}</td>
                            <td className="py-2.5 px-4 text-sm text-right text-gray-600">{d.wins.length > 0 ? pct(avgGM) : '—'}</td>
                            <td className="py-2.5 px-4 text-sm text-right">
                              {overdue > 0 ? <span className="text-red-600 font-semibold">{overdue}</span> : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        )
                      })
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick links to team reports */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { href: '/dashboard/leadership',       label: 'Leadership Report',  desc: 'Wins & pipeline by category' },
              { href: '/dashboard/retail-leadership', label: 'Retail Leadership', desc: 'Retail-focused view'          },
              { href: '/dashboard/weekly',            label: 'Weekly Report',     desc: 'Week-on-week activity'        },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="block bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-200 rounded-xl p-4 transition-colors">
                <p className="text-sm font-medium text-gray-700">{l.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{l.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── OPS TAB ── */}
      {tab === 'ops' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Opportunities" value={String(all.length)}       sub="all time"                  colour="border-blue-500"   />
            <StatCard label="Active Pipeline"     value={String(pipeline.length)}  sub="pipeline + on hold"        colour="border-teal-500"   />
            <StatCard label="Overdue"             value={String(metrics.overdue)}  sub="past projected close date" colour="border-red-400"    />
            <StatCard label="Negative Margin"     value={String(metrics.negMargin)} sub="require pricing review"   colour="border-amber-500"  />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Status breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Pipeline by Status</h2>
              {(['pipeline', 'on_hold', 'on_hold_stale', 'won', 'lost', 'portal'] as const).map(s => {
                const count = all.filter(o => o.normalised_status === s).length
                const rev   = all.filter(o => o.normalised_status === s).reduce((sum, o) => sum + o.revenue_total, 0)
                const colours: Record<string, string> = {
                  pipeline: 'bg-blue-500', won: 'bg-green-500', lost: 'bg-gray-400',
                  on_hold: 'bg-amber-500', on_hold_stale: 'bg-red-400', portal: 'bg-purple-500',
                }
                return (
                  <div key={s} className="flex items-center gap-3 mb-3">
                    <div className={`w-2 h-2 rounded-full ${colours[s]}`} />
                    <span className="text-sm text-gray-600 capitalize w-28">{s.replace(/_/g, ' ')}</span>
                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className={`${colours[s]} h-1.5 rounded-full`} style={{ width: all.length ? `${(count / all.length) * 100}%` : '0%' }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-24 text-right">{euros(rev)}</span>
                  </div>
                )
              })}
            </div>

            {/* Data health */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Data Health</h2>
              <div className="space-y-3">
                {[
                  { label: 'Missing cost data',      count: all.filter(o => o.cost_missing).length,              colour: 'text-amber-600' },
                  { label: 'Negative margin deals',  count: metrics.negMargin,                                    colour: 'text-red-600'   },
                  { label: 'Overdue pipeline',       count: metrics.overdue,                                      colour: 'text-red-600'   },
                  { label: 'No close date set',      count: all.filter(o => !o.projected_close_date).length,      colour: 'text-amber-600' },
                  { label: 'No category assigned',   count: all.filter(o => !o.category).length,                  colour: 'text-gray-500'  },
                ].map(({ label, count, colour }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-600">{label}</span>
                    <span className={`text-sm font-semibold ${count > 0 ? colour : 'text-green-600'}`}>
                      {count > 0 ? count : '✓ Clean'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Link href="/dashboard/upload" className="text-xs text-brand-500 hover:underline">Upload data to fix issues →</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FINANCIAL TAB ── */}
      {tab === 'financial' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Won Revenue"  value={euros(metrics.totalWinRev)}  sub={`${metrics.wonCount} deals`}      colour="border-green-500"  />
            <StatCard label="Total Won GP"       value={euros(metrics.totalWinGP)}   sub="gross profit on wins"             colour="border-teal-500"   />
            <StatCard label="Avg Win Margin"     value={pct(metrics.avgMargin)}      sub="across all wins"                  colour="border-blue-500"   />
            <StatCard label="Pipeline at Risk"
              value={euros(pipeline.filter(o => o.is_overdue || o.is_negative_margin).reduce((s, o) => s + o.revenue_total, 0))}
              sub="overdue or negative margin"  colour="border-red-400"    />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Margin distribution */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Win Margin Distribution</h2>
              {[
                { label: '> 30%',    filter: (o: Opportunity) => o.gross_margin_pct > 30,                           colour: 'bg-green-500'  },
                { label: '20–30%',   filter: (o: Opportunity) => o.gross_margin_pct >= 20 && o.gross_margin_pct <= 30, colour: 'bg-teal-400'   },
                { label: '10–20%',   filter: (o: Opportunity) => o.gross_margin_pct >= 10 && o.gross_margin_pct < 20,  colour: 'bg-amber-400'  },
                { label: '0–10%',    filter: (o: Opportunity) => o.gross_margin_pct >= 0  && o.gross_margin_pct < 10,  colour: 'bg-orange-400' },
                { label: 'Negative', filter: (o: Opportunity) => o.gross_margin_pct < 0,                            colour: 'bg-red-500'    },
              ].map(({ label, filter, colour }) => {
                const bucket = wins.filter(filter)
                const rev    = bucket.reduce((s, o) => s + o.revenue_total, 0)
                return (
                  <div key={label} className="flex items-center gap-3 mb-3">
                    <div className={`w-2 h-2 rounded-full ${colour}`} />
                    <span className="text-sm text-gray-600 w-20">{label}</span>
                    <span className="text-sm text-gray-500 w-8 text-right">{bucket.length}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className={`${colour} h-1.5 rounded-full`} style={{ width: wins.length ? `${(bucket.length / wins.length) * 100}%` : '0%' }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-24 text-right">{euros(rev)}</span>
                  </div>
                )
              })}
            </div>

            {/* Commission placeholder */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-1">Commission Tracker</h2>
              <p className="text-xs text-gray-400 mb-4">Phase 3 &mdash; coming soon</p>
              <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 p-6 text-center">
                <p className="text-2xl mb-2">&#128176;</p>
                <p className="text-sm font-medium text-gray-700">Commission engine in Phase 3</p>
                <p className="text-xs text-gray-400 mt-1">Earnings, commission rates, and payout tracking will appear here once configured.</p>
                <Link href="/dashboard/commission" className="inline-block mt-3 text-xs text-brand-500 hover:underline">Preview commission page</Link>
              </div>
            </div>
          </div>

          {/* Targets placeholder */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Targets vs. Actuals</h2>
                <p className="text-xs text-gray-400">Phase 3 &mdash; configure targets to see progress vs. goal</p>
              </div>
              <Link href="/dashboard/targets" className="text-xs text-brand-500 hover:underline">Manage targets</Link>
            </div>
            <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 p-5 text-center">
              <p className="text-sm text-gray-500">Once targets are configured, this panel will show RAG status per category and pipeline coverage ratio.</p>
            </div>
          </div>
        </div>
      )}

      {/* MARKETING TAB */}
      {tab === 'marketing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Dell MDF Funding Dashboard</h2>
              <p className="text-xs text-gray-400 mt-0.5">ICT Services eMDF &amp; pbMDF EMEA funds tracker</p>
            </div>
            <a href="/dell-mdf-dashboard.html" target="_blank" rel="noopener noreferrer"
               className="text-xs text-brand-500 hover:underline">Open full screen</a>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: '780px' }}>
            <iframe
              src="/dell-mdf-dashboard.html"
              className="w-full h-full border-0"
              title="Dell MDF Funding Dashboard"
            />
          </div>
        </div>
      )}
    </div>
  )
}
