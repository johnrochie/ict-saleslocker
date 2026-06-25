'use client'

import { useState, useMemo } from 'react'
import { formatCompact, formatPercent, cn } from '@/lib/utils/formatting'

interface POApproval {
  id: string
  opportunity_id: string
  autotask_id: number | null
  company: string | null
  opportunity_name: string | null
  requested_by: string
  requested_at: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  gross_margin_pct: number | null
  revenue_total: number | null
}

interface Props {
  initialApprovals: POApproval[]
  threshold: number
  userEmail: string
  userRole: string
  isManager: boolean
  isAdmin: boolean
}

function marginColor(pct: number | null) {
  if (pct == null) return 'text-gray-400'
  if (pct < 10)   return 'text-red-600 font-semibold'
  if (pct < 20)   return 'text-amber-600 font-semibold'
  return 'text-green-600'
}

function statusBadge(status: string) {
  if (status === 'approved') return 'bg-green-100 text-green-700'
  if (status === 'rejected') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-IE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function POApprovalsClient({
  initialApprovals, threshold, userEmail, isManager, isAdmin,
}: Props) {
  const [approvals, setApprovals]         = useState<POApproval[]>(initialApprovals)
  const [activeTab, setActiveTab]         = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [loadingId, setLoadingId]         = useState<string | null>(null)
  const [rejectingId, setRejectingId]     = useState<string | null>(null)
  const [rejectNotes, setRejectNotes]     = useState('')
  const [flash, setFlash]                 = useState<string | null>(null)
  const [editThreshold, setEditThreshold] = useState(false)
  const [thresholdVal, setThresholdVal]   = useState(String(threshold))
  const [savingThreshold, setSavingThreshold] = useState(false)

  const filtered = useMemo(() =>
    activeTab === 'all' ? approvals : approvals.filter(a => a.status === activeTab),
    [approvals, activeTab]
  )

  const pendingCount = approvals.filter(a => a.status === 'pending').length

  function showFlash(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(null), 3500)
  }

  async function handleReview(id: string, action: 'approve' | 'reject', notes?: string) {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/po-approvals/${id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      })
      const json = await res.json()
      if (!res.ok) { showFlash(json.error ?? 'Failed'); return }

      setApprovals(prev => prev.map(a => a.id === id ? json.approval : a))
      setRejectingId(null)
      setRejectNotes('')
      showFlash(action === 'approve' ? 'Approved successfully' : 'Rejected')
    } finally {
      setLoadingId(null)
    }
  }

  async function saveThreshold() {
    setSavingThreshold(true)
    try {
      const res = await fetch('/api/po-approvals/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: parseFloat(thresholdVal) }),
      })
      const json = await res.json()
      if (!res.ok) { showFlash(json.error ?? 'Failed'); return }
      setEditThreshold(false)
      showFlash(`Threshold updated to ${json.threshold}%`)
    } finally {
      setSavingThreshold(false)
    }
  }

  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'pending',  label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all',      label: 'All' },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">PO Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Deals below the margin threshold requiring approval before a PO is raised
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Threshold display / edit */}
          {isAdmin && editThreshold ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Threshold:</span>
              <input
                type="number" min="0" max="100" step="1"
                value={thresholdVal}
                onChange={e => setThresholdVal(e.target.value)}
                className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-500">%</span>
              <button
                onClick={saveThreshold} disabled={savingThreshold}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingThreshold ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditThreshold(false)} className="text-sm text-gray-400 hover:text-gray-600">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                Threshold: <span className="font-semibold text-gray-700">{thresholdVal}%</span>
              </span>
              {isAdmin && (
                <button
                  onClick={() => setEditThreshold(true)}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {flash}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            No {activeTab === 'all' ? '' : activeTab} approval requests
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3">Company</th>
                  <th className="text-left px-4 py-3">Deal</th>
                  <th className="text-right px-4 py-3">Revenue</th>
                  <th className="text-right px-4 py-3">Margin %</th>
                  <th className="text-left px-4 py-3">Requested By</th>
                  <th className="text-left px-4 py-3">Requested At</th>
                  <th className="text-left px-4 py-3">Status</th>
                  {isManager && activeTab === 'pending' && (
                    <th className="text-center px-4 py-3">Actions</th>
                  )}
                  {activeTab !== 'pending' && (
                    <th className="text-left px-4 py-3">Notes</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(approval => (
                  <tr key={approval.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px]">
                      <span className="truncate block" title={approval.company ?? ''}>{approval.company ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px]">
                      <span className="truncate block" title={approval.opportunity_name ?? ''}>
                        {approval.opportunity_name ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                      {approval.revenue_total != null ? formatCompact(approval.revenue_total) : '—'}
                    </td>
                    <td className={cn('px-4 py-3 text-right whitespace-nowrap', marginColor(approval.gross_margin_pct))}>
                      {approval.gross_margin_pct != null ? formatPercent(approval.gross_margin_pct, 1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px]">
                      <span className="truncate block">{approval.requested_by}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDateTime(approval.requested_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        statusBadge(approval.status)
                      )}>
                        {approval.status}
                      </span>
                    </td>

                    {/* Manager action buttons — pending tab only */}
                    {isManager && activeTab === 'pending' && (
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {rejectingId === approval.id ? (
                          <div className="flex flex-col gap-2 min-w-[200px]">
                            <textarea
                              value={rejectNotes}
                              onChange={e => setRejectNotes(e.target.value)}
                              placeholder="Reason for rejection..."
                              rows={2}
                              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setRejectingId(null); setRejectNotes('') }}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleReview(approval.id, 'reject', rejectNotes)}
                                disabled={loadingId === approval.id}
                                className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {loadingId === approval.id ? '…' : 'Confirm Reject'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleReview(approval.id, 'approve')}
                              disabled={loadingId === approval.id}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {loadingId === approval.id ? '…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => setRejectingId(approval.id)}
                              disabled={loadingId === approval.id}
                              className="rounded-lg bg-white border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    )}

                    {/* Notes column for non-pending tabs */}
                    {activeTab !== 'pending' && (
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px]">
                        <span className="truncate block" title={approval.notes ?? ''}>
                          {approval.notes ?? '—'}
                        </span>
                        {approval.reviewed_by && (
                          <span className="text-gray-400 block">by {approval.reviewed_by}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rep info message */}
      {!isManager && (
        <p className="text-xs text-gray-400 text-center">
          Showing your approval requests only. Contact your sales manager to action pending requests.
        </p>
      )}
    </div>
  )
}
