import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const calculationId = searchParams.get('calculation_id')
  if (!calculationId) return NextResponse.json({ error: 'calculation_id required' }, { status: 400 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('commission_deal_lines')
    .select('*')
    .eq('calculation_id', calculationId)
    .order('commission_value', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lines: data || [] })
}
