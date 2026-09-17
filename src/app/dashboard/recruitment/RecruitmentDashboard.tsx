'use client'

import { useMemo, useState } from 'react'
import { cn, formatDate } from '@/lib/utils/formatting'

export interface JobOrder {
  bullhorn_id: number
  title: string
  company_name: string | null
  hiring_manager: string | null
  location: string | null
  salary: string | null
  employment_type: string | null
  status: string | null
  is_open: boolean
  date_added: string | null
  notes: string | null
}

export interface Submission {
  bullhorn_id: number
  job_order_bullhorn_id: number
  candidate_name: string | null
  status: string | null
  cv_sent: boolean
  date_added: string | null
  date_web_response: string | null
  comments: string | null
}

export interface Placement {
  bullhorn_id: number
  job_order_bullhorn_id: number | null
  candidate_name: string | null
  role_title: string | null
  company_name: string | null
  start_date: string | null
  employment_type: string | null
  notes: string | null
}

function daysLive(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function monthLabel(dateStr: string | null): string {
  if (!dateStr) return 'Undated'
  return new Date(dateStr).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</span>
    </div>
  )
}

export default function RecruitmentDashboard({
  jobOrders,
  submissions,
  placements,
  lastSyncedAt,
}: {
  jobOrders: JobOrder[]
  submissions: Submission[]
  placements: Placement[]
  lastSyncedAt: string | null
}) {
  const [tab, setTab] = useState<'vacancies' | 'placements'>('vacancies')
  const [expanded, setExpanded] = useState<number | null>(null)

  const submissionsByJobOrder = useMemo(() => {
    const map = new Map<number, Submission[]>()
    submissions.forEach((s) => {
      const list = map.get(s.job_order_bullhorn_id) ?? []
      list.push(s)
      map.set(s.job_order_bullhorn_id, list)
    })
    return map
  }, [submissions])

  const openJobOrders = jobOrders.filter((j) => j.is_open)

  const totals = useMemo(() => {
    let screened = 0
    let cvSent = 0
    let placed = 0
    openJobOrders.forEach((j) => {
      const subs = submissionsByJobOrder.get(j.bullhorn_id) ?? []
      screened += subs.length
      cvSent += subs.filter((s) => s.cv_sent).length
    })
    placed = placements.length
    return { screened, cvSent, placed }
  }, [openJobOrders, submissionsByJobOrder, placements])

  const placementsByMonth = useMemo(() => {
    const groups = new Map<string, Placement[]>()
    placements.forEach((p) => {
      const key = monthLabel(p.start_date)
      const list = groups.get(key) ?? []
      list.push(p)
      groups.set(key, list)
    })
    return groups
  }, [placements])

  if (jobOrders.length === 0 && placements.length === 0) {
    return (
      <div className="p-8">
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
          <p className="text-sm">No Bullhorn data has been synced yet.</p>
          <p className="text-xs mt-1 text-gray-400">
            Connect Bullhorn at <code className="bg-gray-100 px-1 rounded">/api/bullhorn/connect</code> and run a sync from{' '}
            <code className="bg-gray-100 px-1 rounded">/api/bullhorn/sync</code>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-700">Recruitment</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            {lastSyncedAt ? `Last synced ${formatDate(lastSyncedAt)}` : 'Not yet synced'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Open Vacancies" value={openJobOrders.length} />
        <StatCard label="Screened" value={totals.screened} />
        <StatCard label="CVs Sent" value={totals.cvSent} tone="text-green-700" />
        <StatCard label="Placed (recent)" value={totals.placed} tone="text-green-700" />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('vacancies')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'vacancies' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-navy-700'
          )}
        >
          Live Vacancies ({openJobOrders.length})
        </button>
        <button
          onClick={() => setTab('placements')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'placements' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-navy-700'
          )}
        >
          Placements ({placements.length})
        </button>
      </div>

      {tab === 'vacancies' && (
        <div className="space-y-3">
          {openJobOrders.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
              No open vacancies.
            </div>
          )}
          {openJobOrders.map((job) => {
            const subs = submissionsByJobOrder.get(job.bullhorn_id) ?? []
            const cvSent = subs.filter((s) => s.cv_sent).length
            const isOpen = expanded === job.bullhorn_id
            const days = daysLive(job.date_added)

            return (
              <div key={job.bullhorn_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : job.bullhorn_id)}
                  className="w-full flex items-start gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-navy-700">{job.title}</span>
                      {job.employment_type && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">
                          {job.employment_type}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-gray-400">BH#{job.bullhorn_id}</span>
                    </div>
                    <div className="flex gap-3 flex-wrap mt-1 text-xs text-gray-500">
                      {job.company_name && <span>🏢 {job.company_name}</span>}
                      {job.hiring_manager && <span>👤 {job.hiring_manager}</span>}
                      {job.location && <span>📍 {job.location}</span>}
                      {job.salary && <span>💰 {job.salary}</span>}
                      {days !== null && <span>⏱ {days} days live</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 min-w-[52px]">
                      <span className="text-sm font-semibold tabular-nums">{subs.length}</span>
                      <span className="text-[9px] font-mono text-gray-400">Screened</span>
                    </div>
                    <div className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 min-w-[52px]">
                      <span className="text-sm font-semibold tabular-nums text-green-700">{cvSent}</span>
                      <span className="text-[9px] font-mono text-gray-400">CVs Sent</span>
                    </div>
                    <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-200">
                    {job.notes && (
                      <div className="px-4 py-3 text-xs text-gray-600 bg-gray-50 border-b border-gray-100 whitespace-pre-wrap">
                        {job.notes}
                      </div>
                    )}
                    {subs.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-gray-400">No candidates recorded yet.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                            <th className="text-left font-medium px-4 py-2">Candidate</th>
                            <th className="text-left font-medium px-4 py-2">Status</th>
                            <th className="text-left font-medium px-4 py-2">Date</th>
                            <th className="text-left font-medium px-4 py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subs.map((s) => (
                            <tr key={s.bullhorn_id} className="border-t border-gray-100">
                              <td className="px-4 py-2 font-medium text-navy-700">{s.candidate_name ?? '—'}</td>
                              <td className="px-4 py-2">
                                <span
                                  className={cn(
                                    'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium',
                                    s.cv_sent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                  )}
                                >
                                  {s.status ?? '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-gray-500">{formatDate(s.date_added)}</td>
                              <td className="px-4 py-2 text-gray-500">{s.comments ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'placements' && (
        <div className="space-y-6">
          {placements.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
              No placements recorded yet.
            </div>
          )}
          {Array.from(placementsByMonth.entries()).map(([month, rows]) => (
            <div key={month}>
              <div className="text-xs font-semibold font-mono uppercase tracking-wide text-gray-400 border-b border-gray-200 pb-1.5 mb-3">
                {month} — {rows.length} placement{rows.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-2">
                {rows.map((p) => (
                  <div key={p.bullhorn_id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <span className="text-lg">🏆</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-navy-700">{p.candidate_name ?? '—'}</span>
                        {p.employment_type && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">
                            {p.employment_type}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 flex-wrap mt-1 text-xs text-gray-500">
                        {p.role_title && <span>💼 {p.role_title}</span>}
                        {p.company_name && <span>🏢 {p.company_name}</span>}
                        {p.start_date && <span>📅 Start: {formatDate(p.start_date)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
