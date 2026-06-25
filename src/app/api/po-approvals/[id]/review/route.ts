import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await params
  const { action, notes } = await request.json()

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('po_approvals')
    .select('id, status')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been reviewed' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('po_approvals')
    .update({
      status:      action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: user.email ?? user.id,
      reviewed_at: now,
      notes:       notes ?? null,
      updated_at:  now,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, approval: data })
}
