import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PulseClient from './PulseClient'

export const revalidate = 0

export default async function PulsePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: reports } = await admin
    .from('sales_pulse_reports')
    .select('id, week_label, week_start, status, created_by, created_at')
    .order('week_start', { ascending: false })

  return <PulseClient savedReports={reports || []} currentUserEmail={user.email || ''} />
}
