'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatEuro, formatCompact, formatPercent, formatDate } from '@/lib/utils/formatting'

const SALES_TEAM = [
  'Maciejska, Barbara',
  'Conboy, John',
  'Dowdall, James',
  "O'Hora, Evan",
  'Roche, John',
  'Taylor, Jamie',
]

function repDisplay(name: string): string {
  return name.includes(',') ? name.split(',').map(s => s.trim()).reverse().join(' ') : name
}
function repDisplayFromDeal(am: string | null, oo: string | null): string {
  return repDisplay(am || oo || 'Unknown')
}
function dealMatchesRep(deal: { account_manager: string | null; opportunity_owner: string | null }, rep: string): boolean {
  if (rep === 'all') return true
  return (deal.account_manager || '') === rep || (deal.opportunity_owner || '') === rep
}

interface Deal {
  company: string; opportunity_name: string
  account_manager: string | null; opportunity_owner: string | null
  revenue_total: number; gross_profit: number; gross_margin_pct: number
  category: string | null; stage: string | null
  closed_date?: string | null; projected_close_date?: string | null; created_date?: string | null
}
interface Meeting {
  classification: string; company: string; action_type: string
  start_date: string; start_time: string; description: string
  contact: string; opportunity: string; assigned_to: string
}
interface WeekData {
  lastWeek: { from: string; to: string; label: string }
  thisWeek: { from: string; to: string; label: string }
  closedDeals: Deal[]; closingDeals: Deal[]; newEngagements: Deal[]
}

const MIN_HIGHLIGHT = 5000

function SummaryBanner({ deals, color }: { deals: Deal[]; color: 'green' | 'blue' }) {
  const total = deals.reduce((s, d) => s + d.revenue_total, 0)
  const gp    = deals.reduce((s, d) => s + d.gross_profit, 0)
  const avgMg = total > 0 ? (gp / total) * 100 : 0
  const cls = color === 'green' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-blue-50 border-blue-200 text-blue-800'
  return (
    <div className={'rounded-lg border px-4 py-3 flex items-center gap-6 text-sm mb-3 flex-wrap ' + cls}>
      <div><span className="font-bold">{deals.length}</span> <span className="opacity-70">deals</span></div>
      <div><span className="font-bold">{formatCompact(total)}</span> <span className="opacity-70">revenue</span></div>
      <div><span className="font-bold">{formatCompact(gp)}</span> <span className="opacity-70">gross profit</span></div>
      <div><span className="font-bold">{formatPercent(avgMg, 1)}</span> <span className="opacity-70">avg margin</span></div>
    </div>
  )
}

function DealTable({ deals, dateField, dateLabel, showRep }: {
  deals: Deal[]; dateField: 'closed_date' | 'projected_close_date'; dateLabel: string; showRep: boolean
}) {
  if (deals.length === 0) return <p className="text-sm text-gray-400 italic py-2">No deals in this period.</p>
  const sorted    = [...deals].sort((a, b) => b.revenue_total - a.revenue_total)
  const highlight = sorted.filter(d => d.revenue_total >= MIN_HIGHLIGHT)
  const below     = sorted.filter(d => d.revenue_total < MIN_HIGHLIGHT)
  const belowRev  = below.reduce((s, d) => s + d.revenue_total, 0)
  const belowGP   = below.reduce((s, d) => s + d.gross_profit, 0)
  const belowPct  = belowRev > 0 ? (belowGP / belowRev) * 100 : 0
  return (
    <div>
      {highlight.length > 0 && (
        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2">Company</th>
              <th className="text-left pb-2">Opportunity</th>
              {showRep && <th className="text-left pb-2">Rep</th>}
              <th className="text-right pb-2">Revenue</th>
              <th className="text-right pb-2">GP%</th>
              <th className="text-right pb-2">{dateLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {highlight.map((d, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="py-2 font-medium text-gray-900 max-w-[140px]"><span className="truncate block">{d.company}</span></td>
                <td className="py-2 text-gray-600 max-w-[200px]"><span className="truncate block">{d.opportunity_name}</span></td>
                {showRep && <td className="py-2 text-gray-500 whitespace-nowrap">{repDisplayFromDeal(d.account_manager, d.opportunity_owner)}</td>}
                <td className="py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCompact(d.revenue_total)}</td>
                <td className="py-2 text-right text-gray-600 whitespace-nowrap">{formatPercent(d.gross_margin_pct, 1)}</td>
                <td className="py-2 text-right text-gray-500 whitespace-nowrap">{formatDate((d as Record<string, string | null>)[dateField])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {below.length > 0 && (
        <p className="text-xs text-gray-400 italic">
          + {below.length} additional deal{below.length !== 1 ? 's' : ''} under {formatEuro(MIN_HIGHLIGHT)}
          {' '}&mdash; {formatCompact(belowRev)} revenue, {formatCompact(belowGP)} GP ({formatPercent(belowPct, 1)})
        </p>
      )}
    </div>
  )
}

function EngagementTable({ deals, showRep }: { deals: Deal[]; showRep: boolean }) {
  if (deals.length === 0) return <p className="text-sm text-gray-400 italic py-2">No new opportunities created last week.</p>
  const sorted    = [...deals].sort((a, b) => b.revenue_total - a.revenue_total)
  const highlight = sorted.filter(d => d.revenue_total >= MIN_HIGHLIGHT)
  const below     = sorted.filter(d => d.revenue_total < MIN_HIGHLIGHT)
  return (
    <div>
      {highlight.length > 0 && (
        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2">Company</th>
              <th className="text-left pb-2">Opportunity</th>
              {showRep && <th className="text-left pb-2">Rep</th>}
              <th className="text-left pb-2">Stage</th>
              <th className="text-right pb-2">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {highlight.map((d, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="py-2 font-medium text-gray-900 max-w-[140px]"><span className="truncate block">{d.company}</span></td>
                <td className="py-2 text-gray-600 max-w-[200px]"><span className="truncate block">{d.opportunity_name}</span></td>
                {showRep && <td className="py-2 text-gray-500 whitespace-nowrap">{repDisplayFromDeal(d.account_manager, d.opportunity_owner)}</td>}
                <td className="py-2 text-gray-400 text-xs whitespace-nowrap">{d.stage ? 'S' + (d.stage.match(/\d/) || ['1'])[0] : 'S1'}</td>
                <td className="py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCompact(d.revenue_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {below.length > 0 && (
        <p className="text-xs text-gray-400 italic">
          + {below.length} additional engagement{below.length !== 1 ? 's' : ''} under {formatEuro(MIN_HIGHLIGHT)}
          {' '}&mdash; {formatCompact(below.reduce((s, d) => s + d.revenue_total, 0))} combined value
        </p>
      )}
    </div>
  )
}

function MeetingList({ meetings, showRep }: { meetings: Meeting[]; showRep: boolean }) {
  if (meetings.length === 0) return <p className="text-sm text-gray-400 italic py-2">No meetings in this period.</p>
  const byRep: Record<string, Meeting[]> = {}
  meetings.forEach(m => { const rep = m.assigned_to || 'Unassigned'; if (!byRep[rep]) byRep[rep] = []; byRep[rep].push(m) })
  const entries = showRep ? Object.entries(byRep).sort(([a],[b]) => a.localeCompare(b)) : [['', meetings]] as [string, Meeting[]][]
  return (
    <div className="space-y-3">
      {entries.map(([rep, mts]) => (
        <div key={rep}>
          {showRep && rep && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{repDisplay(rep)} ({mts.length})</p>}
          <div className="space-y-1">
            {mts.map((m, i) => (
              <div key={i} className="flex items-start gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                <div className="shrink-0 text-xs text-gray-400 w-28 pt-0.5">
                  {m.start_date.slice(5).split('-').reverse().join('/')} {m.start_time && m.start_time.slice(0,5)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800">{m.company}</span>
                  {m.contact && <span className="text-gray-500"> &mdash; {m.contact}</span>}
                  {m.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{m.description.trim()}</p>}
                </div>
                <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{m.action_type}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ title, count, children, color = 'gray' }: {
  title: string; count?: number; children: React.ReactNode; color?: 'green' | 'blue' | 'purple' | 'gray'
}) {
  const borderColor = { green: 'border-l-green-500', blue: 'border-l-blue-500', purple: 'border-l-purple-500', gray: 'border-l-gray-400' }[color]
  return (
    <div className={'bg-white rounded-xl border border-gray-200 border-l-4 overflow-hidden ' + borderColor}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-navy-700">{title}</h2>
        {count !== undefined && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{count}</span>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

export default function WeeklyReportClient() {
  const [data, setData]               = useState<WeekData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [meetings, setMeetings]       = useState<Meeting[]>([])
  const [csvLoaded, setCsvLoaded]     = useState(false)
  const [selectedRep, setSelectedRep] = useState<string>('all')
  const [repOrder, setRepOrder]       = useState<string[]>(SALES_TEAM)
  const [dragIdx, setDragIdx]         = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/weekly')
    setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function handleDragStart(i: number) { setDragIdx(i) }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === i) return
    const next = [...repOrder]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    setRepOrder(next)
    setDragIdx(i)
  }
  function handleDragEnd() { setDragIdx(null) }

  function parseMeetingsCsv(text: string) {
    const lines = text.replace(/^﻿/, '').split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows: Meeting[] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const values: string[] = []; let current = '', inQ = false
      for (let j = 0; j < line.length; j++) {
        const c = line[j]
        if (c === '"') { inQ = !inQ }
        else if (c === ',' && !inQ) { values.push(current.trim()); current = '' }
        else { current += c }
      }
      values.push(current.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').replace(/^"|"$/g, '').trim() })
      const actionType = row['Action Type'] || ''
      if (!['Meeting', 'Account Management Meeting'].some(t => actionType.includes(t))) continue
      const rawDate = row['Start Date'] || ''
      const parts = rawDate.split('/')
      const sortableDate = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` : rawDate
      rows.push({
        classification: row['Classification'] || '', company: row['Company'] || '',
        action_type: actionType, start_date: sortableDate, start_time: row['Start Time'] || '',
        description: row['Description'] || '', contact: row['Contact'] || '',
        opportunity: row['Opportunity'] || '', assigned_to: row['Assigned To Resource'] || '',
      })
    }
    rows.sort((a, b) => a.start_date.localeCompare(b.start_date))
    setMeetings(rows); setCsvLoaded(true)
  }

  function readCsvFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => parseMeetingsCsv(e.target?.result as string)
    reader.readAsText(file, 'UTF-8')
  }

  if (loading || !data) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-400">Loading weekly data...</p></div>
  }

  const filterDeal    = (d: Deal)    => dealMatchesRep(d, selectedRep)
  const filterMeeting = (m: Meeting) => selectedRep === 'all' || m.assigned_to === selectedRep
  const closedDeals      = data.closedDeals.filter(filterDeal)
  const closingDeals     = data.closingDeals.filter(filterDeal)
  const newEngagements   = data.newEngagements.filter(filterDeal)
  const lastWeekMeetings = meetings.filter(m => m.start_date >= data.lastWeek.from && m.start_date <= data.lastWeek.to && filterMeeting(m))
  const thisWeekMeetings = meetings.filter(m => m.start_date >= data.thisWeek.from && m.start_date <= data.thisWeek.to && filterMeeting(m))
  const showRep = selectedRep === 'all'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Weekly Sales Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Week of {data.thisWeek.label}</p>
        </div>
        <button onClick={loadData} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">Refresh</button>
      </div>

      {/* Rep filter — draggable to reorder */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-1">View:</span>
        <button onClick={() => setSelectedRep('all')}
          className={'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ' +
            (selectedRep === 'all' ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
          All reps
        </button>
        {repOrder.map((rep, i) => (
          <button key={rep}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            onClick={() => setSelectedRep(rep)}
            title="Drag to reorder"
            className={'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border cursor-grab active:cursor-grabbing select-none ' +
              (dragIdx === i ? 'opacity-40 scale-95 ' : '') +
              (selectedRep === rep ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
            {repDisplay(rep)}
          </button>
        ))}
      </div>

      {/* Meetings CSV */}
      {!csvLoaded ? (
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) readCsvFile(f) }}
          className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-brand-300 transition-colors">
          <p className="text-sm font-medium text-gray-600 mb-1">Drop the To-Do &amp; Note Search CSV to load meetings</p>
          <p className="text-xs text-gray-400 mb-3">From Autotask: Search To-Dos &amp; Notes, filter Action Type = Meeting, export CSV</p>
          <label className="cursor-pointer text-xs font-semibold text-brand-600 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50">
            Browse file
            <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) readCsvFile(f) }} />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm">
          <span className="text-green-700 font-medium">Meetings loaded</span>
          <span className="text-green-600">{meetings.length} total ({lastWeekMeetings.length} last week, {thisWeekMeetings.length} this week)</span>
          <button onClick={() => { setMeetings([]); setCsvLoaded(false) }} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Clear</button>
        </div>
      )}

      <Section title={'Deals Closed - ' + data.lastWeek.label} count={closedDeals.length} color="green">
        {closedDeals.length > 0 && <SummaryBanner deals={closedDeals} color="green" />}
        <DealTable deals={closedDeals} dateField="closed_date" dateLabel="Closed" showRep={showRep} />
      </Section>

      <Section title={'Closing This Week - ' + data.thisWeek.label} count={closingDeals.length} color="blue">
        {closingDeals.length > 0 && <SummaryBanner deals={closingDeals} color="blue" />}
        <DealTable deals={closingDeals} dateField="projected_close_date" dateLabel="Due" showRep={showRep} />
      </Section>

      <Section title={'Customer Meetings Held - ' + data.lastWeek.label} count={lastWeekMeetings.length} color="purple">
        {!csvLoaded ? <p className="text-sm text-gray-400 italic">Load the meetings CSV above to see this section.</p> : <MeetingList meetings={lastWeekMeetings} showRep={showRep} />}
      </Section>

      <Section title={'Meetings Planned - ' + data.thisWeek.label} count={thisWeekMeetings.length} color="purple">
        {!csvLoaded ? <p className="text-sm text-gray-400 italic">Load the meetings CSV above to see this section.</p> : <MeetingList meetings={thisWeekMeetings} showRep={showRep} />}
      </Section>

      <Section title={'New Engagements - ' + data.lastWeek.label} count={newEngagements.length} color="gray">
        <EngagementTable deals={newEngagements} showRep={showRep} />
      </Section>
    </div>
  )
}
