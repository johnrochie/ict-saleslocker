import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import JohnDashboard from './JohnDashboard'

export const revalidate = 0

export default async function JohnPage() {
  const supabase = await createClient()

  // Scope historical (closed/lost) data to the current calendar year so the
  // dashboard reflects "this year" rather than every deal ever synced.
  // Currently-open pipeline is exempt — a live deal stays relevant regardless
  // of when it was created.
  const year     = new Date().getFullYear()
  const yearFrom = `${year}-01-01`
  const yearTo   = `${year}-12-31`

  // Wins — closed_date is the reliable field for won deals
  // (id added as a secondary sort key for deterministic .range() pagination)
  const wins = await fetchAllRows(supabase, (client, from, to) => client
    .from('opportunities')
    .select('*')
    .eq('normalised_status', 'won')
    .gte('closed_date', yearFrom).lte('closed_date', yearTo)
    .order('closed_date', { ascending: false }).order('id', { ascending: true })
    .range(from, to)
  )

  // Pipeline — active + on_hold (Not Ready To Buy) deals; excludes Quarantine/on_hold_stale
  const pipeline = await fetchAllRows(supabase, (client, from, to) => client
    .from('opportunities')
    .select('*')
    .in('normalised_status', ['pipeline', 'on_hold'])
    .order('revenue_total', { ascending: false }).order('id', { ascending: true })
    .range(from, to)
  )

  // All opps for ops/financial/team metrics — open pipeline (any age) plus
  // anything created or closed within the current year. Lost deals have no
  // reliable close date in Autotask, so created_date is the best proxy there.
  const all = await fetchAllRows(supabase, (client, from, to) => client
    .from('opportunities')
    .select('*')
    .or(
      `normalised_status.in.(pipeline,on_hold),` +
      `and(created_date.gte.${yearFrom}T00:00:00,created_date.lte.${yearTo}T23:59:59),` +
      `and(closed_date.gte.${yearFrom},closed_date.lte.${yearTo})`
    )
    .order('created_date', { ascending: false }).order('id', { ascending: true })
    .range(from, to)
  )

  return (
    <JohnDashboard
      wins={wins}
      pipeline={pipeline}
      all={all}
      year={year}
    />
  )
}
