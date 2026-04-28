import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id, status, notes, updated_by } = await request.json()
  const now = new Date().toISOString()

  const update: Record<string, unknown> = { status, updated_at: now }
  if (notes) update.notes = notes
  if (status === 'approved') { update.approved_by = updated_by; update.approved_at = now }
  if (status === 'paid')     update.paid_at = now

  const { error } = await admin.from('commission_calculations').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to audit trail
  await admin.from('commission_audit_trail').insert({
    table_name: 'commission_calculations',
    record_id: id,
    action: status,
    changed_by: updated_by,
    new_values: update,
  })

  return NextResponse.json({ success: true })
}
