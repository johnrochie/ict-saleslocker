import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { ingestCsv } from '@/lib/csv/parser'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const adminClient = createAdminSupabaseClient()
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError) {
    return NextResponse.json(
      { error: 'Could not verify permissions: ' + profileError.message },
      { status: 500 }
    )
  }

  if (!profile || !['admin', 'sales_manager'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Role is "' + (profile?.role ?? 'unknown') + '". Admin or Sales Manager required.' },
      { status: 403 }
    )
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!file.name.endsWith('.csv')) {
    return NextResponse.json({ error: 'File must be a .csv' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  const csvContent = await file.text()
  const result = await ingestCsv(csvContent, file.name, user.email ?? user.id)

  return NextResponse.json(result)
}
