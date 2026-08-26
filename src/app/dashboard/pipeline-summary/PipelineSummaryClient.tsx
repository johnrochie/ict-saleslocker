'use client'

import { useMemo, useState } from 'react'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(n: number) { return `${n.toFixed(1)}%` }

const BAR_PALETTE = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6']

// Internal/test accounts that shouldn't count toward real pipeline or win figures.
const TEST_COMPANIES_RAW    = ['FAKE COMPANY TEST', 'ICT Services']
const TEST_COMPANIES        = TEST_COMPANIES_RAW.map(c => c.toLowerCase())
const TEST_COMPANIES_LABEL  = `Excludes: ${TEST_COMPANIES_RAW.join(', ')}`

const TENSORX_COMPANIES_RAW = ['TensorX Limited']
const TENSORX_COMPANIES     = TENSORX_COMPANIES_RAW.map(c => c.toLowerCase())
const TENSORX_LABEL         = `Excludes: ${TENSORX_COMPANIES_RAW.join(', ')}`

function stageColour(name: string, idx: number): string {
  const l = name.toLowerCase()
  if (l.includes('won') || l === 'win') return '#16a34a'
  if (l.includes('lost'))               return '#dc2626'
  if (l.includes('hold'))               return '#d97706'
  return BAR_PALETTE[idx % BAR_PALETTE.length]
}

function toInputDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function PipelineSummaryClient({ all, year }: { all: Opportunity[]; year: number }) {
  const today = new Date()

  const [dateFrom, setDateFrom] = useState(toInputDate(new Date(year, 0, 1)))
  const [dateTo,   setDateTo]   = useState(toInputDate(new Date(year, 11, 31)))
  const [excludeTestAccounts, setExcludeTestAccounts] = useState(true)
  const [excludeTensorX,      setExcludeTensorX]      = useState(true)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)

  // Drop internal/test accounts and/or TensorX before anything else derives from it.
  const base = useMemo(() => {
    return all.filter(o => {
      const company = (o.company || '').toLowerCase().trim()
      if (excludeTestAccounts && TEST_COMPANIES.includes(company))    return false
      if (excludeTensorX      && TENSORX_COMPANIES.includes(company)) return false
      return true
    })
  }, [all, excludeTestAccounts, excludeTensorX])

  // Quick-select helpers
  function setRange(from: Date, to: Date) {
    setDateFrom(toInputDate(from))
    setDateTo(toInputDate(to))
  }

  const quickRanges = [
    { label: 'This Year', from: new Date(year, 0, 1),     to: new Date(year, 11, 31) },
    { label: 'Last Year', from: new Date(year-1, 0, 1),   to: new Date(year-1, 11, 31) },
    { label: '2 Yrs',     from: new Date(year-2, 0, 1),   to: new Date(year, 11, 31) },
    { label: 'All Time',  from: new Date(2018, 0, 1),      to: new Date(year+1, 11, 31) },
  ]

  // Current open pipeline — a live snapshot, deliberately NOT bound by the date range.
  // An open deal doesn't belong to a "period" until it closes, so it's always shown in full.
  const openPipeline = useMemo(
    () => base.filter(o => o.normalised_status === 'pipeline' || o.normalised_status === 'on_hold'),
    [base]
  )

  // Period activity — Won/Lost deals whose created_date falls inside the selected range.
  const periodClosed = useMemo(() => {
    const from = new Date(dateFrom)
    const to   = new Date(dateTo); to.setHours(23, 59, 59)
    return base.filter(o => {
      if (o.normalised_status !== 'won' && o.normalised_status !== 'lost') return false
      const d = o.created_date ? new Date(o.created_date) : null
      if (!d) return false
      return d >= from && d <= to
    })
  }, [base, dateFrom, dateTo])

  const metrics = useMemo(() => {
    const pipeline = openPipeline.filter(o => o.normalised_status === 'pipeline')
    const onHold   = openPipeline.filter(o => o.normalised_status === 'on_hold')
    const won      = periodClosed.filter(o => o.normalised_status === 'won')
    const lost     = periodClosed.filter(o => o.normalised_status === 'lost')
    return {
      openCount:    openPipeline.length,
      openRev:      openPipeline.reduce((s, o) => s + o.revenue_total, 0),
      avgOpenDeal:  openPipeline.length ? openPipeline.reduce((s, o) => s + o.revenue_total, 0) / openPipeline.length : 0,
      pipeCount:    pipeline.length,  pipeRev:   pipeline.reduce((s, o) => s + o.revenue_total, 0),
      onHoldCount:  onHold.length,    onHoldRev: onHold.reduce((s, o) => s + o.revenue_total, 0),
      wonCount:     won.length,       wonRev:    won.reduce((s, o) => s + o.revenue_total, 0),
      lostCount:    lost.length,      lostRev:   lost.reduce((s, o) => s + o.revenue_total, 0),
    }
  }, [openPipeline, periodClosed])

  // Stage/category breakdowns describe the CURRENT open pipeline, not the selected period.
  const stageRows = useMemo(() => {
    const map = new Map<string, { count: number; rev: number; status: string }>()
    openPipeline.forEach(o => {
      const key = o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown')
      if (!map.has(key)) map.set(key, { count: 0, rev: 0, status: o.normalised_status })
      const e = map.get(key)!; e.count++; e.rev += o.revenue_total
    })
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => {
        const order = (s: string) => s === 'on_hold' ? 90 : 0
        return order(a.status) - order(b.status) || b.rev - a.rev
      })
  }, [openPipeline])

  const catRows = useMemo(() => {
    const map = new Map<string, { count: number; rev: number }>()
    const total = openPipeline.reduce((s, o) => s + o.revenue_total, 0)
    openPipeline.forEach(o => {
      const cat = o.category || 'Uncategorised'
      if (!map.has(cat)) map.set(cat, { count: 0, rev: 0 })
      const e = map.get(cat)!; e.count++; e.rev += o.revenue_total
    })
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d, pctVal: total > 0 ? (d.rev / total) * 100 : 0 }))
      .sort((a, b) => b.rev - a.rev)
  }, [openPipeline])

  const chartRows = useMemo(() => {
    const map = new Map<string, number>()
    openPipeline.forEach(o => {
      const key = o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown')
      map.set(key, (map.get(key) || 0) + o.revenue_total)
    })
    return Array.from(map.entries())
      .map(([name, rev]) => ({ name, rev }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 10)
  }, [openPipeline])

  // Top 10 deals in the currently selected category, by value.
  const topCatDeals = useMemo(() => {
    if (!selectedCat) return []
    return openPipeline
      .filter(o => (o.category || 'Uncategorised') === selectedCat)
      .sort((a, b) => b.revenue_total - a.revenue_total)
      .slice(0, 10)
  }, [openPipeline, selectedCat])

  const maxChart = Math.max(...chartRows.map(r => r.rev), 1)
  const dateStr  = today.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
  const periodLabel = `${new Date(dateFrom).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })} — ${new Date(dateTo).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div style={{ fontFamily: "'Arial', sans-serif", fontSize: 13, color: '#1e293b', background: '#f1f5f9', minHeight: '100vh', margin: -24 }}>
      <style>{`
        @media print { .no-print { display: none !important; } .ps-wrap { background: white !important; } }
        .ps-table th, .ps-table td { padding: 7px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        .ps-table th { background: #f8fafc; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; }
        .ps-table tr:last-child td { border-bottom: none; }
        .ps-table tr:hover td { background: #f8fafc; }
        .ps-table td.r, .ps-table th.r { text-align: right; font-variant-numeric: tabular-nums; }
        .qbtn { padding: 4px 10px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: white; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: .15s; }
        .qbtn:hover { background: rgba(255,255,255,.2); }
        .date-input { background: transparent; border: none; color: white; font-size: 12px; font-weight: 600; outline: none; width: 110px; }
        .date-input::-webkit-calendar-picker-indicator { filter: invert(1); opacity: .45; cursor: pointer; }
      `}</style>

      {/* Top bar */}
      <div style={{ background: 'linear-gradient(135deg,#1A3A5C 0%,#142d47 100%)', color: 'white', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: -.3 }}>
            ICT Services &nbsp;—&nbsp; <span style={{ color: '#93c5fd' }}>Sales Pipeline Summary</span>
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
            {metrics.openCount} open now &nbsp;·&nbsp; {metrics.wonCount + metrics.lostCount} closed {periodLabel}
          </p>
        </div>

        {/* Controls */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Quick-select buttons */}
          <div style={{ display: 'flex', gap: 5 }}>
            {quickRanges.map(r => (
              <button key={r.label} className="qbtn"
                style={{ opacity: dateFrom === toInputDate(r.from) && dateTo === toInputDate(r.to) ? 1 : 0.65 }}
                onClick={() => setRange(r.from, r.to)}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 12px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: .5 }}>From</span>
            <input type="date" className="date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span style={{ color: 'rgba(255,255,255,.3)' }}>→</span>
            <input type="date" className="date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          <button onClick={() => setExcludeTestAccounts(v => !v)}
            title={TEST_COMPANIES_LABEL}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: excludeTestAccounts ? '1px solid #93c5fd' : '1px solid rgba(255,255,255,.25)',
              background: excludeTestAccounts ? 'rgba(59,130,246,.35)' : 'rgba(255,255,255,.1)',
              color: 'white',
            }}>
            {excludeTestAccounts ? '✓ ' : ''}Hide test accounts
          </button>

          <button onClick={() => setExcludeTensorX(v => !v)}
            title={TENSORX_LABEL}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: excludeTensorX ? '1px solid #93c5fd' : '1px solid rgba(255,255,255,.25)',
              background: excludeTensorX ? 'rgba(59,130,246,.35)' : 'rgba(255,255,255,.1)',
              color: 'white',
            }}>
            {excludeTensorX ? '✓ ' : ''}Hide TensorX
          </button>

          <button onClick={() => window.print()}
            style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', color: 'white', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* Sub-header */}
      <div style={{ background: '#1e3a5f', color: 'white', padding: '7px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Current Open Pipeline — By Stage &amp; Category</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{dateStr}</span>
      </div>

      <div className="ps-wrap" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* KEY METRICS */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
              <span>Current Open Pipeline</span>
              <span style={{ color: 'rgba(255,255,255,.5)', textTransform: 'none', fontWeight: 600 }}>as of today — not affected by date range</span>
            </div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  { label: 'Total open opportunities',       val: metrics.openCount.toLocaleString('en-IE'),                     bold: false },
                  { label: 'Total open pipeline value',       val: euros(metrics.openRev),                                       bold: true  },
                  { label: 'Avg open deal size',              val: euros(metrics.avgOpenDeal),                                   bold: false },
                  { label: 'Active pipeline',                val: `${metrics.pipeCount} / ${euros(metrics.pipeRev)}`,            bold: false },
                  { label: 'On hold',                        val: `${metrics.onHoldCount} / ${euros(metrics.onHoldRev)}`,        bold: false, color: '#d97706' },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ color: '#475569' }}>{row.label}</td>
                    <td className="r" style={{ fontWeight: row.bold ? 800 : 600, color: (row as any).color || '#1e293b' }}>{row.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
              <span>Period Activity</span>
              <span style={{ color: 'rgba(255,255,255,.5)', textTransform: 'none', fontWeight: 600 }}>{periodLabel}</span>
            </div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  { label: 'Won deals',                      val: `${metrics.wonCount} / ${euros(metrics.wonRev)}`,              bold: false, color: '#16a34a' },
                  { label: 'Lost deals',                     val: `${metrics.lostCount} / ${euros(metrics.lostRev)}`,            bold: false, color: '#dc2626' },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ color: '#475569' }}>{row.label}</td>
                    <td className="r" style={{ fontWeight: row.bold ? 800 : 600, color: (row as any).color || '#1e293b' }}>{row.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* BY CATEGORY */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>By Product / Category</div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Category</th><th className="r">Deals</th><th className="r">Revenue</th><th className="r">% Value</th></tr></thead>
              <tbody>
                {catRows.map((row, i) => (
                  <tr key={row.name} onClick={() => setSelectedCat(row.name)} style={{ cursor: 'pointer' }} title="Click for top 10 deals">
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: BAR_PALETTE[i % BAR_PALETTE.length], flexShrink: 0 }} />
                      {row.name}
                    </div></td>
                    <td className="r" style={{ color: '#64748b' }}>{row.count}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{euros(row.rev)}</td>
                    <td className="r" style={{ color: '#3b82f6', fontWeight: 700 }}>{pct(row.pctVal)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#1e3a5f' }}>
                  <td style={{ fontWeight: 800, color: 'white' }}>TOTAL</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{metrics.openCount}</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(metrics.openRev)}</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>100.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* BY STAGE */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>By Stage</div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Stage</th><th className="r">Count</th><th className="r">Value</th></tr></thead>
              <tbody>
                {stageRows.map(row => (
                  <tr key={row.name}>
                    <td style={{ color: row.status === 'on_hold' ? '#d97706' : '#1e293b', fontWeight: row.status === 'on_hold' ? 600 : 400 }}>
                      {row.name}
                    </td>
                    <td className="r" style={{ color: '#64748b' }}>{row.count}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{euros(row.rev)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#1e3a5f' }}>
                  <td style={{ fontWeight: 800, color: 'white' }}>TOTAL</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{metrics.openCount}</td>
                  <td className="r" style={{ fontWeight: 800, color: 'white' }}>{euros(metrics.openRev)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* CHART */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Open Pipeline Value by Stage</div>
            <div style={{ padding: '16px 20px' }}>
              {chartRows.length === 0
                ? <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '20px 0' }}>No open pipeline</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {chartRows.map((row, i) => (
                      <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 130, fontSize: 11, color: '#475569', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                          {row.name.length > 18 ? row.name.slice(0, 16) + '…' : row.name}
                        </div>
                        <div style={{ flex: 1, height: 20, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(row.rev / maxChart) * 100}%`, background: stageColour(row.name, i), borderRadius: 4, minWidth: 4 }} />
                        </div>
                        <div style={{ width: 80, fontSize: 11, fontWeight: 700, color: '#1e293b', textAlign: 'right', flexShrink: 0 }}>
                          {euros(row.rev)}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '12px 0 20px', color: '#94a3b8', fontSize: 11, borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
        ICT Services &nbsp;·&nbsp; {dateStr} &nbsp;·&nbsp; Confidential — internal use only
      </div>

      {/* CATEGORY DRILL-DOWN MODAL */}
      {selectedCat && (
        <div className="no-print" onClick={() => setSelectedCat(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 720, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Top {topCatDeals.length} — {selectedCat} (Open Pipeline)</span>
              <button onClick={() => setSelectedCat(null)}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto' }}>
              <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th>#</th><th>Company</th><th>Deal</th><th>Stage</th><th className="r">Value</th></tr></thead>
                <tbody>
                  {topCatDeals.map((o, i) => (
                    <tr key={o.id}>
                      <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{o.company}</td>
                      <td style={{ color: '#64748b' }}>{o.opportunity_name}</td>
                      <td style={{ color: o.normalised_status === 'on_hold' ? '#d97706' : '#1e293b' }}>
                        {o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown')}
                      </td>
                      <td className="r" style={{ fontWeight: 700 }}>{euros(o.revenue_total)}</td>
                    </tr>
                  ))}
                  {topCatDeals.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No deals found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
