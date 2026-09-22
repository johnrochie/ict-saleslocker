import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import { loadExclusions } from '@/lib/exclusions'
import ExecPackClient from './ExecPackClient'

export const revalidate = 0

export default async function ExecPackPage() {
  const supabase = await createClient()
  const year     = new Date().getFullYear()

  // Open pipeline (always shown in full) + won/lost deals back to 2018, so the
  // wins date range can be set to anything the Wins Summary page allows.
  const all = await fetchAllRows(supabase, (client, from, to) =>
    client.from('opportunities')
      .select('*')
      .in('normalised_status', ['pipeline', 'on_hold', 'won', 'lost'])
      .or(`normalised_status.in.(pipeline,on_hold),created_date.gte.2018-01-01T00:00:00,closed_date.gte.2018-01-01`)
      .order('created_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  )

  const { exclusions, canEdit, ready } = await loadExclusions(supabase)

  return <ExecPackClient all={all} year={year} exclusions={exclusions} canEdit={canEdit} exclusionsReady={ready} />
}
