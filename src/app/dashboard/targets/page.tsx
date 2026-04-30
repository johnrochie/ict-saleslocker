import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TargetsDashboardClient from './TargetsDashboardClient'

export const revalidate = 0

export default async function TargetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'sales_manager'].includes(profile?.role || '')) redirect('/dashboard')
  return <TargetsDashboardClient isAdmin={profile?.role === 'admin'} />
}
