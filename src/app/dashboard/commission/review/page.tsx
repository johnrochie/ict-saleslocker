import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissionReviewClient from './CommissionReviewClient'

export const revalidate = 0

export default async function CommissionReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'read_only'

  // Sales reps see their own page, others have no access
  if (role === 'sales_rep') redirect('/dashboard/commission/mine')
  if (!['admin', 'sales_manager'].includes(role)) redirect('/dashboard')

  const { data: calculations } = await admin
    .from('commission_calculations')
    .select('*')
    .order('year', { ascending: false })
    .order('quarter_num', { ascending: false })
    .order('display_name', { ascending: true })

  const { data: repConfigs } = await admin
    .from('commission_rep_configs')
    .select('id, autotask_name, display_name, commission_type')
    .eq('is_active', true)
    .order('display_name')

  return (
    <CommissionReviewClient
      calculations={calculations || []}
      repConfigs={repConfigs || []}
      currentUserEmail={user.email || ''}
    />
  )
}
