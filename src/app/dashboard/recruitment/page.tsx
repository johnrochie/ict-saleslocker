import { createAdminSupabaseClient } from '@/lib/supabase/server'
import RecruitmentDashboard, { type JobOrder, type Submission, type Placement } from './RecruitmentDashboard'

export const revalidate = 0

export default async function RecruitmentPage() {
  const admin = createAdminSupabaseClient()

  const [{ data: jobOrders }, { data: submissions }, { data: placements }, { data: lastSync }] = await Promise.all([
    admin
      .from('bullhorn_job_orders')
      .select('bullhorn_id, title, company_name, hiring_manager, location, salary, employment_type, status, is_open, date_added, notes')
      .order('is_open', { ascending: false })
      .order('date_added', { ascending: false }),
    admin
      .from('bullhorn_submissions')
      .select('bullhorn_id, job_order_bullhorn_id, candidate_name, status, cv_sent, date_added, date_web_response, comments'),
    admin
      .from('bullhorn_placements')
      .select('bullhorn_id, job_order_bullhorn_id, candidate_name, role_title, company_name, start_date, employment_type, notes')
      .order('start_date', { ascending: false }),
    admin
      .from('import_logs')
      .select('imported_at')
      .like('filename', 'bullhorn-api-%')
      .eq('status', 'success')
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <RecruitmentDashboard
      jobOrders={(jobOrders ?? []) as JobOrder[]}
      submissions={(submissions ?? []) as Submission[]}
      placements={(placements ?? []) as Placement[]}
      lastSyncedAt={lastSync?.imported_at ?? null}
    />
  )
}
