import { createClient } from '@/lib/supabase/server'
import JohnDashboard from './JohnDashboard'

export const revalidate = 0

export default async function JohnPage() {
  const supabase = await createClient()

  // Wins
  const { data: wins } = await supabase
    .from('opportunities')
    .select('*')
    .eq('normalised_status', 'won')
    .order('closed_date', { ascending: false })

  // Pipeline
  const { data: pipeline } = await supabase
    .from('opportunities')
    .select('*')
    .in('normalised_status', ['pipeline', 'on_hold', 'on_hold_stale'])
    .order('revenue_total', { ascending: false })

  // All opps for ops/financial metrics
  const { data: all } = await supabase
    .from('opportunities')
    .select('*')
    .order('created_date', { ascending: false })

  return (
    <JohnDashboard
      wins={wins ?? []}
      pipeline={pipeline ?? []}
      all={all ?? []}
    />
  )
}
