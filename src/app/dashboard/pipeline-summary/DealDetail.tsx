'use client'

import { useMemo, useState } from 'react'
import type { Opportunity } from '@/types'
import { exportDealDetailXlsx } from './exportDeals'

type Tab = 'won' | 'open' | 'lost'
type SortKey = 'company' | 'name' | 'owner' | 'category' | 'stage' | 'date' | 'revenue' | 'cost' | 'gp' | 'margin'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// The date that matters per tab: when it closed, or when it's projected to close.
export function dealDate(o: Opportunity, tab: Tab): string | null {
  return tab === 'open' ? o.projected_close_date : (o.closed_date || o.created_date)
}
export function dealMargin(o: Opportunity): number {
  return o.revenue_total ? (o.gross_profit / o.revenue_total) * 100 : 0
}

export default function DealDetail({ won, open, lost, periodLabel, filterNote }: {
  won: Opportunity[]; open: Opportunity[]; lost: Opportunity[]; periodLabel: string; filterNote: string
}) {
  const [tab, setTab] = useState<Tab>('won')
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDesc, setSortDesc] = useState(true)
  const [search, setSearch] = useState('')

  const source = tab === 'won' ? won : tab === 'open' ? open : lost

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? source.filter(o => [o.company, o.opportunity_name, o.opportunity_owner, o.category, o.stage]
          .some(v => (v || '').toLowerCase().includes(q)))
      : source
    const val = (o: Opportunity): string | number => {
      switch (sortKey) {
        case 'company':  return (o.company || '').toLowerCase()
        case 'name':     return (o.opportunity_name || '').toLowerCase()
        case 'owner':    return (o.opportunity_owner || '').toLowerCase()
        case 'category': return (o.category || '').toLowerCase()
        case 'stage':    return (o.stage || '').toLowerCase()
        case 'date':     return dealDate(o, tab) ? new Date(dealDate(o, tab)!).getTime() : 0
        case 'revenue':  return o.revenue_total
        case 'cost':     return o.cost_total
        case 'gp':       return o.gross_profit
        case 'margin':   return dealMargin(o)
      }
    }
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sortDesc ? -c : c
    })
  }, [source, search, sortKey, sortDesc, tab])

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, o) => s + o.revenue_total, 0)
    const cost    = rows.reduce((s, o) => s + o.cost_total, 0)
    const gp      = rows.reduce((s, o) => s + o.gross_profit, 0)
    return { revenue, cost, gp, margin: revenue ? (gp / revenue) * 100 : 0, noCost: rows.filter(o => o.cost_missing).length }
  }, [rows])

  function sortBy(k: SortKey) {
    if (k === sortKey) setSortDesc(d => !d)
    else { setSortKey(k); setSortDesc(k === 'revenue' || k === 'cost' || k === 'gp' || k === 'margin' || k === 'date') }
  }
  const head = (k: SortKey, label: string, right = false) => (
    <th className={right ? 'r' : ''} onClick={() => sortBy(k)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}{sortKey === k ? (sortDesc ? ' ▼' : ' ▲') : ''}
    </th>
  )

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'won',  label: 'Wins',          n: won.length },
    { key: 'open', label: 'Open pipeline', n: open.length },
    { key: 'lost', label: 'Lost',          n: lost.length },
  ]
  const dateLabel = tab === 'open' ? 'Projected close' : 'Closed'
  const marginColour = (m: number, o?: Opportunity) =>
    o?.cost_missing ? '#94a3b8' : m < 0 ? '#dc2626' : m < 10 ? '#d97706' : '#16a34a'

  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: 20 }}>
      <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Deal detail: value, cost and margin</span>
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} className="qbtn" onClick={() => setTab(t.key)} style={{ opacity: tab === t.key ? 1 : 0.65 }}>
              {t.label} ({t.n})
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, deal, owner…"
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', color: 'white', fontSize: 12, width: 200, outline: 'none' }} />
          <button className="qbtn" onClick={() => exportDealDetailXlsx({ won, open, lost, periodLabel, filterNote })}>Export to Excel</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {head('company', 'Company')}{head('name', 'Opportunity')}{head('owner', 'Owner')}
              {head('category', 'Category')}{head('stage', 'Stage')}{head('date', dateLabel)}
              {head('revenue', 'Revenue', true)}{head('cost', 'Cost', true)}{head('gp', 'Profit', true)}{head('margin', 'Margin', true)}
            </tr>
          </thead>
          <tbody>
            {rows.map(o => {
              const m = dealMargin(o)
              return (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.company}</td>
                  <td style={{ color: '#64748b', maxWidth: 280 }}>{o.opportunity_name}</td>
                  <td>{o.opportunity_owner || ''}</td>
                  <td>{o.category || 'Uncategorised'}</td>
                  <td>{o.stage || ''}</td>
                  <td style={{ whiteSpace: 'nowrap', color: tab === 'open' && !o.projected_close_date ? '#d97706' : undefined }}>
                    {fmtDate(dealDate(o, tab)) || (tab === 'open' ? 'No date' : '')}
                  </td>
                  <td className="r" style={{ fontWeight: 700 }}>{euros(o.revenue_total)}</td>
                  <td className="r">{o.cost_missing ? 'No cost' : euros(o.cost_total)}</td>
                  <td className="r">{o.cost_missing ? '' : euros(o.gross_profit)}</td>
                  <td className="r" style={{ fontWeight: 700, color: marginColour(m, o) }}>{o.cost_missing ? '' : `${m.toFixed(1)}%`}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No deals</td></tr>
            )}
            <tr style={{ background: '#1e3a5f' }}>
              <td colSpan={6} style={{ fontWeight: 800, color: 'white' }}>TOTAL ({rows.length} deals)</td>
              <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(totals.revenue)}</td>
              <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(totals.cost)}</td>
              <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(totals.gp)}</td>
              <td className="r" style={{ fontWeight: 800, color: 'white' }}>{totals.margin.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: 0, padding: '8px 14px', fontSize: 11, color: '#94a3b8' }}>
        Margin is profit divided by revenue. Total margin is weighted by value.
        {totals.noCost > 0 && ` ${totals.noCost} deals have no cost recorded; they count in revenue but their cost and profit show as zero, so the total margin is overstated.`}
        {tab !== 'open' ? ` Period: ${periodLabel}.` : ''}
      </p>
    </div>
  )
}
