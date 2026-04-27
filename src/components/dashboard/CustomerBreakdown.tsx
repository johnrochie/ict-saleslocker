import { formatCompact } from '@/lib/utils/formatting'

interface CustomerRow {
  name: string
  pipeline_rev: number
  won_rev: number
  won_gp: number
  opp_count: number
  total: number
}

export default function CustomerBreakdown({ data }: { data: CustomerRow[] }) {
  const maxTotal = data[0]?.total || 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Top Customers</h2>
        <span className="text-xs text-gray-400">Pipeline + Won</span>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No data</p>
      ) : (
        <div className="space-y-2.5">
          {data.map((row, i) => {
            const pct = Math.round((row.total / maxTotal) * 100)
            const wonPct = row.total > 0 ? Math.round((row.won_rev / row.total) * 100) : 0
            const pipePct = 100 - wonPct

            return (
              <div key={row.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800 truncate" title={row.name}>
                      {row.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-gray-400">{row.opp_count} opps</span>
                    {row.won_rev > 0 && (
                      <span className="text-xs text-green-600 font-medium">
                        {formatCompact(row.won_rev)} won
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-900 w-16 text-right">
                      {formatCompact(row.total)}
                    </span>
                  </div>
                </div>
                {/* Stacked bar: won (green) + pipeline (blue) */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${pct}%` }}>
                    <div className="bg-green-400" style={{ width: `${wonPct}%` }} />
                    <div className="bg-blue-400" style={{ width: `${pipePct}%` }} />
                  </div>
                </div>
              </div>
            )
          })}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="text-xs text-gray-500">Won</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              <span className="text-xs text-gray-500">Pipeline</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
