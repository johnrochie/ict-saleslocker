import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import POApprovalsClient from './POApprovalsClient'

export const revalidate = 0

export default async function POApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  const isManager = profile && ['admin', 'sales_manager'].includes(profile.role)
  const isAdmin   = profile?.role === 'admin'

  // Fetch approvals — managers see all, reps see own
  let query = admin
    .from('po_approvals')
    .select('*')
    .order('requested_at', { ascending: false })

  if (!isManager) {
    query = query.eq('requested_by', user.email ?? user.id)
  }

  const { data: approvals } = await query

  // Fetch threshold
  const { data: setting } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'po_approval_margin_threshold')
    .single()

  return (
    <POApprovalsClient
      initialApprovals={approvals ?? []}
      threshold={parseFloat(setting?.value ?? '20')}
      userEmail={user.email ?? ''}
      userRole={profile?.role ?? 'read_only'}
      isManager={!!isManager}
      isAdmin={!!isAdmin}
    />
  )
}
