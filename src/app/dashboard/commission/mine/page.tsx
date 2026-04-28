import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MyCommissionClient from './MyCommissionClient'

export const revalidate = 0

export default async function MyCommissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, autotask_name, full_name')
    .eq('id', user.id)
    .single()

  // Only sales_rep (and above for convenience) can access this page
  if (profile?.role === 'read_only') redirect('/dashboard')

  // Admins/managers visiting /mine redirect to full review
  if (['admin', 'sales_manager'].includes(profile?.role ?? '')) {
    redirect('/dashboard/commission/review')
  }

  const autotaskName = profile?.autotask_name
  if (!autotaskName) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">My Commission</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          Your Autotask name has not been configured. Please ask your administrator to set your
          <strong> autotask_name</strong> in your user profile so commission data can be linked to your account.
        </div>
      </div>
    )
  }

  // Fetch only this rep's calculations
  const { data: calculations } = await admin
    .from('commission_calculations')
    .select('*')
    .eq('autotask_name', autotaskName)
    .order('year', { ascending: false })
    .order('quarter_num', { ascending: false })

  // Fetch their rep config for context
  const { data: repConfig } = await admin
    .from('commission_rep_configs')
    .select('commission_type, quarterly_threshold, threshold_rate, annual_margin_target, annual_bonus')
    .eq('autotask_name', autotaskName)
    .eq('is_active', true)
    .single()

  return (
    <MyCommissionClient
      calculations={calculations || []}
      repConfig={repConfig}
      displayName={profile?.full_name || autotaskName}
    />
  )
}
