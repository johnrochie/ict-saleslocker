// ============================================================
// ICT SalesLocker — Formatting Utilities
// ============================================================

// Euro currency formatter
export function formatEuro(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Euro with decimals
export function formatEuroFull(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Percentage
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

// Compact number (€1.2M, €340K)
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `€${(value / 1_000).toFixed(0)}K`
  }
  return formatEuro(value)
}

// Date display
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Days overdue
export function daysOverdue(projectedClose: string | null): number {
  if (!projectedClose) return 0
  const close = new Date(projectedClose)
  const today = new Date()
  const diff = Math.floor((today.getTime() - close.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

// Days since last activity
export function daysSinceActivity(lastActivity: string | null): number {
  if (!lastActivity) return 999
  const last = new Date(lastActivity)
  const today = new Date()
  return Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
}

// Normalised status → display label
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pipeline:      'Pipeline',
    on_hold:       'On Hold',
    on_hold_stale: 'Stale',
    won:           'Won',
    lost:          'Lost',
    portal:        'Portal / OGP',
  }
  return map[status] ?? status
}

// Normalised status → Tailwind colour classes
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    pipeline:      'bg-blue-100 text-blue-800',
    on_hold:       'bg-yellow-100 text-yellow-800',
    on_hold_stale: 'bg-orange-100 text-orange-800',
    won:           'bg-green-100 text-green-800',
    lost:          'bg-red-100 text-red-800',
    portal:        'bg-gray-100 text-gray-600',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

// Rating → colour dot
export function ratingColor(rating: string | null): string {
  const map: Record<string, string> = {
    Hot:  'text-red-500',
    Warm: 'text-orange-400',
    Cold: 'text-blue-400',
  }
  return map[rating ?? ''] ?? 'text-gray-300'
}

// cn helper (merge Tailwind classes)
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
