'use client'

import { useMemo } from 'react'
import type { Opportunity } from '@/types'

export interface NewCustomer { autotask_id: number; company_name: string; create_date: string | null }
export interface CustomerQuote { autotask_id: number; name: string | null; opportunity_id: number | null; company_id: number | null; create_date: string | null }

const DAY = 86_400_000

function euros(n: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// Customers created in the 30 days up to the end of the report period that
// have at least one quote against them (the "New customer engagements" slide).
export default function NewCustomers({ customers, quotes, deals, excludedNames, asOf, ready, footnote }: {
  customers: NewCustomer[]
  quotes: CustomerQuote[]
  deals: Opportunity[]            // already filtered for exclusions and hidden deals
  excludedNames: string[]         // lower-case company names to leave out
  asOf: Date                      // end of the report period
  ready: boolean                  // false when the tables or first sync aren't there yet
  footnote: string
}) {
  const from = useMemo(() => new Date(asOf.getTime() - 30 * DAY), [asOf])

  const { rows, created } = useMemo(() => {
    const dealByAt = new Map<number, Opportunity>()
    deals.forEach(d => { if (d.autotask_id != null) dealByAt.set(d.autotask_id, d) })

    const quotesBy = new Map<number, CustomerQuote[]>()
    quotes.forEach(q => {
      if (q.company_id == null) return
      const l = quotesBy.get(q.company_id) || []
      l.push(q); quotesBy.set(q.company_id, l)
    })

    const inWindow = customers.filter(c => {
      if (!c.create_date) return false
      const t = new Date(c.create_date).getTime()
      return t >= from.getTime() && t <= asOf.getTime() && !excludedNames.includes(c.company_name.toLowerCase().trim())
    })

    const rows = inWindow.flatMap(c => {
      const qs = quotesBy.get(c.autotask_id)
      if (!qs || qs.length === 0) return []
      const oppIds = [...new Set(qs.map(q => q.opportunity_id).filter((n): n is number => n != null))]
      const linked = oppIds.map(id => dealByAt.get(id)).filter((d): d is Opportunity => !!d)
      const latest = qs.map(q => q.create_date).filter(Boolean).sort().pop() ?? null
      return [{
        c, quotes: qs.length, latest,
        deals: linked.length,
        value: linked.reduce((s, d) => s + d.revenue_total, 0),
        owners: [...new Set(linked.map(d => d.opportunity_owner).filter(Boolean))].join(', '),
      }]
    }).sort((a, b) => b.value - a.value || b.quotes - a.quotes)

    return { rows, created: inWindow.length }
  }, [customers, quotes, deals, excludedNames, from, asOf])

  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: '#475569', margin: '0 0 10px' }}>
        New customer engagements
      </h2>

      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ background: '#1e3a5f', color: 'white', padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase' }}>
          Customers created {fmtDate(from.toISOString())} to {fmtDate(asOf.toISOString())} with a quote
          {ready && ` — ${rows.length} of ${created} new customers · ${euros(total)}`}
        </div>

        {!ready ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: 20, margin: 0, fontSize: 13 }}>
            No customer or quote data yet. Run the supabase migration 022 and a sync from the Upload Data page.
          </p>
        ) : rows.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: 20, margin: 0, fontSize: 13 }}>
            No new customers with a quote in this 30 day window{created ? ` (${created} created, none quoted)` : ''}.
          </p>
        ) : (
          <table className="ps-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th>#</th><th>Customer</th><th>Created</th><th className="r">Quotes</th><th>Latest quote</th><th className="r">Deals</th><th>Owner</th><th className="r">Value</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.c.autotask_id}>
                  <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.c.company_name}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.c.create_date)}</td>
                  <td className="r">{r.quotes}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.latest)}</td>
                  <td className="r">{r.deals || '—'}</td>
                  <td style={{ color: '#64748b' }}>{r.owners || '—'}</td>
                  <td className="r" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.deals ? euros(r.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>{footnote}</p>
    </div>
  )
}
