'use client'

import { useState } from 'react'
import { formatEuro, formatPercent, formatDate } from '@/lib/utils/formatting'

interface Calculation {
  id: string; quarter_label: string; year: number; quarter_num: number
  commission_type: string; deals_included: number
  total_revenue: number; total_margin: number
  commission_earned: number; quarterly_bonus: number; total_payable: number
  cumulative_margin_ytd: number | null; cumulative_target_ytd: number | null
  status: string
}

interface DealLine {
  id: string; company: string; opportunity_name: string; closed_date: string | null
  business_type: string | null; commission_category: string | null
  revenue: number; direct_cost: number; subtotal_for_burden: number
  burdened_cost: number; total_cost: number; margin: number
  rate_applied: number; commission_value: number
}

interface RepConfig {
  commission_type: string
  quarterly_threshold: number | null
  threshold_rate: number
  annual_margin_target: number | null
  annual_bonus: number | null
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  approved: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
}

const fmtBiz = (t: string | null) => ({ new_client: 'New Client', existing_client: 'Existing', renewal: 'Renewal' }[t ?? ''] ?? (t ?? '-'))
const fmtCat = (c: string | null) => ({ hardware: 'Hardware', maintenance: 'Maintenance', support_services: 'Support Services' }[c ?? ''] ?? (c ?? '-'))

export default function MyCommissionClient({
  calculations, repConfig, displayName,
}: {
  calculations: Calculation[]
  repConfig: RepConfig | null
  displayName: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dealLines, setDealLines]   = useState<DealLine[]>([])
  const [loading, setLoading]       = useState(false)

  const totalPaid    = calculations.filter(c => c.status === 'paid').reduce((s, c) => s + c.total_payable, 0)
  const totalApproved = calculations.filter(c => c.status === 'approved').reduce((s, c) => s + c.total_payable, 0)
  const totalPending = calculations.filter(c => c.status === 'draft').reduce((s, c) => s + c.total_payable, 0)
  const isType1 = repConfig?.commission_type === 'type1'

  async function toggleExpand(calc: Calculation) {
    if (expandedId === calc.id) { setExpandedId(null); return }
    setExpandedId(calc.id)
    setLoading(true)
    const res = await fetch('/api/commission/deal-lines?calculation_id=' + calc.id)
    const data = await res.json()
    setLoading(false)
    setDealLines(data.lines || [])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Commission</h1>
        <p className="text-sm text-gray-500 mt-0.5">{displayName}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-green-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Paid</p>
          <p className="text-2xl font-bold text-green-700">{formatEuro(totalPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Approved (pending payment)</p>
          <p className="text-2xl font-bold text-blue-700">{formatEuro(totalApproved)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Pending approval</p>
          <p className="text-2xl font-bold text-gray-600">{formatEuro(totalPending)}</p>
        </div>
      </div>

      {/* Commission type context */}
      {repConfig && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your commission structure</p>
          {repConfig.commission_type === 'type1' && (
            <p className="text-sm text-gray-600">Category-based rates applied to burdened margin. Rates vary by deal category and whether the customer is new or existing.</p>
          )}
          {repConfig.commission_type === 'type2' && (
            <p className="text-sm text-gray-600">
              Threshold margin model. Once your quarterly margin exceeds{' '}
              <strong>{formatEuro(repConfig.quarterly_threshold ?? 0)}</strong>,
              you earn <strong>{formatPercent((repConfig.threshold_rate ?? 0.1) * 100, 0)}</strong> on everything above.
            </p>
          )}
          {repConfig.commission_type === 'type3' && (
            <p className="text-sm text-gray-600">
              Annual target of <strong>{formatEuro(repConfig.annual_margin_target ?? 0)}</strong> margin.
              On-target bonus: <strong>{formatEuro(repConfig.annual_bonus ?? 0)}</strong> per year
              ({formatEuro((repConfig.annual_bonus ?? 0) / 4)} per quarter).
              Rollover applies between quarters.
            </p>
          )}
        </div>
      )}

      {/* Quarterly history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-navy-700">Quarterly history</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click a row to see the deals included in each calculation</p>
        </div>

        {calculations.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            No commission calculations have been run for your account yet.
          </div>
        ) : (
          calculations.map((calc) => (
            <div key={calc.id} className="border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(calc)}>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-navy-700">{calc.quarter_label}</p>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium capitalize ' + (STATUS_STYLES[calc.status] || '')}>
                      {calc.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {calc.deals_included} deals &nbsp;·&nbsp; Margin: {formatEuro(calc.total_margin)}
                    {calc.commission_type === 'type3' && calc.cumulative_margin_ytd !== null && (
                      <span> &nbsp;·&nbsp; YTD: {formatEuro(calc.cumulative_margin_ytd)} vs {formatEuro(calc.cumulative_target_ytd ?? 0)}</span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-green-700">{formatEuro(calc.total_payable)}</p>
                  {calc.commission_earned > 0 && calc.quarterly_bonus > 0 && (
                    <p className="text-xs text-gray-400">{formatEuro(calc.commission_earned)} + {formatEuro(calc.quarterly_bonus)}</p>
                  )}
                </div>
                <svg className={'w-4 h-4 text-gray-400 transition-transform shrink-0 ' + (expandedId === calc.id ? 'rotate-180' : '')}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {expandedId === calc.id && (
                <div className="border-t border-gray-100">
                  {loading ? (
                    <div className="py-6 text-center text-sm text-gray-400">Loading deals...</div>
                  ) : dealLines.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-400">No deal detail available for this period.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-semibold uppercase tracking-wide">
                            <th className="text-left px-5 py-2.5">Customer</th>
                            <th className="text-left px-4 py-2.5">Opportunity</th>
                            <th className="text-left px-3 py-2.5">Date</th>
                            <th className="text-left px-3 py-2.5">Type</th>
                            <th className="text-left px-3 py-2.5">Category</th>
                            <th className="text-right px-3 py-2.5">Revenue</th>
                            <th className="text-right px-3 py-2.5">Cost</th>
                            {isType1 && <th className="text-right px-3 py-2.5">Burden</th>}
                            <th className="text-right px-3 py-2.5">Margin</th>
                            {isType1 && <th className="text-right px-3 py-2.5">Rate</th>}
                            {isType1 && <th className="text-right px-4 py-2.5">Commission</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dealLines.map((l) => (
                            <tr key={l.id} className="hover:bg-gray-50">
                              <td className="px-5 py-2 font-medium text-gray-800 max-w-[120px]">
                                <span className="truncate block">{l.company}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-600 max-w-[180px]">
                                <span className="truncate block">{l.opportunity_name}</span>
                              </td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(l.closed_date)}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtBiz(l.business_type)}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtCat(l.commission_category)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatEuro(l.revenue)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatEuro(l.direct_cost)}</td>
                              {isType1 && <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatEuro(l.burdened_cost)}</td>}
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">{formatEuro(l.margin)}</td>
                              {isType1 && <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatPercent(l.rate_applied * 100, 0)}</td>}
                              {isType1 && <td className="px-4 py-2 text-right tabular-nums font-bold text-green-700">{formatEuro(l.commission_value)}</td>}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 bg-white font-semibold text-xs">
                            <td colSpan={5} className="px-5 py-3 text-gray-700">Total — {dealLines.length} deals</td>
                            <td className="px-3 py-3 text-right tabular-nums text-gray-800">{formatEuro(dealLines.reduce((s,l)=>s+l.revenue,0))}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatEuro(dealLines.reduce((s,l)=>s+l.direct_cost,0))}</td>
                            {isType1 && <td className="px-3 py-3 text-right tabular-nums text-gray-600">{formatEuro(dealLines.reduce((s,l)=>s+l.burdened_cost,0))}</td>}
                            <td className="px-3 py-3 text-right tabular-nums text-gray-900">{formatEuro(dealLines.reduce((s,l)=>s+l.margin,0))}</td>
                            {isType1 && <td className="px-3 py-3" />}
                            {isType1 && <td className="px-4 py-3 text-right tabular-nums text-green-700 text-sm">{formatEuro(dealLines.reduce((s,l)=>s+l.commission_value,0))}</td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
