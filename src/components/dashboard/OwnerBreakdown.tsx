import { formatCompact } from '@/lib/utils/formatting'

interface OwnerRow {
  name: string
  pipeline_rev: number
  won_rev: number
  pipeline_gp: number
  won_gp: number
  count: number
}

export default function OwnerBreakdown({ data }: { data: OwnerRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Performance by Rep</h2>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No data</p>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-4 text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-100">
            <span className="col-span-1">Rep</span>
            <span className="text-right">Pipeline</span>
            <span className="text-right">Won</span>
            <span className="text-right">Won GP</span>
          </div>
          {data.map((row) => {
            // Format name: "Roche, John" → "John Roche" or keep as-is
            const displayName = row.name.includes(',')
              ? row.name.split(',').map((s) => s.trim()).reverse().join(' ')
              : row.name

            return (
              <div key={row.name}
                className="grid grid-cols-4 py-2.5 text-sm border-b border-gray-50 last:border-0">
                <span className="col-span-1 font-medium text-gray-900 truncate" title={displayName}>
                  {displayName}
                </span>
                <span className="text-right text-blue-600">{formatCompact(row.pipeline_rev)}</span>
                <span className="text-right text-green-600">{formatCompact(row.won_rev)}</span>
                <span className="text-right text-gray-600">{formatCompact(row.won_gp)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
