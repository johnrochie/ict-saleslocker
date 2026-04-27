'use client'

import { useState, useRef, useCallback } from 'react'
import type { ImportResult } from '@/types'

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export default function UploadPage() {
  const [state,    setState]    = useState<UploadState>('idle')
  const [result,   setResult]   = useState<ImportResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setError('Please select a .csv file exported from Autotask.')
      setState('error')
      return
    }

    setFileName(file.name)
    setState('uploading')
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
        setState('error')
        return
      }

      setResult(data)
      setState('success')
    } catch {
      setError('Network error — please try again.')
      setState('error')
    }
  }

  const handleFile = (file: File | null) => {
    if (!file) return
    uploadFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0] ?? null)
  }, [])

  function reset() {
    setState('idle')
    setResult(null)
    setError(null)
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Upload Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Import an Autotask Opportunities CSV export. Existing records will be updated; new ones added.
        </p>
      </div>

      {/* Upload zone */}
      {(state === 'idle' || state === 'error') && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`
            rounded-xl border-2 border-dashed cursor-pointer transition-colors p-10
            flex flex-col items-center justify-center text-center gap-3
            ${dragging
              ? 'border-brand-400 bg-brand-50'
              : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50'}
          `}
        >
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {/* Error state */}
      {state === 'error' && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">Upload failed</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button onClick={reset} className="mt-4 text-sm text-red-700 underline">Try again</button>
        </div>
      )}

      {/* Uploading state */}
      {state === 'uploading' && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">Processing {fileName}</p>
            <p className="text-xs text-gray-400 mt-0.5">Parsing, validating, and upserting records…</p>
          </div>
        </div>
      )}

      {/* Success state */}
      {state === 'success' && result && (
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
                  {result.status === 'success' ? 'Import complete' : 'Import completed with warnings'}
                </p>
                <p className="text-xs text-green-700">{fileName}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Processed',  value: result.rows_processed, color: 'text-gray-700' },
                { label: 'Inserted',   value: result.rows_inserted,  color: 'text-green-700' },
                { label: 'Updated',    value: result.rows_updated,   color: 'text-blue-700' },
                { label: 'Skipped',    value: result.rows_skipped,   color: 'text-amber-700' },
              ].map((item) => (
                <div key={item.label} className="bg-white rounded-lg p-3 text-center border border-green-100">
                  <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Errors detail */}
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800 mb-2">
                {result.errors.length} row{result.errors.length > 1 ? 's' : ''} skipped
              </p>
              <ul className="space-y-1">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i} className="text-xs text-amber-700">
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {result.errors.length > 5 && (
                  <li className="text-xs text-amber-500">
                    …and {result.errors.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm
                         font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Upload another file
            </button>
            <a
              href="/dashboard"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                         hover:bg-brand-700 transition-colors"
            >
              View dashboard
            </a>
          </div>
        </div>
      )}

      {/* How-to note */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-600">How to export from Autotask</p>
        <p>1. Go to CRM → Opportunities → Search</p>
        <p>2. Set date range from 1 Jan 2026 to today, select all statuses</p>
        <p>3. Click Export → CSV</p>
        <p>4. Upload the downloaded file here</p>
      </div>
    </div>
  )
}
