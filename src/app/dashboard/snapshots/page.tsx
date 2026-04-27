import { createClient } from '@/lib/supabase/server'
import SnapshotManager from './SnapshotManager'

export const revalidate = 0

export default async function SnapshotsPage() {
  const supabase = await createClient()

  // Get distinct snapshots
  const adminRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pipeline_snapshots?select=snapshot_name,snapshot_date,taken_by,created_at&order=snapshot_date.desc`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  )
  const allRows: { snapshot_name: string; snapshot_date: string; taken_by: string; created_at: string }[] =
    adminRes.ok ? await adminRes.json() : []

  // Deduplicate
  const seen = new Set<string>()
  const snapshots: { name: string; date: string; taken_by: string; count: number }[] = []
  const countMap: Record<string, number> = {}

  for (const row of allRows) {
    countMap[row.snapshot_name] = (countMap[row.snapshot_name] || 0) + 1
    if (!seen.has(row.snapshot_name)) {
      seen.add(row.snapshot_name)
      snapshots.push({
        name: row.snapshot_name,
        date: row.snapshot_date,
        taken_by: row.taken_by,
        count: 0,
      })
    }
  }
  snapshots.forEach((s) => { s.count = countMap[s.name] || 0 })

  // Get current pipeline for comparison
  const { data: currentPipeline } = await supabase
    .from('opportunities')
    .select('composite_key, company, opportunity_name, account_manager, category, stage, normalised_status, revenue_total, gross_profit, projected_close_date')
    .not('normalised_status', 'eq', 'portal')

  return (
    <SnapshotManager
      snapshots={snapshots}
      currentPipeline={currentPipeline || []}
    />
  )
}
