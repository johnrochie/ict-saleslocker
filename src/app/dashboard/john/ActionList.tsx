'use client'

import { useMemo, useState } from 'react'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

type Priority = 'critical' | 'high' | 'medium'

interface ActionItem {
  opp: Opportunity
  priority: Priority
  reason: string
  detail: string
}

const PRIORITY_CONFIG: Record<Priority, { label: string; colour: string; dot: string; order: number }> = {
  critical: { label: 'Critical', colour: 'bg-red-100 text-red-700',    dot: 'bg-red-500',    order: 0 },
  high:     { label: 'High',     colour: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500',  order: 1 },
  medium:   { label: 'Review',   colour: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-400',   order: 2 },
}

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function ActionList({ pipeline, all }: {
  pipeline: Opportunity[]
  all: Opportunity[]
}) {
  const [expanded, setExpanded] = useState(false)

  const actions = useMemo((): ActionItem[] => {
    const items: ActionItem[] = []
    const seen = new Set<string>()

    const add = (opp: Opportunity, priority: Priority, reason: string, detail: string) => {
      if (!seen.has(opp.id)) {
        seen.add(opp.id)
        items.push({ opp, priority, reason, detail })
      }
    }

    // 1. CRITICAL: Overdue deals (past projected close date)
    pipeline
      .filter(o => o.is_overdue && o.projected_close_date)
      .forEach(o => {
        const days = Math.abs(daysUntil(o.projected_close_date) ?? 0)
        add(o, 'critical', 'Overdue', `${days} day${days !== 1 ? 's' : ''} past projected close`)
      })

    // 2. CRITICAL: Large deals (>€50k) with no projected close date
    pipeline
      .filter(o => o.revenue_total >= 50000 && !o.projected_close_date)
      .forEach(o => add(o, 'critical', 'No close date', `${euros(o.revenue_total)} deal — close date missing`))

    // 3. HIGH: Negative margin in pipeline
    pipeline
      .filter(o => o.is_negative_margin)
      .forEach(o => add(o, 'high', 'Negative margin', `${o.gross_margin_pct.toFixed(1)}% — pricing review needed`))

    // 4. HIGH: Missing cost data (can't calculate margin)
    pipeline
      .filter(o => o.cost_missing)
      .forEach(o => add(o, 'high', 'Missing costs', 'Margin unknown — cost data incomplete'))

    // 5. HIGH: On hold > 60 days
    pipeline
      .filter(o => (o.normalised_status === 'on_hold' || o.normalised_status === 'on_hold_stale'))
      .filter(o => {
        const days = daysAgo(o.last_activity ?? o.updated_at)
        return days !== null && days >= 60
      })
      .forEach(o => {
        const days = daysAgo(o.last_activity ?? o.updated_at) ?? 0
        add(o, 'high', 'Stale on hold', `No activity for ${days} days`)
      })

    // 6. MEDIUM: Closing within 14 days — need attention
    pipeline
      .filter(o => {
        const days = daysUntil(o.projected_close_date)
        return days !== null && days >= 0 && days <= 14
      })
      .forEach(o => {
        const days = daysUntil(o.projected_close_date) ?? 0
        add(o, 'medium', 'Closing soon', `${days} day${days !== 1 ? 's' : ''} to projected close`)
      })

    // 7. MEDIUM: Any deal > €25k with no close date
    pipeline
      .filter(o => o.revenue_total >= 25000 && !o.projected_close_date)
      .forEach(o => add(o, 'medium', 'No close date', `${euros(o.revenue_total)} — needs close date`))

    // Sort by priority then revenue
    return items
      .sort((a, b) => {
        const po = PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order
        return po !== 0 ? po : b.opp.revenue_total - a.opp.revenue_total
      })
  }, [pipeline, all])

  const visible = expanded ? actions : actions.slice(0, 6)
  const criticalCount = actions.filter(a => a.priority === 'critical').length
  const highCount     = actions.filter(a => a.priority === 'high').length

  if (actions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
        <p className="text-2xl mb-2">🎉</p>
        <p className="text-sm font-medium text-gray-700">Nothing needs your attention right now</p>
        <p className="text-xs text-gray-400 mt-1">All pipeline deals are on track</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900 text-sm">Action List</h2>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">
                {criticalCount} critical
              </span>
            )}
            {highCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                {highCount} high
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400">{actions.length} total</span>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-50">
        {visible.map(({ opp, priority, reason, detail }, i) => {
          const cfg = PRIORITY_CONFIG[priority]
          return (
            <div key={opp.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
              {/* Number */}
              <span className="text-xs text-gray-400 font-mono w-4 pt-0.5 shrink-0">{i + 1}</span>

              {/* Priority dot */}
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{opp.opportunity_name}</p>
                    <p className="text-xs text-gray-500 truncate">{opp.company}{opp.category ? ` · ${opp.category}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">{euros(opp.revenue_total)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.colour}`}>
                      {reason}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{detail}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Show more */}
      {actions.length > 6 && (
        <div className="px-5 py-3 border-t border-gray-100 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-brand-500 hover:underline font-medium"
          >
            {expanded ? 'Show less' : `Show ${actions.length - 6} more`}
          </button>
        </div>
      )}
    </div>
  )
}
