'use client'

import { useMemo, useState } from 'react'
import { Opportunity } from '@/types'

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(n: number) { return `${n.toFixed(1)}%` }

type View = 'trend' | 'category' | 'size'

export default function WinLossAnalysis({ wins, all }: { wins: Opportunity[]; all: Opportunity[] }) {
  const [view, setView] = useState<View>('category')

  const losses = useMemo(() => all.filter(o => o.normalised_status === 'lost'), [all])

  // ── Monthly trend (last 12 months) ──────────────────────────
  const trendData = useMemo(() => {
    const months: { key: string; label: string; wins: number; losses: number; winRate: number }[] = []
    const now = new Date()

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth()

      const monthWins   = wins.filter(o => {
        if (!o.closed_date) return false
        const cd = new Date(o.closed_date)
        return cd.getFullYear() === y && cd.getMonth() === m
      })
      const monthLosses = losses.filter(o => {
        if (!o.closed_date) return false
        const cd = new Date(o.closed_date)
        return cd.getFullYear() === y && cd.getMonth() === m
      })

      const total   = monthWins.length + monthLosses.length
      const winRate = total > 0 ? (monthWins.length / total) * 100 : 0

      months.push({
        key: `${y}-${m}`,
        label: d.toLocaleDateString('en-IE', { month: 'short' }),
        wins: monthWins.length,
        losses: monthLosses.length,
        winRate,
      })
    }
    return months
  }, [wins, losses])

  // ── By category ─────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const cats = new Map<string, { wins: number; losses: number; winRev: number }>()
    ;[...wins, ...losses].forEach(o => {
      const cat = o.category ?? 'Uncategorised'
      if (!cats.has(cat)) cats.set(cat, { wins: 0, losses: 0, winRev: 0 })
      const entry = cats.get(cat)!
      if (o.normalised_status === 'won') { entry.wins++; entry.winRev += o.revenue_total }
      else entry.losses++
    })
    return Array.from(cats.entries())
      .map(([cat, d]) => ({
        cat,
        wins: d.wins,
        losses: d.losses,
        total: d.wins + d.losses,
        winRate: d.wins + d.losses > 0 ? (d.wins / (d.wins + d.losses)) * 100 : 0,
        winRev: d.winRev,
      }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [wins, losses])

  // ── By deal size ─────────────────────────────────────────────
  const sizeData = useMemo(() => {
    const bands = [
      { label: '< €10k',      min: 0,      max: 10000  },
      { label: '€10k–25k',   min: 10000,  max: 25000  },
      { label: '€25k–50k',   min: 25000,  max: 50000  },
      { label: '€50k–100k',  min: 50000,  max: 100000 },
      { label: '> €100k',    min: 100000, max: Infinity },
    ]
    return bands.map(b => {
      const bWins   = wins.filter(o => o.revenue_total >= b.min && o.revenue_total < b.max)
      const bLosses = losses.filter(o => o.revenue_total >= b.min && o.revenue_total < b.max)
      const total   = bWins.length + bLosses.length
      return {
        label: b.label,
        wins: bWins.length,
        losses: bLosses.length,
        total,
        winRate: total > 0 ? (bWins.length / total) * 100 : 0,
        avgWinRev: bWins.length > 0 ? bWins.reduce((s, o) => s + o.revenue_total, 0) / bWins.length : 0,
      }
    }).filter(d => d.total > 0)
  }, [wins, losses])

  const maxTrend = Math.max(...trendData.map(m => m.wins + m.losses), 1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Header + view switcher */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Win / Loss Analysis</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {wins.length} wins · {losses.length} losses ·{' '}
            {wins.length + losses.length > 0
              ? pct((wins.length / (wins.length + losses.length)) * 100)
              : '—'}{' '}
            overall win rate
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['category', 'size', 'trend'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-colors capitalize ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">

        {/* ── Category view ── */}
        {view === 'category' && (
          <div className="space-y-3">
            {categoryData.map(d => (
              <div key={d.cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 truncate max-w-[180px]">{d.cat}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="text-green-600 font-medium">{d.wins}W</span>
                    <span className="text-red-500 font-medium">{d.losses}L</span>
                    <span className={`font-semibold w-12 text-right ${d.winRate >= 60 ? 'text-green-600' : d.winRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {pct(d.winRate)}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-green-400 transition-all"
                    style={{ width: `${d.total > 0 ? (d.wins / d.total) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-red-300 transition-all"
                    style={{ width: `${d.total > 0 ? (d.losses / d.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
            {categoryData.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No closed data yet</p>}
          </div>
        )}

        {/* ── Size view ── */}
        {view === 'size' && (
          <div className="space-y-4">
            {sizeData.map(d => (
              <div key={d.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{d.label}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="text-green-600 font-medium">{d.wins}W</span>
                    <span className="text-red-500 font-medium">{d.losses}L</span>
                    <span className={`font-semibold w-12 text-right ${d.winRate >= 60 ? 'text-green-600' : d.winRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {pct(d.winRate)}
                    </span>
                    {d.avgWinRev > 0 && (
                      <span className="text-gray-400 w-20 text-right">avg {euros(d.avgWinRev)}</span>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-green-400" style={{ width: `${d.total > 0 ? (d.wins / d.total) * 100 : 0}%` }} />
                  <div className="h-full bg-red-300" style={{ width: `${d.total > 0 ? (d.losses / d.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {sizeData.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No closed data yet</p>}
          </div>
        )}

        {/* ── Trend view ── */}
        {view === 'trend' && (
          <div>
            <div className="flex items-end gap-1 h-28">
              {trendData.map(m => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                    <div
                      className="w-full bg-red-200 rounded-t-none"
                      style={{ height: `${maxTrend > 0 ? (m.losses / maxTrend) * 80 : 0}px` }}
                    />
                    <div
                      className="w-full bg-green-400"
                      style={{ height: `${maxTrend > 0 ? (m.wins / maxTrend) * 80 : 0}px` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {trendData.map(m => (
                <div key={m.key} className="flex-1 text-center">
                  <span className="text-[10px] text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-green-400" />
                <span className="text-xs text-gray-500">Wins</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-200" />
                <span className="text-xs text-gray-500">Losses</span>
              </div>
              <span className="text-xs text-gray-400 ml-auto">Last 12 months</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
