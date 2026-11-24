'use client'

import { useMemo, useState } from 'react'
import type { Opportunity } from '@/types'
import { HideDealButton, useDealExclusions } from '@/components/dashboard/DealExclusions'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

type HideState = ReturnType<typeof useDealExclusions>

// Top deals in each chosen category of the open pipeline, laid out as panels
// (the "Pipeline Breakdown" slide). Uses whatever the page filters leave in the open pipeline.
export default function PipelineBreakdown({ deals, categoryOf, hide, footnote, mode = 'open' }: {
  mode?: 'open' | 'won'
  deals: Opportunity[]
  categoryOf: (o: Opportunity) => string
  hide: HideState | null          // null when the user can't hide deals
  footnote: string
}) {
  const [topN, setTopN] = useState(10)
  const [picked, setPicked] = useState<string[] | null>(null)   // null = auto: three biggest categories

  // Categories ranked by open value.
  const catRows = useMemo(() => {
    const m = new Map<string, { count: number; rev: number }>()
    deals.forEach(o => {
      const k = categoryOf(o)
      const e = m.get(k) || { count: 0, rev: 0 }
      e.count++; e.rev += o.revenue_total
      m.set(k, e)
    })
    return Array.from(m.entries()).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.rev - a.rev)
  }, [deals, categoryOf])

  const selected = (picked ?? catRows.slice(0, 3).map(r => r.name)).filter(n => catRows.some(r => r.name === n))

  const tables = selected.map(cat => ({
    cat,
    deals: deals.filter(o => categoryOf(o) === cat).sort((a, b) => b.revenue_total - a.revenue_total).slice(0, topN),
  }))

  // Two columns, each panel dropped into whichever column is currently shorter.
  const cols: { items: typeof tables; weight: number }[] = [{ items: [], weight: 0 }, { items: [], weight: 0 }]
  tables.forEach(t => {
    const target = cols[0].weight <= cols[1].weight ? cols[0] : cols[1]
    target.items.push(t); target.weight += t.deals.length + 2
  })

  function toggle(name: string) {
    setPicked(selected.includes(name) ? selected.filter(n => n !== name) : [...selected, name])
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    border: on ? '1px solid #1e3a5f' : '1px solid #cbd5e1',
    background: on ? '#1e3a5f' : 'white', color: on ? 'white' : '#475569',
  })

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#475569', margin: '0 0 10px' }}>
        {mode === 'won' ? 'Wins breakdown: top deals by category' : 'Pipeline breakdown: top deals by category'}
      </h2>

      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginRight: 4 }}>Show</span>
        {[5, 10].map(n => <button key={n} style={chip(topN === n)} onClick={() => setTopN(n)}>Top {n}</button>)}
        <span style={{ width: 10 }} />
        {catRows.map(r => (
          <button key={r.name} style={chip(selected.includes(r.name))} onClick={() => toggle(r.name)} title={`${r.count} deals, ${euros(r.rev)}`}>
            {r.name}
          </button>
        ))}
        <button style={{ ...chip(picked === null), marginLeft: 6 }} onClick={() => setPicked(null)} title="Use the three biggest categories">Auto</button>
      </div>

      {tables.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No categories selected</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: tables.length === 1 ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
          {(tables.length === 1 ? [cols[0]] : cols).map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {c.items.map(t => (
                <div key={t.cat} style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
                    Top {t.deals.length} — {t.cat} ({mode === 'won' ? 'Won' : 'Open Pipeline'})
                  </div>
                  <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th>#</th><th>Company</th><th>Deal</th><th>{mode === 'won' ? 'Closed' : 'Stage'}</th><th className="r">Value</th></tr></thead>
                    <tbody>
                      {t.deals.map((o, idx) => (
                        <tr key={o.id}>
                          <td style={{ color: '#94a3b8' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{o.company}</td>
                          <td style={{ color: '#64748b' }}>{o.opportunity_name}</td>
                          <td style={{ whiteSpace: mode === 'won' ? 'nowrap' : undefined, color: o.normalised_status === 'on_hold' ? '#d97706' : undefined }}>
                            {mode === 'won'
                              ? fmtDate(o.closed_date || o.created_date)
                              : (o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown'))}
                          </td>
                          <td className="r" style={{ fontWeight: 700, whiteSpace: 'nowrap', color: mode === 'won' ? '#16a34a' : undefined }}>
                            {euros(o.revenue_total)}
                            {hide && <span className="no-print" style={{ marginLeft: 6 }}><HideDealButton deal={o} state={hide} /></span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>{footnote}</p>
    </div>
  )
}
