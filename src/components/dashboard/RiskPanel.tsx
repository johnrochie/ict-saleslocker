import { formatCompact, formatDate, daysOverdue } from '@/lib/utils/formatting'
import type { Opportunity } from '@/types'

export default function RiskPanel({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <div className="bg-white rounded-xl border border-red-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-900">
          Overdue Pipeline ({opportunities.length})
        </h2>
        <span className="text-xs text-gray-400">Projected close date passed by 7+ days</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-2 pr-4">Opportunity</th>
              <th className="text-left pb-2 pr-4">Company</th>
              <th className="text-left pb-2 pr-4">Owner</th>
              <th className="text-right pb-2 pr-4">Revenue</th>
              <th className="text-right pb-2">Close Date</th>
              <th className="text-right pb-2">Days Over</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {opportunities.map((opp) => {
              const ownerRaw = opp.account_manager ?? opp.opportunity_owner ?? '—'
              const owner = ownerRaw.includes(',')
                ? ownerRaw.split(',').map((s: string) => s.trim()).reverse().join(' ')
                : ownerRaw
              const over = daysOverdue(opp.projected_close_date)

              return (
                <tr key={opp.id} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-900 max-w-[200px] truncate">
                    {opp.opportunity_name}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 max-w-[150px] truncate">
                    {opp.company}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">{owner}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-gray-900">
                    {formatCompact(opp.revenue_total)}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-gray-500">
                    {formatDate(opp.projected_close_date)}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5
                                     text-xs font-medium text-red-700">
                      +{over}d
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
