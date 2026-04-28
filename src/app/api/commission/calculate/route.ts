import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) return null
  return { user, admin }
}

function quarterDateRange(year: number, quarter: number) {
  const starts = [[1,1],[4,1],[7,1],[10,1]]
  const ends   = [[3,31],[6,30],[9,30],[12,31]]
  const [sm, sd] = starts[quarter - 1]
  const [em, ed] = ends[quarter - 1]
  return {
    from: `${year}-${String(sm).padStart(2,'0')}-${String(sd).padStart(2,'0')}`,
    to:   `${year}-${String(em).padStart(2,'0')}-${String(ed).padStart(2,'0')}`,
  }
}

async function getRepDeals(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  autotaskName: string, fields: string, fromDate: string, toDate: string
) {
  const [{ data: byAM }, { data: byOO }] = await Promise.all([
    admin.from('opportunities').select(fields)
      .eq('normalised_status', 'won').eq('account_manager', autotaskName)
      .gte('closed_date', fromDate).lte('closed_date', toDate),
    admin.from('opportunities').select(fields)
      .eq('normalised_status', 'won').eq('opportunity_owner', autotaskName)
      .gte('closed_date', fromDate).lte('closed_date', toDate),
  ])
  const seen = new Set<string>()
  const results: Record<string, unknown>[] = []
  for (const d of [...(byAM || []), ...(byOO || [])]) {
    const key = (d as Record<string, unknown>).composite_key as string
    if (!seen.has(key)) { seen.add(key); results.push(d as Record<string, unknown>) }
  }
  return results
}

export async function POST(request: NextRequest) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body = await request.json()
  const { year, quarter_num, rep_ids, preview = false } = body as {
    year: number; quarter_num: number; rep_ids?: string[]; preview?: boolean
  }

  if (!year || !quarter_num || quarter_num < 1 || quarter_num > 4) {
    return NextResponse.json({ error: 'year and quarter_num (1-4) required' }, { status: 400 })
  }

  const admin = ctx.admin
  const quarter_label = `Q${quarter_num} ${year}`
  const { from: qFrom, to: qTo } = quarterDateRange(year, quarter_num)
  const ytdFrom = `${year}-01-01`

  const [
    { data: repConfigs }, { data: categoryMappings },
    { data: type1Rates }, { data: dealClassifications },
  ] = await Promise.all([
    admin.from('commission_rep_configs').select('*').eq('is_active', true),
    admin.from('commission_category_mappings').select('*'),
    admin.from('commission_type1_rates').select('*').is('effective_to', null),
    admin.from('commission_deal_classifications').select('*'),
  ])

  const reps = (repConfigs || []).filter(r =>
    !rep_ids || rep_ids.length === 0 || rep_ids.includes(r.id)
  )
  if (reps.length === 0) {
    return NextResponse.json({ error: 'No active reps found' }, { status: 400 })
  }

  const catMap: Record<string, string> = {}
  ;(categoryMappings || []).forEach(m => { catMap[m.autotask_category] = m.commission_category })

  const rateMap: Record<string, number> = {}
  ;(type1Rates || []).forEach(r => { rateMap[`${r.business_type}__${r.commission_category}`] = r.rate_pct })

  const classMap: Record<string, string> = {}
  ;(dealClassifications || []).forEach(c => { classMap[c.composite_key] = c.business_type })

  const { data: allWon } = await admin
    .from('opportunities').select('company, created_date').eq('normalised_status', 'won')
  const companyFirst: Record<string, string> = {}
  ;(allWon || []).forEach(r => {
    if (!companyFirst[r.company] && r.created_date) companyFirst[r.company] = r.created_date.slice(0, 10)
  })

  function getBusinessType(compositeKey: string, company: string, closedDate: string | null): string {
    if (classMap[compositeKey]) return classMap[compositeKey]
    const first = companyFirst[company]
    if (!first || !closedDate) return 'existing_client'
    const firstY = new Date(first).getFullYear()
    const closeY = new Date(closedDate).getFullYear()
    const firstQ = Math.ceil((new Date(first).getMonth() + 1) / 3)
    const closeQ = Math.ceil((new Date(closedDate).getMonth() + 1) / 3)
    return (firstY === closeY && Math.abs(firstQ - closeQ) <= 1) ? 'new_client' : 'existing_client'
  }

  const results: Record<string, unknown>[] = []
  const dealLines: Record<string, unknown>[][] = []

  for (const rep of reps) {
    const won = await getRepDeals(admin, rep.autotask_name, '*', qFrom, qTo)
    const deals = won.filter(d => catMap[(d.category as string) || ''] !== 'exclude')

    const base: Record<string, unknown> = {
      autotask_name: rep.autotask_name,
      display_name: rep.display_name,
      commission_type: rep.commission_type,
      year, quarter_num, quarter_label,
      deals_included: deals.length,
    }

    if (rep.commission_type === 'type1') {
      const burdenRate = rep.burden_rate ?? 0.25
      let totalRevenue = 0, totalDirCost = 0, totalBurdened = 0, totalMargin = 0, totalComm = 0
      const lines: Record<string, unknown>[] = []

      for (const d of deals) {
        const commCat = catMap[(d.category as string) || ''] || 'hardware'
        const bizType = getBusinessType(d.composite_key as string, d.company as string, d.closed_date as string | null)
        const rate    = rateMap[`${bizType}__${commCat}`] ?? 0
        const revenue = (d.revenue_total as number) ?? 0
        const dirCost = (d.cost_total as number) ?? 0
        const subtotal = revenue - dirCost
        const burdened = subtotal * burdenRate
        const margin   = revenue - dirCost - burdened
        const comm     = margin * rate

        totalRevenue += revenue; totalDirCost += dirCost
        totalBurdened += burdened; totalMargin += margin; totalComm += comm

        lines.push({
          composite_key: d.composite_key, company: d.company,
          opportunity_name: d.opportunity_name, autotask_name: rep.autotask_name,
          quarter_label, revenue, direct_cost: dirCost,
          subtotal_for_burden: subtotal, burdened_cost: burdened,
          total_cost: dirCost + burdened, margin,
          business_type: bizType, commission_category: commCat,
          rate_applied: rate, commission_value: comm, closed_date: d.closed_date,
        })
      }

      Object.assign(base, {
        total_revenue: totalRevenue, total_direct_costs: totalDirCost,
        total_burdened_cost: totalBurdened, total_margin: totalMargin,
        commission_base: totalMargin, commission_earned: totalComm,
        quarterly_bonus: 0, total_payable: totalComm,
      })
      dealLines.push(lines)

    } else if (rep.commission_type === 'type2') {
      const threshold = rep.quarterly_threshold ?? 0
      const rate      = rep.threshold_rate ?? 0.10
      const totalGP   = deals.reduce((s, d) => s + ((d.gross_profit as number) ?? 0), 0)
      const commBase  = Math.max(0, totalGP - threshold)
      const comm      = commBase * rate

      // Deal lines for type2 — show each deal for finance review
      const lines = deals.map(d => ({
        composite_key: d.composite_key, company: d.company,
        opportunity_name: d.opportunity_name, autotask_name: rep.autotask_name,
        quarter_label, revenue: (d.revenue_total as number) ?? 0,
        direct_cost: (d.cost_total as number) ?? 0,
        subtotal_for_burden: 0, burdened_cost: 0,
        total_cost: (d.cost_total as number) ?? 0,
        margin: (d.gross_profit as number) ?? 0,
        business_type: getBusinessType(d.composite_key as string, d.company as string, d.closed_date as string | null),
        commission_category: catMap[(d.category as string) || ''] || null,
        rate_applied: 0, commission_value: 0, closed_date: d.closed_date,
      }))

      Object.assign(base, {
        total_revenue: deals.reduce((s, d) => s + ((d.revenue_total as number) ?? 0), 0),
        total_direct_costs: 0, total_burdened_cost: 0, total_margin: totalGP,
        commission_base: commBase, commission_earned: comm,
        quarterly_bonus: 0, total_payable: comm,
      })
      dealLines.push(lines)

    } else if (rep.commission_type === 'type3') {
      const annualTarget = rep.annual_margin_target ?? 450000
      const annualBonus  = rep.annual_bonus ?? 0
      const qTarget = annualTarget / 4
      const qBonus  = annualBonus / 4

      const ytdWon = await getRepDeals(admin, rep.autotask_name, 'composite_key, gross_profit', ytdFrom, qTo)
      const ytdMargin = ytdWon.reduce((s, d) => s + ((d.gross_profit as number) ?? 0), 0)
      const ytdTarget = qTarget * quarter_num
      const quarterGP = deals.reduce((s, d) => s + ((d.gross_profit as number) ?? 0), 0)
      const bonusEarned = ytdMargin >= ytdTarget ? qBonus : 0

      // Deal lines for type3 — show each deal for finance review
      const lines = deals.map(d => ({
        composite_key: d.composite_key, company: d.company,
        opportunity_name: d.opportunity_name, autotask_name: rep.autotask_name,
        quarter_label, revenue: (d.revenue_total as number) ?? 0,
        direct_cost: (d.cost_total as number) ?? 0,
        subtotal_for_burden: 0, burdened_cost: 0,
        total_cost: (d.cost_total as number) ?? 0,
        margin: (d.gross_profit as number) ?? 0,
        business_type: getBusinessType(d.composite_key as string, d.company as string, d.closed_date as string | null),
        commission_category: catMap[(d.category as string) || ''] || null,
        rate_applied: 0, commission_value: 0, closed_date: d.closed_date,
      }))

      Object.assign(base, {
        total_revenue: deals.reduce((s, d) => s + ((d.revenue_total as number) ?? 0), 0),
        total_direct_costs: 0, total_burdened_cost: 0, total_margin: quarterGP,
        cumulative_margin_ytd: ytdMargin, cumulative_target_ytd: ytdTarget,
        commission_base: quarterGP, commission_earned: 0,
        quarterly_bonus: bonusEarned, total_payable: bonusEarned,
      })
      dealLines.push(lines)
    }

    results.push(base)
  }

  if (preview) {
    return NextResponse.json({ preview: true, results, quarter_label })
  }

  // Save
  const savedCalcs: string[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const lines = dealLines[i]

    const { data: existing } = await admin
      .from('commission_calculations')
      .select('id, status')
      .eq('autotask_name', r.autotask_name)
      .eq('year', year)
      .eq('quarter_num', quarter_num)
      .single()

    if (existing && existing.status !== 'draft') continue
    if (existing) await admin.from('commission_calculations').delete().eq('id', existing.id)

    const { data: calc } = await admin
      .from('commission_calculations')
      .insert({ ...r, status: 'draft' })
      .select()
      .single()

    if (calc && lines.length > 0) {
      await admin.from('commission_deal_lines')
        .insert(lines.map(l => ({ ...l, calculation_id: calc.id })))
    }
    if (calc) savedCalcs.push(calc.id)
  }

  return NextResponse.json({ success: true, results, quarter_label, saved: savedCalcs.length })
}
