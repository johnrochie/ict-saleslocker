'use client'

import { useMemo, useState } from 'react'
import { Opportunity } from '@/types'
import type { DealExclusion } from '@/lib/exclusions'

// Shared "hide this deal from exec reporting" behaviour for the Exec Pack,
// Pipeline Summary and Wins Summary pages.

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function useDealExclusions(initial: DealExclusion[]) {
  const [exclusions, setExclusions] = useState(initial)
  const [pending, setPending]       = useState<Opportunity | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const hiddenIds = useMemo(() => new Set(exclusions.map(e => e.opportunity_id)), [exclusions])

  async function hide(o: Opportunity, reason: string) {
    setError(null)
    const res = await fetch('/api/deal-exclusions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: o.id, reason }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || 'Could not hide deal'); return false }
    setExclusions(list => [{
      ...json.exclusion,
      deal: { company: o.company, opportunity_name: o.opportunity_name, revenue_total: o.revenue_total, normalised_status: o.normalised_status },
    }, ...list.filter(e => e.opportunity_id !== o.id)])
    return true
  }

  async function restore(id: string) {
    setError(null)
    const res = await fetch(`/api/deal-exclusions?opportunity_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error || 'Could not restore deal'); return }
    setExclusions(list => list.filter(e => e.opportunity_id !== id))
  }

  return { exclusions, hiddenIds, hide, restore, pending, setPending, error, setError }
}

export type DealExclusionsState = ReturnType<typeof useDealExclusions>

// Small inline "Hide" control for a deal row. Rendered only for managers.
export function HideDealButton({ deal, state, className }: { deal: Opportunity; state: DealExclusionsState; className?: string }) {
  return (
    <button type="button" title="Hide this deal from exec reports"
      onClick={e => { e.stopPropagation(); state.setPending(deal) }}
      className={className}
      style={{ border: '1px solid #cbd5e1', background: 'white', color: '#64748b', borderRadius: 5, fontSize: 11, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      Hide
    </button>
  )
}

export function HideDealDialog({ state }: { state: DealExclusionsState }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const o = state.pending
  if (!o) return null

  function close() { state.setPending(null); setReason(''); state.setError(null) }
  async function submit() {
    setSaving(true)
    const ok = await state.hide(o!, reason)
    setSaving(false)
    if (ok) close()
  }

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" style={{ fontFamily: 'Arial, sans-serif' }}>
        <h3 className="text-base font-bold text-gray-900 mb-1">Hide deal from exec reports?</h3>
        <p className="text-sm text-gray-600 mb-3">
          <strong>{o.company}</strong> — {o.opportunity_name} ({euros(o.revenue_total)})
        </p>
        <p className="text-xs text-gray-500 mb-3">
          It will be left out of the Exec Pack, Pipeline Summary and Wins Summary for everyone until restored.
          It stays on the main Pipeline page so it can still be fixed in Autotask.
        </p>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Reason (optional)</label>
        <input autoFocus value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. Rep hasn't updated — deal is dead"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3" />
        {state.error && <p className="text-xs text-red-600 mb-3">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={close} className="px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded-md text-sm font-semibold bg-navy-700 text-white hover:bg-navy-800 disabled:opacity-50">
            {saving ? 'Hiding…' : 'Hide deal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// List of hidden deals with restore. `scope` limits it to the deals relevant
// to the page (e.g. open deals on Pipeline Summary, won deals on Wins Summary).
export function HiddenDealsPanel({ state, canEdit, ready, scope }: {
  state: DealExclusionsState; canEdit: boolean; ready: boolean; scope?: (status: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const rows  = state.exclusions.filter(e => !scope || (e.deal && scope(e.deal.normalised_status)))
  const total = rows.reduce((s, e) => s + (e.deal?.revenue_total ?? 0), 0)

  if (!ready) {
    return (
      <div className="no-print text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2" style={{ fontFamily: 'Arial, sans-serif' }}>
        Hiding deals isn&apos;t switched on yet: run migration <code>015_deal_exclusions.sql</code> in Supabase.
      </div>
    )
  }
  if (rows.length === 0) return null

  return (
    <div className="no-print bg-white border border-gray-200 rounded-lg" style={{ fontFamily: 'Arial, sans-serif' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm">
        <span className="font-semibold text-gray-800">
          Hidden from reports: {rows.length} deal{rows.length === 1 ? '' : 's'} · {euros(total)}
        </span>
        <span className="text-gray-400 text-xs">{open ? 'Hide list ▲' : 'Show list ▼'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
        <table className="w-full text-xs border-t border-gray-100">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Company</th><th className="text-left px-4 py-2">Deal</th>
              <th className="text-right px-4 py-2">Value</th><th className="text-left px-4 py-2">Reason</th>
              <th className="text-left px-4 py-2">Hidden by</th><th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.opportunity_id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-semibold text-gray-800">{e.deal?.company ?? '—'}</td>
                <td className="px-4 py-2 text-gray-600">{e.deal?.opportunity_name ?? '(deal no longer in CRM)'}</td>
                <td className="px-4 py-2 text-right font-semibold">{euros(e.deal?.revenue_total ?? 0)}</td>
                <td className="px-4 py-2 text-gray-600">{e.reason || '—'}</td>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {(e.hidden_by || '').split('@')[0] || '—'} · {new Date(e.hidden_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}
                </td>
                <td className="px-4 py-2 text-right">
                  {canEdit && (
                    <button onClick={() => state.restore(e.opportunity_id)} className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold">
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {state.error && <p className="text-xs text-red-600 px-4 pb-2">{state.error}</p>}
    </div>
  )
}
