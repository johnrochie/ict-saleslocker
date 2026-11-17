import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import { loadExclusions } from '@/lib/exclusions'
import CustomerQbrClient from './CustomerQbrClient'

export const revalidate = 0

export default async function CustomerQbrPage() {
  const supabase = await createClient()

  // All won deals. The client filters by date range and customer.
  const all = await fetchAllRows(supabase, (client, from, to) =>
    client.from('opportunities')
      .select('*')
      .eq('normalised_status', 'won')
      .order('id', { ascending: true })
      .range(from, to)
  )

  const { exclusions } = await loadExclusions(supabase)

  return <CustomerQbrClient all={all} year={new Date().getFullYear()} exclusions={exclusions} />
}
