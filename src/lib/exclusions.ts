import type { SupabaseClient } from '@supabase/supabase-js'

export interface DealExclusion {
  opportunity_id: string
  reason: string | null
  hidden_by: string | null
  hidden_at: string
  deal: { company: string; opportunity_name: string; revenue_total: number; normalised_status: string } | null
}

// Deals a manager has hidden from exec reporting, plus whether the current
// user may hide/restore. Returns an empty list if the table isn't there yet
// (migration 015 not applied) so the report pages keep working.
export async function loadExclusions(supabase: SupabaseClient): Promise<{ exclusions: DealExclusion[]; canEdit: boolean; ready: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase.from('deal_exclusions')
      .select('opportunity_id, reason, hidden_by, hidden_at, deal:opportunities(company, opportunity_name, revenue_total, normalised_status)')
      .order('hidden_at', { ascending: false }),
    user ? supabase.from('profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])
  const canEdit = ['admin', 'sales_manager'].includes((profile as { role?: string } | null)?.role ?? '')
  if (error) return { exclusions: [], canEdit, ready: false }
  return { exclusions: (data ?? []) as unknown as DealExclusion[], canEdit, ready: true }
}
