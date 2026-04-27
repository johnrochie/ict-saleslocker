import { formatCompact, formatPercent } from '@/lib/utils/formatting'

interface OwnerRow {
  name: string
  pipeline_rev: number
  won_rev: number
  won_gp: number
  pipeline_gp: number
  won_count: number
  lost_count: number
}

export default function OwnerBreakdown({ data }: { data: OwnerRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Performance by Rep</h2>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No data</p>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-5 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-100">
            <span className="col-span-1">Rep</span>
            <span className="text-right">Pipeline</span>
            <span className="text-right">Won</span>
            <span className="text-right">GP%</span>
            <span className="text-right">Conv.</span>
          </div>
          {data.map((row) => {
            const displayName = row.name.includes(',')
              ? row.name.split(',').map((s) => s.trim()).reverse().join(' ')
              : row.name
            const closedTotal = row.won_count + row.lost_count
            const convRate = closedTotal > 0 ? (row.won_count / closedTotal) * 100 : null
            const wonMargin = row.won_rev > 0 ? (row.won_gp / row.won_rev) * 100 : null

            return (
              <div key={row.name} className="grid grid-cols-5 py-2.5 text-sm border-b border-gray-50 last:border-0 items-center">
                <span className="col-span-1 font-medium text-gray-900 truncate" title={displayName}>
                  {displayName}
                </span>
                <span className="text-right text-blue-600">{formatCompact(row.pipeline_rev)}</span>
                <span className="text-right text-green-600">{formatCompact(row.won_rev)}</span>
                <span className="text-right text-gray-500 text-xs">
                  {wonMargin !== null ? formatPercent(wonMargin, 0) : '—'}
                </span>
                <span className={`text-right text-xs font-semibold ${
                  convRate === null ? 'text-gray-400' :
                  convRate >= 60 ? 'text-green-600' :
                  convRate >= 40 ? 'text-amber-600' : 'text-red-500'
                }`}>
                  {convRate !== null ? formatPercent(convRate, 0) : '—'}
                  {closedTotal > 0 && (
                    <span className="ml-1 font-normal text-gray-400">
                      ({row.won_count}/{closedTotal})
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
