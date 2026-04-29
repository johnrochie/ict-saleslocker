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

  const { composite_key, company, business_type, notes } = await request.json()

  // Upsert the classification
  const { error } = await admin
    .from('commission_deal_classifications')
    .upsert({
      composite_key,
      company,
      business_type,
      auto_detected: false,
      override_by: user.email,
      override_at: new Date().toISOString(),
      notes: notes || null,
    }, { onConflict: 'composite_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to audit trail
  await admin.from('commission_audit_trail').insert({
    table_name: 'commission_deal_classifications',
    record_id: composite_key,
    action: 'override',
    changed_by: user.email,
    new_values: { business_type, company },
    reason: notes || 'Manual classification override',
  })

  return NextResponse.json({ success: true, business_type })
}
