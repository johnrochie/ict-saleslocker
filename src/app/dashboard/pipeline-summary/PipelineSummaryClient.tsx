'use client'

import { useMemo } from 'react'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(n: number) { return `${n.toFixed(1)}%` }

const STAGE_COLOURS: Record<string, string> = {
  won:     '#16a34a',
  lost:    '#dc2626',
  on_hold: '#d97706',
}
const BAR_PALETTE = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6']

function stageColour(name: string, idx: number): string {
  const l = name.toLowerCase()
  if (l.includes('won') || l === 'win') return STAGE_COLOURS.won
  if (l.includes('lost') || l === 'loss') return STAGE_COLOURS.lost
  if (l.includes('hold')) return STAGE_COLOURS.on_hold
  return BAR_PALETTE[idx % BAR_PALETTE.length]
}

export default function PipelineSummaryClient({ all, year }: { all: Opportunity[]; year: number }) {
  const today = new Date()

  const metrics = useMemo(() => {
    const pipeline = all.filter(o => o.normalised_status === 'pipeline')
    const onHold   = all.filter(o => o.normalised_status === 'on_hold')
    const won      = all.filter(o => o.normalised_status === 'won')
    const lost     = all.filter(o => o.normalised_status === 'lost')
    const open     = [...pipeline, ...onHold]
    return {
      total:        all.length,
      totalRev:     all.reduce((s, o) => s + o.revenue_total, 0),
      avgDeal:      all.length ? all.reduce((s, o) => s + o.revenue_total, 0) / all.length : 0,
      openRev:      open.reduce((s, o) => s + o.revenue_total, 0),
      pipeCount:    pipeline.length, pipeRev: pipeline.reduce((s, o) => s + o.revenue_total, 0),
      onHoldCount:  onHold.length,   onHoldRev: onHold.reduce((s, o) => s + o.revenue_total, 0),
      wonCount:     won.length,      wonRev: won.reduce((s, o) => s + o.revenue_total, 0),
      lostCount:    lost.length,     lostRev: lost.reduce((s, o) => s + o.revenue_total, 0),
    }
  }, [all])

  const stageRows = useMemo(() => {
    const map = new Map<string, { count: number; rev: number; status: string }>()
    all.forEach(o => {
      let key: string
      if (o.normalised_status === 'won')     key = 'Won'
      else if (o.normalised_status === 'lost')    key = 'Lost'
      else if (o.normalised_status === 'on_hold') key = 'On Hold'
      else key = o.stage || 'Unknown'
      if (!map.has(key)) map.set(key, { count: 0, rev: 0, status: o.normalised_status })
      const e = map.get(key)!; e.count++; e.rev += o.revenue_total
    })
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => {
        // pipeline stages first (alphabetical/numeric), then on hold, lost, won
        const order = (s: string) => {
          if (s === 'on_hold') return 90
          if (s === 'lost')    return 95
          if (s === 'won')     return 99
          return 0
        }
        return order(a.status) - order(b.status) || b.rev - a.rev
      })
  }, [all])

  const catRows = useMemo(() => {
    const map = new Map<string, { count: number; rev: number }>()
    const total = all.reduce((s, o) => s + o.revenue_total, 0)
    all.forEach(o => {
      const cat = o.category || 'Uncategorised'
      if (!map.has(cat)) map.set(cat, { count: 0, rev: 0 })
      const e = map.get(cat)!; e.count++; e.rev += o.revenue_total
    })
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d, pctVal: total > 0 ? (d.rev / total) * 100 : 0 }))
      .sort((a, b) => b.rev - a.rev)
  }, [all])

  // Chart: open pipeline + on_hold by stage only (excludes won/lost)
  const chartRows = useMemo(() => {
    const map = new Map<string, number>()
    all.filter(o => o.normalised_status === 'pipeline' || o.normalised_status === 'on_hold')
      .forEach(o => {
        const key = o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown')
        map.set(key, (map.get(key) || 0) + o.revenue_total)
      })
    return Array.from(map.entries())
      .map(([name, rev]) => ({ name, rev }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 10)
  }, [all])

  const maxChart = Math.max(...chartRows.map(r => r.rev), 1)

  const dateStr = today.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ fontFamily: "'Arial', sans-serif", fontSize: 13, color: '#1e293b', background: '#f1f5f9', minHeight: '100vh', margin: -24 }}>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .ps-wrap { margin: 0 !important; background: white !important; }
        }
        .ps-table th, .ps-table td { padding: 7px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        .ps-table th { background: #f8fafc; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; }
        .ps-table tr:last-child td { border-bottom: none; }
        .ps-table tr:hover td { background: #f8fafc; }
        .ps-table td.r, .ps-table th.r { text-align: right; font-variant-numeric: tabular-nums; }
      `}</style>

      {/* Top bar */}
      <div style={{ background: 'linear-gradient(135deg,#1A3A5C 0%,#142d47 100%)', color: 'white', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -.3 }}>
            ICT Services &nbsp;—&nbsp; <span style={{ color: '#93c5fd' }}>Sales Pipeline Summary</span>
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
            {year} · Generated {dateStr}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }} className="no-print">
          <button
            onClick={() => window.print()}
            style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', color: 'white', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* Sub-header */}
      <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Sales Pipeline — By Stage &amp; Category</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{dateStr}</span>
      </div>

      <div className="ps-wrap" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 28px' }}>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* LEFT: Key Metrics */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
              Key Metrics
            </div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  { label: 'Total opportunities',            val: metrics.total.toLocaleString('en-IE'),         bold: false },
                  { label: 'Total pipeline value (list)',    val: euros(metrics.totalRev),                        bold: true  },
                  { label: 'Avg deal size',                  val: euros(metrics.avgDeal),                         bold: false },
                  { label: 'Open pipeline (excl. Won/Lost)', val: euros(metrics.openRev),                         bold: true  },
                  { label: `Active pipeline`,               val: `${metrics.pipeCount} / ${euros(metrics.pipeRev)}`, bold: false },
                  { label: 'Won deals',                      val: `${metrics.wonCount} / ${euros(metrics.wonRev)}`,  bold: false, green: true },
                  { label: 'On hold deals',                  val: `${metrics.onHoldCount} / ${euros(metrics.onHoldRev)}`, bold: false, amber: true },
                  { label: 'Lost deals',                     val: `${metrics.lostCount} / ${euros(metrics.lostRev)}`,  bold: false, red: true },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ color: '#475569' }}>{row.label}</td>
                    <td className="r" style={{ fontWeight: row.bold ? 800 : 600, color: (row as any).green ? '#16a34a' : (row as any).amber ? '#d97706' : (row as any).red ? '#dc2626' : '#1e293b' }}>
                      {row.val}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RIGHT: By Category */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
              By Product / Category
            </div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="r">Deals</th>
                  <th className="r">Revenue</th>
                  <th className="r">% Value</th>
                </tr>
              </thead>
              <tbody>
                {catRows.map((row, i) => (
                  <tr key={row.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: BAR_PALETTE[i % BAR_PALETTE.length], flexShrink: 0 }} />
                        {row.name}
                      </div>
                    </td>
                    <td className="r" style={{ color: '#64748b' }}>{row.count}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{euros(row.rev)}</td>
                    <td className="r" style={{ color: '#3b82f6', fontWeight: 700 }}>{pct(row.pctVal)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#1e3a5f' }}>
                  <td style={{ fontWeight: 800, color: 'white' }}>TOTAL</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{all.length}</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(metrics.totalRev)}</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>100.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Second row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* LEFT: By Stage */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
              By Stage
            </div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="r">Count</th>
                  <th className="r">Value</th>
                </tr>
              </thead>
              <tbody>
                {stageRows.map((row, i) => (
                  <tr key={row.name}>
                    <td style={{ color: row.status === 'won' ? '#16a34a' : row.status === 'lost' ? '#dc2626' : row.status === 'on_hold' ? '#d97706' : '#1e293b', fontWeight: ['won','lost','on_hold'].includes(row.status) ? 600 : 400 }}>
                      {row.name}
                    </td>
                    <td className="r" style={{ color: '#64748b' }}>{row.count}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{euros(row.rev)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#1e3a5f' }}>
                  <td style={{ fontWeight: 800, color: 'white' }}>TOTAL</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{all.length}</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(metrics.totalRev)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* RIGHT: Pipeline Value by Stage chart */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
              Open Pipeline Value by Stage
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 14, textAlign: 'center' }}>
                Open Pipeline Value by Stage
              </div>
              {chartRows.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>No open pipeline</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {chartRows.map((row, i) => (
                    <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 130, fontSize: 11, color: '#475569', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                           title={row.name}>
                        {row.name.length > 18 ? row.name.slice(0, 16) + '…' : row.name}
                      </div>
                      <div style={{ flex: 1, height: 20, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${(row.rev / maxChart) * 100}%`,
                          background: stageColour(row.name, i),
                          borderRadius: 4,
                          transition: 'width .5s ease',
                          minWidth: 4,
                        }} />
                      </div>
                      <div style={{ width: 80, fontSize: 11, fontWeight: 700, color: '#1e293b', textAlign: 'right', flexShrink: 0 }}>
                        {euros(row.rev)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '12px 0 20px', color: '#94a3b8', fontSize: 11, borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
        ICT Services &nbsp;·&nbsp; {dateStr} &nbsp;·&nbsp; Confidential — internal use only
      </div>
    </div>
  )
}
