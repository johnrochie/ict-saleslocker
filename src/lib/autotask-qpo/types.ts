// ============================================================
// ICT SalesIQ — Autotask charges/billing raw types (customer side)
// Field names follow docs/autotask-quotes-po-spec.md section 5.
// Not yet validated against the live instance; every field is
// treated as optional on read.
// ============================================================

export interface AutotaskTicketCharge {
  id: number
  ticketID?: number | null
  name?: string | null
  description?: string | null
  productID?: number | null
  billingCodeID?: number | null
  unitQuantity?: number | null
  unitPrice?: number | null
  unitCost?: number | null
  billableAmount?: number | null
  extendedCost?: number | null
  isBillableToCompany?: boolean | null
  isBilled?: boolean | null
  status?: number | null
  createDate?: string | null
  datePurchased?: string | null
  statusLastModifiedDate?: string | null
  [key: string]: unknown
}

export interface AutotaskBillingItem {
  id: number
  ticketChargeID?: number | null
  ticketID?: number | null
  invoiceID?: number | null
  purchaseOrderNumber?: string | null
  vendorID?: number | null
  ourCost?: number | null
  rate?: number | null
  quantity?: number | null
  totalAmount?: number | null
  itemDate?: string | null
  postedDate?: string | null
  billingCodeID?: number | null
  [key: string]: unknown
}

export interface AutotaskTicketLite {
  id: number
  ticketNumber?: string | null
  title?: string | null
  companyID?: number | null
  accountID?: number | null
  status?: number | null
  [key: string]: unknown
}

export interface AutotaskInvoiceLite {
  id: number
  invoiceNumber?: string | number | null
  companyID?: number | null
  [key: string]: unknown
}

export interface ChargesSyncResult {
  charges: number
  billing_items: number
  tickets: number
  invoices: number
  errors: Array<{ row: number; message: string }>
  status: 'success' | 'partial' | 'failed'
  window_since: string | null
  duration_ms: number
}
