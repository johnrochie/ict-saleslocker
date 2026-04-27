'use client'

import { useState } from 'react'
import { formatCompact, formatDate } from '@/lib/utils/formatting'

interface Snapshot {
  name: string
  date: string
  taken_by: string
  count: number
}

interface OppRow {
  composite_key: string
  company: string
  opportunity_name: string
  account_manager: string | null
  category: string | null
  stage: string | null
  normalised_status: string
  revenue_total: number
  gross_profit: number
  projected_close_date: string | null
}

interface SnapshotRow extends OppRow {
  snapshot_name: string
  snapshot_date: string
}

type Movement = 'won' | 'lost' | 'advanced' | 'regressed' | 'slipped' | 'new' | 'removed' | 'unchanged'

interface DealMovement {
  composite_key: string
  company: string
  opportunity_name: string
  account_manager: string | null
  category: string | null
  movement: Movement
  prev_stage: string | null
  curr_stage: string | null
  prev_status: string
  curr_status: string
  revenue: number
  prev_close: string | null
  curr_close: string | null
}

function stageNum(s: string | null): number {
  if (!s) return 0
  const m = s.match(/Stage\s*(\d)/i)
  return m ? parseInt(m[1]) : 0
}

function classifyMovement(prev: OppRow, curr: OppRow | undefined): Movement {
  if (!curr) return 'removed'
  if (curr.normalised_status === 'won') return 'won'
  if (curr.normalised_status === 'lost') return 'lost'
  if (prev.normalised_status === 'pipeline' && curr.normalised_status !== 'pipeline') return 'regressed'

  const prevStage = stageNum(prev.stage)
  const currStage = stageNum(curr.stage)

  if (currStage > prevStage) return 'advanced'
  if (currStage < prevStage && currStage > 0) return 'regressed'

  // Check close date slippage
  if (prev.projected_close_date && curr.projected_close_date) {
    const prevClose = new Date(prev.projected_close_date).getTime()
    const currClose = new Date(curr.projected_close_date).getTime()
    const slippedDays = (currClose - prevClose) / (1000 * 60 * 60 * 24)
    if (slippedDays > 14) return 'slipped'
  }

  return 'unchanged'
}

const MOVEMENT_META: Record<Movement, { label: string; color: string; bg: string; icon: string }> = {
  won:       { label: 'Won',           color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: '🏆' },
  lost:      { label: 'Lost',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       icon: '✗' },
  advanced:  { label: 'Advanced',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: '↑' },
  regressed: { label: 'Regressed',     color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: '↓' },
  slipped:   { label: 'Date Slipped',  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: '⟶' },
  new:       { label: 'New',           color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: '+' },
  removed:   { label: 'Removed',       color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',     icon: '−' },
  unchanged: { label: 'No Change',     color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',     icon: '=' },
}

export default function SnapshotManager({
  snapshots,
  currentPipeline,
}: {
  snapshots: Snapshot[]
  currentPipeline: OppRow[]
}) {
  const [snapshotName, setSnapshotName] = useState(
    `Leadership Meeting — ${new Date().toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })}`
  )
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [comparing, setComparing] = useState<string | null>(null)
  const [movements, setMovements] = useState<DealMovement[] | null>(null)
  const [loadingComp, setLoadingComp] = useState(false)
  const [expanded, setExpanded]   = useState<Movement | null>(null)

  async function saveSnapshot() {
    if (!snapshotName.trim()) return
    setSaving(true)
    setSaveMsg(null)

    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshot_name: snapshotName.trim(),
        snapshot_date: new Date().toISOString().slice(0, 10),
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setSaveMsg({ type: 'error', text: data.error || 'Failed to save snapshot' })
    } else {
      setSaveMsg({ type: 'success', text: `Saved — ${data.deals_saved} deals captured in "${data.snapshot_name}"` })
      // Refresh page to show new snapshot in list
      setTimeout(() => window.location.reload(), 1500)
    }
  }

  async function loadComparison(snapshotName: string) {
    setLoadingComp(true)
    setComparing(snapshotName)
    setMovements(null)
    setExpanded(null)

    const res = await fetch(
      `/api/snapshot/compare?name=${encodeURIComponent(snapshotName)}`
    )
    const data = await res.json()
    setLoadingComp(false)

    if (res.ok) {
      setMovements(data.movements)
    }
  }

  // Group movements
  const grouped = movements ? Object.entries(
    movements.reduce((acc, m) => {
      if (!acc[m.movement]) acc[m.movement] = []
      acc[m.movement].push(m)
      return acc
    }, {} as Record<Movement, DealMovement[]>)
  ) : []

  const displayOrder: Movement[] = ['won', 'lost', 'advanced', 'regressed', 'slipped', 'new', 'removed', 'unchanged']
  const groupedSorted = displayOrder
    .map(mv => [mv, grouped.find(([k]) => k === mv)?.[1] || []] as [Movement, DealMovement[]])
    .filter(([, deals]) => deals.length > 0)

  const valueByMovement = (mv: Movement) =>
    (grouped.find(([k]) => k === mv)?.[1] || []).reduce((s, d) => s + d.revenue, 0)

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Pipeline Snapshots</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Capture a point-in-time view of the pipeline to track movement between meetings
        </p>
      </div>

      {/* ── Save new snapshot ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-navy-700 mb-4">Save snapshot now</h2>
        <p className="text-sm text-gray-500 mb-4">
          Captures all {currentPipeline.filter(o => ['pipeline','on_hold','on_hold_stale'].includes(o.normalised_status)).length} active pipeline deals as they stand today.
          Name it something you can identify at the next meeting.
        </p>
        <div className="flex gap-3 items-start">
          <input
            type="text"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-navy-700
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="e.g. Leadership Meeting — 22 Apr 2026"
          />
          <button
            onClick={saveSnapshot}
            disabled={saving || !snapshotName.trim()}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white
                       hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed
                       transition-colors whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save Snapshot'}
          </button>
        </div>

        {saveMsg && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm border ${
            saveMsg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {saveMsg.text}
          </div>
        )}
      </div>

      {/* ── Saved snapshots ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-navy-700 mb-4">
          Saved snapshots ({snapshots.length})
        </h2>

        {snapshots.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">
            No snapshots saved yet. Save one above before the next meeting.
          </p>
        ) : (
          <div className="space-y-2">
            {snapshots.map((s) => (
              <div key={s.name}
                className="flex items-center gap-4 p-4 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-navy-700 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-700 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(s.date)} &nbsp;·&nbsp; {s.count} deals &nbsp;·&nbsp; saved by {s.taken_by}
                  </p>
                </div>
                <button
                  onClick={() => loadComparison(s.name)}
                  disabled={loadingComp && comparing === s.name}
                  className="rounded-lg border border-brand-500 text-brand-500 px-4 py-1.5 text-xs
                             font-semibold hover:bg-brand-50 transition-colors whitespace-nowrap
                             disabled:opacity-60"
                >
                  {loadingComp && comparing === s.name ? 'Loading...' : 'Compare to now'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Movement comparison ─────────────────────────────── */}
      {movements && comparing && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-navy-700">
              Pipeline movement since &ldquo;{comparing}&rdquo;
            </h2>
            <button
              onClick={() => { setMovements(null); setComparing(null) }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕ close
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(['won', 'lost', 'advanced', 'new'] as Movement[]).map((mv) => {
              const meta = MOVEMENT_META[mv]
              const deals = movements.filter(m => m.movement === mv)
              const value = deals.reduce((s, d) => s + d.revenue, 0)
              return (
                <div key={mv}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${meta.bg} ${
                    expanded === mv ? 'ring-2 ring-brand-500' : ''
                  }`}
                  onClick={() => setExpanded(expanded === mv ? null : mv)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{meta.icon}</span>
                    <span className={`text-xs font-bold uppercase tracking-wide ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className={`text-xl font-bold ${meta.color}`}>{formatCompact(value)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
                </div>
              )
            })}
          </div>

          {/* Full movement table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy-700">All movements</h3>
              <p className="text-xs text-gray-400 mt-0.5">Click a category to expand deals</p>
            </div>

            {groupedSorted
              .filter(([mv]) => mv !== 'unchanged')
              .map(([mv, deals]) => {
                const meta = MOVEMENT_META[mv]
                const totalValue = deals.reduce((s, d) => s + d.revenue, 0)
                const isOpen = expanded === mv

                return (
                  <div key={mv} className="border-b border-gray-100 last:border-0">
                    {/* Category header */}
                    <button
                      onClick={() => setExpanded(isOpen ? null : mv)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${meta.bg} ${meta.color}`}>
                        {meta.icon}
                      </span>
                      <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-gray-400">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
                      <span className="ml-auto text-sm font-semibold text-gray-700">{formatCompact(totalValue)}</span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Deal rows */}
                    {isOpen && (
                      <div className="border-t border-gray-100 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              <th className="text-left px-5 py-2">Company</th>
                              <th className="text-left px-4 py-2">Opportunity</th>
                              <th className="text-left px-4 py-2">Rep</th>
                              <th className="text-right px-4 py-2">Revenue</th>
                              <th className="text-center px-4 py-2">Was</th>
                              <th className="text-center px-4 py-2">Now</th>
                              {(mv === 'slipped') && <th className="text-right px-4 py-2">Close Date</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {deals.sort((a, b) => b.revenue - a.revenue).map((deal) => {
                              const rep = deal.account_manager?.includes(',')
                                ? deal.account_manager.split(',').map(s => s.trim()).reverse().join(' ')
                                : (deal.account_manager || '—')
                              return (
                                <tr key={deal.composite_key} className="hover:bg-gray-50">
                                  <td className="px-5 py-2.5 font-medium text-navy-700 max-w-[140px]">
                                    <span className="truncate block">{deal.company}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-600 max-w-[220px]">
                                    <span className="truncate block">{deal.opportunity_name}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{rep}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-gray-700 whitespace-nowrap">
                                    {formatCompact(deal.revenue)}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className="inline-block bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded">
                                      {deal.prev_stage ? `S${stageNum(deal.prev_stage)}` : deal.prev_status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${meta.bg} ${meta.color}`}>
                                      {deal.curr_stage ? `S${stageNum(deal.curr_stage)}` : deal.curr_status}
                                    </span>
                                  </td>
                                  {mv === 'slipped' && (
                                    <td className="px-4 py-2.5 text-right text-xs text-orange-600 font-medium whitespace-nowrap">
                                      {formatDate(deal.prev_close)} → {formatDate(deal.curr_close)}
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}

            {/* Unchanged summary (no drill-down needed) */}
            {movements.filter(m => m.movement === 'unchanged').length > 0 && (
              <div className="flex items-center gap-4 px-5 py-3 text-gray-400">
                <span className="text-xs font-semibold uppercase tracking-wide">=</span>
                <span className="text-sm">No change</span>
                <span className="text-xs">{movements.filter(m => m.movement === 'unchanged').length} deals unchanged</span>
                <span className="ml-auto text-sm font-semibold">
                  {formatCompact(movements.filter(m => m.movement === 'unchanged').reduce((s, d) => s + d.revenue, 0))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
