'use client'

import { useMemo } from 'react'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// Consistent colour per category (hashed)
const CATEGORY_COLOURS = [
  'bg-blue-500',  'bg-purple-500', 'bg-teal-500',   'bg-orange-500',
  'bg-pink-500',  'bg-indigo-500', 'bg-cyan-500',   'bg-rose-500',
  'bg-emerald-500', 'bg-amber-500',
]

function categoryColour(cat: string): string {
  let hash = 0
  for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) & 0xff
  return CATEGORY_COLOURS[hash % CATEGORY_COLOURS.length]
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IE', { month: 'short', year: '2-digit' })
}

export default function DealTimeline({ pipeline }: { pipeline: Opportunity[] }) {
  const { months, noDate, totalPipeline } = useMemo(() => {
    const now = new Date()
    const buckets: Record<string, Opportunity[]> = {}
    const noDate: Opportunity[] = []

    // Generate next 5 months as keys
    for (let i = 0; i < 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      buckets[monthKey(d)] = []
    }

    pipeline.forEach(o => {
      if (!o.projected_close_date) {
        noDate.push(o)
        return
      }
      const key = monthKey(new Date(o.projected_close_date))
      if (buckets[key]) {
        buckets[key].push(o)
      } else {
        // Future beyond our window — put in last bucket
        const lastKey = Object.keys(buckets).at(-1)!
        buckets[lastKey].push(o)
      }
    })

    const months = Object.entries(buckets).map(([key, opps]) => ({
      key,
      label: monthLabel(key),
      opps: opps.sort((a, b) => b.revenue_total - a.revenue_total),
      total: opps.reduce((s, o) => s + o.revenue_total, 0),
      isCurrentMonth: key === monthKey(now),
    }))

    const totalPipeline = pipeline.reduce((s, o) => s + o.revenue_total, 0)

    return { months, noDate, totalPipeline }
  }, [pipeline])

  const maxMonthTotal = Math.max(...months.map(m => m.total), 1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Deal Timeline</h2>
          <p className="text-xs text-gray-400 mt-0.5">Pipeline by projected close — {euros(totalPipeline)} total</p>
        </div>
        {noDate.length > 0 && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
            {noDate.length} with no close date
          </span>
        )}
      </div>

      {/* Month columns */}
      <div className="grid grid-cols-5 divide-x divide-gray-100">
        {months.map(month => (
          <div key={month.key} className={`p-3 ${month.isCurrentMonth ? 'bg-blue-50' : ''}`}>
            {/* Month header */}
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold ${month.isCurrentMonth ? 'text-blue-600' : 'text-gray-500'}`}>
                {month.label}
                {month.isCurrentMonth && <span className="ml-1 text-[10px] bg-blue-500 text-white px-1 rounded">Now</span>}
              </span>
              <span className="text-xs text-gray-500 font-medium">{euros(month.total)}</span>
            </div>

            {/* Volume bar */}
            <div className="h-1 bg-gray-100 rounded-full mb-3">
              <div
                className={`h-1 rounded-full transition-all ${month.isCurrentMonth ? 'bg-blue-500' : 'bg-brand-400'}`}
                style={{ width: `${(month.total / maxMonthTotal) * 100}%` }}
              />
            </div>

            {/* Deal pills */}
            <div className="space-y-1.5">
              {month.opps.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-2">—</p>
              )}
              {month.opps.slice(0, 5).map(opp => (
                <div
                  key={opp.id}
                  className="group relative"
                  title={`${opp.opportunity_name} — ${opp.company}\n${euros(opp.revenue_total)} · ${opp.category ?? 'No category'}`}
                >
                  <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-white text-xs ${categoryColour(opp.category ?? 'other')} hover:opacity-90 transition-opacity cursor-default`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate leading-tight">{opp.opportunity_name}</p>
                      <p className="opacity-80 text-[10px] truncate">{euros(opp.revenue_total)}</p>
                    </div>
                    {opp.is_overdue && <span className="text-[10px] shrink-0">⚠️</span>}
                  </div>
                </div>
              ))}
              {month.opps.length > 5 && (
                <p className="text-xs text-gray-400 text-center">+{month.opps.length - 5} more</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* No close date bucket */}
      {noDate.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-xs font-medium text-amber-600 mb-2">⚠️ No projected close date ({noDate.length} deals · {euros(noDate.reduce((s, o) => s + o.revenue_total, 0))})</p>
          <div className="flex flex-wrap gap-1.5">
            {noDate.slice(0, 8).map(opp => (
              <span
                key={opp.id}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md truncate max-w-[180px]"
                title={`${opp.company} — ${euros(opp.revenue_total)}`}
              >
                {opp.opportunity_name}
              </span>
            ))}
            {noDate.length > 8 && (
              <span className="text-xs text-gray-400 px-1 py-1">+{noDate.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {/* Category legend */}
      <div className="border-t border-gray-100 px-5 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Array.from(new Set(pipeline.map(o => o.category ?? 'Uncategorised')))
            .slice(0, 8)
            .map(cat => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-sm ${categoryColour(cat)}`} />
                <span className="text-[11px] text-gray-500">{cat}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
