'use client'

import { useMemo, useState } from 'react'
import { Opportunity } from '@/types'
import type { DealExclusion } from '@/lib/exclusions'
import { useDealExclusions } from '@/components/dashboard/DealExclusions'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function toInputDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// Internal/test accounts that shouldn't count toward customer spend.
const EXCLUDED_COMPANIES = ['fake company test', 'ict services', 'tensorx limited']

// The date a deal counts in: when it was closed, falling back to created if no close date.
function dealDate(o: Opportunity): Date | null {
  const s = o.closed_date || o.created_date
  return s ? new Date(s) : null
}

export default function CustomerQbrClient({ all, year, exclusions }: {
  all: Opportunity[]; year: number; exclusions: DealExclusion[]
}) {
  const hidden = useDealExclusions(exclusions)
  const today = new Date()

  const [dateFrom, setDateFrom] = useState(toInputDate(new Date(year, 0, 1)))
  const [dateTo, setDateTo]     = useState(toInputDate(today))
  const [customer, setCustomer] = useState<string>('')      // '' = all customers
  const [search, setSearch]     = useState('')

  // Won deals in the date range, minus test accounts and manager-hidden deals.
  const inRange = useMemo(() => {
    const from = new Date(dateFrom)
    const to = new Date(dateTo); to.setHours(23, 59, 59)
    return all.filter(o => {
      if (hidden.hiddenIds.has(o.id)) return false
      if (EXCLUDED_COMPANIES.includes((o.company || '').toLowerCase().trim())) return false
      const d = dealDate(o)
      return !!d && d >= from && d <= to
    })
  }, [all, dateFrom, dateTo, hidden.hiddenIds])

  // Table 1: spend by company (always shows every company so you can pick one).
  const companyRows = useMemo(() => {
    const map = new Map<string, { count: number; rev: number }>()
    inRange.forEach(o => {
      const k = o.company || 'Unknown'
      const e = map.get(k) || { count: 0, rev: 0 }
      e.count++; e.rev += o.revenue_total
      map.set(k, e)
    })
    return Array.from(map.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.rev - a.rev)
  }, [inRange])

  const filteredCompanyRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    return q ? companyRows.filter(r => r.name.toLowerCase().includes(q)) : companyRows
  }, [companyRows, search])

  // Deals the report is run on: one customer, or everyone.
  const scoped = useMemo(
    () => customer ? inRange.filter(o => (o.company || 'Unknown') === customer) : inRange,
    [inRange, customer]
  )
  const totalRev = scoped.reduce((s, o) => s + o.revenue_total, 0)

  // Table 2: Opportunity Category totals for the scope.
  const categoryRows = useMemo(() => {
    const map = new Map<string, { count: number; rev: number }>()
    scoped.forEach(o => {
      const k = o.category || 'Uncategorised'
      const e = map.get(k) || { count: 0, rev: 0 }
      e.count++; e.rev += o.revenue_total
      map.set(k, e)
    })
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d, pct: totalRev > 0 ? (d.rev / totalRev) * 100 : 0 }))
      .sort((a, b) => b.rev - a.rev)
  }, [scoped, totalRev])

  const deals = useMemo(
    () => customer ? [...scoped].sort((a, b) => b.revenue_total - a.revenue_total) : [],
    [scoped, customer]
  )

  const periodLabel = `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
  const scopeLabel = customer || 'All customers'

  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50'
  const quick = [
    { label: 'YTD',       from: new Date(year, 0, 1),     to: today },
    { label: 'Last Year', from: new Date(year - 1, 0, 1), to: new Date(year - 1, 11, 31) },
    { label: 'Last 12 Mo', from: new Date(year - 1, today.getMonth(), today.getDate()), to: today },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer QBR</h1>
          <p className="text-sm text-gray-500">Won spend by company and by Opportunity Category. Pick a customer to run the report on them.</p>
        </div>
        <button onClick={() => window.print()} className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          Print / Save as PDF
        </button>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-4 print:hidden">
        <label className="text-xs font-semibold text-gray-500 uppercase">From
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 normal-case" />
        </label>
        <label className="text-xs font-semibold text-gray-500 uppercase">To
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 normal-case" />
        </label>
        <div className="flex gap-2">
          {quick.map(q => (
            <button key={q.label} onClick={() => { setDateFrom(toInputDate(q.from)); setDateTo(toInputDate(q.to)) }}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">{q.label}</button>
          ))}
        </div>
        <label className="text-xs font-semibold text-gray-500 uppercase flex-1 min-w-[240px]">Customer
          <select value={customer} onChange={e => setCustomer(e.target.value)}
            className="block mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 normal-case">
            <option value="">All customers ({companyRows.length})</option>
            {[...companyRows].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
              <option key={r.name} value={r.name}>{r.name} — {euros(r.rev)}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Report header (shows in print) */}
      <div className="bg-[#1e3a5f] text-white rounded-xl px-5 py-4">
        <div className="text-xs uppercase tracking-wide opacity-80">Quarterly Business Review</div>
        <div className="text-xl font-bold">{scopeLabel}</div>
        <div className="text-sm opacity-80">Won deals closed {periodLabel}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total spend (won)" value={euros(totalRev)} />
        <Kpi label="Won deals" value={scoped.length.toLocaleString('en-IE')} />
        <Kpi label="Average deal" value={scoped.length ? euros(totalRev / scoped.length) : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Table 1: spend by company */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden print:break-inside-avoid">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-900">Total spend by company</h2>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-40 print:hidden" />
          </div>
          <div className="max-h-[520px] overflow-auto print:max-h-none">
            <table className="w-full text-sm">
              <thead className="sticky top-0"><tr>
                <th className={`${th} text-left`}>Company</th>
                <th className={`${th} text-right`}>Deals</th>
                <th className={`${th} text-right`}>Spend</th>
              </tr></thead>
              <tbody>
                {filteredCompanyRows.map(r => (
                  <tr key={r.name} onClick={() => setCustomer(customer === r.name ? '' : r.name)}
                    className={`cursor-pointer border-t border-gray-100 hover:bg-blue-50 ${customer === r.name ? 'bg-blue-100 font-semibold' : ''}`}>
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="px-3 py-1.5 text-right">{r.count}</td>
                    <td className="px-3 py-1.5 text-right">{euros(r.rev)}</td>
                  </tr>
                ))}
                {filteredCompanyRows.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No won deals in this period</td></tr>
                )}
              </tbody>
              <tfoot><tr className="border-t-2 border-gray-300 font-bold">
                <td className="px-3 py-2">Total (all companies)</td>
                <td className="px-3 py-2 text-right">{inRange.length}</td>
                <td className="px-3 py-2 text-right">{euros(inRange.reduce((s, o) => s + o.revenue_total, 0))}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        {/* Table 2: opportunity category */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden print:break-inside-avoid self-start">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Opportunity Category totals — {scopeLabel}</h2>
          </div>
          <table className="w-full text-sm">
            <thead><tr>
              <th className={`${th} text-left`}>Category</th>
              <th className={`${th} text-right`}>Deals</th>
              <th className={`${th} text-right`}>Value</th>
              <th className={`${th} text-right`}>% of total</th>
            </tr></thead>
            <tbody>
              {categoryRows.map(r => (
                <tr key={r.name} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5 text-right">{r.count}</td>
                  <td className="px-3 py-1.5 text-right">{euros(r.rev)}</td>
                  <td className="px-3 py-1.5 text-right">{r.pct.toFixed(1)}%</td>
                </tr>
              ))}
              {categoryRows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No won deals in this period</td></tr>
              )}
            </tbody>
            <tfoot><tr className="border-t-2 border-gray-300 font-bold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right">{scoped.length}</td>
              <td className="px-3 py-2 text-right">{euros(totalRev)}</td>
              <td className="px-3 py-2 text-right">{totalRev > 0 ? '100.0%' : '—'}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      {/* Deal list for the chosen customer */}
      {customer && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Won deals — {customer}</h2>
          </div>
          <table className="w-full text-sm">
            <thead><tr>
              <th className={`${th} text-left`}>Opportunity</th>
              <th className={`${th} text-left`}>Category</th>
              <th className={`${th} text-left`}>Closed</th>
              <th className={`${th} text-right`}>Value</th>
            </tr></thead>
            <tbody>
              {deals.map(o => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">{o.opportunity_name}</td>
                  <td className="px-3 py-1.5">{o.category || 'Uncategorised'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(o.closed_date || o.created_date)}</td>
                  <td className="px-3 py-1.5 text-right">{euros(o.revenue_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Spend = won opportunity value, not invoiced amounts. Deals are dated by close date (created date if none). Excludes test accounts, TensorX and deals hidden by managers.
      </p>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}
