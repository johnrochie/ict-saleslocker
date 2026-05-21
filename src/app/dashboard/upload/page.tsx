'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ImportResult } from '@/types'
import type { SyncResult } from '@/lib/autotask/types'

// ── Types ────────────────────────────────────────────────────
type UploadState = 'idle' | 'uploading' | 'success' | 'error'
type SyncState  = 'idle' | 'syncing' | 'success' | 'error'

interface SyncStatus {
  configured: boolean
  last_sync: {
    at: string
    status: string
    rows_processed: number
    rows_inserted: number
    rows_updated: number
    rows_skipped: number
    error_count: number
  } | null
  total_opportunities: number
}

// ── Helpers ──────────────────────────────────────────────────
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Component ────────────────────────────────────────────────
export default function UploadPage() {
  // ── Sync state ────────────────────────────────────────────
  const [syncStatus, setSyncStatus]     = useState<SyncStatus | null>(null)
  const [syncState,  setSyncState]      = useState<SyncState>('idle')
  const [syncResult, setSyncResult]     = useState<(SyncResult & { error?: string }) | null>(null)

  // ── CSV upload state ──────────────────────────────────────
  const [uploadState, setUploadState]   = useState<UploadState>('idle')
  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError]   = useState<string | null>(null)
  const [dragging, setDragging]         = useState(false)
  const [fileName, setFileName]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Load sync status on mount ─────────────────────────────
  useEffect(() => {
    fetch('/api/autotask/status')
      .then(r => r.json())
      .then(setSyncStatus)
      .catch(() => setSyncStatus({ configured: false, last_sync: null, total_opportunities: 0 }))
  }, [])

  // ── Trigger manual sync ───────────────────────────────────
  async function handleSync() {
    setSyncState('syncing')
    setSyncResult(null)
    try {
      const res = await fetch('/api/autotask/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult({ ...data, status: 'failed' } as SyncResult & { error?: string })
        setSyncState('error')
      } else {
        setSyncResult(data)
        setSyncState('success')
        // Refresh status card
        fetch('/api/autotask/status').then(r => r.json()).then(setSyncStatus).catch(() => {})
      }
    } catch {
      setSyncResult({ error: 'Network error — please try again.' } as SyncResult & { error?: string })
      setSyncState('error')
    }
  }

  function resetSync() {
    setSyncState('idle')
    setSyncResult(null)
  }

  // ── CSV upload handlers ───────────────────────────────────
  async function uploadFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setUploadError('Please select a .csv file exported from Autotask.')
      setUploadState('error')
      return
    }
    setFileName(file.name)
    setUploadState('uploading')
    setUploadError(null)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res  = await fetch('/api/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed')
        setUploadState('error')
      } else {
        setUploadResult(data)
        setUploadState('success')
      }
    } catch {
      setUploadError('Network error — please try again.')
      setUploadState('error')
    }
  }

  const handleFile  = (file: File | null) => { if (file) uploadFile(file) }
  const onDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null)
  }, [])

  function resetUpload() {
    setUploadState('idle'); setUploadResult(null); setUploadError(null); setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Sync status card colours ──────────────────────────────
  const lastSyncOk = syncStatus?.last_sync?.status === 'success'
  const lastSyncPartial = syncStatus?.last_sync?.status === 'partial'

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Data Sync</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Live Autotask integration — data syncs automatically every hour.
        </p>
      </div>

      {/* ── Live Sync Card ─────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${
              !syncStatus ? 'bg-gray-300' :
              !syncStatus.configured ? 'bg-amber-400' :
              syncStatus.last_sync ? 'bg-green-400' : 'bg-gray-300'
            }`} />
            <span className="text-sm font-semibold text-gray-900">Autotask Live Sync</span>
          </div>
          {syncStatus?.configured && syncState === 'idle' && (
            <button
              onClick={handleSync}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5
                         text-xs font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Now
            </button>
          )}
          {syncState === 'syncing' && (
            <span className="flex items-center gap-1.5 text-xs text-brand-600 font-medium">
              <span className="inline-block w-3.5 h-3.5 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
              Syncing…
            </span>
          )}
        </div>

        {/* Status body */}
        <div className="px-5 py-4 space-y-4">
          {/* Not configured */}
          {syncStatus && !syncStatus.configured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">Credentials not configured</p>
              <p className="text-xs text-amber-700 mt-1">
                Add <code className="font-mono bg-amber-100 px-1 rounded">AUTOTASK_USERNAME</code>,{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">AUTOTASK_SECRET</code> and{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">AUTOTASK_INTEGRATION_CODE</code>{' '}
                to your Vercel environment variables.
              </p>
            </div>
          )}

          {/* Loading skeleton */}
          {!syncStatus && (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
            </div>
          )}

          {/* Configured — show last sync info */}
          {syncStatus?.configured && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Last sync</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {syncStatus.last_sync
                    ? <>{timeAgo(syncStatus.last_sync.at)}<span className="text-gray-400 font-normal ml-1.5 text-xs">{fmtDateTime(syncStatus.last_sync.at)}</span></>
                    : <span className="text-gray-400">Never synced</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total opportunities</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {syncStatus.total_opportunities.toLocaleString()}
                </p>
              </div>
              {syncStatus.last_sync && (
                <>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                    <span className={`inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      lastSyncOk      ? 'bg-green-100 text-green-700' :
                      lastSyncPartial ? 'bg-amber-100 text-amber-700' :
                                        'bg-red-100 text-red-700'
                    }`}>
                      {syncStatus.last_sync.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Last run</p>
                    <p className="font-medium text-gray-900 mt-0.5 text-xs">
                      {syncStatus.last_sync.rows_processed} processed ·{' '}
                      {syncStatus.last_sync.rows_inserted} new ·{' '}
                      {syncStatus.last_sync.rows_updated} updated
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Schedule info */}
          {syncStatus?.configured && (
            <p className="text-xs text-gray-400">
              Scheduled to run automatically every hour via Vercel Cron.
            </p>
          )}
        </div>
      </div>

      {/* ── Sync result (after manual sync) ──────────────────── */}
      {syncState === 'success' && syncResult && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-green-900">
                {syncResult.status === 'success' ? 'Sync complete' : 'Sync completed with warnings'}
              </p>
              <p className="text-xs text-green-700">
                {syncResult.sync_type === 'full' ? 'Full sync' : 'Incremental sync'} ·{' '}
                {syncResult.duration_ms != null ? `${(syncResult.duration_ms / 1000).toFixed(1)}s` : ''}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Processed', value: syncResult.rows_processed, color: 'text-gray-700' },
              { label: 'Inserted',  value: syncResult.rows_inserted,  color: 'text-green-700' },
              { label: 'Updated',   value: syncResult.rows_updated,   color: 'text-blue-700'  },
              { label: 'Skipped',   value: syncResult.rows_skipped,   color: 'text-amber-700' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-lg p-3 text-center border border-green-100">
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          {syncResult.errors?.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">{syncResult.errors.length} row(s) skipped</p>
              {syncResult.errors.slice(0, 3).map((e, i) => (
                <p key={i} className="text-xs text-amber-700">• {e.message}</p>
              ))}
            </div>
          )}
          <button onClick={resetSync} className="mt-4 text-xs text-green-700 underline">Dismiss</button>
        </div>
      )}

      {syncState === 'error' && syncResult && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-medium text-red-800">Sync failed</p>
          <p className="text-sm text-red-600 mt-0.5">{syncResult.error ?? 'Unknown error'}</p>
          <button onClick={resetSync} className="mt-3 text-sm text-red-700 underline">Dismiss</button>
        </div>
      )}

      {/* ── Divider ───────────────────────────────────────────── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-gray-50 px-3 text-gray-400 uppercase tracking-wider">or import manually</span>
        </div>
      </div>

      {/* ── CSV Upload (fallback) ─────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Manual CSV Import</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Use this as a fallback if the live sync is unavailable. Existing records will be updated.
          </p>
        </div>

        {/* Upload zone */}
        {(uploadState === 'idle' || uploadState === 'error') && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`
              rounded-xl border-2 border-dashed cursor-pointer transition-colors p-8
              flex flex-col items-center justify-center text-center gap-3
              ${dragging
                ? 'border-brand-400 bg-brand-50'
                : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50'}
            `}
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Drop your CSV here, or <span className="text-brand-600">click to browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Autotask Opportunity Search Results export (.csv)</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </div>
        )}

        {/* Upload error */}
        {uploadState === 'error' && uploadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">Upload failed</p>
                <p className="text-sm text-red-600 mt-0.5">{uploadError}</p>
              </div>
            </div>
            <button onClick={resetUpload} className="mt-4 text-sm text-red-700 underline">Try again</button>
          </div>
        )}

        {/* Uploading */}
        {uploadState === 'uploading' && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 flex flex-col items-center gap-4">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
              <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">Processing {fileName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Parsing, validating, and upserting records…</p>
            </div>
          </div>
        )}

        {/* Upload success */}
        {uploadState === 'success' && uploadResult && (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-900">
                    {uploadResult.status === 'success' ? 'Import complete' : 'Import completed with warnings'}
                  </p>
                  <p className="text-xs text-green-700">{fileName}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Processed', value: uploadResult.rows_processed, color: 'text-gray-700'  },
                  { label: 'Inserted',  value: uploadResult.rows_inserted,  color: 'text-green-700' },
                  { label: 'Updated',   value: uploadResult.rows_updated,   color: 'text-blue-700'  },
                  { label: 'Skipped',   value: uploadResult.rows_skipped,   color: 'text-amber-700' },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-lg p-3 text-center border border-green-100">
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {uploadResult.errors.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  {uploadResult.errors.length} row{uploadResult.errors.length > 1 ? 's' : ''} skipped
                </p>
                <ul className="space-y-1">
                  {uploadResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-xs text-amber-700">Row {e.row}: {e.message}</li>
                  ))}
                  {uploadResult.errors.length > 5 && (
                    <li className="text-xs text-amber-500">…and {uploadResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={resetUpload}
                className="rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm
                           font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Upload another file
              </button>
              <a href="/dashboard"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                           hover:bg-brand-700 transition-colors">
                View dashboard
              </a>
            </div>
          </div>
        )}

        {/* How to export note */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">How to export from Autotask</p>
          <p>1. Go to CRM → Opportunities → Search</p>
          <p>2. Set date range from 1 Jan 2026 to today, select all statuses</p>
          <p>3. Click Export → CSV</p>
          <p>4. Upload the downloaded file here</p>
        </div>
      </div>
    </div>
  )
}
