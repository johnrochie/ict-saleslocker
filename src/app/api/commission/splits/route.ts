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

// GET — list all company splits
export async function GET() {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  const { data } = await ctx.admin
    .from('commission_company_splits').select('*').order('company')
  return NextResponse.json({ splits: data || [] })
}

// POST — create or update a company split
export async function POST(request: NextRequest) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  const body = await request.json()
  const { company, rep1_name, rep1_pct, rep2_name, rep2_pct, notes } = body

  if (!company || !rep1_name) return NextResponse.json({ error: 'company and rep1_name required' }, { status: 400 })

  const pct1 = parseFloat(rep1_pct) || 100
  const pct2 = rep2_name ? (100 - pct1) : null

  const { data, error } = await ctx.admin
    .from('commission_company_splits')
    .upsert({
      company: company.trim(),
      rep1_name: rep1_name.trim(),
      rep1_pct: pct1,
      rep2_name: rep2_name?.trim() || null,
      rep2_pct: rep2_name ? pct2 : null,
      notes: notes || null,
      updated_by: ctx.user.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ split: data })
}

// DELETE — remove a company split
export async function DELETE(request: NextRequest) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  const { id } = await request.json()
  await ctx.admin.from('commission_company_splits').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
