'use client'

import { useMemo } from 'react'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

interface BriefCard {
  icon: string
  label: string
  value: string
  sub?: string
  colour: string
  urgent?: boolean
}

export default function MorningBrief({ all, wins, pipeline }: {
  all: Opportunity[]
  wins: Opportunity[]
  pipeline: Opportunity[]
}) {
  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const brief = useMemo(() => {
    const isRecent = (dateStr: string | null) => {
      if (!dateStr) return false
      return new Date(dateStr) >= cutoff
    }

    const newWins     = wins.filter(o => isRecent(o.created_at))
    const newPipeline = pipeline.filter(o => isRecent(o.created_at))
    const wentOverdue = pipeline.filter(o => o.is_overdue && isRecent(o.updated_at))
    const missingCost = all.filter(o => o.cost_missing && isRecent(o.updated_at))
    const statusChange = all.filter(o =>
      isRecent(o.updated_at) && !isRecent(o.created_at) // updated but not newly created
    )

    const cards: BriefCard[] = [
      {
        icon: '🏆',
        label: 'New Wins',
        value: newWins.length > 0 ? String(newWins.length) : '—',
        sub: newWins.length > 0 ? euros(newWins.reduce((s, o) => s + o.revenue_total, 0)) : 'none since yesterday',
        colour: newWins.length > 0 ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white',
        urgent: false,
      },
      {
        icon: '📥',
        label: 'New Pipeline',
        value: newPipeline.length > 0 ? String(newPipeline.length) : '—',
        sub: newPipeline.length > 0
          ? euros(newPipeline.reduce((s, o) => s + o.revenue_total, 0))
          : 'none since yesterday',
        colour: newPipeline.length > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white',
        urgent: false,
      },
      {
        icon: '⏰',
        label: 'Went Overdue',
        value: wentOverdue.length > 0 ? String(wentOverdue.length) : '✓',
        sub: wentOverdue.length > 0 ? 'past close date' : 'nothing new overdue',
        colour: wentOverdue.length > 0 ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white',
        urgent: wentOverdue.length > 0,
      },
      {
        icon: '⚠️',
        label: 'Missing Costs',
        value: missingCost.length > 0 ? String(missingCost.length) : '✓',
        sub: missingCost.length > 0 ? 'margin data incomplete' : 'data is clean',
        colour: missingCost.length > 0 ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white',
        urgent: missingCost.length > 0,
      },
      {
        icon: '🔄',
        label: 'Updated',
        value: statusChange.length > 0 ? String(statusChange.length) : '—',
        sub: statusChange.length > 0 ? 'deals changed status' : 'no changes',
        colour: statusChange.length > 0 ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white',
        urgent: false,
      },
    ]

    const urgentCount = cards.filter(c => c.urgent).length

    return { cards, urgentCount, newWins, wentOverdue }
  }, [all, wins, pipeline])

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-navy-900 to-brand-600" style={{ background: 'linear-gradient(to right, #1e293b, #2563eb)' }}>
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
        {brief.urgentCount > 0 && (
          <div className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
            <span>●</span>
            {brief.urgentCount} item{brief.urgentCount > 1 ? 's' : ''} need attention
          </div>
        )}
        {brief.urgentCount === 0 && (
          <div className="flex items-center gap-1.5 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
            <span>✓</span> All clear
          </div>
        )}
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
