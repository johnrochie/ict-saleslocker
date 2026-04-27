'use client'

import { useState, useMemo } from 'react'
import {
  formatCompact, formatDate, formatPercent,
  statusLabel, statusColor, ratingColor, daysSinceActivity, cn
} from '@/lib/utils/formatting'
import type { Opportunity } from '@/types'

interface PipelineTableProps {
  opportunities: Opportunity[]
}

type SortField = 'revenue_total' | 'projected_close_date' | 'company' | 'gross_margin_pct'
type SortDir   = 'asc' | 'desc'

export default function PipelineTable({ opportunities }: PipelineTableProps) {
  const [search,       setSearch]       = useState('')
  const [filterOwner,  setFilterOwner]  = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortField,    setSortField]    = useState<SortField>('revenue_total')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')

  // Unique filter options
  const owners = useMemo(() => {
    const s = new Set(opportunities.map((o) =>
      o.account_manager ?? o.opportunity_owner ?? ''
    ).filter(Boolean))
    return Array.from(s).sort()
  }, [opportunities])

  const categories = useMemo(() => {
    const s = new Set(opportunities.map((o) => o.category ?? '').filter(Boolean))
    return Array.from(s).sort()
  }, [opportunities])

  // Filter + sort
  const filtered = useMemo(() => {
    return opportunities
      .filter((o) => {
        const q = search.toLowerCase()
        if (q && !o.company.toLowerCase().includes(q) &&
            !o.opportunity_name.toLowerCase().includes(q)) return false
        if (filterOwner) {
          const owner = o.account_manager ?? o.opportunity_owner ?? ''
          if (owner !== filterOwner) return false
        }
        if (filterCat && o.category !== filterCat) return false
        if (filterStatus && o.normalised_status !== filterStatus) return false
        return true
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        if (sortField === 'company')
          return dir * a.company.localeCompare(b.company)
        if (sortField === 'projected_close_date') {
          const da = a.projected_close_date ? new Date(a.projected_close_date).getTime() : 0
          const db = b.projected_close_date ? new Date(b.projected_close_date).getTime() : 0
          return dir * (da - db)
        }
        return dir * ((a[sortField] ?? 0) - (b[sortField] ?? 0))
      })
  }, [opportunities, search, filterOwner, filterCat, filterStatus, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-brand-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const totalRevenue = filtered.reduce((s, o) => s + o.revenue_total, 0)
  const totalGP      = filtered.reduce((s, o) => s + o.gross_profit, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
        <input
          type="text"
          placeholder="Search company or opportunity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-2
                     text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">All Statuses</option>
          <option value="pipeline">Pipeline</option>
          <option value="on_hold">On Hold</option>
          <option value="on_hold_stale">Stale</option>
        </select>
        <select
          value={filterOwner}
          onChange={(e) => setFilterOwner(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">All Reps</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o.includes(',') ? o.split(',').map((s) => s.trim()).reverse().join(' ') : o}
            </option>
          ))}
        </select>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-gray-400 shrink-0">
          {filtered.length} results
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left px-4 py-3">
                <button onClick={() => toggleSort('company')} className="hover:text-gray-700 flex items-center">
                  Company <SortIcon field="company" />
                </button>
              </th>
              <th className="text-left px-4 py-3">Opportunity</th>
              <th className="text-left px-4 py-3">Rep</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">
                <button onClick={() => toggleSort('revenue_total')} className="hover:text-gray-700 flex items-center ml-auto">
                  Revenue <SortIcon field="revenue_total" />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => toggleSort('gross_margin_pct')} className="hover:text-gray-700 flex items-center ml-auto">
                  Margin <SortIcon field="gross_margin_pct" />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => toggleSort('projected_close_date')} className="hover:text-gray-700 flex items-center ml-auto">
                  Close Date <SortIcon field="projected_close_date" />
                </button>
              </th>
              <th className="text-center px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-gray-400">
                  No opportunities match your filters
                </td>
              </tr>
            ) : (
              filtered.map((opp) => {
                const ownerRaw = opp.account_manager ?? opp.opportunity_owner ?? '—'
                const owner = ownerRaw.includes(',')
                  ? ownerRaw.split(',').map((s: string) => s.trim()).reverse().join(' ')
                  : ownerRaw
                const stale = daysSinceActivity(opp.last_activity) >= 14

                return (
                  <tr key={opp.id} className={cn(
                    'hover:bg-gray-50 transition-colors',
                    opp.is_overdue && 'bg-red-50/30',
                  )}>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[150px]">
                      <span className="truncate block" title={opp.company}>{opp.company}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px]">
                      <span className="truncate block" title={opp.opportunity_name}>
                        {opp.opportunity_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{owner}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[150px]">
                      <span className="truncate block" title={opp.category ?? ''}>
                        {opp.category ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        statusColor(opp.normalised_status)
                      )}>
                        {statusLabel(opp.normalised_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {formatCompact(opp.revenue_total)}
                    </td>
                    <td className={cn(
                      'px-4 py-3 text-right whitespace-nowrap',
                      opp.gross_margin_pct < 0 ? 'text-red-600 font-medium' : 'text-gray-600'
                    )}>
                      {opp.cost_missing
                        ? <span className="text-amber-500">—</span>
                        : formatPercent(opp.gross_margin_pct, 1)}
                    </td>
                    <td className={cn(
                      'px-4 py-3 text-right whitespace-nowrap',
                      opp.is_overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                    )}>
                      {formatDate(opp.projected_close_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {opp.is_overdue && (
                          <span title="Overdue" className="text-red-500">⚠</span>
                        )}
                        {opp.cost_missing && (
                          <span title="Cost data missing" className="text-amber-500">€?</span>
                        )}
                        {stale && !opp.is_overdue && (
                          <span title="No activity 14+ days" className="text-gray-400">⏸</span>
                        )}
                        {opp.rating && (
                          <span title={opp.rating} className={ratingColor(opp.rating)}>●</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {/* Footer totals */}
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                <td colSpan={5} className="px-4 py-3 text-gray-600">
                  {filtered.length} opportunities
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatCompact(totalRevenue)}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {totalRevenue > 0 ? formatPercent((totalGP / totalRevenue) * 100, 1) : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
