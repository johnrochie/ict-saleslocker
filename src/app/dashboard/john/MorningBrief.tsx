'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface SyncStatus {
  configured: boolean
  last_sync: { at: string; status: string; rows_processed: number } | null
  total_opportunities: number
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error'

export default function MorningBrief({ all, wins, pipeline }: {
  all: Opportunity[]
  wins: Opportunity[]
  pipeline: Opportunity[]
}) {
  const router = useRouter()
  const now    = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncState,  setSyncState]  = useState<SyncState>('idle')
  const [syncMsg,    setSyncMsg]    = useState<string>('')

  useEffect(() => {
    fetch('/api/autotask/status')
      .then(r => r.json())
      .then(setSyncStatus)
      .catch(() => setSyncStatus({ configured: false, last_sync: null, total_opportunities: 0 }))
  }, [])

  async function handleSync() {
    setSyncState('syncing')
    setSyncMsg('')
    try {
      const res  = await fetch('/api/autotask/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncState('error')
        setSyncMsg(data.error ?? 'Sync failed')
      } else {
        setSyncState('success')
        setSyncMsg(`${data.rows_processed ?? 0} records synced`)
        // Refresh server data
        router.refresh()
        // Re-fetch sync status
        fetch('/api/autotask/status').then(r => r.json()).then(setSyncStatus).catch(() => {})
        // Reset after 4s
        setTimeout(() => setSyncState('idle'), 4000)
      }
    } catch {
      setSyncState('error')
      setSyncMsg('Network error — try again')
    }
  }

  const brief = useMemo(() => {
    const isRecent = (dateStr: string | null) => {
      if (!dateStr) return false
      return new Date(dateStr) >= cutoff
    }

    const newWins     = wins.filter(o => isRecent(o.created_at))
    const newPipeline = pipeline.filter(o => isRecent(o.created_at))
    const wentOverdue = pipeline.filter(o => o.is_overdue && isRecent(o.updated_at))
    const missingCost = all.filter(o => o.cost_missing && isRecent(o.updated_at))
    const statusChange = all.filter(o => isRecent(o.updated_at) && !isRecent(o.created_at))

    const urgentCount = (wentOverdue.length > 0 ? 1 : 0) + (missingCost.length > 0 ? 1 : 0)

    return {
      urgentCount,
      cards: [
        {
          icon: '🏆', label: 'New Wins',
          value: newWins.length > 0 ? String(newWins.length) : '—',
          sub: newWins.length > 0 ? euros(newWins.reduce((s, o) => s + o.revenue_total, 0)) : 'none since yesterday',
          colour: newWins.length > 0 ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white',
          urgent: false,
        },
        {
          icon: '📥', label: 'New Pipeline',
          value: newPipeline.length > 0 ? String(newPipeline.length) : '—',
          sub: newPipeline.length > 0 ? euros(newPipeline.reduce((s, o) => s + o.revenue_total, 0)) : 'none since yesterday',
          colour: newPipeline.length > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white',
          urgent: false,
        },
        {
          icon: '⏰', label: 'Went Overdue',
          value: wentOverdue.length > 0 ? String(wentOverdue.length) : '✓',
          sub: wentOverdue.length > 0 ? 'past close date' : 'nothing new overdue',
          colour: wentOverdue.length > 0 ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white',
          urgent: wentOverdue.length > 0,
        },
        {
          icon: '⚠️', label: 'Missing Costs',
          value: missingCost.length > 0 ? String(missingCost.length) : '✓',
          sub: missingCost.length > 0 ? 'margin data incomplete' : 'data is clean',
          colour: missingCost.length > 0 ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white',
          urgent: missingCost.length > 0,
        },
        {
          icon: '🔄', label: 'Updated',
          value: statusChange.length > 0 ? String(statusChange.length) : '—',
          sub: statusChange.length > 0 ? 'deals changed status' : 'no changes',
          colour: statusChange.length > 0 ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white',
          urgent: false,
        },
      ],
    }
  }, [all, wins, pipeline])

  const hour     = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100"
           style={{ background: 'linear-gradient(to right, #1e293b, #2563eb)' }}>
        <div className="flex items-center gap-3">
          <span className="text-lg">☀️</span>
          <div>
            <p className="text-white font-semibold text-sm">{greeting}, John</p>
            <p className="text-blue-200 text-xs">
              {now.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}Here's what happened since yesterday
            </p>
          </div>
        </div>

        {/* Right side: sync control + status badge */}
        <div className="flex items-center gap-3">

          {/* Last synced info */}
          {syncStatus?.last_sync && syncState === 'idle' && (
            <span className="text-xs text-blue-200 hidden sm:block">
              Synced {timeAgo(syncStatus.last_sync.at)}
            </span>
          )}
          {syncStatus && !syncStatus.configured && (
            <span className="text-xs text-amber-300">Autotask not configured</span>
          )}

          {/* Sync button */}
          {syncStatus?.configured && syncState === 'idle' && (
            <button
              onClick={handleSync}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-white/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Now
            </button>
          )}

          {syncState === 'syncing' && (
            <span className="flex items-center gap-1.5 text-xs text-white font-medium">
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Syncing...
            </span>
          )}

          {syncState === 'success' && (
            <span className="flex items-center gap-1.5 text-xs text-green-300 font-medium">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {syncMsg}
            </span>
          )}

          {syncState === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-red-300 font-medium">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {syncMsg}
              <button onClick={() => setSyncState('idle')} className="underline ml-1">Dismiss</button>
            </span>
          )}

          {/* Attention badge */}
          {brief.urgentCount > 0 && syncState === 'idle' && (
            <div className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
              {brief.urgentCount} need{brief.urgentCount === 1 ? 's' : ''} attention
            </div>
          )}
          {brief.urgentCount === 0 && syncState === 'idle' && (
            <div className="flex items-center gap-1.5 bg-green-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <span>✓</span> All clear
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-5 divide-x divide-gray-100">
        {brief.cards.map(card => (
          <div key={card.label} className={`px-4 py-3.5 border-l-4 ${card.colour}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-base">{card.icon}</span>
              <span className="text-xs text-gray-500 font-medium">{card.label}</span>
              {card.urgent && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <p className={`text-xl font-bold ${card.urgent ? 'text-red-600' : 'text-gray-900'}`}>
              {card.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
