'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDate } from '@/lib/utils/formatting'

function repDisplay(name: string): string {
  return name.includes(',') ? name.split(',').map(s => s.trim()).reverse().join(' ') : name
}

interface AmMeeting {
  company: string; opportunity: string | null; contact: string | null
  start_date: string | null; start_time: string | null; description: string | null
}
interface RepRow {
  key: string; display: string; held: AmMeeting[]; planned: AmMeeting[]; total: number; target: number
}
interface MonthData {
  month: { from: string; to: string; label: string; monthKey: string }
  target: number
  reps: RepRow[]
}

function progressColor(total: number, target: number): { bar: string; text: string; badge: string } {
  const pct = target > 0 ? total / target : 0
  if (pct >= 1)   return { bar: 'bg-green-500',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' }
  if (pct >= 0.5) return { bar: 'bg-amber-500',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' }
  return              { bar: 'bg-red-400',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700' }
}

function MeetingRow({ m }: { m: AmMeeting }) {
  return (
    <div className="flex items-start gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
      <div className="shrink-0 text-xs text-gray-400 w-24 pt-0.5">
        {m.start_date ? formatDate(m.start_date) : '—'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-800">{m.company}</span>
        {m.contact && <span className="text-gray-500"> &mdash; {m.contact}</span>}
        {m.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{m.description.trim()}</p>}
      </div>
    </div>
  )
}

function RepCard({ rep }: { rep: RepRow }) {
  const colors = progressColor(rep.total, rep.target)
  const pct = Math.min(100, rep.target > 0 ? (rep.total / rep.target) * 100 : 0)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-navy-700">{repDisplay(rep.display)}</h3>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={'h-full rounded-full ' + colors.bar} style={{ width: `${pct}%` }} />
          </div>
          <span className={'text-xs font-semibold px-2 py-0.5 rounded-full ' + colors.badge}>
            {rep.total} / {rep.target}
          </span>
        </div>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Held ({rep.held.length})</p>
          {rep.held.length === 0
            ? <p className="text-sm text-gray-400 italic py-1">None yet this month.</p>
            : rep.held.map((m, i) => <MeetingRow key={i} m={m} />)}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Planned ({rep.planned.length})</p>
          {rep.planned.length === 0
            ? <p className="text-sm text-gray-400 italic py-1">None scheduled.</p>
            : rep.planned.map((m, i) => <MeetingRow key={i} m={m} />)}
        </div>
      </div>
    </div>
  )
}

export default function AccountManagementClient() {
  const [data, setData]       = useState<MonthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthKey, setMonthKey] = useState<string>('')

  const loadData = useCallback(async (mk?: string) => {
    setLoading(true)
    const url = mk ? `/api/account-management?month=${mk}` : '/api/account-management'
    const res = await fetch(url)
    const json: MonthData = await res.json()
    setData(json)
    setMonthKey(json.month.monthKey)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function shiftMonth(delta: number) {
    if (!data) return
    const [y, m] = data.month.monthKey.split('-').map(Number)
    const next = new Date(y, m - 1 + delta, 1)
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    loadData(nextKey)
  }

  if (loading || !data) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-400">Loading account management data...</p></div>
  }

  const currentMonthKey = new Date().toISOString().slice(0, 7)
  const isCurrentMonth  = data.month.monthKey === currentMonthKey

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Account Management Meetings</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data.month.label} · Target: {data.target} per rep</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={monthKey} max={currentMonthKey}
            onChange={e => e.target.value && loadData(e.target.value)}
            className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-gray-300" />
          {!isCurrentMonth && (
            <button onClick={() => loadData()}
              className="text-xs text-brand-600 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50">
              Back to current
            </button>
          )}
          <button onClick={() => shiftMonth(-1)}
            className="text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50" title="Previous month">
            &#8592;
          </button>
          <button onClick={() => shiftMonth(1)} disabled={isCurrentMonth}
            className="text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed" title="Next month">
            &#8594;
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {data.reps.map(rep => <RepCard key={rep.key} rep={rep} />)}
      </div>
    </div>
  )
}
