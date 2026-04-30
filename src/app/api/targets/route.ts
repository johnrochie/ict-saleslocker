import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { quarterBounds } from '@/lib/config'

async function checkAccess(minRole: 'admin' | 'sales_manager' | 'any') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return null
  if (minRole === 'admin' && profile.role !== 'admin') return null
  if (minRole === 'sales_manager' && !['admin','sales_manager'].includes(profile.role)) return null
  return { user, admin, role: profile.role }
}

export async function GET(request: NextRequest) {
  const ctx = await checkAccess('any')
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const q    = parseInt(searchParams.get('q')    || String(Math.ceil((new Date().getMonth() + 1) / 3)))

  const { from, to } = quarterBounds(year, q)

  const [
    { data: companyTarget },
    { data: repTargets },
    { data: repActualsRows },
    { data: categoryTargetsRaw },
    { data: categoryActualsRaw },
  ] = await Promise.all([
    ctx.admin.from('company_targets').select('*').eq('year', year).eq('quarter_num', q).single(),
    ctx.admin.from('rep_targets').select('*').eq('year', year).eq('quarter_num', q).order('display_name'),
    ctx.admin.from('v_rep_quarterly_actuals')
      .select('autotask_name, actual_revenue, actual_gp')
      .eq('year', year).eq('quarter_num', q),
    ctx.admin.from('category_revenue_targets')
      .select('category_name, gl_code, annual_revenue_target, is_framework, sort_order')
      .eq('year', year)
      .order('sort_order'),
    ctx.admin.from('v_category_quarterly_actuals')
      .select('category_name, actual_revenue, actual_gp')
      .eq('year', year).eq('quarter_num', q),
  ])

  // OGP framework actuals (Portal/OGP account manager deals not mapped via category)
  const { data: ogpRaw } = await ctx.admin.from('opportunities')
    .select('revenue_total')
    .eq('normalised_status', 'won')
    .eq('account_manager', 'Portal, OGP')
    .gte('closed_date', from).lte('closed_date', to)
  const ogpTotal = (ogpRaw || []).reduce((s, r) => s + ((r.revenue_total as number) || 0), 0)

  // Build rep actuals map
  const repActuals: Record<string, { revenue: number; gp: number }> = {}
  for (const r of (repActualsRows || [])) {
    repActuals[r.autotask_name] = { revenue: r.actual_revenue, gp: r.actual_gp }
  }

  // Build category actuals map
  const catActualsMap: Record<string, number> = {}
  for (const r of (categoryActualsRaw || [])) {
    catActualsMap[r.category_name] = (catActualsMap[r.category_name] || 0) + (r.actual_revenue || 0)
  }

  // OGP Lot1/Lot2 split proportional to target (76% / 24%)
  const ogpLot1Target = 5900000, ogpLot2Target = 1800000, ogpTotal2 = ogpLot1Target + ogpLot2Target
  catActualsMap['OGP (Lot 1)'] = Math.round(ogpTotal * ogpLot1Target / ogpTotal2)
  catActualsMap['OGP (Lot 2)'] = Math.round(ogpTotal * ogpLot2Target / ogpTotal2)

  // Build category targets with attainment
  const categoryTargets = (categoryTargetsRaw || []).map(ct => {
    const annualTarget    = (ct.annual_revenue_target as number) || 0
    const quarterlyTarget = annualTarget / 4
    const actual          = catActualsMap[ct.category_name] || 0
    const attainmentPct   = quarterlyTarget > 0
      ? Math.round((actual / quarterlyTarget) * 100 * 10) / 10
      : 0
    return {
      category_name:             ct.category_name,
      gl_code:                   ct.gl_code,
      annual_revenue_target:     annualTarget,
      quarterly_revenue_target:  quarterlyTarget,
      actual_revenue:            actual,
      attainment_pct:            attainmentPct,
      is_framework:              ct.is_framework,
      sort_order:                ct.sort_order,
    }
  })

  // Company actuals (CRM only)
  const companyActualRevenue = Object.values(repActuals).reduce((s, r) => s + r.revenue, 0)
  const companyActualGP      = Object.values(repActuals).reduce((s, r) => s + r.gp, 0)

  // Weeks remaining in quarter
  const qEnd          = new Date(to)
  const weeksRemaining = Math.max(0, Math.ceil((qEnd.getTime() - new Date().getTime()) / (7 * 86400000)))

  return NextResponse.json({
    year, quarter: q, from, to, weeksRemaining,
    companyTarget:  companyTarget || null,
    companyActual:  { revenue: companyActualRevenue, gp: companyActualGP },
    repTargets:     repTargets || [],
    repActuals,
    categoryTargets,
  })
}

// Upsert company or rep target
export async function POST(request: NextRequest) {
  const ctx = await checkAccess('admin')
  if (!ctx) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const { type, ...data } = body

  if (type === 'company') {
    const { year, quarter_num, revenue_target, margin_target, notes } = data
    const { data: result, error } = await ctx.admin
      .from('company_targets')
      .upsert(
        { year, quarter_num, revenue_target, margin_target, notes, updated_by: ctx.user.email },
        { onConflict: 'year,quarter_num' }
      )
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ target: result })
  }

  if (type === 'rep') {
    const { autotask_name, display_name, year, quarter_num,
            personal_margin_target, team_margin_target, notes } = data
    const { data: result, error } = await ctx.admin
      .from('rep_targets')
      .upsert(
        {
          autotask_name, display_name, year, quarter_num,
          personal_margin_target: personal_margin_target || null,
          team_margin_target:     team_margin_target     || null,
          notes, updated_by: ctx.user.email,
        },
        { onConflict: 'autotask_name,year,quarter_num' }
      )
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ target: result })
  }

  return NextResponse.json({ error: 'type must be company or rep' }, { status: 400 })
}
