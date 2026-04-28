import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CommissionSettingsClient from './CommissionSettingsClient'

export const revalidate = 0

export default async function CommissionSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()

  // Admin only
  if (profile?.role !== 'admin') redirect('/dashboard/commission')

  const [
    { data: categoryMappings },
    { data: type1Rates },
    { data: repConfigs },
  ] = await Promise.all([
    admin.from('commission_category_mappings').select('*').order('autotask_category'),
    admin.from('commission_type1_rates').select('*').order('business_type').order('commission_category'),
    admin.from('commission_rep_configs').select('*').order('display_name'),
  ])

  return (
    <CommissionSettingsClient
      categoryMappings={categoryMappings || []}
      type1Rates={type1Rates || []}
      repConfigs={repConfigs || []}
      currentUserEmail={user.email || ''}
    />
  )
}
