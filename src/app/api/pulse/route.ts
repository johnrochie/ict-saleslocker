import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { SALES_TEAM, weekBounds, currentQuarter } from '@/lib/config'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtE(n: number) {
  if (n >= 1000000) return '€' + (n / 1000000).toFixed(2) + 'm'
  if (n >= 1000)    return '€' + Math.round(n / 1000) + 'k'
  return '€' + Math.round(n)
}

function dealMatchesRep(deal: Record<string, unknown>, repKey: string): boolean {
  return (deal.account_manager as string || '') === repKey ||
         (deal.opportunity_owner  as string || '') === repKey
}

// ── types ─────────────────────────────────────────────────────────────────────

interface TargetRow {
  autotask_name:           string
  display_name:            string
  personal_margin_target:  number
  actual_gp:               number
  personal_attainment_pct: number | null
}

interface CategoryRow {
  category_name:            string
  annual_revenue_target:    number
  quarterly_revenue_target: number
  actual_revenue:           number
  attainment_pct:           number
  is_framework:             boolean
}

// ── narrative generators ──────────────────────────────────────────────────────

function generatePipelineNarrative(
  closedDeals:  Record<string, unknown>[],
  closingDeals: Record<string, unknown>[],
): string {
  const repLines: string[] = []

  for (const rep of SALES_TEAM) {
    const wonDeals  = closedDeals.filter(d => dealMatchesRep(d, rep.key))
    const pipeDeals = closingDeals.filter(d => dealMatchesRep(d, rep.key))
    const wonRev    = wonDeals.reduce((s, d) => s + ((d.revenue_total as number) || 0), 0)
    const pipeRev   = pipeDeals.reduce((s, d) => s + ((d.revenue_total as number) || 0), 0)
    const wonGP     = wonDeals.reduce((s, d) => s + ((d.gross_profit  as number) || 0), 0)
    const bigWins   = wonDeals.filter(d => (d.revenue_total as number) >= 50000)

    let line = `${rep.first}: `

    if (wonRev >= 500000) {
      line += `excellent week — ${fmtE(wonRev)} closed`
      if (wonGP > 0) line += ` at ${Math.round((wonGP / wonRev) * 100)}% margin`
      if (bigWins.length > 0) {
        const top = bigWins[0]
        line += `. Key win: ${top.company} (${fmtE(top.revenue_total as number)})`
      }
    } else if (wonRev >= 100000) {
      line += `strong week with ${fmtE(wonRev)} closed across ${wonDeals.length} deal${wonDeals.length !== 1 ? 's' : ''}`
    } else if (wonRev > 0) {
      line += `${wonDeals.length} deal${wonDeals.length !== 1 ? 's' : ''} closed totalling ${fmtE(wonRev)}`
    } else {
      line += `no closures this week`
    }

    if (pipeRev >= 200000) {
      line += `. Strong pipeline of ${fmtE(pipeRev)} due to close this week`
    } else if (pipeRev > 0 && pipeDeals.length > 0) {
      line += `. ${pipeDeals.length} deal${pipeDeals.length !== 1 ? 's' : ''} due to close (${fmtE(pipeRev)})`
    }

    repLines.push(`- ${line}`)
  }

  const totalWon  = closedDeals.reduce((s, d) => s + ((d.revenue_total as number) || 0), 0)
  const totalPipe = closingDeals.reduce((s, d) => s + ((d.revenue_total as number) || 0), 0)

  return [
    `Overall team closed ${fmtE(totalWon)} last week across ${closedDeals.length} deals. ${fmtE(totalPipe)} in pipeline closing this week.\n`,
    ...repLines,
  ].join('\n')
}

function generateTargetNarrative(
  repAttainment:  TargetRow[],
  closedDeals:    Record<string, unknown>[],
  weeksRemaining: number,
  categories:     CategoryRow[],
): string {
  const repsWithTargets = repAttainment.filter(r => (r.personal_margin_target ?? 0) > 0)

  // Notable closures — always appended
  const bigDeals = [...closedDeals]
    .sort((a, b) => ((b.revenue_total as number) || 0) - ((a.revenue_total as number) || 0))
    .slice(0, 3)
    .filter(d => (d.revenue_total as number) >= 10000)

  const closureBlock = bigDeals.length > 0
    ? '\n\nNotable closures this week:\n' + bigDeals.map(d => {
        const gp  = (d.gross_profit  as number) || 0
        const rev = (d.revenue_total as number) || 0
        const mg  = rev > 0 ? Math.round((gp / rev) * 100) : 0
        return `- ${d.company} — ${fmtE(rev)} at ${mg}% margin`
      }).join('\n')
    : ''

  // Category highlights (product lines only, min quarterly target to be meaningful)
  const productCats = categories
    .filter(c => !c.is_framework && c.quarterly_revenue_target >= 50000)
    .sort((a, b) => b.attainment_pct - a.attainment_pct)

  let catBlock = ''
  if (productCats.length >= 2) {
    const top = productCats[0]
    const bottom = productCats[productCats.length - 1]
    const topLine = `${top.category_name} leading at ${Math.round(top.attainment_pct)}% of Q target (${fmtE(top.actual_revenue)} of ${fmtE(top.quarterly_revenue_target)})`
    const bottomLine = bottom.attainment_pct < 50
      ? `${bottom.category_name} lagging at ${Math.round(bottom.attainment_pct)}% (${fmtE(bottom.actual_revenue)} of ${fmtE(bottom.quarterly_revenue_target)} target)`
      : ''
    catBlock = '\n\nCategory highlights:\n- ' + topLine +
      (bottomLine ? '\n- ' + bottomLine : '')
  }

  // No rep targets configured yet
  if (repsWithTargets.length === 0) {
    return ('Quarterly targets not yet configured.' + catBlock + closureBlock).trim()
  }

  // Team totals
  const totalTarget = repsWithTargets.reduce((s, r) => s + (r.personal_margin_target ?? 0), 0)
  const totalActual = repsWithTargets.reduce((s, r) => s + (r.actual_gp ?? 0), 0)
  const teamPct     = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0
  const wkLabel     = `${weeksRemaining} week${weeksRemaining !== 1 ? 's' : ''} remaining`

  let headline = ''
  if (teamPct >= 100) {
    headline = `Team has hit Q GP target — ${fmtE(totalActual)} achieved against ${fmtE(totalTarget)} target (${teamPct}%).`
  } else if (teamPct >= 80) {
    headline = `Team on track — ${fmtE(totalActual)} GP closed (${teamPct}% of ${fmtE(totalTarget)} target, ${wkLabel}).`
  } else if (teamPct >= 50) {
    headline = `Team at ${teamPct}% of Q GP target — ${fmtE(totalActual)} of ${fmtE(totalTarget)} with ${wkLabel}.`
  } else {
    headline = `Team at ${teamPct}% of Q GP target — ${fmtE(totalActual)} of ${fmtE(totalTarget)} with ${wkLabel}. Focus required.`
  }

  const sorted   = [...repsWithTargets].sort((a, b) => (b.personal_attainment_pct ?? 0) - (a.personal_attainment_pct ?? 0))
  const repLines = sorted.map(r => {
    const pct       = r.personal_attainment_pct ?? 0
    const firstName = r.display_name.split(' ')[0]
    if (pct >= 100) return `- ${firstName}: target achieved (${pct}%)`
    if (pct >= 80)  return `- ${firstName}: on track — ${pct}% of personal target`
    if (pct >= 50)  return `- ${firstName}: ${pct}% — ${fmtE(r.actual_gp)} of ${fmtE(r.personal_margin_target)} target`
    return             `- ${firstName}: behind — ${pct}% (${fmtE(r.actual_gp)} vs ${fmtE(r.personal_margin_target)} target)`
  })

  return (headline + '\n\n' + repLines.join('\n') + catBlock + closureBlock).trim()
}

function generateEngagementsText(newEngagements: Record<string, unknown>[]): string {
  const lines: string[] = []
  for (const rep of SALES_TEAM) {
    const newOpps = newEngagements.filter(d => dealMatchesRep(d, rep.key))
    if (newOpps.length === 0) {
      lines.push(`- ${rep.first}: 0`)
    } else {
      const named = newOpps.slice(0, 2).map(d => d.company as string).join(', ')
      lines.push(`- ${rep.first}: ${newOpps.length} — ${named}`)
    }
  }
  return lines.join('\n')
}

// ── auth ──────────────────────────────────────────────────────────────────────

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, admin }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'list') {
    const { data } = await ctx.admin
      .from('sales_pulse_reports')
      .select('id, week_label, week_start, status, created_by, created_at')
      .order('week_start', { ascending: false })
    return NextResponse.json({ reports: data || [] })
  }

  if (action === 'get') {
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { data } = await ctx.admin.from('sales_pulse_reports').select('*').eq('id', id).single()
    return NextResponse.json({ report: data })
  }

  const lastWeek = weekBounds(-1)
  const thisWeek = weekBounds(0)
  const { year, quarter } = currentQuarter()

  const qEnds        = ['03-31', '06-30', '09-30', '12-31']
  const qEnd         = new Date(`${year}-${qEnds[quarter - 1]}`)
  const weeksRemaining = Math.max(0, Math.ceil((qEnd.getTime() - new Date().getTime()) / (7 * 86400000)))

  const [
    { data: closedDeals },
    { data: closingDeals },
    { data: newEngagements },
    { data: repAttainment },
    { data: categoryTargetsRaw },
    { data: categoryActualsRaw },
  ] = await Promise.all([
    ctx.admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, category, stage, closed_date')
      .eq('normalised_status', 'won')
      .gte('closed_date', lastWeek.from).lte('closed_date', lastWeek.to),
    ctx.admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, gross_profit, gross_margin_pct, stage, projected_close_date')
      .eq('normalised_status', 'pipeline')
      .gte('projected_close_date', thisWeek.from).lte('projected_close_date', thisWeek.to),
    ctx.admin.from('opportunities')
      .select('company, opportunity_name, account_manager, opportunity_owner, revenue_total, category, stage, created_date')
      .gte('created_date', lastWeek.from + 'T00:00:00').lte('created_date', lastWeek.to + 'T23:59:59')
      .neq('normalised_status', 'portal'),
    ctx.admin.from('v_rep_target_attainment')
      .select('autotask_name, display_name, personal_margin_target, actual_gp, personal_attainment_pct')
      .eq('year', year).eq('quarter_num', quarter),
    ctx.admin.from('category_revenue_targets')
      .select('category_name, annual_revenue_target, is_framework')
      .eq('year', year)
      .order('sort_order'),
    ctx.admin.from('v_category_quarterly_actuals')
      .select('category_name, actual_revenue')
      .eq('year', year).eq('quarter_num', quarter),
  ])

  // Build category data for narrative
  const catActualsMap: Record<string, number> = {}
  for (const r of (categoryActualsRaw || [])) {
    catActualsMap[r.category_name] = (catActualsMap[r.category_name] || 0) + (r.actual_revenue || 0)
  }

  const categories: CategoryRow[] = (categoryTargetsRaw || []).map(ct => {
    const annual    = (ct.annual_revenue_target as number) || 0
    const quarterly = annual / 4
    const actual    = catActualsMap[ct.category_name] || 0
    return {
      category_name:            ct.category_name,
      annual_revenue_target:    annual,
      quarterly_revenue_target: quarterly,
      actual_revenue:           actual,
      attainment_pct:           quarterly > 0 ? Math.round((actual / quarterly) * 100 * 10) / 10 : 0,
      is_framework:             ct.is_framework,
    }
  })

  const closed  = closedDeals    || []
  const closing = closingDeals   || []
  const newEngs = newEngagements || []
  const targets = (repAttainment || []) as TargetRow[]

  const meetingNotes = `Sales meeting for this week took place on ${lastWeek.meetingDate}.\n\nTeam continue to update pipeline ahead of weekly review.`

  const narrative = {
    meeting_notes:      meetingNotes,
    pipeline_narrative: generatePipelineNarrative(closed, closing),
    target_narrative:   generateTargetNarrative(targets, closed, weeksRemaining, categories),
    support_notes:      'Nothing at present.',
    engagements_text:   generateEngagementsText(newEngs),
  }

  const weekData = { closedDeals: closed, closingDeals: closing, newEngagements: newEngs, lastWeek, thisWeek }
  return NextResponse.json({ weekData, narrative, lastWeek, thisWeek })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body = await request.json()
  const { id, week_label, week_start, week_end, meeting_notes, pipeline_narrative,
          target_narrative, support_notes, data_snapshot, status } = body

  if (id) {
    const { data, error } = await ctx.admin
      .from('sales_pulse_reports')
      .update({ meeting_notes, pipeline_narrative, target_narrative, support_notes,
                status, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ report: data })
  }

  const { data, error } = await ctx.admin
    .from('sales_pulse_reports')
    .upsert({
      week_label, week_start, week_end,
      meeting_notes, pipeline_narrative, target_narrative, support_notes,
      data_snapshot, status: 'draft',
      created_by: ctx.user.email,
    }, { onConflict: 'week_start' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report: data })
}
