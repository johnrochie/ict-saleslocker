// ============================================================
// ICT SalesIQ — /api/account-management/targets
// Tier cadence (visits / phone calls per year) and per-AM monthly
// target overrides. Admin / sales_manager only.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { AM_TIERS } from '@/lib/config'

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
  const [tiers, overrides] = await Promise.all([
    a.admin.from('am_tier_settings').select('tier, visits_per_year, calls_per_year'),
    a.admin.from('am_target_overrides').select('account_manager, month, monthly_target'),
  ])
  if (tiers.error || overrides.error) {
    return NextResponse.json({ error: (tiers.error ?? overrides.error)!.message }, { status: 500 })
  }
  const saved = new Map((tiers.data ?? []).map(t => [t.tier as string, t]))
  return NextResponse.json({
    tiers: AM_TIERS.map(t => ({
      tier: t.tier, band: t.band,
      visits_per_year: saved.get(t.tier)?.visits_per_year ?? t.visitsPerYear,
      calls_per_year:  saved.get(t.tier)?.calls_per_year  ?? t.callsPerYear,
    })),
    overrides: overrides.data ?? [],
  })
}

// Body: { tiers?: [{ tier, visits_per_year, calls_per_year }],
//         overrides?: [{ account_manager, month ('' = standing, or YYYY-MM), monthly_target (null = remove) }] }
export async function POST(request: NextRequest) {
  const a = await managerOnly()
  if ('error' in a) return a.error
  const body = await request.json().catch(() => null) as {
    tiers?: Array<{ tier: string; visits_per_year: number; calls_per_year: number }>
    overrides?: Array<{ account_manager: string; month: string; monthly_target: number | null }>
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const validTiers = AM_TIERS.map(t => t.tier as string)
  for (const t of body.tiers ?? []) {
    const v = Number(t.visits_per_year), c = Number(t.calls_per_year)
    if (!validTiers.includes(t.tier) || !Number.isInteger(v) || !Number.isInteger(c) || v < 0 || c < 0 || v > 52 || c > 52) {
      return NextResponse.json({ error: `Invalid settings for tier ${t.tier}: use whole numbers from 0 to 52` }, { status: 400 })
    }
    const { error } = await a.admin.from('am_tier_settings')
      .upsert({ tier: t.tier, visits_per_year: v, calls_per_year: c, updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const o of body.overrides ?? []) {
    const month = o.month ?? ''
    if (!o.account_manager || (month !== '' && !/^\d{4}-\d{2}$/.test(month))) {
      return NextResponse.json({ error: 'Invalid override' }, { status: 400 })
    }
    if (o.monthly_target == null) {
      const { error } = await a.admin.from('am_target_overrides').delete().eq('account_manager', o.account_manager).eq('month', month)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      continue
    }
    const target = Number(o.monthly_target)
    if (!Number.isFinite(target) || target < 0 || target > 100) {
      return NextResponse.json({ error: `Target for ${o.account_manager} must be between 0 and 100` }, { status: 400 })
    }
    const { error } = await a.admin.from('am_target_overrides')
      .upsert({ account_manager: o.account_manager, month, monthly_target: target, updated_at: new Date().toISOString() },
              { onConflict: 'account_manager,month' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
