import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/pagination'
import CustomerBillingClient, { type ChargeRow } from './CustomerBillingClient'

export const revalidate = 0

interface Charge {
  autotask_id: number; ticket_id: number | null; name: string | null; description: string | null
  unit_quantity: number | null; billable_amount: number | null; extended_cost: number | null
  is_billable_to_company: boolean | null; is_billed: boolean | null; charge_date: string | null
}
interface Ticket  { autotask_id: number; ticket_number: string | null; title: string | null; company_name: string | null }
interface Billing { ticket_charge_id: number | null; invoice_id: number | null; total_amount: number | null }
interface Invoice { autotask_id: number; invoice_number: string | null }

export default async function CustomerBillingPage() {
  const supabase = await createClient()
  const year = new Date().getFullYear()
  const since = new Date(Date.UTC(year - 1, 0, 1)).toISOString()

  // Charges from last year onwards; the client narrows by date range and customer.
  const [charges, tickets, billing, invoices] = await Promise.all([
    fetchAllRows<Charge>(supabase, (c, from, to) =>
      c.from('autotask_ticket_charges')
        .select('autotask_id, ticket_id, name, description, unit_quantity, billable_amount, extended_cost, is_billable_to_company, is_billed, charge_date')
        .gte('charge_date', since)
        .order('autotask_id', { ascending: true })
        .range(from, to)),
    fetchAllRows<Ticket>(supabase, (c, from, to) =>
      c.from('autotask_tickets_lite')
        .select('autotask_id, ticket_number, title, company_name')
        .order('autotask_id', { ascending: true })
        .range(from, to)),
    fetchAllRows<Billing>(supabase, (c, from, to) =>
      c.from('autotask_billing_items')
        .select('autotask_id, ticket_charge_id, invoice_id, total_amount')
        .not('ticket_charge_id', 'is', null)
        .order('autotask_id', { ascending: true })
        .range(from, to)),
    fetchAllRows<Invoice>(supabase, (c, from, to) =>
      c.from('autotask_invoices_lite')
        .select('autotask_id, invoice_number')
        .order('autotask_id', { ascending: true })
        .range(from, to)),
  ])

  const ticketById  = new Map(tickets.map(t => [t.autotask_id, t]))
  const invoiceById = new Map(invoices.map(i => [i.autotask_id, i.invoice_number]))
  const billByCharge = new Map<number, { amount: number; invoices: Set<string> }>()
  billing.forEach(b => {
    if (b.ticket_charge_id == null) return
    const e = billByCharge.get(b.ticket_charge_id) ?? { amount: 0, invoices: new Set<string>() }
    e.amount += Number(b.total_amount ?? 0)
    if (b.invoice_id != null) e.invoices.add(invoiceById.get(b.invoice_id) ?? `#${b.invoice_id}`)
    billByCharge.set(b.ticket_charge_id, e)
  })

  const rows: ChargeRow[] = charges.map(c => {
    const t = c.ticket_id != null ? ticketById.get(c.ticket_id) : undefined
    const b = billByCharge.get(c.autotask_id)
    return {
      id:           c.autotask_id,
      date:         c.charge_date,
      company:      t?.company_name || 'Unknown',
      ticketNumber: t?.ticket_number ?? null,
      ticketTitle:  t?.title ?? null,
      name:         c.name || c.description || '',
      qty:          Number(c.unit_quantity ?? 0),
      sell:         Number(c.billable_amount ?? 0),
      cost:         Number(c.extended_cost ?? 0),
      billable:     c.is_billable_to_company !== false,
      billed:       c.is_billed === true || !!b,
      invoicedAmount: b?.amount ?? 0,
      invoices:     b ? [...b.invoices] : [],
    }
  })

  return <CustomerBillingClient rows={rows} year={year} />
}
