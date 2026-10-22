// ============================================================
// ICT SalesIQ — /api/account-management/customers
// Maintains the am_customers table (customer -> Account Manager + tier).
// Admin / sales_manager only.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

const TIERS = ['1+', '1', '2', '3', '4', '5']

async function managerOnly() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { admin }
}

export async function GET() {
  const a = await managerOnly()
  if ('error' in a) return a.error
  const { data, error } = await a.admin.from('am_customers').select('*').order('company').limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data })
}

// Body: { customers: [{ company, account_manager, tier, annual_revenue?, notes?, is_active? }] }
// Matches on company name (case-insensitive) so a bulk paste can be re-run safely.
export async function POST(request: NextRequest) {
  const a = await managerOnly()
  if ('error' in a) return a.error

  const body = await request.json().catch(() => null) as { customers?: Array<Record<string, unknown>> } | null
  const rows = body?.customers
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No customers supplied' }, { status: 400 })
  }

  const errors: string[] = []
  const clean: Array<Record<string, unknown>> = []
  rows.forEach((r, i) => {
    const company = String(r.company ?? '').trim()
    const am      = String(r.account_manager ?? '').trim()
    const tier    = String(r.tier ?? '').trim()
    if (!company) return errors.push(`Row ${i + 1}: company is blank`)
    if (!am)      return errors.push(`Row ${i + 1} (${company}): account manager is blank`)
    if (!TIERS.includes(tier)) return errors.push(`Row ${i + 1} (${company}): tier "${tier}" must be one of ${TIERS.join(', ')}`)
    const rev = r.annual_revenue === '' || r.annual_revenue == null ? null : Number(r.annual_revenue)
    clean.push({
      company, account_manager: am, tier,
      annual_revenue: rev != null && !Number.isNaN(rev) ? rev : null,
      notes: r.notes ? String(r.notes) : null,
      is_active: r.is_active === false ? false : true,
    })
  })
  if (errors.length) return NextResponse.json({ error: errors.join('\n') }, { status: 400 })

  // The unique index is on LOWER(company), which PostgREST can't use for onConflict,
  // so match existing rows by name and update or insert accordingly.
  const { data: existing, error: exErr } = await a.admin.from('am_customers').select('id, company').limit(5000)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const byName = new Map((existing ?? []).map(c => [String(c.company).toLowerCase(), c.id as string]))

  let updated = 0
  const seen = new Set<string>()
  const toInsert: Array<Record<string, unknown>> = []
  for (const row of clean) {
    const lower = (row.company as string).toLowerCase()
    if (seen.has(lower)) continue          // duplicate line in the paste: first one wins
    seen.add(lower)
    const id = byName.get(lower)
    if (id) {
      const { error } = await a.admin.from('am_customers').update(row).eq('id', id)
      if (error) return NextResponse.json({ error: `${row.company}: ${error.message}` }, { status: 500 })
      updated++
    } else {
      toInsert.push(row)
    }
  }
  if (toInsert.length) {
    const { error } = await a.admin.from('am_customers').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ inserted: toInsert.length, updated })
}

export async function DELETE(request: NextRequest) {
  const a = await managerOnly()
  if ('error' in a) return a.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await a.admin.from('am_customers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
