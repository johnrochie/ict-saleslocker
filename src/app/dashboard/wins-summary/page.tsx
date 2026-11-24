import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import { loadExclusions } from '@/lib/exclusions'
import WinsSummaryClient from './WinsSummaryClient'

export const revalidate = 0

export default async function WinsSummaryPage() {
  const supabase = await createClient()
  const year     = new Date().getFullYear()
  const rangeFrom = `2018-01-01`          // covers the "All Time" quick-select on the client
  const rangeTo   = `${year + 1}-12-31`

  // Won deals only, closed within the full range the date picker can select
  // (created date is used only where no close date is recorded).
  const all = await fetchAllRows(supabase, (client, from, to) =>
    client.from('opportunities')
      .select('*')
      .eq('normalised_status', 'won')
      .or(
        `and(closed_date.gte.${rangeFrom},closed_date.lte.${rangeTo}),` +
        `and(closed_date.is.null,created_date.gte.${rangeFrom}T00:00:00,created_date.lte.${rangeTo}T23:59:59)`
      )
      .order('created_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  )

  const { exclusions, canEdit, ready } = await loadExclusions(supabase)

  return <WinsSummaryClient all={all} year={year} exclusions={exclusions} canEdit={canEdit} exclusionsReady={ready} />
}
