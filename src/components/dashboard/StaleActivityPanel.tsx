import { formatCompact, formatDate } from '@/lib/utils/formatting'
import type { Opportunity } from '@/types'

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export default function StaleActivityPanel({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-900">
          No Activity 14+ Days ({opportunities.length})
        </h2>
        <span className="text-xs text-gray-400">Active pipeline with no logged activity</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 pr-4">Opportunity</th>
              <th className="text-left pb-2 pr-4">Company</th>
              <th className="text-left pb-2 pr-4">Owner</th>
              <th className="text-right pb-2 pr-4">Revenue</th>
              <th className="text-right pb-2 pr-4">Last Activity</th>
              <th className="text-right pb-2">Days Inactive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {opportunities.slice(0, 10).map((opp) => {
              const ownerRaw = opp.account_manager ?? opp.opportunity_owner ?? '—'
              const owner = ownerRaw.includes(',')
                ? ownerRaw.split(',').map((s: string) => s.trim()).reverse().join(' ')
                : ownerRaw
              const days = daysSince(opp.last_activity)

              return (
                <tr key={opp.id} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-900 max-w-[200px]">
                    <span className="truncate block" title={opp.opportunity_name}>
                      {opp.opportunity_name}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 max-w-[140px]">
                    <span className="truncate block">{opp.company}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 whitespace-nowrap">{owner}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-gray-900 whitespace-nowrap">
                    {formatCompact(opp.revenue_total)}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-gray-500 whitespace-nowrap">
                    {opp.last_activity ? formatDate(opp.last_activity) : 'Never'}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      days >= 30 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {days >= 999 ? 'Never' : `${days}d`}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
