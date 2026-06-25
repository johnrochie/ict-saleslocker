import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import PipelineTable from '@/components/dashboard/PipelineTable'

export const revalidate = 0

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminSupabaseClient()

  const [oppsResult, settingResult, approvalsResult] = await Promise.all([
    supabase
      .from('opportunities')
      .select('*')
      .in('normalised_status', ['pipeline', 'on_hold', 'on_hold_stale'])
      .order('revenue_total', { ascending: false }),

    admin
      .from('system_settings')
      .select('value')
      .eq('key', 'po_approval_margin_threshold')
      .single(),

    user
      ? admin
          .from('po_approvals')
          .select('opportunity_id, status')
          .eq('requested_by', user.email ?? user.id)
      : Promise.resolve({ data: [] }),
  ])

  const threshold = parseFloat(settingResult.data?.value ?? '20')

  // Build map of opportunity_id → latest approval status for this user
  const existingApprovals: Record<string, 'pending' | 'approved' | 'rejected'> = {}
  for (const row of approvalsResult.data ?? []) {
    // Later rows overwrite earlier — shows most recent status
    existingApprovals[row.opportunity_id] = row.status as 'pending' | 'approved' | 'rejected'
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">Active, On Hold, and Stale opportunities</p>
      </div>
      <PipelineTable
        opportunities={oppsResult.data ?? []}
        poApprovalThreshold={threshold}
        existingApprovals={existingApprovals}
      />
    </div>
  )
}
