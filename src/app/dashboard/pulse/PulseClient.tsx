'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils/formatting'

interface SavedReport {
  id: string; week_label: string; week_start: string; status: string
  created_by: string; created_at: string
}

interface DraftReport {
  id?: string
  week_label: string; week_start: string; week_end: string
  meeting_notes: string; pipeline_narrative: string
  target_narrative: string; support_notes: string
  engagements_text?: string; status: string
}

const SECTION_LABELS = [
  { key: 'meeting_notes',      title: 'Weekly Meeting'        },
  { key: 'pipeline_narrative', title: 'Pipeline'              },
  { key: 'target_narrative',   title: 'Target'                },
  { key: 'support_notes',      title: 'Support'               },
]

function EditableSection({ title, value, onChange }: { title: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-navy-700 mb-2 pb-1 border-b border-gray-200">{title}</h3>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={Math.max(4, value.split('\n').length + 1)}
        className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-4 py-3
                   focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none font-mono"
      />
    </div>
  )
}

function ReportView({ report }: { report: DraftReport }) {
  function renderText(text: string) {
    return text.split('\n').map((line, i) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        return <li key={i} className="ml-4 text-gray-700">{trimmed.slice(2)}</li>
      }
      if (trimmed === '') return <br key={i} />
      return <p key={i} className="text-gray-700 mb-1">{trimmed}</p>
    })
  }

  const sections = [
    { title: 'Weekly Meeting',  text: report.meeting_notes      },
    { title: 'Pipeline',        text: report.pipeline_narrative },
    { title: 'Target',          text: report.target_narrative   },
    { title: 'Support',         text: report.support_notes      },
  ]

  return (
    <div className="prose max-w-none">
      <h2 className="text-lg font-bold text-navy-700 mb-6">{report.week_label}</h2>
      {sections.map(s => (
        <div key={s.title} className="mb-6">
          <h3 className="text-base font-semibold text-navy-700 mb-2 pb-1 border-b border-gray-200">{s.title}</h3>
          <ul className="space-y-0.5 text-sm list-none p-0">{renderText(s.text)}</ul>
        </div>
      ))}
    </div>
  )
}

export default function PulseClient({ savedReports, currentUserEmail }: {
  savedReports: SavedReport[]
  currentUserEmail: string
}) {
  const [view, setView]         = useState<'generate' | 'archive' | 'edit'>('generate')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [draft, setDraft]       = useState<DraftReport | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [reports, setReports]   = useState<SavedReport[]>(savedReports)

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text }); setTimeout(() => setMsg(null), 5000)
  }

  function updateDraft(field: string, value: string) {
    setDraft(prev => prev ? { ...prev, [field]: value } : null)
  }

  async function generate() {
    setGenerating(true)
    const res = await fetch('/api/pulse')
    const data = await res.json()
    setGenerating(false)
    if (!res.ok) { flash('err', data.error || 'Failed to generate'); return }

    const { narrative, lastWeek, thisWeek } = data
    setDraft({
      week_label:          lastWeek.label,
      week_start:          lastWeek.from,
      week_end:            lastWeek.to,
      meeting_notes:       narrative.meeting_notes,
      pipeline_narrative:  narrative.pipeline_narrative,
      target_narrative:    narrative.target_narrative,
      support_notes:       narrative.support_notes,
      engagements_text:    narrative.engagements_text,
      status:              'draft',
    })
    setPreviewMode(false)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    const res = await fetch('/api/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { flash('err', data.error || 'Failed to save'); return }
    const saved = data.report
    setDraft(prev => prev ? { ...prev, id: saved.id } : null)
    setReports(prev => {
      const existing = prev.find(r => r.week_start === saved.week_start)
      if (existing) return prev.map(r => r.week_start === saved.week_start ? { ...r, ...saved } : r)
      return [{ id: saved.id, week_label: saved.week_label, week_start: saved.week_start, status: saved.status, created_by: currentUserEmail, created_at: saved.created_at }, ...prev]
    })
    flash('ok', 'Report saved')
  }

  async function loadReport(id: string) {
    const res = await fetch('/api/pulse?action=get&id=' + id)
    const data = await res.json()
    if (res.ok) {
      setDraft(data.report)
      setView('edit')
      setPreviewMode(false)
    }
  }

  function copyToClipboard() {
    if (!draft) return
    const sections = [
      `${draft.week_label}\n`,
      `Weekly Meeting\n${draft.meeting_notes}`,
      `\nPipeline\n${draft.pipeline_narrative}`,
      `\nTarget\n${draft.target_narrative}`,
      `\nSupport\n${draft.support_notes}`,
    ]
    navigator.clipboard.writeText(sections.join('\n'))
    flash('ok', 'Copied to clipboard — paste into email')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Pulse</h1>
          <p className="text-sm text-gray-500 mt-0.5">Weekly CEO report — AI-drafted, admin-edited</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView('generate'); setDraft(null) }}
            className={'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ' +
              (view === 'generate' && !draft ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
            Generate
          </button>
          <button onClick={() => setView('archive')}
            className={'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ' +
              (view === 'archive' ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
            Archive ({reports.length})
          </button>
        </div>
      </div>

      {msg && (
        <div className={'rounded-lg px-4 py-3 text-sm border ' + (msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>
          {msg.text}
        </div>
      )}

      {/* Generate / Edit view */}
      {(view === 'generate' || view === 'edit') && !draft && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-navy-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-navy-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-navy-700 mb-2">Generate this week's report</h2>
          <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
            Pulls last week's closes, this week's pipeline, and new engagements, then drafts narrative for each section.
            You edit and refine before saving.
          </p>
          <button onClick={generate} disabled={generating}
            className="rounded-lg bg-brand-500 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-600 disabled:opacity-60 transition-colors">
            {generating ? 'Generating...' : 'Generate Report Draft'}
          </button>
        </div>
      )}

      {draft && (view === 'generate' || view === 'edit') && (
        <div>
          {/* Report toolbar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-navy-700">{draft.week_label}</h2>
              <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' +
                (draft.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-green-50 text-green-700')}>
                {draft.status}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setPreviewMode(!previewMode)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                {previewMode ? 'Edit' : 'Preview'}
              </button>
              <button onClick={copyToClipboard}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                Copy to clipboard
              </button>
              <button onClick={generate} disabled={generating}
                className="text-xs border border-brand-300 rounded-lg px-3 py-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-60">
                {generating ? 'Regenerating...' : 'Regenerate'}
              </button>
              <button onClick={save} disabled={saving}
                className="text-xs rounded-lg bg-brand-500 text-white px-4 py-1.5 font-semibold hover:bg-brand-600 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Report'}
              </button>
            </div>
          </div>

          {/* Report content */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            {previewMode ? (
              <ReportView report={draft} />
            ) : (
              <div>
                {SECTION_LABELS.map(s => (
                  <EditableSection
                    key={s.key}
                    title={s.title}
                    value={(draft as unknown as Record<string, string>)[s.key] || ''}
                    onChange={v => updateDraft(s.key, v)}
                  />
                ))}

                {/* Customer meetings — manual for now */}
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-navy-700 mb-2 pb-1 border-b border-gray-200">
                    Customer Meetings
                  </h3>
                  <textarea
                    placeholder="e.g. Evan - OGP Calls&#10;Jamie - 3&#10;James - 0&#10;John C - 1&#10;JR -"
                    rows={7}
                    className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-4 py-3
                               focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">Load the To-Dos &amp; Notes CSV in the Weekly Report to get meeting counts, then paste here.</p>
                </div>

                {/* Net New Engagements — auto-generated */}
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-navy-700 mb-2 pb-1 border-b border-gray-200">
                    Net New Customer Engagements
                  </h3>
                  <textarea
                    value={draft.engagements_text || ''}
                    onChange={e => updateDraft('engagements_text', e.target.value)}
                    rows={7}
                    className="w-full text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-lg px-4 py-3
                               focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Archive view */}
      {view === 'archive' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-navy-700">Saved reports</h2>
          </div>
          {reports.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              No reports saved yet. Generate and save a report to start the archive.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Week</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Created by</th>
                  <th className="text-right px-5 py-3">Date</th>
                  <th className="text-right px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-navy-700">{r.week_label}</td>
                    <td className="px-5 py-3">
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' +
                        (r.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-green-50 text-green-700')}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{r.created_by}</td>
                    <td className="px-5 py-3 text-right text-gray-400">{formatDate(r.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => loadReport(r.id)}
                        className="text-xs text-brand-600 hover:underline font-medium">
                        Open &amp; Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
