'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatDate } from '@/lib/utils/formatting'
import { AM_TIERS, SALES_TEAM } from '@/lib/config'

// ── Types (mirror /api/account-management) ───────────────────
interface Meeting {
  company: string; contact: string | null; start_date: string | null
  start_time: string | null; description: string | null; tier: string | null; inList: boolean
}
interface OppRow {
  id: number | null; company: string; name: string; value: number
  status: string; stage: string | null; created: string | null
}
interface Rep {
  key: string; display: string; customerCount: number; annualVisitTarget: number
  target: number; targetIsDefault: boolean
  held: Meeting[]; planned: Meeting[]; nextMonthPlanned: Meeting[]; nextMonthTarget: number
  opps: {
    month: OppRow[]; monthCount: number; monthValue: number
    ytdCount: number; ytdValue: number; ytdWonCount: number; ytdWonValue: number
    openCount: number; openValue: number
  }
}
interface CoverageRow {
  company: string; account_manager: string; am_display: string; tier: string
  visitsPerYear: number; cadence: string; visits12m: number
  lastVisit: string | null; nextPlanned: string | null; daysSince: number | null
  status: 'overdue' | 'due_soon' | 'ok' | 'phone_only'
}
interface Data {
  month: { from: string; to: string; label: string; monthKey: string }
  nextMonth: { label: string; monthKey: string }
  today: string; role: string; isManager: boolean; ownKey: string | null; leadSource: string
  reps: Rep[]; coverage: CoverageRow[]
}
interface CustomerRow {
  id: string; company: string; account_manager: string; tier: string
  annual_revenue: number | null; is_active: boolean
}

type Tab = 'overview' | 'review' | 'coverage' | 'customers'

const eur = (n: number) => '€' + Math.round(n).toLocaleString('en-IE')
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function pctColour(actual: number, target: number) {
  const pct = target > 0 ? actual / target : 1
  if (pct >= 1)   return { bar: 'bg-green-500', badge: 'bg-green-100 text-green-700' }
  if (pct >= 0.5) return { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' }
  return                 { bar: 'bg-red-400',   badge: 'bg-red-100 text-red-700' }
}

const STATUS_STYLE: Record<CoverageRow['status'], { label: string; cls: string }> = {
  overdue:    { label: 'Overdue',    cls: 'bg-red-100 text-red-700' },
  due_soon:   { label: 'Due soon',   cls: 'bg-amber-100 text-amber-700' },
  ok:         { label: 'On track',   cls: 'bg-green-100 text-green-700' },
  phone_only: { label: 'Phone only', cls: 'bg-gray-100 text-gray-600' },
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-navy-700 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ no, title, note, children }: { no: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden break-inside-avoid">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-widest">{no}</p>
        <h3 className="text-sm font-semibold text-navy-700">{title}</h3>
        {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 italic">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            {head.map(h => <th key={h} className="py-1.5 pr-4 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {r.map((c, j) => <td key={j} className="py-2 pr-4 text-gray-700 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TierPill = ({ tier }: { tier: string | null }) =>
  tier ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-navy-700">T{tier}</span>
       : <span className="text-xs text-amber-600" title="Not in the customer list">not listed</span>

// ── Overview ─────────────────────────────────────────────────
function Overview({ data, openReview }: { data: Data; openReview: (key: string) => void }) {
  const overdueBy = (key: string) => data.coverage.filter(c => c.account_manager === key && c.status === 'overdue').length
  const tot = data.reps.reduce((a, r) => ({
    held: a.held + r.held.length, target: a.target + r.target,
    planned: a.planned + r.planned.length,
    oppValue: a.oppValue + r.opps.monthValue, oppCount: a.oppCount + r.opps.monthCount,
    won: a.won + r.opps.ytdWonValue,
  }), { held: 0, target: 0, planned: 0, oppValue: 0, oppCount: 0, won: 0 })
  const overdueAll = data.coverage.filter(c => c.status === 'overdue').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Visits held" value={`${tot.held} / ${num(tot.target)}`} sub={`${data.month.label}, held vs target`} />
        <Kpi label="Still planned" value={String(tot.planned)} sub="Later this month" />
        <Kpi label="Opportunities from visits" value={String(tot.oppCount)} sub={eur(tot.oppValue) + ' this month'} />
        <Kpi label="Won from visits (YTD)" value={eur(tot.won)} sub={`Lead source: ${data.leadSource}`} />
        <Kpi label="Overdue customers" value={String(overdueAll)} sub="Behind their tier cadence" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="px-5 py-2.5">Account manager</th><th className="px-3">Customers</th>
              <th className="px-3">Visits vs target</th><th className="px-3">Planned</th>
              <th className="px-3">Opps this month</th><th className="px-3">Open from visits</th>
              <th className="px-3">Won YTD</th><th className="px-3">Overdue</th><th />
            </tr>
          </thead>
          <tbody>
            {data.reps.map(r => {
              const c = pctColour(r.held.length, r.target)
              const od = overdueBy(r.key)
              return (
                <tr key={r.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-navy-700">{r.display}</td>
                  <td className="px-3 text-gray-600">{r.customerCount || <span className="text-amber-600">none set</span>}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={'h-full ' + c.bar} style={{ width: `${Math.min(100, r.target > 0 ? (r.held.length / r.target) * 100 : 0)}%` }} />
                      </div>
                      <span className={'text-xs font-semibold px-2 py-0.5 rounded-full ' + c.badge}>{r.held.length} / {num(r.target)}</span>
                      {r.targetIsDefault && <span className="text-[10px] text-gray-400" title="No customers assigned, using the default target">default</span>}
                    </div>
                  </td>
                  <td className="px-3 text-gray-600">{r.planned.length}</td>
                  <td className="px-3 text-gray-600">{r.opps.monthCount} <span className="text-gray-400">({eur(r.opps.monthValue)})</span></td>
                  <td className="px-3 text-gray-600">{r.opps.openCount} <span className="text-gray-400">({eur(r.opps.openValue)})</span></td>
                  <td className="px-3 text-gray-600">{r.opps.ytdWonCount} <span className="text-gray-400">({eur(r.opps.ytdWonValue)})</span></td>
                  <td className="px-3">{od > 0 ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{od}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3"><button onClick={() => openReview(r.key)} className="text-xs text-brand-600 hover:underline">Review</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Target = each AM's customers' tier visit cadence ÷ 12. Visits are Autotask meetings of type Account Management Meeting.
        Opportunities count where the AM chose Lead Source "{data.leadSource}".
      </p>
    </div>
  )
}

// ── Monthly review (mirrors the AMR deck, section 01) ────────
function Review({ data, repKey, setRepKey }: { data: Data; repKey: string; setRepKey: (k: string) => void }) {
  const rep = data.reps.find(r => r.key === repKey) ?? data.reps[0]
  if (!rep) return <p className="text-sm text-gray-400">No account managers found.</p>

  const variance = rep.held.length - rep.target
  const pct = rep.target > 0 ? Math.round((rep.held.length / rep.target) * 100) : 0
  const avgOpp = rep.opps.monthCount > 0 ? rep.opps.monthValue / rep.opps.monthCount : 0
  const gap = rep.nextMonthPlanned.length - rep.nextMonthTarget

  const met = new Map<string, Meeting>()
  rep.held.forEach(m => { if (!met.has(m.company)) met.set(m.company, m) })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        {data.isManager ? (
          <select value={rep.key} onChange={e => setRepKey(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
            {data.reps.map(r => <option key={r.key} value={r.key}>{r.display}</option>)}
          </select>
        ) : <span className="text-sm font-semibold text-navy-700">{rep.display}</span>}
        <button onClick={() => window.print()} className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
          Print / save as PDF
        </button>
      </div>

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">{rep.display} — Account Management Review, {data.month.label}</h2>
      </div>

      <Section no="01 · Meetings" title={`Meetings conducted in ${data.month.label}`}
        note={`${rep.held.length} meetings held against a target of ${num(rep.target)}.`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Meetings held" value={String(rep.held.length)} sub="Logged in Autotask" />
          <Kpi label="Target" value={num(rep.target)} sub={rep.targetIsDefault ? 'Default, no customers assigned' : `${rep.customerCount} customers by tier`} />
          <Kpi label="Variance" value={(variance > 0 ? '+' : '') + num(Math.round(variance * 10) / 10)} sub="Actual minus target" />
          <Kpi label="% of target" value={`${pct}%`} sub="Actual ÷ target" />
        </div>
        <Table head={['Customer', 'Tier', 'Contact', 'Date', 'Notes']} empty="No meetings held yet this month."
          rows={rep.held.map(m => [
            <span key="c" className="font-medium text-gray-800">{m.company}</span>,
            <TierPill key="t" tier={m.tier} />,
            m.contact ?? '—',
            m.start_date ? formatDate(m.start_date) : '—',
            <span key="n" className="text-xs text-gray-500 line-clamp-2">{m.description?.trim() || '—'}</span>,
          ])} />
        {rep.planned.length > 0 && (
          <p className="text-xs text-gray-500">Also booked later this month: {rep.planned.map(m => `${m.company} (${m.start_date ? formatDate(m.start_date) : ''})`).join(', ')}</p>
        )}
      </Section>

      <Section no="02 · Customers" title="Customers met" note="One line per customer visited this month, with what came out of it.">
        {met.size === 0 ? <p className="text-sm text-gray-400 italic">No customers met yet.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...met.values()].map(m => {
              const theirOpps = rep.opps.month.filter(o => o.company.toLowerCase() === m.company.toLowerCase())
              return (
                <div key={m.company} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-navy-700">{m.company}</p><TierPill tier={m.tier} />
                  </div>
                  <p className="text-xs text-gray-400">{m.contact ?? 'No contact logged'} · Met {m.start_date ? formatDate(m.start_date) : ''}</p>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-2">Growth opportunities raised</p>
                  {theirOpps.length === 0
                    ? <p className="text-xs text-gray-400 italic">None logged with Lead Source "{data.leadSource}"</p>
                    : theirOpps.map(o => <p key={o.id ?? o.name} className="text-xs text-gray-700">{o.name} <span className="text-gray-400">{eur(o.value)}</span></p>)}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section no="03 · Quotes" title="Opportunities and quotes generated from visits"
        note={`Autotask opportunities created in ${data.month.label} with Lead Source "${data.leadSource}".`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Raised" value={String(rep.opps.monthCount)} sub="This month" />
          <Kpi label="Total value" value={eur(rep.opps.monthValue)} sub="Excl. VAT" />
          <Kpi label="Average value" value={eur(avgOpp)} sub="Total ÷ number" />
          <Kpi label="Won YTD" value={`${rep.opps.ytdWonCount} (${eur(rep.opps.ytdWonValue)})`} sub={`${rep.opps.openCount} still open, ${eur(rep.opps.openValue)}`} />
        </div>
        <Table head={['Customer', 'Opportunity', 'Value', 'Stage', 'Status']} empty="No opportunities raised from visits this month."
          rows={rep.opps.month.map(o => [
            <span key="c" className="font-medium text-gray-800">{o.company}</span>, o.name, eur(o.value), o.stage ?? '—',
            <span key="s" className="capitalize">{o.status.replace('_', ' ')}</span>,
          ])} />
      </Section>

      <Section no="04 · Tickets" title="Tickets created from meetings"
        note="Not shown yet: tickets aren't synced from Autotask. Add once we agree how tickets are linked to a visit.">
        <p className="text-sm text-gray-400 italic">Coming in the next phase.</p>
      </Section>

      <Section no="05 · Plan" title={`Meetings planned for ${data.nextMonth.label}`}
        note={`${rep.nextMonthPlanned.length} planned against a target of ${num(rep.nextMonthTarget)}. All must be scheduled in Autotask.`}>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Planned" value={String(rep.nextMonthPlanned.length)} sub="Scheduled in Autotask" />
          <Kpi label="Target" value={num(rep.nextMonthTarget)} sub="Agreed monthly target" />
          <Kpi label="Gap to target" value={(gap > 0 ? '+' : '') + num(Math.round(gap * 10) / 10)} sub="Planned minus target" />
        </div>
        <Table head={['Customer', 'Tier', 'Contact', 'Date', 'Purpose']} empty="Nothing booked yet."
          rows={rep.nextMonthPlanned.map(m => [
            <span key="c" className="font-medium text-gray-800">{m.company}</span>,
            <TierPill key="t" tier={m.tier} />, m.contact ?? '—',
            m.start_date ? formatDate(m.start_date) : '—',
            <span key="n" className="text-xs text-gray-500 line-clamp-2">{m.description?.trim() || '—'}</span>,
          ])} />
      </Section>
    </div>
  )
}

// ── Coverage ─────────────────────────────────────────────────
function Coverage({ data }: { data: Data }) {
  const [am, setAm] = useState('all')
  const [status, setStatus] = useState('all')
  const rows = data.coverage.filter(c => (am === 'all' || c.account_manager === am) && (status === 'all' || c.status === status))
  const counts = (s: CoverageRow['status']) => data.coverage.filter(c => c.status === s).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {data.isManager && (
          <select value={am} onChange={e => setAm(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
            <option value="all">All account managers</option>
            {data.reps.filter(r => r.customerCount > 0).map(r => <option key={r.key} value={r.key}>{r.display}</option>)}
          </select>
        )}
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
          <option value="all">All statuses</option>
          <option value="overdue">Overdue ({counts('overdue')})</option>
          <option value="due_soon">Due soon ({counts('due_soon')})</option>
          <option value="ok">On track ({counts('ok')})</option>
          <option value="phone_only">Phone only ({counts('phone_only')})</option>
        </select>
        <span className="text-xs text-gray-400">{rows.length} customers</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <Table head={['Customer', 'AM', 'Tier', 'Cadence', 'Visits (12m)', 'Last visit', 'Next booked', 'Status']}
          empty="No customers yet. Add them on the Customers tab."
          rows={rows.map(c => [
            <span key="c" className="font-medium text-gray-800">{c.company}</span>, c.am_display,
            <TierPill key="t" tier={c.tier} />, c.cadence,
            `${c.visits12m}${c.visitsPerYear ? ' / ' + c.visitsPerYear : ''}`,
            c.lastVisit ? `${formatDate(c.lastVisit)} (${c.daysSince}d)` : <span key="l" className="text-red-600">Never</span>,
            c.nextPlanned ? formatDate(c.nextPlanned) : <span key="n" className="text-gray-300">—</span>,
            <span key="s" className={'text-xs font-semibold px-2 py-0.5 rounded-full ' + STATUS_STYLE[c.status].cls}>{STATUS_STYLE[c.status].label}</span>,
          ])} />
      </div>
      <p className="text-xs text-gray-400">
        Overdue = no visit for longer than the tier interval (365 ÷ visits per year) plus 14 days. Due soon = within 30 days of that interval.
        Only meetings logged against the exact customer name in Autotask count.
      </p>
    </div>
  )
}

// ── Customers admin (managers) ───────────────────────────────
function Customers({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<CustomerRow[]>([])
  const [paste, setPaste] = useState('')
  const [defaultAm, setDefaultAm] = useState(SALES_TEAM[0].key)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/account-management/customers')
    if (res.ok) setList((await res.json()).customers)
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    // One customer per line:  Company, Tier, Account manager (optional), Annual revenue (optional)
    // Tab-separated (pasted from Excel) works too. AM may be the full "Surname, Firstname" name in quotes,
    // a first name, or left blank to use the AM picked above.
    const customers = paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
      const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map(p => p.trim().replace(/^"|"$/g, ''))
      const [company, tier, amRaw, rev] = parts
      const amLower = (amRaw ?? '').toLowerCase()
      const team = SALES_TEAM.find(r =>
        r.key.toLowerCase() === amLower || r.display.toLowerCase() === amLower || r.first.toLowerCase() === amLower)
      return { company, tier, account_manager: team?.key ?? (amRaw || defaultAm), annual_revenue: rev }
    })
    setBusy(true); setMsg(null)
    const res = await fetch('/api/account-management/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customers }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) return setMsg({ ok: false, text: json.error ?? 'Save failed' })
    setMsg({ ok: true, text: `Saved: ${json.inserted} added, ${json.updated} updated.` })
    setPaste(''); load(); onChanged()
  }

  async function remove(id: string) {
    if (!confirm('Remove this customer from the AM programme?')) return
    await fetch(`/api/account-management/customers?id=${id}`, { method: 'DELETE' })
    load(); onChanged()
  }

  const byAm = useMemo(() => {
    const m = new Map<string, CustomerRow[]>()
    list.forEach(c => m.set(c.account_manager, [...(m.get(c.account_manager) ?? []), c]))
    return [...m.entries()]
  }, [list])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-navy-700">Add or update customers</h3>
          <p className="text-xs text-gray-500">
            One per line: <code>Company, Tier, Account manager, Annual revenue</code>. Last two are optional. Paste straight from Excel if easier.
            Company must match the Autotask name exactly. Existing customers are updated.
          </p>
          <label className="block text-xs text-gray-500">Account manager when left blank
            <select value={defaultAm} onChange={e => setDefaultAm(e.target.value)} className="mt-1 block w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5">
              {SALES_TEAM.map(r => <option key={r.key} value={r.key}>{r.display}</option>)}
            </select>
          </label>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={8}
            placeholder={'Acme Ltd, 2\nBeta Foods, 1+, Jamie, 780000'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono" />
          <button onClick={save} disabled={busy || !paste.trim()}
            className="w-full text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 rounded-lg px-3 py-2">
            {busy ? 'Saving...' : 'Save customers'}
          </button>
          {msg && <p className={'text-xs whitespace-pre-line ' + (msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-navy-700 mb-2">Tiers and visit targets</h3>
          <Table head={['Tier', 'Revenue', 'Visits / yr']} empty=""
            rows={AM_TIERS.map(t => [<TierPill key="t" tier={t.tier} />, t.band, t.visitsPerYear ? `${t.visitsPerYear} (${t.cadence})` : t.cadence])} />
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        {byAm.length === 0 && <p className="text-sm text-gray-400 italic">No customers added yet.</p>}
        {byAm.map(([am, rows]) => (
          <div key={am} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between">
              <h3 className="text-sm font-semibold text-navy-700">{SALES_TEAM.find(r => r.key === am)?.display ?? am}</h3>
              <span className="text-xs text-gray-400">{rows.length} customers</span>
            </div>
            <div className="p-4">
              <Table head={['Customer', 'Tier', 'Revenue', '']} empty=""
                rows={rows.map(c => [c.company, <TierPill key="t" tier={c.tier} />,
                  c.annual_revenue ? eur(c.annual_revenue) : '—',
                  <button key="x" onClick={() => remove(c.id)} className="text-xs text-gray-400 hover:text-red-600">Remove</button>])} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page shell ───────────────────────────────────────────────
export default function AccountManagementClient() {
  const [data, setData]       = useState<Data | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<Tab>('overview')
  const [repKey, setRepKey]   = useState('')

  const loadData = useCallback(async (mk?: string) => {
    setLoading(true); setError(null)
    const res = await fetch(mk ? `/api/account-management?month=${mk}` : '/api/account-management')
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to load'); setLoading(false); return }
    setData(json)
    setRepKey(prev => prev || json.ownKey || json.reps[0]?.key || '')
    if (!json.isManager) setTab(t => (t === 'overview' ? 'review' : t))
    setLoading(false)
  }, [])
  useEffect(() => { loadData() }, [loadData])

  if (error) return <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">{error}</div>
  if (!data) return <div className="py-20 text-center text-sm text-gray-400">Loading account management data...</div>

  const currentKey = new Date().toISOString().slice(0, 7)
  const isCurrent  = data.month.monthKey === currentKey
  const shift = (d: number) => {
    const [y, m] = data.month.monthKey.split('-').map(Number)
    const n = new Date(y, m - 1 + d, 1)
    loadData(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`)
  }

  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'overview',  label: 'Team overview',    show: data.isManager },
    { id: 'review',    label: 'Monthly review',   show: true },
    { id: 'coverage',  label: 'Customer coverage', show: true },
    { id: 'customers', label: 'Customers',        show: data.isManager },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Account Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data.month.label} · all figures come from Autotask</p>
        </div>
        {tab !== 'customers' && tab !== 'coverage' && (
          <div className="flex items-center gap-2">
            <input type="month" value={data.month.monthKey}
              onChange={e => e.target.value && loadData(e.target.value)}
              className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5" />
            {!isCurrent && (
              <button onClick={() => loadData()} className="text-xs text-brand-600 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50">
                Back to current
              </button>
            )}
            <button onClick={() => shift(-1)} className="text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50" title="Previous month">&#8592;</button>
            <button onClick={() => shift(1)} disabled={isCurrent}
              className="text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-30" title="Next month">&#8594;</button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 print:hidden">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'px-4 py-2 text-sm font-medium -mb-px border-b-2 ' +
              (tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-navy-700')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
        {tab === 'overview'  && <Overview data={data} openReview={k => { setRepKey(k); setTab('review') }} />}
        {tab === 'review'    && <Review data={data} repKey={repKey} setRepKey={setRepKey} />}
        {tab === 'coverage'  && <Coverage data={data} />}
        {tab === 'customers' && <Customers onChanged={() => loadData(data.month.monthKey)} />}
      </div>
    </div>
  )
}
