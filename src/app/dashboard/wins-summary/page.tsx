import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import WinsSummaryClient from './WinsSummaryClient'

export const revalidate = 0

export default async function WinsSummaryPage() {
  const supabase = await createClient()
  const year     = new Date().getFullYear()
  const rangeFrom = `2018-01-01`          // covers the "All Time" quick-select on the client
  const rangeTo   = `${year + 1}-12-31`

  // Won deals only, created within the full range the date picker can select.
  const all = await fetchAllRows(supabase, (client, from, to) =>
    client.from('opportunities')
      .select('*')
      .eq('normalised_status', 'won')
      .gte('created_date', `${rangeFrom}T00:00:00`)
      .lte('created_date', `${rangeTo}T23:59:59`)
      .order('created_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  )

  return <WinsSummaryClient all={all} year={year} />
}
