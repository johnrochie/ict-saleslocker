import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import PipelineSummaryClient from './PipelineSummaryClient'

export const revalidate = 0

export default async function PipelineSummaryPage() {
  const supabase = await createClient()
  const year     = new Date().getFullYear()
  const yearFrom = `${year}-01-01`
  const yearTo   = `${year}-12-31`

  // All non-portal deals: open pipeline (any age) + anything created/closed this year
  const all = await fetchAllRows(supabase, (client, from, to) =>
    client.from('opportunities')
      .select('*')
      .neq('normalised_status', 'portal')
      .or(
        `normalised_status.in.(pipeline,on_hold),` +
        `and(created_date.gte.${yearFrom}T00:00:00,created_date.lte.${yearTo}T23:59:59),` +
        `and(closed_date.gte.${yearFrom},closed_date.lte.${yearTo})`
      )
      .order('created_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  )

  return <PipelineSummaryClient all={all} year={year} />
}
