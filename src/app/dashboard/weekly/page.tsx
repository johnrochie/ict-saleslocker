import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import WeeklyReportClient from './WeeklyReportClient'

export default async function WeeklyReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <WeeklyReportClient />
}
