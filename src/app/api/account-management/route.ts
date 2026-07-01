import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { SALES_TEAM, monthBounds } from '@/lib/config'

const MONTHLY_TARGET = 7

interface AmMeeting {
  company: string; opportunity: string | null; contact: string | null
  assigned_to: string | null; action_type: string | null; classification: string | null
  start_date: string | null; start_time: string | null; description: string | null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const monthKey = new URL(request.url).searchParams.get('month') ?? undefined
  const month    = monthBounds(monthKey)
  const admin    = createAdminSupabaseClient()
  const today    = new Date().toISOString().slice(0, 10)

  const { data: meetings, error } = await admin
    .from('meetings')
    .select('company, opportunity, contact, assigned_to, action_type, classification, start_date, start_time, description')
    .eq('action_type', 'Account Management Meeting')
    .gte('start_date', month.from).lte('start_date', month.to)
    .order('start_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byRep = new Map<string, AmMeeting[]>()
  for (const rep of SALES_TEAM) byRep.set(rep.key, [])
  for (const m of meetings ?? []) {
    const rep = m.assigned_to ?? 'Unassigned'
    if (!byRep.has(rep)) byRep.set(rep, [])
    byRep.get(rep)!.push(m)
  }

  const reps = Array.from(byRep.entries()).map(([key, list]) => {
    const held    = list.filter(m => !!m.start_date && m.start_date <= today)
    const planned = list.filter(m => !!m.start_date && m.start_date > today)
    const repConfig = SALES_TEAM.find(r => r.key === key)
    return {
      key,
      display: repConfig?.display ?? key,
      held,
      planned,
      total:  held.length + planned.length,
      target: MONTHLY_TARGET,
    }
  }).sort((a, b) => a.display.localeCompare(b.display))

  return NextResponse.json({ month, target: MONTHLY_TARGET, reps })
}
