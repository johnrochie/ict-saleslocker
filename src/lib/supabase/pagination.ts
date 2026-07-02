import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

// Supabase/PostgREST silently caps unbounded selects at 1000 rows — a plain
// .select('*') against a table larger than that returns an incomplete
// result with no error. Page through with .range() so every matching row
// comes back. The query builder passed in MUST include a deterministic
// .order() (with a unique tiebreaker, e.g. id) or rows can be skipped or
// duplicated across page boundaries.
export async function fetchAllRows<T>(
  client: SupabaseClient,
  buildQuery: (client: SupabaseClient, from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = []
  let page = 0
  while (true) {
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(client, from, to)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }
  return rows
}
