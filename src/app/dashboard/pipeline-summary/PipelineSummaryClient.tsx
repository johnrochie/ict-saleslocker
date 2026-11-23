'use client'

import { useEffect, useMemo, useState } from 'react'
import { Opportunity } from '@/types'
import type { DealExclusion } from '@/lib/exclusions'
import { useDealExclusions, HideDealButton, HideDealDialog, HiddenDealsPanel } from '@/components/dashboard/DealExclusions'

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

// On Hold deals get their own bucket rather than being folded into their
// product category — they're not actively moving, so mixing them in with
// real category totals hides which categories are actually being worked.
function effectiveCategory(o: Opportunity): string {
  if (o.normalised_status === 'on_hold') return 'On Hold'
  return o.category || 'Uncategorised'
}

function stageColour(name: string, idx: number): string {
  const l = name.toLowerCase()
  if (l.includes('won') || l === 'win') return '#16a34a'
  if (l.includes('lost'))               return '#dc2626'
  if (l.includes('hold'))               return '#d97706'
  return BAR_PALETTE[idx % BAR_PALETTE.length]
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDay(d: Date) { return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) }
const COMMENTARY_KEY = 'pipeline-summary-commentary'

export default function PipelineSummaryClient({ all, year, exclusions, canEdit, exclusionsReady }: {
  all: Opportunity[]; year: number; exclusions: DealExclusion[]; canEdit: boolean; exclusionsReady: boolean
}) {
  const today = new Date()
  const hidden = useDealExclusions(exclusions)

  // Reporting period is monthly: pick the month the figures start from, and the month they run to.
  const [startDate, setStartDate] = useState(toDateInput(new Date(year, 0, 1)))
  const [endDate,   setEndDate]   = useState(toDateInput(today))
  const [commentary, setCommentary] = useState('')
  useEffect(() => {
    try { setCommentary(localStorage.getItem(COMMENTARY_KEY) || '') } catch {}
  }, [])
  function updateCommentary(v: string) {
    setCommentary(v)
    try { localStorage.setItem(COMMENTARY_KEY, v) } catch {}
  }
  const [excludeTestAccounts, setExcludeTestAccounts] = useState(true)
  const [excludeTensorX,      setExcludeTensorX]      = useState(true)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [hideOnHold, setHideOnHold] = useState(true)
  // Open pipeline only counts deals projected to close on/before this date ('' = no limit).
  const [closeByDate, setCloseByDate] = useState('')

  // Drop internal/test accounts and/or TensorX before anything else derives from it.
  const base = useMemo(() => {
    return all.filter(o => {
      if (hidden.hiddenIds.has(o.id)) return false   // manager-hidden from exec reporting
      const company = (o.company || '').toLowerCase().trim()
      if (excludeTestAccounts && TEST_COMPANIES.includes(company))    return false
      if (excludeTensorX      && TENSORX_COMPANIES.includes(company)) return false
      return true
    })
  }, [all, excludeTestAccounts, excludeTensorX, hidden.hiddenIds])

  // Quick-select helpers
  function setRange(from: Date, to: Date) {
    setStartDate(toDateInput(from))
    setEndDate(toDateInput(to))
  }

  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const quickRanges = [
    { label: 'This Month', from: new Date(today.getFullYear(), today.getMonth(), 1), to: today },
    { label: 'Last Month', from: lastMonth, to: new Date(today.getFullYear(), today.getMonth(), 0) },
    { label: 'YTD',        from: new Date(year, 0, 1),   to: today },
    { label: 'Last 12 M',  from: new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1), to: today },
  ]

  // Current open pipeline — a live snapshot, deliberately NOT bound by the date range.
  // An open deal doesn't belong to a "period" until it closes, so it's always shown in full.
  const allOpen = useMemo(
    () => base.filter(o => o.normalised_status === 'pipeline' || (!hideOnHold && o.normalised_status === 'on_hold')),
    [base, hideOnHold]
  )
  // Deals with a projected close date after the cut-off are held out; deals with no date stay in.
  const closeCutoff = closeByDate ? new Date(`${closeByDate}T23:59:59`) : null
  const isBeyondCutoff = (o: Opportunity) =>
    !!closeCutoff && !!o.projected_close_date && new Date(o.projected_close_date) > closeCutoff
  const openPipeline = useMemo(
    () => allOpen.filter(o => !isBeyondCutoff(o)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOpen, closeByDate]
  )
  const deferred = useMemo(() => {
    const d = allOpen.filter(isBeyondCutoff)
    return { count: d.length, rev: d.reduce((s, o) => s + o.revenue_total, 0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOpen, closeByDate])
  const noDateCount = useMemo(() => openPipeline.filter(o => !o.projected_close_date).length, [openPipeline])

  // Period activity — Won/Lost deals closed inside the selected months
  // (falls back to created_date where no close date is recorded).
  const periodFrom = useMemo(() => new Date(`${startDate}T00:00:00`), [startDate])
  const periodTo   = useMemo(() => new Date(`${endDate}T23:59:59`),   [endDate])
  const periodClosed = useMemo(() => {
    return base.filter(o => {
      if (o.normalised_status !== 'won' && o.normalised_status !== 'lost') return false
      const raw = o.closed_date || o.created_date
      const d = raw ? new Date(raw) : null
      if (!d) return false
      return d >= periodFrom && d <= periodTo
    })
  }, [base, periodFrom, periodTo])

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
      const cat = effectiveCategory(o)
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
      .filter(o => effectiveCategory(o) === selectedCat)
      .sort((a, b) => b.revenue_total - a.revenue_total)
      .slice(0, 10)
  }, [openPipeline, selectedCat])

  const maxChart = Math.max(...chartRows.map(r => r.rev), 1)
  const dateStr  = today.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
  const periodLabel = `${fmtDay(periodFrom)} — ${fmtDay(periodTo)}`
  const periodShort = `${fmtDay(periodFrom)} to ${fmtDay(periodTo)}`.toUpperCase()
  const excludedNote = [
    excludeTestAccounts ? TEST_COMPANIES_RAW.join(', ') : '',
    excludeTensorX ? TENSORX_COMPANIES_RAW.join(', ') : '',
  ].filter(Boolean).join(', ')

  return (
    <div style={{ fontFamily: "'Arial', sans-serif", fontSize: 13, color: '#1e293b', background: '#f1f5f9', minHeight: '100vh', margin: -24 }}>
      <style>{`
        @media print { .no-print { display: none !important; } .print-only { display: block !important; } .ps-wrap { background: white !important; } }
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
            ICT Services &nbsp;—&nbsp; <span style={{ color: '#93c5fd' }}>Monthly Business Performance Review</span>
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
                style={{ opacity: startDate === toDateInput(r.from) && endDate === toDateInput(r.to) ? 1 : 0.65 }}
                onClick={() => setRange(r.from, r.to)}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 12px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: .5 }}>From</span>
            <input type="date" className="date-input" value={startDate} max={endDate} onChange={e => e.target.value && setStartDate(e.target.value)} />
            <span style={{ color: 'rgba(255,255,255,.3)' }}>→</span>
            <input type="date" className="date-input" value={endDate} min={startDate} onChange={e => e.target.value && setEndDate(e.target.value)} />
          </div>

          {/* Projected close cut-off for the open pipeline */}
          <div title="Only count open deals projected to close on or before this date" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 12px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: .5 }}>Closing by</span>
            <input type="date" className="date-input" value={closeByDate} onChange={e => setCloseByDate(e.target.value)} />
            {closeByDate && <button onClick={() => setCloseByDate('')} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, lineHeight: 1 }} title="Clear">×</button>}
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

          <button onClick={() => setHideOnHold(v => !v)}
            title="Leave On Hold deals out of the open pipeline"
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: hideOnHold ? '1px solid #93c5fd' : '1px solid rgba(255,255,255,.25)',
              background: hideOnHold ? 'rgba(59,130,246,.35)' : 'rgba(255,255,255,.1)',
              color: 'white',
            }}>
            {hideOnHold ? '✓ ' : ''}Hide On Hold
          </button>

          <button onClick={() => window.print()}
            style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', color: 'white', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* Sub-header */}
      <div style={{ background: '#1e3a5f', color: 'white', padding: '7px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Commercial — ICT Sales and Pipeline</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{dateStr}</span>
      </div>

      <div className="ps-wrap" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 28px' }}>
        <div style={{ marginBottom: 16 }}><HiddenDealsPanel state={hidden} canEdit={canEdit} ready={exclusionsReady} scope={s => s === 'pipeline' || s === 'on_hold'} /></div>
        {/* LEADERSHIP SUMMARY: mirrors the headings on the leadership slide */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Open pipeline', val: euros(metrics.openRev), sub: `${metrics.openCount.toLocaleString('en-IE')} opportunities, average ${euros(metrics.avgOpenDeal)}`, color: '#1e293b' },
            { label: `Won, ${periodShort}`, val: euros(metrics.wonRev), sub: `${metrics.wonCount} deals`, color: '#16a34a' },
            { label: 'Lost, same period', val: euros(metrics.lostRev), sub: `${metrics.lostCount} deals`, color: '#dc2626' },
          ].map(k => (
            <div key={k.label} style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: '#64748b' }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color, margin: '4px 0', fontVariantNumeric: 'tabular-nums' }}>{k.val}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{k.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 8 }}>
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Open pipeline by stage</div>
            <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {stageRows.map(row => (
                  <tr key={row.name}>
                    <td style={{ color: row.status === 'on_hold' ? '#d97706' : '#1e293b' }}>{row.name}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{euros(row.rev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>Commentary</div>
            <textarea className="no-print" value={commentary} onChange={e => updateCommentary(e.target.value)}
              placeholder="One point per line. Saved in this browser."
              style={{ flex: 1, minHeight: 140, border: 'none', outline: 'none', resize: 'vertical', padding: '12px 14px', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }} />
            <ul className="print-only" style={{ display: 'none', margin: 0, padding: '12px 14px 12px 30px' }}>
              {commentary.split('\n').filter(l => l.trim()).map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 24px' }}>
          Open pipeline {hideOnHold ? 'excludes' : 'includes'} On Hold.{closeCutoff ? ` Limited to deals projected to close by ${fmtDay(closeCutoff)}; ${deferred.count} deals worth ${euros(deferred.rev)} projected later are left out${noDateCount ? `, and ${noDateCount} with no projected date are included` : ''}.` : ''} Won and lost are deals closed {periodLabel}.{excludedNote ? ` Excludes: ${excludedNote}.` : ''} Source: ICT SalesIQ, {dateStr}.
        </p>
        <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#475569', margin: '0 0 12px' }}>Detail: by category and stage</h2>

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
                  ...(hideOnHold ? [] : [{ label: 'On hold', val: `${metrics.onHoldCount} / ${euros(metrics.onHoldRev)}`, bold: false, color: '#d97706' }]),
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

      <HideDealDialog state={hidden} />

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
                <thead><tr><th>#</th><th>Company</th><th>Deal</th><th>Stage</th><th className="r">Value</th>{canEdit && exclusionsReady && <th />}</tr></thead>
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
                      {canEdit && exclusionsReady && <td className="r"><HideDealButton deal={o} state={hidden} /></td>}
                    </tr>
                  ))}
                  {topCatDeals.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>No deals found</td></tr>
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
