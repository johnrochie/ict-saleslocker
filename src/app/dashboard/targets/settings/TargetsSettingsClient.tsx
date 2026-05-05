'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatEuro } from '@/lib/utils/formatting'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_Q    = Math.ceil((new Date().getMonth() + 1) / 3)
const YEARS        = [2025, 2026, 2027]
const QUARTERS     = [1, 2, 3, 4]

interface CompanyTarget  { id: string; year: number; quarter_num: number; revenue_target: number | null; margin_target: number | null; notes: string | null }
interface RepTarget      { id?: string; autotask_name: string; display_name: string; year: number; quarter_num: number; personal_margin_target: number | null; team_margin_target: number | null; notes: string | null }
interface Rep            { autotask_name: string; display_name: string }
interface CategoryTarget { id?: string; year: number; category_name: string; gl_code: string | null; annual_revenue_target: number; is_framework: boolean; sort_order: number }

function repDisplayName(name: string) {
  return name.includes(',') ? name.split(',').map(s => s.trim()).reverse().join(' ') : name
}

function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
      placeholder={placeholder || '0'}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  )
}

/** Derive canonical category list (unique rows, sorted by sort_order) from all-years data */
function getUniqueCategories(categoryTargets: CategoryTarget[]): CategoryTarget[] {
  const seen = new Set<string>()
  const result: CategoryTarget[] = []
  for (const ct of [...categoryTargets].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!seen.has(ct.category_name)) {
      seen.add(ct.category_name)
      result.push(ct)
    }
  }
  return result
}

export default function TargetsSettingsClient({
  companyTargets,
  repTargets,
  reps,
  categoryTargets,
  currentUserEmail,
}: {
  companyTargets: CompanyTarget[]
  repTargets: RepTarget[]
  reps: Rep[]
  categoryTargets: CategoryTarget[]
  currentUserEmail: string
}) {
  const uniqueCategories = getUniqueCategories(categoryTargets)

  const [tab,     setTab]     = useState<'company' | 'reps' | 'categories'>('company')
  const [selYear, setSelYear] = useState(CURRENT_YEAR)
  const [selQ,    setSelQ]    = useState(CURRENT_Q)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Company target state
  const existingCompany = companyTargets.find(t => t.year === selYear && t.quarter_num === selQ)
  const [companyRev,   setCompanyRev]   = useState<number | null>(existingCompany?.revenue_target ?? null)
  const [companyMgn,   setCompanyMgn]   = useState<number | null>(existingCompany?.margin_target  ?? null)
  const [companyNotes, setCompanyNotes] = useState(existingCompany?.notes ?? '')

  // Rep targets state keyed by autotask_name
  const [repDrafts, setRepDrafts] = useState<Record<string, { personal: number | null; team: number | null; notes: string }>>(() => {
    const map: Record<string, { personal: number | null; team: number | null; notes: string }> = {}
    for (const rep of reps) {
      const existing = repTargets.find(t => t.autotask_name === rep.autotask_name && t.year === selYear && t.quarter_num === selQ)
      map[rep.autotask_name] = {
        personal: existing?.personal_margin_target ?? null,
        team:     existing?.team_margin_target     ?? null,
        notes:    existing?.notes                  ?? '',
      }
    }
    return map
  })

  // Category targets state keyed by category_name
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, number | null>>(() => {
    const map: Record<string, number | null> = {}
    for (const cat of uniqueCategories) {
      const existing = categoryTargets.find(t => t.category_name === cat.category_name && t.year === CURRENT_YEAR)
      map[cat.category_name] = existing != null ? existing.annual_revenue_target : null
    }
    return map
  })

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text }); setTimeout(() => setMsg(null), 4000)
  }

  function handlePeriodChange(year: number, q: number) {
    setSelYear(year); setSelQ(q)
    const ct = companyTargets.find(t => t.year === year && t.quarter_num === q)
    setCompanyRev(ct?.revenue_target ?? null)
    setCompanyMgn(ct?.margin_target  ?? null)
    setCompanyNotes(ct?.notes ?? '')
    const newRepDrafts: Record<string, { personal: number | null; team: number | null; notes: string }> = {}
    for (const rep of reps) {
      const rt = repTargets.find(t => t.autotask_name === rep.autotask_name && t.year === year && t.quarter_num === q)
      newRepDrafts[rep.autotask_name] = {
        personal: rt?.personal_margin_target ?? null,
        team:     rt?.team_margin_target     ?? null,
        notes:    rt?.notes                  ?? '',
      }
    }
    setRepDrafts(newRepDrafts)
    const newCatDrafts: Record<string, number | null> = {}
    for (const cat of uniqueCategories) {
      const existing = categoryTargets.find(t => t.category_name === cat.category_name && t.year === year)
      newCatDrafts[cat.category_name] = existing != null ? existing.annual_revenue_target : null
    }
    setCategoryDrafts(newCatDrafts)
  }

  function handleYearChange(year: number) {
    handlePeriodChange(year, selQ)
  }

  async function saveCompany() {
    setSaving(true)
    const res = await fetch('/api/targets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'company', year: selYear, quarter_num: selQ, revenue_target: companyRev, margin_target: companyMgn, notes: companyNotes }),
    })
    setSaving(false)
    res.ok ? flash('ok', `Company target saved for Q${selQ} ${selYear}`) : flash('err', 'Failed to save')
  }

  async function saveRep(autotaskName: string, displayName: string) {
    setSaving(true)
    const draft = repDrafts[autotaskName]
    const res = await fetch('/api/targets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'rep', autotask_name: autotaskName, display_name: displayName,
        year: selYear, quarter_num: selQ,
        personal_margin_target: draft.personal,
        team_margin_target:     draft.team || null,
        notes: draft.notes,
      }),
    })
    setSaving(false)
    res.ok ? flash('ok', `${repDisplayName(displayName)} target saved`) : flash('err', 'Failed to save')
  }

  async function saveAllReps() {
    setSaving(true)
    let allOk = true
    for (const rep of reps) {
      const draft = repDrafts[rep.autotask_name]
      if (!draft.personal && !draft.team) continue
      const res = await fetch('/api/targets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rep', autotask_name: rep.autotask_name, display_name: rep.display_name,
          year: selYear, quarter_num: selQ,
          personal_margin_target: draft.personal,
          team_margin_target: draft.team || null,
          notes: draft.notes,
        }),
      })
      if (!res.ok) allOk = false
    }
    setSaving(false)
    allOk ? flash('ok', `All rep targets saved for Q${selQ} ${selYear}`) : flash('err', 'Some targets failed to save')
  }

  async function saveAllCategories() {
    setSaving(true)
    let allOk = true
    for (const cat of uniqueCategories) {
      const target = categoryDrafts[cat.category_name]
      const res = await fetch('/api/targets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'category',
          year: selYear,
          category_name: cat.category_name,
          annual_revenue_target: target ?? 0,
        }),
      })
      if (!res.ok) allOk = false
    }
    setSaving(false)
    allOk ? flash('ok', `Category targets saved for ${selYear}`) : flash('err', 'Some targets failed to save')
  }

  const regularCats   = uniqueCategories.filter(c => !c.is_framework)
  const frameworkCats = uniqueCategories.filter(c => c.is_framework)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Target Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Set company, rep, and category revenue targets</p>
        </div>
        <Link href="/dashboard/targets"
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
          Back to dashboard
        </Link>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={'rounded-lg px-4 py-3 text-sm border ' + (msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>
          {msg.text}
        </div>
      )}

      {/* Period selector: quarter view for company/reps, year-only for categories */}
      {tab !== 'categories' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Period:</span>
          {YEARS.map(y => QUARTERS.map(q => (
            <button key={`${y}-${q}`}
              onClick={() => handlePeriodChange(y, q)}
              className={'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ' +
                (selYear === y && selQ === q ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
              Q{q} {y}
            </button>
          )))}
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Year:</span>
          {YEARS.map(y => (
            <button key={y}
              onClick={() => handleYearChange(y)}
              className={'px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ' +
                (selYear === y ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { id: 'company',    label: 'Company Target'   },
          { id: 'reps',       label: 'Rep Targets'      },
          { id: 'categories', label: 'Category Targets' },
        ] as { id: 'company' | 'reps' | 'categories'; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={'px-4 py-1.5 rounded-md text-sm font-medium transition-colors ' +
              (tab === t.id ? 'bg-white text-navy-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Company target */}
      {tab === 'company' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-navy-700 mb-1">Company Target — Q{selQ} {selYear}</h2>
          <p className="text-xs text-gray-400 mb-5">
            This is the overall ICT Services target and is independent of individual rep targets.
            It should reflect the full business including revenue not captured in Autotask CRM.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Revenue Target</label>
              <NumInput value={companyRev} onChange={setCompanyRev} placeholder="e.g. 5000000" />
              {companyRev && <p className="text-xs text-gray-400 mt-1">{formatEuro(companyRev)}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Gross Profit / Margin Target</label>
              <NumInput value={companyMgn} onChange={setCompanyMgn} placeholder="e.g. 600000" />
              {companyMgn && <p className="text-xs text-gray-400 mt-1">{formatEuro(companyMgn)}</p>}
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
            <textarea value={companyNotes} onChange={e => setCompanyNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. includes services revenue not in CRM" />
          </div>
          <button onClick={saveCompany} disabled={saving}
            className="rounded-lg bg-brand-500 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Company Target'}
          </button>
        </div>
      )}

      {/* Rep targets */}
      {tab === 'reps' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={saveAllReps} disabled={saving}
              className="rounded-lg bg-brand-500 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-600 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save All Reps'}
            </button>
          </div>
          {reps.map(rep => {
            const draft = repDrafts[rep.autotask_name]
            return (
              <div key={rep.autotask_name} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-navy-700">{repDisplayName(rep.display_name)}</h3>
                    <p className="text-xs text-gray-400">{rep.autotask_name}</p>
                  </div>
                  <button onClick={() => saveRep(rep.autotask_name, rep.display_name)} disabled={saving}
                    className="text-xs border border-brand-300 text-brand-600 rounded-lg px-3 py-1 hover:bg-brand-50 disabled:opacity-60">
                    Save
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Personal margin target (quarterly)</label>
                    <NumInput
                      value={draft.personal}
                      onChange={v => setRepDrafts(prev => ({ ...prev, [rep.autotask_name]: { ...prev[rep.autotask_name], personal: v } }))}
                      placeholder="e.g. 75000"
                    />
                    {draft.personal && <p className="text-xs text-gray-400 mt-1">{formatEuro(draft.personal)}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Team pool target (optional — for shared accounts)</label>
                    <NumInput
                      value={draft.team}
                      onChange={v => setRepDrafts(prev => ({ ...prev, [rep.autotask_name]: { ...prev[rep.autotask_name], team: v } }))}
                      placeholder="Leave blank if personal only"
                    />
                    {draft.team && <p className="text-xs text-gray-400 mt-1">{formatEuro(draft.team)}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Category targets */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-gray-400">
              Annual revenue targets per product line for {selYear}. Quarterly target is calculated automatically (annual &divide; 4).
            </p>
            <button onClick={saveAllCategories} disabled={saving}
              className="rounded-lg bg-brand-500 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-600 disabled:opacity-60 shrink-0">
              {saving ? 'Saving...' : `Save All for ${selYear}`}
            </button>
          </div>

          {/* Product lines */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-navy-700 uppercase tracking-wide">Product Lines</h2>
              <span className="text-xs text-gray-400">{regularCats.length} categories</span>
            </div>
            <div className="px-5 py-2 grid grid-cols-12 gap-4 border-b border-gray-100">
              <div className="col-span-4 text-xs font-medium text-gray-400">Category</div>
              <div className="col-span-4 text-xs font-medium text-gray-400">Annual target</div>
              <div className="col-span-4 text-xs font-medium text-gray-400">Quarterly (annual &divide; 4)</div>
            </div>
            <div className="divide-y divide-gray-100">
              {regularCats.map(cat => {
                const annual    = categoryDrafts[cat.category_name] ?? 0
                const quarterly = annual ? annual / 4 : null
                return (
                  <div key={cat.category_name} className="px-5 py-3 grid grid-cols-12 gap-4 items-center hover:bg-gray-50/50 transition-colors">
                    <div className="col-span-4">
                      <p className="text-sm font-medium text-gray-800">{cat.category_name}</p>
                      {cat.gl_code && <p className="text-xs text-gray-400 mt-0.5">GL {cat.gl_code}</p>}
                    </div>
                    <div className="col-span-4">
                      <NumInput
                        value={categoryDrafts[cat.category_name] ?? null}
                        onChange={v => setCategoryDrafts(prev => ({ ...prev, [cat.category_name]: v }))}
                        placeholder="0"
                      />
                      {annual > 0 && <p className="text-xs text-gray-400 mt-1">{formatEuro(annual)}</p>}
                    </div>
                    <div className="col-span-4">
                      <p className="text-sm font-semibold text-gray-700">
                        {quarterly ? formatEuro(quarterly) : <span className="text-gray-300 font-normal">—</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Framework accounts */}
          {frameworkCats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-xs font-semibold text-navy-700 uppercase tracking-wide">Framework Accounts</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  OGP actuals are attributed proportionally (76% Lot 1 / 24% Lot 2). Garda and DOJ actuals flow through Autotask category mappings.
                </p>
              </div>
              <div className="px-5 py-2 grid grid-cols-12 gap-4 border-b border-gray-100">
                <div className="col-span-4 text-xs font-medium text-gray-400">Account</div>
                <div className="col-span-4 text-xs font-medium text-gray-400">Annual target</div>
                <div className="col-span-4 text-xs font-medium text-gray-400">Quarterly (annual &divide; 4)</div>
              </div>
              <div className="divide-y divide-gray-100">
                {frameworkCats.map(cat => {
                  const annual    = categoryDrafts[cat.category_name] ?? 0
                  const quarterly = annual ? annual / 4 : null
                  return (
                    <div key={cat.category_name} className="px-5 py-3 grid grid-cols-12 gap-4 items-center hover:bg-gray-50/50 transition-colors">
                      <div className="col-span-4">
                        <p className="text-sm font-medium text-gray-800">{cat.category_name}</p>
                      </div>
                      <div className="col-span-4">
                        <NumInput
                          value={categoryDrafts[cat.category_name] ?? null}
                          onChange={v => setCategoryDrafts(prev => ({ ...prev, [cat.category_name]: v }))}
                          placeholder="0"
                        />
                        {annual > 0 && <p className="text-xs text-gray-400 mt-1">{formatEuro(annual)}</p>}
                      </div>
                      <div className="col-span-4">
                        <p className="text-sm font-semibold text-gray-700">
                          {quarterly ? formatEuro(quarterly) : <span className="text-gray-300 font-normal">—</span>}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
