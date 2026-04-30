'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatEuro, formatCompact, formatPercent } from '@/lib/utils/formatting'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_Q    = Math.ceil((new Date().getMonth() + 1) / 3)

interface CompanyTarget { revenue_target: number | null; margin_target: number | null }
interface RepTarget {
  autotask_name: string; display_name: string
  personal_margin_target: number | null; team_margin_target: number | null
}
interface RepActual { revenue: number; gp: number }
interface CategoryTarget {
  category_name: string; gl_code: string | null
  annual_revenue_target: number; quarterly_revenue_target: number
  actual_revenue: number; attainment_pct: number
  is_framework: boolean; sort_order: number
}
interface TargetData {
  year: number; quarter: number; weeksRemaining: number
  companyTarget: CompanyTarget | null
  companyActual: { revenue: number; gp: number }
  repTargets: RepTarget[]
  repActuals: Record<string, RepActual>
  categoryTargets: CategoryTarget[]
}

function ragColor(pct: number): string {
  if (pct >= 90) return 'bg-green-500'
  if (pct >= 60) return 'bg-amber-400'
  return 'bg-red-400'
}
function ragText(pct: number): string {
  if (pct >= 90) return 'text-green-700'
  if (pct >= 60) return 'text-amber-700'
  return 'text-red-700'
}

function ProgressBar({ actual, target, label, color }: {
  actual: number; target: number | null; label: string; color?: string
}) {
  if (!target) return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label} — no target set</p>
      <p className="text-sm font-semibold text-gray-700">{formatCompact(actual)}</p>
    </div>
  )
  const pct    = Math.min(100, (actual / target) * 100)
  const barCol = color || ragColor(pct)
  const txtCol = ragText(pct)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <span className={'text-xs font-bold ' + txtCol}>{formatPercent(pct, 0)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className={'h-full rounded-full transition-all ' + barCol} style={{ width: pct + '%' }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{formatCompact(actual)} actual</span>
        <span>{formatCompact(target)} target</span>
      </div>
    </div>
  )
}

function CategoryRow({ cat }: { cat: CategoryTarget }) {
  const pct    = Math.min(100, cat.quarterly_revenue_target > 0
    ? (cat.actual_revenue / cat.quarterly_revenue_target) * 100 : 0)
  const barCol = ragColor(pct)
  const txtCol = ragText(pct)
  const noData = cat.is_framework && cat.actual_revenue === 0 &&
    (cat.category_name.startsWith('OGP') || cat.category_name === 'Garda')

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-44 shrink-0">
        <p className="text-xs font-medium text-gray-800 truncate" title={cat.category_name}>
          {cat.category_name}
        </p>
        {cat.gl_code && (
          <p className="text-xs text-gray-400">{cat.gl_code}</p>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {noData ? (
          <p className="text-xs text-gray-400 italic">actuals require manual allocation</p>
        ) : (
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={'h-full rounded-full ' + barCol} style={{ width: pct + '%' }} />
          </div>
        )}
      </div>
      <div className="shrink-0 text-right w-32">
        <p className="text-xs font-semibold text-gray-900">{formatCompact(cat.actual_revenue)}</p>
        <p className="text-xs text-gray-400">of {formatCompact(cat.quarterly_revenue_target)} Q</p>
      </div>
      <div className="shrink-0 w-10 text-right">
        {!noData && (
          <span className={'text-xs font-bold ' + txtCol}>{Math.round(pct)}%</span>
        )}
      </div>
    </div>
  )
}

export default function TargetsDashboardClient({ isAdmin }: { isAdmin: boolean }) {
  const [selYear, setSelYear] = useState(CURRENT_YEAR)
  const [selQ,    setSelQ]    = useState(CURRENT_Q)
  const [data, setData]       = useState<TargetData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/targets?year=${selYear}&q=${selQ}`)
    setData(await res.json())
    setLoading(false)
  }, [selYear, selQ])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  const { companyTarget, companyActual, repTargets, repActuals,
          categoryTargets, weeksRemaining } = data

  const totalRepPersonal = repTargets.reduce((s, r) => s + (r.personal_margin_target || 0), 0)
  const productLines     = categoryTargets.filter(c => !c.is_framework)
  const frameworks       = categoryTargets.filter(c => c.is_framework)
  const annualTotal      = productLines.reduce((s, c) => s + c.annual_revenue_target, 0)
  const annualFwTotal    = frameworks.reduce((s, c) => s + c.annual_revenue_target, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Targets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Q{selQ} {selYear} &nbsp;&mdash;&nbsp; {weeksRemaining} week{weeksRemaining !== 1 ? 's' : ''} remaining
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={selQ} onChange={e => setSelQ(parseInt(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
          </select>
          {isAdmin && (
            <Link href="/dashboard/targets/settings"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Settings
            </Link>
          )}
        </div>
      </div>

      {/* Company target */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-navy-700">Company Target — Q{selQ} {selYear}</h2>
          {!companyTarget && isAdmin && (
            <Link href="/dashboard/targets/settings" className="text-xs text-brand-600 hover:underline">
              Set company target
            </Link>
          )}
        </div>
        {companyTarget ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProgressBar label="Revenue (CRM only)" actual={companyActual.revenue} target={companyTarget.revenue_target} />
            <ProgressBar label="Gross Profit (CRM only)" actual={companyActual.gp} target={companyTarget.margin_target} />
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            No company target set for Q{selQ} {selYear}.
            {isAdmin && <Link href="/dashboard/targets/settings" className="ml-1 text-brand-600 hover:underline">Set one now.</Link>}
          </p>
        )}
        {companyTarget && (
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Actuals are from Autotask CRM only and do not include non-CRM revenue streams.
          </p>
        )}
      </div>

      {/* Rep targets */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-navy-700">Individual Rep Targets — Q{selQ} {selYear}</h2>
            {totalRepPersonal > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">Combined personal targets: {formatEuro(totalRepPersonal)} margin</p>
            )}
          </div>
          {isAdmin && (
            <Link href="/dashboard/targets/settings" className="text-xs text-brand-600 hover:underline">
              Edit targets
            </Link>
          )}
        </div>
        {repTargets.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            No rep targets set for this quarter.
            {isAdmin && <Link href="/dashboard/targets/settings" className="ml-1 text-brand-600 hover:underline">Set them now.</Link>}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {repTargets.map(rep => {
              const actual  = repActuals[rep.autotask_name] || { revenue: 0, gp: 0 }
              const pctPers = rep.personal_margin_target
                ? Math.min(100, (actual.gp / rep.personal_margin_target) * 100) : null
              const displayName = rep.display_name.includes(',')
                ? rep.display_name.split(',').map((s: string) => s.trim()).reverse().join(' ')
                : rep.display_name
              return (
                <div key={rep.autotask_name} className="px-5 py-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-navy-700">{displayName}</h3>
                        {pctPers !== null && (
                          <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' +
                            (pctPers >= 90 ? 'bg-green-100 text-green-700' :
                             pctPers >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>
                            {formatPercent(pctPers, 0)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <ProgressBar label="Personal margin target" actual={actual.gp} target={rep.personal_margin_target} />
                        {rep.team_margin_target && (
                          <ProgressBar label="Team pool contribution" actual={actual.gp}
                            target={rep.team_margin_target} color="bg-blue-400" />
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-gray-400">Actual GP</p>
                      <p className="text-lg font-bold text-gray-900">{formatCompact(actual.gp)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatCompact(actual.revenue)} revenue</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Revenue by category */}
      {categoryTargets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-navy-700">Revenue by Category — Q{selQ} {selYear}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Quarterly targets = annual &divide; 4 &nbsp;&middot;&nbsp; Actuals from CRM category mapping
            </p>
          </div>

          {/* Product lines */}
          {productLines.length > 0 && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product Lines</p>
                <p className="text-xs text-gray-400">
                  Annual total: {formatCompact(annualTotal)}
                  &nbsp;&middot;&nbsp; Q target: {formatCompact(annualTotal / 4)}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {productLines.map(cat => <CategoryRow key={cat.category_name} cat={cat} />)}
              </div>
            </div>
          )}

          {/* Frameworks */}
          {frameworks.length > 0 && (
            <div className="px-5 py-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Framework Accounts</p>
                <p className="text-xs text-gray-400">
                  Annual total: {formatCompact(annualFwTotal)}
                  &nbsp;&middot;&nbsp; Q target: {formatCompact(annualFwTotal / 4)}
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {frameworks.map(cat => <CategoryRow key={cat.category_name} cat={cat} />)}
              </div>
              <p className="text-xs text-gray-400 italic mt-3">
                OGP Lot 1/2 actuals are split proportionally from Portal/OGP CRM deals.
                Garda actuals require a dedicated Autotask category mapping.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
