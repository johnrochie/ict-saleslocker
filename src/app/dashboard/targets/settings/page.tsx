import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TargetsSettingsClient from './TargetsSettingsClient'

export const revalidate = 0

const REPS = [
  { autotask_name: 'Maciejska, Barbara', display_name: 'Maciejska, Barbara' },
  { autotask_name: 'Conboy, John',       display_name: 'Conboy, John'       },
  { autotask_name: 'Dowdall, James',     display_name: 'Dowdall, James'     },
  { autotask_name: "O'Hora, Evan",       display_name: "O'Hora, Evan"       },
  { autotask_name: 'Roche, John',        display_name: 'Roche, John'        },
  { autotask_name: 'Taylor, Jamie',      display_name: 'Taylor, Jamie'      },
]

export default async function TargetsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard/targets')

  const { data: companyTargets }  = await admin.from('company_targets').select('*').order('year').order('quarter_num')
  const { data: repTargets }      = await admin.from('rep_targets').select('*').order('year').order('quarter_num').order('display_name')
  const { data: categoryTargets } = await admin
    .from('category_revenue_targets')
    .select('id, year, category_name, gl_code, annual_revenue_target, is_framework, sort_order')
    .order('year')
    .order('sort_order')

  return (
    <TargetsSettingsClient
      companyTargets={companyTargets || []}
      repTargets={repTargets || []}
      reps={REPS}
      categoryTargets={categoryTargets || []}
      currentUserEmail={user.email || ''}
    />
  )
}
