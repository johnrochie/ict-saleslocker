'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Opportunity } from '@/types'
import type { DealExclusion } from '@/lib/exclusions'
import { useDealExclusions, HideDealButton, HideDealDialog, HiddenDealsPanel, DealExclusionsState } from '@/components/dashboard/DealExclusions'

// Builds the four exec-meeting slides (Pipeline, Pipeline Breakdown, General
// Wins, Wins Breakdown) from one set of settings. The numbers follow the same
// rules as the Pipeline Summary and Wins Summary pages so they reconcile.

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(n: number) { return `${n.toFixed(1)}%` }
function fmtDate(s: string) {
  return new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
}
// Local-time YYYY-MM-DD (toISOString shifts dates back a day during Irish summer time).
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const BAR_PALETTE = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6']

const TEST_COMPANIES    = ['fake company test', 'ict services']
const TENSORX_COMPANIES = ['tensorx limited']

const SLIDE_W = 1600
const SLIDE_H = 900
const MAX_CAT_ROWS = 10
const STORAGE_KEY = 'execPack.v1'

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

type Row = { name: string; count: number; rev: number }

function groupBy(deals: Opportunity[], key: (o: Opportunity) => string): Row[] {
  const map = new Map<string, Row>()
  deals.forEach(o => {
    const k = key(o)
    if (!map.has(k)) map.set(k, { name: k, count: 0, rev: 0 })
    const e = map.get(k)!; e.count++; e.rev += o.revenue_total
  })
  return Array.from(map.values()).sort((a, b) => b.rev - a.rev)
}

// Keep category tables to a slide-safe length by rolling the tail into "Other".
function capRows(rows: Row[]): Row[] {
  if (rows.length <= MAX_CAT_ROWS) return rows
  const head = rows.slice(0, MAX_CAT_ROWS - 1)
  const tail = rows.slice(MAX_CAT_ROWS - 1)
  return [...head, { name: `Other (${tail.length} categories)`, count: tail.reduce((s, r) => s + r.count, 0), rev: tail.reduce((s, r) => s + r.rev, 0) }]
}

function sum(deals: Opportunity[]) { return deals.reduce((s, o) => s + o.revenue_total, 0) }

type Saved = {
  winsFrom: string; winsTo: string; winsBasis: 'created' | 'closed'
  pipeCats: string[] | null; winCats: string[] | null; topN: number
  excludeTest: boolean; excludeTensorX: boolean; activityRange: 'year' | 'wins'
}

export default function ExecPackClient({ all, year, exclusions, canEdit, exclusionsReady }: {
  all: Opportunity[]; year: number; exclusions: DealExclusion[]; canEdit: boolean; exclusionsReady: boolean
}) {
  const today = new Date()
  const hidden = useDealExclusions(exclusions)

  const [winsFrom,  setWinsFrom]  = useState(ymd(new Date(year, 0, 1)))
  const [winsTo,    setWinsTo]    = useState(ymd(new Date(year, 11, 31)))
  const [winsBasis, setWinsBasis] = useState<'created' | 'closed'>('created')
  const [activityRange, setActivityRange] = useState<'year' | 'wins'>('year')
  const [pipeCats,  setPipeCats]  = useState<string[] | null>(null)  // null = auto (top 3)
  const [winCats,   setWinCats]   = useState<string[] | null>(null)  // null = auto (top 2)
  const [topN,      setTopN]      = useState(10)
  const [excludeTest,    setExcludeTest]    = useState(true)
  const [excludeTensorX, setExcludeTensorX] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy,   setBusy]   = useState<string | null>(null)
  const [toast,  setToast]  = useState<string | null>(null)

  // Remember the last settings so next month's pack is one click.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw) as Partial<Saved>
        if (s.winsFrom)  setWinsFrom(s.winsFrom)
        if (s.winsTo)    setWinsTo(s.winsTo)
        if (s.winsBasis) setWinsBasis(s.winsBasis)
        if (s.activityRange) setActivityRange(s.activityRange)
        if (s.pipeCats !== undefined) setPipeCats(s.pipeCats)
        if (s.winCats  !== undefined) setWinCats(s.winCats)
        if (s.topN)      setTopN(s.topN)
        if (s.excludeTest    !== undefined) setExcludeTest(s.excludeTest)
        if (s.excludeTensorX !== undefined) setExcludeTensorX(s.excludeTensorX)
      }
    } catch { /* storage unavailable — defaults are fine */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const s: Saved = { winsFrom, winsTo, winsBasis, pipeCats, winCats, topN, excludeTest, excludeTensorX, activityRange }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }, [loaded, winsFrom, winsTo, winsBasis, pipeCats, winCats, topN, excludeTest, excludeTensorX, activityRange])

  const base = useMemo(() => all.filter(o => {
    if (hidden.hiddenIds.has(o.id)) return false
    const company = (o.company || '').toLowerCase().trim()
    if (excludeTest    && TEST_COMPANIES.includes(company))    return false
    if (excludeTensorX && TENSORX_COMPANIES.includes(company)) return false
    return true
  }), [all, excludeTest, excludeTensorX, hidden.hiddenIds])

  // ── Pipeline (live snapshot, not date-bound) ──────────────────────────────
  const open     = useMemo(() => base.filter(o => o.normalised_status === 'pipeline' || o.normalised_status === 'on_hold'), [base])
  const active   = useMemo(() => open.filter(o => o.normalised_status === 'pipeline'), [open])
  const onHold   = useMemo(() => open.filter(o => o.normalised_status === 'on_hold'), [open])
  const openRev  = sum(open)
  const pipeCatRows   = useMemo(() => groupBy(open, effectiveCategory), [open])
  const pipeStageRows = useMemo(() => {
    const rows = groupBy(open, o => o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown'))
    return [...rows.filter(r => r.name !== 'On Hold'), ...rows.filter(r => r.name === 'On Hold')]
  }, [open])

  // ── Wins (date-bound) ─────────────────────────────────────────────────────
  const won = useMemo(() => base.filter(o => {
    if (o.normalised_status !== 'won') return false
    const d = winsBasis === 'closed' ? o.closed_date : o.created_date
    if (!d) return false
    const day = d.slice(0, 10)
    return day >= winsFrom && day <= winsTo
  }), [base, winsFrom, winsTo, winsBasis])
  const wonRev       = sum(won)
  const winCatRows   = useMemo(() => groupBy(won, o => o.category || 'Uncategorised'), [won])
  const winStageRows = useMemo(() => groupBy(won, o => o.stage || 'Unknown'), [won])

  // Period Activity on the Pipeline slide: this year by default (as on the
  // Pipeline Summary page), or the same window as the wins slides.
  const actFrom = activityRange === 'year' ? `${year}-01-01` : winsFrom
  const actTo   = activityRange === 'year' ? `${year}-12-31` : winsTo
  const inActivity = (o: Opportunity) => {
    const d = winsBasis === 'closed' ? o.closed_date : o.created_date
    return !!d && d.slice(0, 10) >= actFrom && d.slice(0, 10) <= actTo
  }
  const actWon  = useMemo(() => base.filter(o => o.normalised_status === 'won'  && inActivity(o)), [base, actFrom, actTo, winsBasis]) // eslint-disable-line react-hooks/exhaustive-deps
  const actLost = useMemo(() => base.filter(o => o.normalised_status === 'lost' && inActivity(o)), [base, actFrom, actTo, winsBasis]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Breakdown selections ──────────────────────────────────────────────────
  const pipeSel = pipeCats ?? pipeCatRows.filter(r => r.name !== 'On Hold').slice(0, 3).map(r => r.name)
  const winSel  = winCats  ?? winCatRows.slice(0, 2).map(r => r.name)

  function toggle(list: string[], name: string, set: (v: string[]) => void) {
    set(list.includes(name) ? list.filter(n => n !== name) : [...list, name])
  }

  const pipeTables = pipeSel
    .filter(c => pipeCatRows.some(r => r.name === c))
    .map(c => ({ cat: c, deals: open.filter(o => effectiveCategory(o) === c).sort((a, b) => b.revenue_total - a.revenue_total).slice(0, topN) }))
  const winTables = winSel
    .filter(c => winCatRows.some(r => r.name === c))
    .map(c => ({ cat: c, deals: won.filter(o => (o.category || 'Uncategorised') === c).sort((a, b) => b.revenue_total - a.revenue_total).slice(0, topN) }))

  const periodLabel = `${fmtDate(winsFrom)} — ${fmtDate(winsTo)}`
  const basisLabel  = winsBasis === 'closed' ? 'by closed date' : 'by created date'

  const quickRanges = [
    { label: 'This Month',   from: new Date(today.getFullYear(), today.getMonth(), 1),     to: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
    { label: 'Last Month',   from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 0) },
    { label: 'This Quarter', from: new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1), to: new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0) },
    { label: 'This Year',    from: new Date(year, 0, 1), to: new Date(year, 11, 31) },
  ]

  // ── Export ────────────────────────────────────────────────────────────────
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const slideNames = ['Pipeline', 'Pipeline Breakdown', 'General Wins', 'Wins Breakdown']

  async function renderSlide(i: number) {
    const node = slideRefs.current[i]
    if (!node) throw new Error('Slide not ready')
    const { toBlob } = await import('html-to-image')
    const blob = await toBlob(node, {
      width: SLIDE_W, height: SLIDE_H, pixelRatio: 1.5, backgroundColor: '#f5f5f5', cacheBust: true,
      filter: n => !(n instanceof HTMLElement && n.classList.contains('xp-nocap')),   // drop the Hide buttons
    })
    if (!blob) throw new Error('Could not render slide')
    return blob
  }

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function copySlide(i: number) {
    setBusy(`copy-${i}`)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderSlide(i) })])
      flash(`${slideNames[i]} copied — paste it into PowerPoint`)
    } catch (e) {
      flash(`Couldn't copy: ${(e as Error).message}`)
    } finally { setBusy(null) }
  }

  async function downloadPptx() {
    setBusy('pptx')
    try {
      const { default: PptxGenJS } = await import('pptxgenjs')
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'   // 13.33 x 7.5 in, 16:9
      for (let i = 0; i < slideNames.length; i++) {
        const blob = await renderSlide(i)
        const data = await new Promise<string>((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob)
        })
        pptx.addSlide().addImage({ data, x: 0, y: 0, w: 13.333, h: 7.5 })
      }
      await pptx.writeFile({ fileName: `Sales Exec Pack ${ymd(today)}.pptx` })
      flash('PowerPoint downloaded')
    } catch (e) {
      flash(`Export failed: ${(e as Error).message}`)
    } finally { setBusy(null) }
  }

  // Scale the fixed 1600×900 slides to fit the page width.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / SLIDE_W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Slides ────────────────────────────────────────────────────────────────
  const slides = [
    // 1. Pipeline
    <div key="p" className="xp-grid">
      <Panel title="Current Open Pipeline" right="as of today">
        <KV rows={[
          ['Total open opportunities', open.length.toLocaleString('en-IE')],
          ['Total open pipeline value', euros(openRev), { bold: true }],
          ['Avg open deal size', euros(open.length ? openRev / open.length : 0)],
          ['Active pipeline', `${active.length} / ${euros(sum(active))}`],
          ['On hold', `${onHold.length} / ${euros(sum(onHold))}`, { color: '#d97706' }],
        ]} />
        <PanelHead title="Period Activity" right={`${fmtDate(actFrom)} — ${fmtDate(actTo)} (${basisLabel})`} />
        <KV rows={[
          ['Won deals',  `${actWon.length} / ${euros(sum(actWon))}`, { color: '#16a34a' }],
          ['Lost deals', `${actLost.length} / ${euros(sum(actLost))}`, { color: '#dc2626' }],
        ]} />
      </Panel>
      <Panel title="By Product / Category"><CatTable rows={capRows(pipeCatRows)} total={{ count: open.length, rev: openRev }} /></Panel>
      <Panel title="By Stage"><StageTable rows={pipeStageRows} total={{ count: open.length, rev: openRev }} /></Panel>
      <Panel title="Open Pipeline Value by Stage"><Bars rows={[...pipeStageRows].sort((a, b) => b.rev - a.rev).slice(0, 10)} empty="No open pipeline" /></Panel>
    </div>,

    // 2. Pipeline breakdown
    <Breakdown key="pb" tables={pipeTables} mode="pipeline" empty="Pick at least one category above" hide={canEdit ? hidden : null} />,

    // 3. General wins
    <div key="w" className="xp-grid">
      <Panel title="Won Deals" right={periodLabel}>
        <KV rows={[
          ['Total won opportunities', won.length.toLocaleString('en-IE')],
          ['Total won value', euros(wonRev), { bold: true, color: '#16a34a' }],
          ['Avg won deal size', euros(won.length ? wonRev / won.length : 0)],
        ]} />
      </Panel>
      <Panel title="By Product / Category"><CatTable rows={capRows(winCatRows)} total={{ count: won.length, rev: wonRev }} /></Panel>
      <Panel title="By Stage"><StageTable rows={winStageRows} total={{ count: won.length, rev: wonRev }} /></Panel>
      <Panel title="Won Value by Stage"><Bars rows={winStageRows.slice(0, 10)} empty="No won deals in this period" /></Panel>
    </div>,

    // 4. Wins breakdown
    <Breakdown key="wb" tables={winTables} mode="won" empty="Pick at least one category above" hide={canEdit ? hidden : null} />,
  ]

  const btn = 'px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors'
  const on  = 'bg-navy-700 border-navy-700 text-white'
  const off = 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'

  return (
    <div style={{ fontFamily: "'Arial', sans-serif" }}>
      <style>{SLIDE_CSS}</style>

      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Exec Meeting Pack</h1>
          <p className="text-sm text-gray-500">The four sales slides for the exec deck, built from live data. Your settings are remembered for next time.</p>
        </div>
        <button onClick={downloadPptx} disabled={!!busy}
          className="px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-semibold hover:bg-navy-800 disabled:opacity-50">
          {busy === 'pptx' ? 'Building…' : '⬇ Download PowerPoint (4 slides)'}
        </button>
      </div>

      {/* Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-4 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-36 font-semibold text-gray-700">Wins period</span>
          {quickRanges.map(r => {
            const f = ymd(r.from), t = ymd(r.to)
            return <button key={r.label} className={`${btn} ${winsFrom === f && winsTo === t ? on : off}`}
              onClick={() => { setWinsFrom(f); setWinsTo(t) }}>{r.label}</button>
          })}
          <input type="date" value={winsFrom} onChange={e => setWinsFrom(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={winsTo} onChange={e => setWinsTo(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-xs" />
          <span className="text-gray-400 ml-2">Filter on</span>
          <button className={`${btn} ${winsBasis === 'created' ? on : off}`} onClick={() => setWinsBasis('created')} title="Matches the Wins Summary page">Created date</button>
          <button className={`${btn} ${winsBasis === 'closed'  ? on : off}`} onClick={() => setWinsBasis('closed')}>Closed date</button>
        </div>

        <CatPicker label="Pipeline breakdown" rows={pipeCatRows} selected={pipeSel}
          onToggle={n => toggle(pipeSel, n, setPipeCats)} onAuto={() => setPipeCats(null)} auto={pipeCats === null} btn={btn} on={on} off={off} />
        <CatPicker label="Wins breakdown" rows={winCatRows} selected={winSel}
          onToggle={n => toggle(winSel, n, setWinCats)} onAuto={() => setWinCats(null)} auto={winCats === null} btn={btn} on={on} off={off} />

        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-36 font-semibold text-gray-700">Options</span>
          <span className="text-gray-400">Deals per table</span>
          {[5, 10].map(n => <button key={n} className={`${btn} ${topN === n ? on : off}`} onClick={() => setTopN(n)}>{n}</button>)}
          <span className="text-gray-400 ml-2">Pipeline slide period activity</span>
          <button className={`${btn} ${activityRange === 'year' ? on : off}`} onClick={() => setActivityRange('year')}>This year</button>
          <button className={`${btn} ${activityRange === 'wins' ? on : off}`} onClick={() => setActivityRange('wins')}>Same as wins period</button>
          <button className={`${btn} ${excludeTest ? on : off}`} onClick={() => setExcludeTest(v => !v)}>{excludeTest ? '✓ ' : ''}Hide test accounts</button>
          <button className={`${btn} ${excludeTensorX ? on : off}`} onClick={() => setExcludeTensorX(v => !v)}>{excludeTensorX ? '✓ ' : ''}Hide TensorX</button>
        </div>
      </div>

      <div className="mb-6"><HiddenDealsPanel state={hidden} canEdit={canEdit} ready={exclusionsReady} scope={s => s !== 'lost'} /></div>
      {canEdit && exclusionsReady && (
        <p className="text-xs text-gray-500 -mt-3 mb-4">Spotted a deal that shouldn&apos;t be there? Hover over it in a breakdown slide and click <strong>Hide</strong>. The totals update straight away.</p>
      )}

      {/* Slides */}
      <div ref={wrapRef} className="space-y-8">
        {slides.map((content, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Slide {i + 1} — {slideNames[i]}</span>
              <button onClick={() => copySlide(i)} disabled={!!busy} className={`${btn} ${off} disabled:opacity-50`}>
                {busy === `copy-${i}` ? 'Copying…' : '📋 Copy as image'}
              </button>
            </div>
            <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, overflow: 'hidden', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: SLIDE_W, height: SLIDE_H }}>
                <div ref={el => { slideRefs.current[i] = el }} className="xp-slide">
                  <div className="xp-title">
                    <h2>Sales &amp; Business Development – {slideNames[i]}</h2>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="ICT Services" />
                  </div>
                  <div className="xp-body">{content}</div>
                  <div className="xp-foot">Source: ICT SalesIQ · {today.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <HideDealDialog state={hidden} />

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50">{toast}</div>
      )}
    </div>
  )
}

// ── Building blocks ─────────────────────────────────────────────────────────

function CatPicker({ label, rows, selected, onToggle, onAuto, auto, btn, on, off }: {
  label: string; rows: Row[]; selected: string[]; onToggle: (n: string) => void; onAuto: () => void; auto: boolean
  btn: string; on: string; off: string
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-36 font-semibold text-gray-700">{label}</span>
      <button className={`${btn} ${auto ? on : off}`} onClick={onAuto} title="Always pick the biggest categories">Auto</button>
      {rows.map(r => (
        <button key={r.name} className={`${btn} ${selected.includes(r.name) ? on : off}`} onClick={() => onToggle(r.name)}>
          {r.name} <span className="opacity-60">({r.count})</span>
        </button>
      ))}
      {rows.length === 0 && <span className="text-gray-400 text-xs">No deals</span>}
    </div>
  )
}

function PanelHead({ title, right }: { title: string; right?: string }) {
  return <div className="xp-head"><span>{title}</span>{right && <span className="xp-head-r">{right}</span>}</div>
}

function Panel({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return <div className="xp-panel"><PanelHead title={title} right={right} />{children}</div>
}

function KV({ rows }: { rows: [string, string, { bold?: boolean; color?: string }?][] }) {
  return (
    <table className="xp-table"><tbody>
      {rows.map(([label, val, opt]) => (
        <tr key={label}>
          <td style={{ color: '#475569' }}>{label}</td>
          <td className="r" style={{ fontWeight: opt?.bold ? 800 : 600, color: opt?.color || '#1e293b' }}>{val}</td>
        </tr>
      ))}
    </tbody></table>
  )
}

function TotalRow({ cells }: { cells: string[] }) {
  return (
    <tr className="xp-total">
      {cells.map((c, i) => <td key={i} className={i ? 'r' : ''}>{c}</td>)}
    </tr>
  )
}

function CatTable({ rows, total }: { rows: Row[]; total: { count: number; rev: number } }) {
  return (
    <table className="xp-table">
      <thead><tr><th>Category</th><th className="r">Deals</th><th className="r">Revenue</th><th className="r">% Value</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name}>
            <td><span className="xp-dot" style={{ background: BAR_PALETTE[i % BAR_PALETTE.length] }} />{r.name}</td>
            <td className="r" style={{ color: '#64748b' }}>{r.count}</td>
            <td className="r" style={{ fontWeight: 700 }}>{euros(r.rev)}</td>
            <td className="r" style={{ color: '#3b82f6', fontWeight: 700 }}>{pct(total.rev > 0 ? (r.rev / total.rev) * 100 : 0)}</td>
          </tr>
        ))}
        <TotalRow cells={['TOTAL', String(total.count), euros(total.rev), '100.0%']} />
      </tbody>
    </table>
  )
}

function StageTable({ rows, total }: { rows: Row[]; total: { count: number; rev: number } }) {
  return (
    <table className="xp-table">
      <thead><tr><th>Stage</th><th className="r">Count</th><th className="r">Value</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td style={r.name === 'On Hold' ? { color: '#d97706', fontWeight: 600 } : undefined}>{r.name}</td>
            <td className="r" style={{ color: '#64748b' }}>{r.count}</td>
            <td className="r" style={{ fontWeight: 700 }}>{euros(r.rev)}</td>
          </tr>
        ))}
        <TotalRow cells={['TOTAL', String(total.count), euros(total.rev)]} />
      </tbody>
    </table>
  )
}

function Bars({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="xp-empty">{empty}</p>
  const max = Math.max(...rows.map(r => r.rev), 1)
  return (
    <div className="xp-bars">
      {rows.map((r, i) => (
        <div key={r.name} className="xp-bar-row">
          <div className="xp-bar-label">{r.name.length > 22 ? r.name.slice(0, 20) + '…' : r.name}</div>
          <div className="xp-bar-track"><div style={{ width: `${(r.rev / max) * 100}%`, background: stageColour(r.name, i) }} /></div>
          <div className="xp-bar-val">{euros(r.rev)}</div>
        </div>
      ))}
    </div>
  )
}

function DealTable({ cat, deals, mode, hide }: { cat: string; deals: Opportunity[]; mode: 'pipeline' | 'won'; hide: DealExclusionsState | null }) {
  return (
    <div className="xp-panel">
      <PanelHead title={`Top ${deals.length} — ${cat} (${mode === 'won' ? 'Won' : 'Open Pipeline'})`} />
      <table className="xp-table xp-deals">
        <thead><tr><th>#</th><th>Company</th><th>Deal</th><th>{mode === 'won' ? 'Closed' : 'Stage'}</th><th className="r">Value</th></tr></thead>
        <tbody>
          {deals.map((o, i) => (
            <tr key={o.id}>
              <td style={{ color: '#94a3b8' }}>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{o.company}</td>
              <td style={{ color: '#64748b' }}>{o.opportunity_name}</td>
              <td style={{ whiteSpace: mode === 'won' ? 'nowrap' : undefined, color: o.normalised_status === 'on_hold' ? '#d97706' : undefined }}>
                {mode === 'won'
                  ? (o.closed_date ? fmtDate(o.closed_date) : '—')
                  : (o.normalised_status === 'on_hold' ? 'On Hold' : (o.stage || 'Unknown'))}
              </td>
              <td className="r" style={{ fontWeight: 700, color: mode === 'won' ? '#16a34a' : undefined, whiteSpace: 'nowrap' }}>
                {euros(o.revenue_total)}
                {hide && <span className="xp-nocap"><HideDealButton deal={o} state={hide} /></span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Two columns, each table dropped into whichever column is currently shorter.
function Breakdown({ tables, mode, empty, hide }: { tables: { cat: string; deals: Opportunity[] }[]; mode: 'pipeline' | 'won'; empty: string; hide: DealExclusionsState | null }) {
  if (tables.length === 0) return <p className="xp-empty" style={{ paddingTop: 200 }}>{empty}</p>
  if (tables.length === 1) return <div style={{ maxWidth: 1100 }}><DealTable {...tables[0]} mode={mode} hide={hide} /></div>
  const cols: { items: typeof tables; weight: number }[] = [{ items: [], weight: 0 }, { items: [], weight: 0 }]
  tables.forEach(t => {
    const target = cols[0].weight <= cols[1].weight ? cols[0] : cols[1]
    target.items.push(t); target.weight += t.deals.length + 2
  })
  return (
    <div className="xp-cols">
      {cols.map((c, i) => <div key={i} className="xp-col">{c.items.map(t => <DealTable key={t.cat} {...t} mode={mode} hide={hide} />)}</div>)}
    </div>
  )
}

const SLIDE_CSS = `
  .xp-slide { width: ${SLIDE_W}px; height: ${SLIDE_H}px; background: #f5f5f5; color: #1e293b; font-family: Arial, sans-serif; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .xp-title { display: flex; justify-content: space-between; align-items: center; padding: 26px 56px 16px; }
  .xp-title h2 { margin: 0; font-size: 46px; font-weight: 800; color: #333; letter-spacing: -.5px; }
  .xp-title img { height: 66px; }
  .xp-body { flex: 1; padding: 0 56px; min-height: 0; }
  .xp-foot { position: absolute; bottom: 12px; right: 56px; font-size: 11px; color: #94a3b8; }
  .xp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
  .xp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
  .xp-col { display: flex; flex-direction: column; gap: 22px; }
  .xp-panel { background: white; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; }
  .xp-head { background: #1e3a5f; color: white; padding: 10px 16px; font-size: 13px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; display: flex; justify-content: space-between; gap: 12px; }
  .xp-head-r { color: rgba(255,255,255,.55); text-transform: none; font-weight: 600; }
  .xp-table { width: 100%; border-collapse: collapse; }
  .xp-table th, .xp-table td { padding: 5px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .xp-table th { background: #f8fafc; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; color: #64748b; }
  .xp-table tr:last-child td { border-bottom: none; }
  .xp-table .r { text-align: right; font-variant-numeric: tabular-nums; }
  .xp-total td { background: #1e3a5f; color: white; font-weight: 800; }
  .xp-deals th, .xp-deals td { font-size: 13px; padding: 7px 12px; vertical-align: middle; }
  .xp-dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 8px; vertical-align: middle; }
  .xp-bars { padding: 18px 22px; display: flex; flex-direction: column; gap: 12px; }
  .xp-bar-row { display: flex; align-items: center; gap: 12px; }
  .xp-bar-label { width: 170px; font-size: 13px; color: #475569; text-align: right; flex-shrink: 0; white-space: nowrap; overflow: hidden; }
  .xp-bar-track { flex: 1; height: 22px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
  .xp-bar-track > div { height: 100%; border-radius: 4px; min-width: 4px; }
  .xp-bar-val { width: 100px; font-size: 13px; font-weight: 700; text-align: right; flex-shrink: 0; }
  .xp-nocap { display: none; margin-left: 8px; }
  .xp-table tr:hover .xp-nocap { display: inline; }
  .xp-empty { text-align: center; color: #94a3b8; font-size: 15px; padding: 24px 0; }
`
