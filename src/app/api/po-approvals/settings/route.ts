import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'po_approval_margin_threshold')
    .single()

  return NextResponse.json({ threshold: parseFloat(data?.value ?? '20') })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { threshold } = await request.json()
  const value = parseFloat(threshold)
  if (isNaN(value) || value < 0 || value > 100) {
    return NextResponse.json({ error: 'Threshold must be between 0 and 100' }, { status: 400 })
  }

  const { error } = await admin
    .from('system_settings')
    .update({ value: String(value), updated_by: user.email, updated_at: new Date().toISOString() })
    .eq('key', 'po_approval_margin_threshold')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, threshold: value })
}
