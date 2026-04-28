'use client'

import { useState } from 'react'
import { formatEuro, formatPercent, formatDate } from '@/lib/utils/formatting'

interface Calculation {
  id: string; autotask_name: string; display_name: string; commission_type: string
  year: number; quarter_num: number; quarter_label: string
  total_revenue: number; total_direct_costs: number; total_burdened_cost: number
  total_margin: number; commission_base: number; commission_earned: number
  quarterly_bonus: number; total_payable: number
  cumulative_margin_ytd: number | null; cumulative_target_ytd: number | null
  deals_included: number; status: string; notes: string | null
}

interface DealLine {
  id: string; composite_key: string; company: string; opportunity_name: string
  closed_date: string | null; business_type: string | null; commission_category: string | null
  revenue: number; direct_cost: number; subtotal_for_burden: number
  burdened_cost: number; total_cost: number; margin: number
  rate_applied: number; commission_value: number; override_applied: boolean
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', approved: 'bg-blue-50 text-blue-700', paid: 'bg-green-50 text-green-700',
}
const TYPE_BADGE: Record<string, string> = {
  type1: 'bg-blue-50 text-blue-700', type2: 'bg-purple-50 text-purple-700', type3: 'bg-green-50 text-green-700',
}
const fmtBiz = (t: string | null) => ({ new_client: 'New Client', existing_client: 'Existing', renewal: 'Renewal' }[t ?? ''] ?? (t ?? '-'))
const fmtCat = (c: string | null) => ({ hardware: 'Hardware', maintenance: 'Maintenance', support_services: 'Support Services' }[c ?? ''] ?? (c ?? '-'))

function exportToCsv(lines: DealLine[], calc: Calculation) {
  const isType1 = calc.commission_type === 'type1'
  const headers = isType1
    ? ['Company','Opportunity','Date','Business Type','Category','Revenue','Direct Cost','Pre-Burden','Burden','Total Cost','Margin','Rate','Commission']
    : ['Company','Opportunity','Date','Business Type','Category','Revenue','Cost','Margin']

  const rows = lines.map(l => isType1
    ? [l.company, l.opportunity_name, l.closed_date || '', fmtBiz(l.business_type), fmtCat(l.commission_category),
       l.revenue.toFixed(2), l.direct_cost.toFixed(2), l.subtotal_for_burden.toFixed(2),
       l.burdened_cost.toFixed(2), l.total_cost.toFixed(2), l.margin.toFixed(2),
       (l.rate_applied * 100).toFixed(2) + '%', l.commission_value.toFixed(2)]
    : [l.company, l.opportunity_name, l.closed_date || '', fmtBiz(l.business_type), fmtCat(l.commission_category),
       l.revenue.toFixed(2), l.direct_cost.toFixed(2), l.margin.toFixed(2)]
  )

  const totals = isType1
    ? ['TOTAL','','','','',
       lines.reduce((s,l)=>s+l.revenue,0).toFixed(2), lines.reduce((s,l)=>s+l.direct_cost,0).toFixed(2),
       lines.reduce((s,l)=>s+l.subtotal_for_burden,0).toFixed(2), lines.reduce((s,l)=>s+l.burdened_cost,0).toFixed(2),
       lines.reduce((s,l)=>s+l.total_cost,0).toFixed(2), lines.reduce((s,l)=>s+l.margin,0).toFixed(2),
       '', lines.reduce((s,l)=>s+l.commission_value,0).toFixed(2)]
    : ['TOTAL','','','','',
       lines.reduce((s,l)=>s+l.revenue,0).toFixed(2), lines.reduce((s,l)=>s+l.direct_cost,0).toFixed(2),
       lines.reduce((s,l)=>s+l.margin,0).toFixed(2)]

  const summaryRows = calc.commission_type === 'type2'
    ? [[], ['Commission Summary'], ['Total Margin', calc.total_margin.toFixed(2)],
       ['Commission Base (above threshold)', calc.commission_base.toFixed(2)],
       ['Commission Payable', calc.total_payable.toFixed(2)]]
    : calc.commission_type === 'type3'
    ? [[], ['Commission Summary'], ['Quarter Margin', calc.total_margin.toFixed(2)],
       ['YTD Margin', (calc.cumulative_margin_ytd ?? 0).toFixed(2)],
       ['YTD Target', (calc.cumulative_target_ytd ?? 0).toFixed(2)],
       ['Quarterly Bonus', calc.quarterly_bonus.toFixed(2)]]
    : []

  const allRows = [headers, ...rows, totals, ...summaryRows]
  const csv = allRows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Commission_${calc.display_name.replace(/\s+/g,'_')}_${calc.quarter_label.replace(/\s+/g,'_')}.csv`
  a.click()
}

export default function CommissionReviewClient({
  calculations, currentUserEmail,
}: {
  calculations: Calculation[]
  repConfigs: { id: string; autotask_name: string; display_name: string; commission_type: string }[]
  currentUserEmail: string
}) {
  const [running, setRunning] = useState(false)
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [selQ, setSelQ]       = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [preview, setPreview] = useState<Calculation[] | null>(null)
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [filterQ, setFilterQ] = useState<string>('all')
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [dealLines, setDealLines]       = useState<DealLine[]>([])
  const [loadingLines, setLoadingLines] = useState(false)

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text }); setTimeout(() => setMsg(null), 5000)
  }

  async function runCalc(mode: 'preview' | 'save') {
    setRunning(true); setPreview(null)
    const res = await fetch('/api/commission/calculate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: selYear, quarter_num: selQ, preview: mode === 'preview' }),
    })
    const data = await res.json()
    setRunning(false)
    if (!res.ok) { flash('err', data.error || 'Calculation failed'); return }
    if (mode === 'preview') {
      setPreview(data.results)
    } else {
      flash('ok', 'Saved ' + data.saved + ' calculation(s) for ' + data.quarter_label)
      setTimeout(() => window.location.reload(), 1500)
    }
  }

  async function toggleExpand(calc: Calculation) {
    if (expandedId === calc.id) { setExpandedId(null); return }
    setExpandedId(calc.id)
    setLoadingLines(true)
    const res = await fetch('/api/commission/deal-lines?calculation_id=' + calc.id)
    const data = await res.json()
    setLoadingLines(false)
    setDealLines(data.lines || [])
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch('/api/commission/status', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, updated_by: currentUserEmail }),
    })
    if (res.ok) { flash('ok', 'Status updated'); setTimeout(() => window.location.reload(), 1000) }
    else flash('err', 'Failed to update status')
  }

  const quarters  = [...new Set(calculations.map(c => c.quarter_label))].sort().reverse()
  const displayed = filterQ === 'all' ? calculations : calculations.filter(c => c.quarter_label === filterQ)
  const expandedCalc = calculations.find(c => c.id === expandedId)
  const isType1 = expandedCalc?.commission_type === 'type1'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Commission Review</h1>
        <p className="text-sm text-gray-500 mt-0.5">Run quarterly calculations, review deal-level workings, and approve payments</p>
      </div>

      {msg && (
        <div className={'rounded-lg px-4 py-3 text-sm border ' + (msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>
          {msg.text}
        </div>
      )}

      {/* Run calculation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-navy-700 mb-1">Run quarterly calculation</h2>
        <p className="text-xs text-gray-400 mb-4">Preview first, then save. Saving stores full deal-level workings for finance review and export.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Quarter</label>
            <select value={selQ} onChange={e => setSelQ(parseInt(e.target.value))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <button onClick={() => runCalc('preview')} disabled={running}
            className="rounded-lg border border-brand-500 text-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-50 disabled:opacity-60 transition-colors">
            {running ? 'Running...' : 'Preview'}
          </button>
          <button onClick={() => runCalc('save')} disabled={running}
            className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600 disabled:opacity-60 transition-colors">
            {running ? 'Running...' : 'Calculate & Save'}
          </button>
        </div>
        {preview && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview - Q{selQ} {selYear}</p>
            {preview.map((r: Calculation, i: number) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy-700">{r.display_name}</p>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (TYPE_BADGE[r.commission_type] || '')}>{r.commission_type}</span>
                  </div>
                  <p className="text-xs text-gray-400">{r.deals_included} deals &nbsp;·&nbsp; Margin: {formatEuro(r.total_margin)}</p>
                </div>
                <p className="text-sm font-bold text-green-700">{formatEuro(r.total_payable)}</p>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Total: {formatEuro(preview.reduce((s: number, r: Calculation) => s + r.total_payable, 0))}</p>
              <button onClick={() => runCalc('save')} disabled={running}
                className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600">Save</button>
            </div>
          </div>
        )}
      </div>

      {/* Saved calculations */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-navy-700">Saved calculations</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Quarter:</label>
            <select value={filterQ} onChange={e => setFilterQ(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="all">All</option>
              {quarters.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>

        {displayed.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No calculations saved yet.</div>
        ) : (
          displayed.map((calc) => (
            <div key={calc.id} className="border-b border-gray-100 last:border-0">
              {/* Summary row */}
              <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(calc)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy-700">{calc.display_name}</p>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (TYPE_BADGE[calc.commission_type] || '')}>{calc.commission_type}</span>
                    <span className="text-xs text-gray-400">{calc.quarter_label}</span>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium capitalize ' + (STATUS_STYLES[calc.status] || '')}>{calc.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {calc.deals_included} deals &nbsp;·&nbsp; Margin: {formatEuro(calc.total_margin)}
                    {calc.commission_type === 'type3' && calc.cumulative_margin_ytd !== null && (
                      <span> &nbsp;·&nbsp; YTD: {formatEuro(calc.cumulative_margin_ytd)} vs {formatEuro(calc.cumulative_target_ytd ?? 0)} target</span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-700">{formatEuro(calc.total_payable)}</p>
                  {calc.commission_type === 'type1' && calc.commission_earned > 0 && (
                    <p className="text-xs text-gray-400">commission on {formatEuro(calc.total_margin)} margin</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {calc.status === 'draft' && (
                    <button onClick={e => { e.stopPropagation(); updateStatus(calc.id, 'approved') }}
                      className="text-xs text-blue-600 hover:underline font-medium">Approve</button>
                  )}
                  {calc.status === 'approved' && (
                    <button onClick={e => { e.stopPropagation(); updateStatus(calc.id, 'paid') }}
                      className="text-xs text-green-600 hover:underline font-medium">Paid</button>
                  )}
                  <svg className={'w-4 h-4 text-gray-400 transition-transform ' + (expandedId === calc.id ? 'rotate-180' : '')}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Deal breakdown */}
              {expandedId === calc.id && (
                <div className="border-t border-gray-100 bg-gray-50">
                  {loadingLines ? (
                    <div className="py-8 text-center text-sm text-gray-400">Loading deal breakdown...</div>
                  ) : dealLines.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                      No deal lines found. Re-run Calculate & Save to generate deal-level data.
                    </div>
                  ) : (
                    <div>
                      {/* Commission summary banner for Type 2 / Type 3 */}
                      {calc.commission_type === 'type2' && (
                        <div className="flex items-center gap-6 px-5 py-3 bg-purple-50 border-b border-purple-100 text-sm">
                          <span className="text-purple-700 font-semibold">Type 2 — Threshold Margin</span>
                          <span className="text-gray-600">Total margin: <strong>{formatEuro(calc.total_margin)}</strong></span>
                          <span className="text-gray-600">Commission base (above threshold): <strong>{formatEuro(calc.commission_base)}</strong></span>
                          <span className="text-green-700 font-bold ml-auto">Payable: {formatEuro(calc.total_payable)}</span>
                        </div>
                      )}
                      {calc.commission_type === 'type3' && (
                        <div className="flex items-center gap-6 px-5 py-3 bg-green-50 border-b border-green-100 text-sm">
                          <span className="text-green-700 font-semibold">Type 3 — Annual Target</span>
                          <span className="text-gray-600">Quarter margin: <strong>{formatEuro(calc.total_margin)}</strong></span>
                          <span className="text-gray-600">YTD: <strong>{formatEuro(calc.cumulative_margin_ytd ?? 0)}</strong> vs <strong>{formatEuro(calc.cumulative_target_ytd ?? 0)}</strong></span>
                          <span className={'font-bold ml-auto ' + (calc.quarterly_bonus > 0 ? 'text-green-700' : 'text-red-600')}>
                            Bonus: {formatEuro(calc.quarterly_bonus)} {calc.quarterly_bonus > 0 ? '(target met)' : '(target not met)'}
                          </span>
                        </div>
                      )}

                      {/* Export button */}
                      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dealLines.length} deals</p>
                        <button onClick={() => expandedCalc && exportToCsv(dealLines, expandedCalc)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Export CSV for Finance
                        </button>
                      </div>

                      {/* Deal table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-white border-b border-gray-200 text-gray-400 font-semibold uppercase tracking-wide">
                              <th className="text-left px-4 py-2.5">Customer</th>
                              <th className="text-left px-4 py-2.5">Opportunity</th>
                              <th className="text-left px-3 py-2.5">Date</th>
                              <th className="text-left px-3 py-2.5">Type</th>
                              <th className="text-left px-3 py-2.5">Category</th>
                              <th className="text-right px-3 py-2.5">Revenue</th>
                              <th className="text-right px-3 py-2.5">Cost</th>
                              {isType1 && <th className="text-right px-3 py-2.5">Pre-Burden</th>}
                              {isType1 && <th className="text-right px-3 py-2.5">Burden</th>}
                              {isType1 && <th className="text-right px-3 py-2.5">Total Cost</th>}
                              <th className="text-right px-3 py-2.5 text-gray-600">Margin</th>
                              {isType1 && <th className="text-right px-3 py-2.5">Rate</th>}
                              {isType1 && <th className="text-right px-4 py-2.5 text-gray-600">Commission</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {dealLines.map((l) => (
                              <tr key={l.id} className="bg-gray-50 hover:bg-white">
                                <td className="px-4 py-2 font-medium text-gray-800 max-w-[120px]">
                                  <span className="truncate block" title={l.company}>{l.company}</span>
                                </td>
                                <td className="px-4 py-2 text-gray-600 max-w-[180px]">
                                  <span className="truncate block" title={l.opportunity_name}>{l.opportunity_name}</span>
                                </td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(l.closed_date)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtBiz(l.business_type)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtCat(l.commission_category)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatEuro(l.revenue)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatEuro(l.direct_cost)}</td>
                                {isType1 && <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatEuro(l.subtotal_for_burden)}</td>}
                                {isType1 && <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatEuro(l.burdened_cost)}</td>}
                                {isType1 && <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatEuro(l.total_cost)}</td>}
                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">{formatEuro(l.margin)}</td>
                                {isType1 && <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatPercent(l.rate_applied * 100, 0)}</td>}
                                {isType1 && <td className="px-4 py-2 text-right tabular-nums font-bold text-green-700">{formatEuro(l.commission_value)}</td>}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-300 bg-white font-semibold text-xs">
                              <td colSpan={5} className="px-4 py-3 text-gray-700">TOTAL — {dealLines.length} deals</td>
                              <td className="px-3 py-3 text-right tabular-nums text-gray-800">{formatEuro(dealLines.reduce((s,l)=>s+l.revenue,0))}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatEuro(dealLines.reduce((s,l)=>s+l.direct_cost,0))}</td>
                              {isType1 && <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatEuro(dealLines.reduce((s,l)=>s+l.subtotal_for_burden,0))}</td>}
                              {isType1 && <td className="px-3 py-3 text-right tabular-nums text-gray-600">{formatEuro(dealLines.reduce((s,l)=>s+l.burdened_cost,0))}</td>}
                              {isType1 && <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatEuro(dealLines.reduce((s,l)=>s+l.total_cost,0))}</td>}
                              <td className="px-3 py-3 text-right tabular-nums text-gray-900">{formatEuro(dealLines.reduce((s,l)=>s+l.margin,0))}</td>
                              {isType1 && <td className="px-3 py-3" />}
                              {isType1 && <td className="px-4 py-3 text-right tabular-nums text-green-700 text-sm">{formatEuro(dealLines.reduce((s,l)=>s+l.commission_value,0))}</td>}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
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
