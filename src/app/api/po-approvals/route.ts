import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()

  const statusParam = new URL(request.url).searchParams.get('status') ?? 'pending'
  const isManager   = profile && ['admin', 'sales_manager'].includes(profile.role)

  let query = admin
    .from('po_approvals')
    .select('*')
    .order('requested_at', { ascending: false })

  // Managers see all; reps see only their own
  if (!isManager) {
    query = query.eq('requested_by', user.email ?? user.id)
  }

  if (statusParam !== 'all') {
    query = query.eq('status', statusParam)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also return pending count for badge
  const { count } = await admin
    .from('po_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return NextResponse.json({ approvals: data ?? [], pending_count: count ?? 0 })
}
