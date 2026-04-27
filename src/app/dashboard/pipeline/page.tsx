import { createClient } from '@/lib/supabase/server'
import PipelineTable from '@/components/dashboard/PipelineTable'

export const revalidate = 0

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data: opps } = await supabase
    .from('opportunities')
    .select('*')
    .in('normalised_status', ['pipeline', 'on_hold', 'on_hold_stale'])
    .order('revenue_total', { ascending: false })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">Active, On Hold, and Stale opportunities</p>
      </div>
      <PipelineTable opportunities={opps ?? []} />
    </div>
  )
}
