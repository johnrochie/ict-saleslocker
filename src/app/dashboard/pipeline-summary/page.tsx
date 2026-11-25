import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import { loadExclusions } from '@/lib/exclusions'
import PipelineSummaryClient from './PipelineSummaryClient'

export const revalidate = 0

export default async function PipelineSummaryPage() {
  const supabase = await createClient()
  const year     = new Date().getFullYear()
  const rangeFrom = `${year - 2}-01-01`   // 3 years of history
  const rangeTo   = `${year}-12-31`

  // All non-portal deals: open pipeline (always) + created/closed within 3-year window
  const all = await fetchAllRows(supabase, (client, from, to) =>
    client.from('opportunities')
      .select('*')
      .neq('normalised_status', 'portal')
      .or(
        `normalised_status.in.(pipeline,on_hold),` +
        `and(created_date.gte.${rangeFrom}T00:00:00,created_date.lte.${rangeTo}T23:59:59),` +
        `and(closed_date.gte.${rangeFrom},closed_date.lte.${rangeTo})`
      )
      .order('created_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  )

  const { exclusions, canEdit, ready } = await loadExclusions(supabase)

  // New customer engagements: companies and quotes from the Autotask sync. If the
  // tables don't exist yet (migration 022 not run) or are still empty, say so on the page.
  const [custRes, quoteRes] = await Promise.all([
    supabase.from('autotask_customers').select('autotask_id, company_name, create_date').limit(5000),
    supabase.from('autotask_quotes').select('autotask_id, name, opportunity_id, company_id, create_date').limit(10000),
  ])
  const customers = custRes.data ?? []
  const quotes    = quoteRes.data ?? []
  const customersReady = !custRes.error && !quoteRes.error && (customers.length > 0 || quotes.length > 0)

  return (
    <PipelineSummaryClient
      all={all} year={year} exclusions={exclusions} canEdit={canEdit} exclusionsReady={ready}
      customers={customers} quotes={quotes} customersReady={customersReady}
    />
  )
}
