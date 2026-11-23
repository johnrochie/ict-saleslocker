// ============================================================
// ICT SalesIQ — Autotask charges/billing -> DB row mapping
// ============================================================

import type {
  AutotaskTicketCharge, AutotaskBillingItem, AutotaskTicketLite, AutotaskInvoiceLite,
} from './types'

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const ts  = (v: unknown): string | null => {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function transformCharge(c: AutotaskTicketCharge) {
  const qty   = num(c.unitQuantity)
  const price = num(c.unitPrice)
  const cost  = num(c.unitCost)
  return {
    autotask_id:            c.id,
    ticket_id:              num(c.ticketID),
    name:                   str(c.name),
    description:            str(c.description),
    product_id:             num(c.productID),
    billing_code_id:        num(c.billingCodeID),
    unit_quantity:          qty,
    unit_price:             price,
    unit_cost:              cost,
    // Autotask documents billableAmount = qty x price, extendedCost = qty x cost.
    // Fall back to computing them if the API user doesn't return them.
    billable_amount:        num(c.billableAmount) ?? (qty != null && price != null ? qty * price : null),
    extended_cost:          num(c.extendedCost)   ?? (qty != null && cost  != null ? qty * cost  : null),
    is_billable_to_company: typeof c.isBillableToCompany === 'boolean' ? c.isBillableToCompany : null,
    is_billed:              typeof c.isBilled === 'boolean' ? c.isBilled : null,
    status:                 num(c.status),
    charge_date:            ts(c.createDate) ?? ts(c.datePurchased),
    status_last_modified:   ts(c.statusLastModifiedDate),
    raw:                    c,
    synced_at:              new Date().toISOString(),
  }
}

export function transformBillingItem(b: AutotaskBillingItem) {
  return {
    autotask_id:           b.id,
    ticket_charge_id:      num(b.ticketChargeID),
    ticket_id:             num(b.ticketID),
    invoice_id:            num(b.invoiceID),
    purchase_order_number: str(b.purchaseOrderNumber),
    vendor_id:             num(b.vendorID),
    our_cost:              num(b.ourCost),
    rate:                  num(b.rate),
    quantity:              num(b.quantity),
    total_amount:          num(b.totalAmount),
    item_date:             ts(b.itemDate),
    posted_date:           ts(b.postedDate),
    billing_code_id:       num(b.billingCodeID),
    raw:                   b,
    synced_at:             new Date().toISOString(),
  }
}

export function transformTicket(t: AutotaskTicketLite, companyNames: Map<number, string>) {
  const companyId = num(t.companyID) ?? num(t.accountID)
  return {
    autotask_id:   t.id,
    ticket_number: str(t.ticketNumber),
    title:         str(t.title),
    company_id:    companyId,
    company_name:  companyId != null ? companyNames.get(companyId) ?? null : null,
    status:        num(t.status),
    synced_at:     new Date().toISOString(),
  }
}

export function transformInvoice(i: AutotaskInvoiceLite) {
  return {
    autotask_id:    i.id,
    invoice_number: str(i.invoiceNumber),
    company_id:     num(i.companyID),
    synced_at:      new Date().toISOString(),
  }
}
