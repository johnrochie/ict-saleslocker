'use client'

import { useState } from 'react'
import { formatPercent } from '@/lib/utils/formatting'

const COMM_CATEGORIES = ['hardware', 'maintenance', 'support_services', 'exclude']
const BUSINESS_TYPES  = ['new_client', 'existing_client', 'renewal']
const COMM_TYPES      = ['type1', 'type2', 'type3']

const commCatLabel = (c: string) =>
  ({ hardware: 'Hardware', maintenance: 'Maintenance', support_services: 'Support Services', exclude: 'Exclude' }[c] ?? c)
const bizTypeLabel = (b: string) =>
  ({ new_client: 'New Client', existing_client: 'Existing Client', renewal: 'Renewal' }[b] ?? b)
const commTypeLabel = (t: string) =>
  ({ type1: 'Type 1 — Category Rates', type2: 'Type 2 — Threshold Margin', type3: 'Type 3 — Target Bonus' }[t] ?? t)

interface CategoryMapping { id: string; autotask_category: string; commission_category: string; notes: string | null }
interface Type1Rate { id: string; business_type: string; commission_category: string; rate_pct: number; notes: string | null }
interface RepConfig {
  id: string; autotask_name: string; display_name: string; commission_type: string
  is_active: boolean; burden_rate: number; quarterly_threshold: number | null
  threshold_rate: number; annual_margin_target: number | null; annual_bonus: number | null
  stage1_threshold: number | null; stage1_rate: number; stage2_threshold: number | null
  stage2_rate: number; rollover_enabled: boolean; notes: string | null
}

export default function CommissionSettingsClient({
  categoryMappings, type1Rates, repConfigs, currentUserEmail,
}: {
  categoryMappings: CategoryMapping[]
  type1Rates: Type1Rate[]
  repConfigs: RepConfig[]
  currentUserEmail: string
}) {
  const [tab, setTab] = useState<'categories' | 'rates' | 'reps'>('categories')
  const [cats, setCats]     = useState(categoryMappings)
  const [rates, setRates]   = useState(type1Rates)
  const [reps, setReps]     = useState(repConfigs)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showAddRep, setShowAddRep] = useState(false)
  const [newRep, setNewRep] = useState({ autotask_name: '', display_name: '', commission_type: 'type1' })

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function saveMapping(id: string, field: string, value: string) {
    setSaving(true)
    const res = await fetch('/api/commission/settings/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value, updated_by: currentUserEmail }),
    })
    setSaving(false)
    res.ok ? flash('ok', 'Category mapping saved') : flash('err', 'Failed to save')
  }

  async function saveRate(id: string, value: number) {
    setSaving(true)
    const res = await fetch('/api/commission/settings/rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, rate_pct: value, updated_by: currentUserEmail }),
    })
    setSaving(false)
    res.ok ? flash('ok', 'Rate saved') : flash('err', 'Failed to save')
  }

  async function saveRepConfig(rep: RepConfig) {
    setSaving(true)
    const res = await fetch('/api/commission/settings/reps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rep, updated_by: currentUserEmail }),
    })
    setSaving(false)
    res.ok ? flash('ok', 'Rep configuration saved') : flash('err', 'Failed to save')
  }

  async function addRep() {
    if (!newRep.autotask_name.trim() || !newRep.display_name.trim()) return
    setSaving(true)
    const res = await fetch('/api/commission/settings/reps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newRep, updated_by: currentUserEmail }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setReps(prev => [...prev, data.rep])
      setNewRep({ autotask_name: '', display_name: '', commission_type: 'type1' })
      setShowAddRep(false)
      flash('ok', 'Rep added')
    } else {
      flash('err', data.error || 'Failed to add rep')
    }
  }

  const tabs = [
    { id: 'categories', label: 'Category Mappings' },
    { id: 'rates',      label: 'Type 1 Rates' },
    { id: 'reps',       label: 'Rep Configuration' },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Commission Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure commission rules, rates, and rep assignments</p>
      </div>

      {msg && (
        <div className={'rounded-lg px-4 py-3 text-sm border ' + (msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'px-4 py-1.5 rounded-md text-sm font-medium transition-colors ' + (tab === t.id ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Category Mappings ── */}
      {tab === 'categories' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-navy-700">Autotask Category Mappings</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Control how each Autotask opportunity category is treated in commission calculations.
              Set to Exclude to skip categories that should not earn commission.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Autotask Category</th>
                <th className="text-left px-5 py-3">Commission Category</th>
                <th className="text-left px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cats.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{c.autotask_category}</td>
                  <td className="px-5 py-3">
                    <select
                      value={c.commission_category}
                      onChange={(e) => {
                        const val = e.target.value
                        setCats(prev => prev.map(x => x.id === c.id ? { ...x, commission_category: val } : x))
                        saveMapping(c.id, 'commission_category', val)
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    >
                      {COMM_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{commCatLabel(cat)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Type 1 Rates ── */}
      {tab === 'rates' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-navy-700">Type 1 Commission Rates</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Rates applied to burdened margin. Burden = 25% of (Revenue minus direct costs).
              Click a rate to edit it inline.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Business Type</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-right px-5 py-3">Rate</th>
                <th className="text-left px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rates.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{bizTypeLabel(r.business_type)}</td>
                  <td className="px-5 py-3 text-gray-600">{commCatLabel(r.commission_category)}</td>
                  <td className="px-5 py-3 text-right">
                    <RateInput
                      value={r.rate_pct}
                      onSave={(v) => {
                        setRates(prev => prev.map(x => x.id === r.id ? { ...x, rate_pct: v } : x))
                        saveRate(r.id, v)
                      }}
                    />
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Rep Configuration ── */}
      {tab === 'reps' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddRep(true)}
              className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition-colors"
            >
              + Add Rep
            </button>
          </div>

          {showAddRep && (
            <div className="bg-white rounded-xl border border-brand-200 p-5">
              <h3 className="text-sm font-semibold text-navy-700 mb-3">Add new rep</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
                  <input value={newRep.display_name} onChange={e => setNewRep(p => ({ ...p, display_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Gary O'Brien" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Autotask Name</label>
                  <input value={newRep.autotask_name} onChange={e => setNewRep(p => ({ ...p, autotask_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="O'Brien, Gary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Commission Type</label>
                  <select value={newRep.commission_type} onChange={e => setNewRep(p => ({ ...p, commission_type: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    {COMM_TYPES.map(t => <option key={t} value={t}>{commTypeLabel(t)}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addRep} disabled={saving}
                  className="rounded-lg bg-brand-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-brand-600 disabled:opacity-60">
                  Save
                </button>
                <button onClick={() => setShowAddRep(false)}
                  className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {reps.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No reps configured yet. Add a rep above to get started.
            </div>
          ) : (
            reps.map((rep) => (
              <RepConfigCard key={rep.id} rep={rep}
                onSave={(updated) => {
                  setReps(prev => prev.map(r => r.id === updated.id ? updated : r))
                  saveRepConfig(updated)
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline rate editor ────────────────────────────────────
function RateInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((value * 100).toFixed(2))

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className="text-sm font-semibold text-brand-600 hover:underline tabular-nums">
        {formatPercent(value * 100, 2)}
      </button>
    )
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number" value={draft} step="0.01" min="0" max="100"
        onChange={e => setDraft(e.target.value)}
        className="w-20 rounded border border-brand-300 px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500"
        autoFocus
      />
      <span className="text-xs text-gray-400">%</span>
      <button onClick={() => { onSave(parseFloat(draft) / 100); setEditing(false) }}
        className="text-xs text-green-600 font-semibold hover:underline ml-1">Save</button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:underline">x</button>
    </div>
  )
}

// ── Rep config card ───────────────────────────────────────
function RepConfigCard({ rep, onSave }: { rep: RepConfig; onSave: (r: RepConfig) => void }) {
  const [draft, setDraft] = useState(rep)
  const [expanded, setExpanded] = useState(false)
  const [dirty, setDirty] = useState(false)

  function update(field: string, value: unknown) {
    setDraft(prev => ({ ...prev, [field]: value }))
    setDirty(true)
  }

  const typeColor = { type1: 'bg-blue-50 text-blue-700', type2: 'bg-purple-50 text-purple-700', type3: 'bg-green-50 text-green-700' }[draft.commission_type] || 'bg-gray-50 text-gray-600'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-navy-700">{draft.display_name}</p>
            <span className={'text-xs font-medium px-2 py-0.5 rounded-full ' + typeColor}>
              {commTypeLabel(draft.commission_type).split(' ')[0] + ' ' + commTypeLabel(draft.commission_type).split(' ')[1]}
            </span>
            {!draft.is_active && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{draft.autotask_name}</p>
        </div>
        {dirty && (
          <button onClick={e => { e.stopPropagation(); onSave(draft); setDirty(false) }}
            className="rounded-lg bg-brand-500 text-white px-3 py-1 text-xs font-semibold hover:bg-brand-600">
            Save changes
          </button>
        )}
        <svg className={'w-4 h-4 text-gray-400 transition-transform ' + (expanded ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {/* Common */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Commission Type</label>
              <select value={draft.commission_type} onChange={e => update('commission_type', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                {COMM_TYPES.map(t => <option key={t} value={t}>{commTypeLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Autotask Name (exact)</label>
              <input value={draft.autotask_name} onChange={e => update('autotask_name', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={draft.is_active} onChange={e => update('is_active', e.target.checked)}
                  className="rounded" />
                <span className="text-sm text-gray-600">Active</span>
              </label>
            </div>
          </div>

          {/* Type 1 */}
          {draft.commission_type === 'type1' && (
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Type 1 Settings</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Burden Rate (%)</label>
                <input type="number" value={(draft.burden_rate * 100).toFixed(0)}
                  onChange={e => update('burden_rate', parseFloat(e.target.value) / 100)}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-gray-400 mt-1">Applied to (Revenue minus direct costs). Default 25%.</p>
              </div>
            </div>
          )}

          {/* Type 2 */}
          {draft.commission_type === 'type2' && (
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">Type 2 Settings</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quarterly Threshold (€)</label>
                  <input type="number" value={draft.quarterly_threshold ?? ''}
                    onChange={e => update('quarterly_threshold', parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="18000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Commission Rate above threshold (%)</label>
                  <input type="number" value={(draft.threshold_rate * 100).toFixed(0)}
                    onChange={e => update('threshold_rate', parseFloat(e.target.value) / 100)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
            </div>
          )}

          {/* Type 3 */}
          {draft.commission_type === 'type3' && (
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Type 3 Settings</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Margin Target (€)</label>
                  <input type="number" value={draft.annual_margin_target ?? ''}
                    onChange={e => update('annual_margin_target', parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="450000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Bonus (€)</label>
                  <input type="number" value={draft.annual_bonus ?? ''}
                    onChange={e => update('annual_bonus', parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="56000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stage 1 Accelerator Start (€)</label>
                  <input type="number" value={draft.stage1_threshold ?? ''}
                    onChange={e => update('stage1_threshold', parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="450000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stage 1 Rate (%)</label>
                  <input type="number" value={(draft.stage1_rate * 100).toFixed(0)}
                    onChange={e => update('stage1_rate', parseFloat(e.target.value) / 100)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stage 2 Accelerator Start (€)</label>
                  <input type="number" value={draft.stage2_threshold ?? ''}
                    onChange={e => update('stage2_threshold', parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="950000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stage 2 Rate (%)</label>
                  <input type="number" value={(draft.stage2_rate * 100).toFixed(0)}
                    onChange={e => update('stage2_rate', parseFloat(e.target.value) / 100)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={draft.rollover_enabled}
                    onChange={e => update('rollover_enabled', e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-600">Enable quarterly rollover (shortfall in Q1 can be covered by Q2 surplus)</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={draft.notes ?? ''} onChange={e => update('notes', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Any notes about this rep's commission arrangement..." />
          </div>

          {dirty && (
            <div className="flex justify-end">
              <button onClick={() => { onSave(draft); setDirty(false) }}
                className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600">
                Save changes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
