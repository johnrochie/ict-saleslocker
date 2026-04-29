import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) return null
  return { user, admin }
}

export async function PATCH(request: NextRequest) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  const { composite_key, company, rep1_name, rep1_pct, rep2_name, rep2_pct, notes } = await request.json()

  const pct1 = parseFloat(rep1_pct) || 100
  const pct2 = rep2_name ? (100 - pct1) : null

  const { data, error } = await ctx.admin
    .from('commission_deal_splits')
    .upsert({
      composite_key, company,
      rep1_name: rep1_name.trim(),
      rep1_pct: pct1,
      rep2_name: rep2_name?.trim() || null,
      rep2_pct: rep2_name ? pct2 : null,
      notes: notes || null,
      override_by: ctx.user.email,
      override_at: new Date().toISOString(),
    }, { onConflict: 'composite_key' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await ctx.admin.from('commission_audit_trail').insert({
    table_name: 'commission_deal_splits',
    record_id: composite_key,
    action: 'override',
    changed_by: ctx.user.email,
    new_values: { rep1_name, rep1_pct: pct1, rep2_name, rep2_pct: pct2 },
    reason: notes || 'Deal split override',
  })

  return NextResponse.json({ split: data })
}
