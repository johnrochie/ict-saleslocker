import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

// Hide / restore deals from exec reporting. Admins and sales managers only.
async function checkManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) return null
  return { user, admin }
}

export async function POST(request: NextRequest) {
  const ctx = await checkManager()
  if (!ctx) return NextResponse.json({ error: 'Only admins and sales managers can hide deals' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const opportunityId = typeof body.opportunity_id === 'string' ? body.opportunity_id : null
  const reason        = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null
  if (!opportunityId) return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 })

  const row = { opportunity_id: opportunityId, reason, hidden_by: ctx.user.email ?? null, hidden_at: new Date().toISOString() }
  const { error } = await ctx.admin.from('deal_exclusions').upsert(row, { onConflict: 'opportunity_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exclusion: row })
}

export async function DELETE(request: NextRequest) {
  const ctx = await checkManager()
  if (!ctx) return NextResponse.json({ error: 'Only admins and sales managers can restore deals' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('opportunity_id')
  if (!id) return NextResponse.json({ error: 'opportunity_id is required' }, { status: 400 })

  const { error } = await ctx.admin.from('deal_exclusions').delete().eq('opportunity_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
