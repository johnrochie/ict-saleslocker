// ============================================================
// ICT SalesIQ — GET /api/account-management?month=YYYY-MM
// Everything on the AM dashboard comes from Autotask data already
// synced into SalesIQ: meetings (visits), opportunities with Lead
// Source = "Account Management Visit", plus the am_customers table
// for ownership and tier.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  SALES_TEAM, monthBounds, repDisplayName, amTierConfig,
  AM_LEAD_SOURCE, AM_MEETING_TYPE, AM_DEFAULT_MONTHLY_TARGET,
} from '@/lib/config'

interface Meeting {
  company: string; opportunity: string | null; contact: string | null
  assigned_to: string | null; start_date: string | null; start_time: string | null
  description: string | null
}
interface Customer {
  company: string; account_manager: string; tier: string
  annual_revenue: number | null; is_active: boolean
}
interface Opp {
  autotask_id: number | null; company: string; opportunity_name: string
  opportunity_owner: string | null; account_manager: string | null
  revenue_total: number | null; normalised_status: string; stage: string | null
  created_date: string | null; closed_date: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
// Autotask has "Taylor , Jamie" on some records; tidy spacing so one person is not shown twice
const tidyName = (s: string | null): string | null => (s ? s.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim() : s)
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000)

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin
    .from('profiles').select('role, autotask_name').eq('id', user.id).single()
  const role      = profile?.role ?? 'read_only'
  const isManager = ['admin', 'sales_manager'].includes(role)
  if (!isManager && role !== 'sales_rep') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const ownKey = profile?.autotask_name ?? null
  if (!isManager && !ownKey) {
    return NextResponse.json({ error: 'Your Autotask name is not set on your profile. Ask an admin to set it.' }, { status: 409 })
  }

  const monthKey  = new URL(request.url).searchParams.get('month') ?? undefined
  const month     = monthBounds(monthKey)
  const next      = monthBounds(addDays(month.to, 1).slice(0, 7))
  const today     = new Date().toISOString().slice(0, 10)
  const yearStart = `${month.from.slice(0, 4)}-01-01`
  const lookback  = addDays(today, -400)   // enough for a rolling 12 months of visits

  const [meetingsRes, customersRes, oppsRes, tiersRes, overridesRes] = await Promise.all([
    admin.from('meetings')
      .select('company, opportunity, contact, assigned_to, start_date, start_time, description')
      .eq('action_type', AM_MEETING_TYPE)
      .gte('start_date', lookback).lte('start_date', next.to)
      .order('start_date', { ascending: true }).limit(10000),
    admin.from('am_customers')
      .select('company, account_manager, tier, annual_revenue, is_active')
      .eq('is_active', true).limit(5000),
    admin.from('opportunities')
      .select('autotask_id, company, opportunity_name, opportunity_owner, account_manager, revenue_total, normalised_status, stage, created_date, closed_date')
      .ilike('lead_source', AM_LEAD_SOURCE)
      .gte('created_date', `${yearStart}T00:00:00`).limit(5000),
    admin.from('am_tier_settings').select('tier, visits_per_year'),
    admin.from('am_target_overrides').select('account_manager, month, monthly_target'),
  ])
  const err = meetingsRes.error ?? customersRes.error ?? oppsRes.error ?? tiersRes.error ?? overridesRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  // Tier cadence is editable in the app; the config values are the fallback
  const tierSettings = new Map((tiersRes.data ?? []).map(t => [t.tier as string, t.visits_per_year as number]))
  const tierVisits   = (tier: string) => tierSettings.get(tier) ?? amTierConfig(tier)?.visitsPerYear ?? 0
  const overrides    = new Map((overridesRes.data ?? []).map(o => [`${o.account_manager}|${o.month}`, Number(o.monthly_target)]))
  // A month-specific override wins over the standing one (month = '')
  const overrideFor = (key: string, monthKey: string) => {
    const m = overrides.get(`${key}|${monthKey}`)
    if (m != null) return { value: m, scope: 'month' as const }
    const st = overrides.get(`${key}|`)
    return st != null ? { value: st, scope: 'standing' as const } : null
  }

  const meetings  = ((meetingsRes.data ?? []) as Meeting[]).map(m => ({ ...m, assigned_to: tidyName(m.assigned_to) }))
  const customers = ((customersRes.data ?? []) as Customer[]).map(c => ({ ...c, account_manager: tidyName(c.account_manager) as string }))
  const opps      = ((oppsRes.data ?? []) as Opp[]).map(o => ({
    ...o, opportunity_owner: tidyName(o.opportunity_owner), account_manager: tidyName(o.account_manager),
  }))
  const custByName = new Map(customers.map(c => [norm(c.company), c]))

  // Reps shown: whole team for managers, just the signed-in AM otherwise
  const repKeys = new Set<string>(SALES_TEAM.map(r => r.key))
  customers.forEach(c => repKeys.add(c.account_manager))
  meetings.forEach(m => { if (m.assigned_to) repKeys.add(m.assigned_to) })
  const visibleKeys = [...repKeys].filter(k => isManager || k === ownKey)

  const withTier = (m: Meeting) => {
    const c = custByName.get(norm(m.company))
    return { ...m, tier: c?.tier ?? null, inList: !!c }
  }
  const oppOwner = (o: Opp) =>
    (o.opportunity_owner && repKeys.has(o.opportunity_owner)) ? o.opportunity_owner : o.account_manager
  const sum = (l: Opp[]) => l.reduce((s, o) => s + (o.revenue_total ?? 0), 0)

  const reps = visibleKeys.map(key => {
    const mine         = meetings.filter(m => m.assigned_to === key && m.start_date)
    const myCusts      = customers.filter(c => c.account_manager === key)
    const annualVisits = myCusts.reduce((s, c) => s + tierVisits(c.tier), 0)
    const hasCusts     = myCusts.length > 0
    const calculated   = hasCusts ? Math.round((annualVisits / 12) * 10) / 10 : AM_DEFAULT_MONTHLY_TARGET
    const ovr          = overrideFor(key, month.monthKey)
    const ovrNext      = overrideFor(key, next.monthKey)
    const target       = ovr ? ovr.value : calculated

    const inMonth = mine.filter(m => m.start_date! >= month.from && m.start_date! <= month.to)
    const inNext  = mine.filter(m => m.start_date! >= next.from && m.start_date! <= next.to)
    const held    = inMonth.filter(m => m.start_date! <= today).map(withTier)
    const planned = inMonth.filter(m => m.start_date! > today).map(withTier)

    const myOpps    = opps.filter(o => oppOwner(o) === key)
    const monthOpps = myOpps.filter(o => {
      const d = o.created_date?.slice(0, 10)
      return !!d && d >= month.from && d <= month.to
    })
    const won  = myOpps.filter(o => o.normalised_status === 'won')
    const open = myOpps.filter(o => o.normalised_status === 'pipeline')

    return {
      key, display: repDisplayName(key),
      customerCount: myCusts.length,
      annualVisitTarget: annualVisits,
      target, targetIsDefault: !hasCusts && !ovr,
      calculatedTarget: calculated,
      standingOverride: overrides.get(`${key}|`) ?? null,
      monthOverride: overrides.get(`${key}|${month.monthKey}`) ?? null,
      overrideScope: ovr?.scope ?? null,
      held, planned,
      nextMonthPlanned: inNext.map(withTier),
      nextMonthTarget: ovrNext ? ovrNext.value : calculated,
      opps: {
        month: monthOpps.map(o => ({
          id: o.autotask_id, company: o.company, name: o.opportunity_name,
          value: o.revenue_total ?? 0, status: o.normalised_status, stage: o.stage,
          created: o.created_date?.slice(0, 10) ?? null,
        })),
        monthCount: monthOpps.length, monthValue: sum(monthOpps),
        ytdCount: myOpps.length, ytdValue: sum(myOpps),
        ytdWonCount: won.length, ytdWonValue: sum(won),
        openCount: open.length, openValue: sum(open),
      },
    }
  }).sort((a, b) => a.display.localeCompare(b.display))

  // ── Coverage: every customer against its tier cadence ───────
  const coverage = customers
    .filter(c => isManager || c.account_manager === ownKey)
    .map(c => {
      const cfg         = amTierConfig(c.tier)
      const visits      = meetings.filter(m => norm(m.company) === norm(c.company) && m.start_date)
      const held12      = visits.filter(m => m.start_date! <= today && m.start_date! > addDays(today, -365))
      const lastVisit   = visits.filter(m => m.start_date! <= today).map(m => m.start_date!).sort().pop() ?? null
      const nextPlanned = visits.filter(m => m.start_date! > today).map(m => m.start_date!).sort()[0] ?? null
      const perYear     = tierVisits(c.tier)
      let status: 'overdue' | 'due_soon' | 'ok' | 'phone_only' = 'ok'
      if (perYear === 0) status = 'phone_only'
      else {
        const interval = 365 / perYear
        const since    = lastVisit ? daysBetween(lastVisit, today) : Infinity
        if (since > interval + 14) status = 'overdue'
        else if (since > interval - 30) status = 'due_soon'
      }
      return {
        company: c.company, account_manager: c.account_manager,
        am_display: repDisplayName(c.account_manager),
        tier: c.tier, visitsPerYear: perYear, cadence: perYear > 0 ? `${perYear} visits a year` : (cfg?.cadence ?? ''),
        visits12m: held12.length, lastVisit, nextPlanned,
        daysSince: lastVisit ? daysBetween(lastVisit, today) : null,
        status,
      }
    })
    .sort((a, b) => a.am_display.localeCompare(b.am_display) || a.tier.localeCompare(b.tier) || a.company.localeCompare(b.company))

  return NextResponse.json({
    month, nextMonth: { label: next.label, monthKey: next.monthKey },
    today, role, isManager, ownKey, leadSource: AM_LEAD_SOURCE,
    reps, coverage,
  })
}
