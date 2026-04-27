import { formatCompact, formatPercent } from '@/lib/utils/formatting'

interface CategoryRow {
  name: string
  revenue: number
  count: number
  gp: number
}

export default function CategoryBreakdown({ data }: { data: CategoryRow[] }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Pipeline by Category</h2>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No pipeline data</p>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <div key={row.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700 truncate max-w-[180px]" title={row.name}>
                  {row.name}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-400">{row.count} opps</span>
                  <span className="text-sm font-medium text-gray-900 w-20 text-right">
                    {formatCompact(row.revenue)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full"
                    style={{ width: `${(row.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">
                  {row.revenue > 0 ? formatPercent((row.gp / row.revenue) * 100, 0) : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
