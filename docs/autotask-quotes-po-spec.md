# Autotask Ticket Charge / Billing / PO Reconciliation — Technical Spec

Status: Draft for review — v2, rescoped to Finance's month-end reconciliation requirement
Owner: John Roche
Last updated: 2026-09-02

## 1. Purpose

Finance need a month-end reconciliation that traces, at line level, every product/equipment cost from the point it's raised on a ticket through to both sides of the ledger — what the customer was billed and what the supplier billed back. The existing Autotask integration (`src/lib/autotask/`) only syncs Opportunities and meetings; none of the entities below exist in the app today.

**Central object: `TicketCharge`.** A ticket can carry multiple charges, and each charge can be sourced from a different vendor/PO — so the join has to happen at the charge line, not the ticket or opportunity. Two chains hang off it:

```
                    ┌─→ BillingItem → Autotask Invoice → Xero Sales Invoice   (customer side)
TicketCharge ───────┤
                    └─→ PurchaseOrderItem → PurchaseOrder → Xero PO → Xero Supplier Bill   (supplier side)
```

Quote/Opportunity-level reconciliation (the original v1 draft) is **demoted to a phase 2 nice-to-have** — see Section 2. It's a separate, weaker join (Autotask has no FK from a Quote Line to the charges it generates) and isn't a blocker for the reconciliation Finance actually needs now.

## 2. Scope

In scope for v1:

- **TicketCharges** — the central entity. New addition vs. the v1 draft.
- **BillingItems** — customer-side link (Charge → Billing → Invoice)
- **Purchase Orders + PurchaseOrderItems + Vendors** — supplier-side link (Charge → PO Item → PO → Vendor)
- **Tickets (lite)** — parent of TicketCharges, ID/number/title only
- **Invoices (lite)** — id/invoiceNumber only, to resolve `BillingItem.invoiceID` to a human invoice number for the Xero join

Out of scope for v1:

- ContractCharges / ProjectCharges — Finance confirmed the priority is product/equipment sales via the Ticket Charge → Billing/Procurement path, not recurring contract or project billing. Same entities, same reconciliation shape, but a separate build if/when needed.
- Quotes / QuoteItems — kept as Phase 2. Autotask has no FK linking a Quote Line to the TicketCharges it eventually becomes, so this can only ever be an Opportunity-level rollup (see the v1 draft's Section 5/6 for why), which is a different, softer report than the line-level reconciliation this spec is for.
- Any write-back to Autotask — read-only throughout.

## 3. Reconciliation logic — the five states Finance need

This is the actual deliverable; everything else in this spec exists to produce the joined rows this logic runs over.

For each `TicketCharge` line (join to its BillingItem(s) and PurchaseOrderItem(s)):

| State | Condition |
|---|---|
| **Matched** | Customer invoiced (BillingItem → Invoice exists and posted) AND supplier billed in full (PO Item's PO has a matched Xero Supplier Bill covering the full PO line value) |
| **Accrual required** | Customer invoiced, but no matching supplier bill found yet (or the PO is still Submitted/Received Partial in Xero) — accrual value = the PO line's remaining un-billed value, not the full PO value, per the original ask |
| **Partial billing (accrual)** | Supplier has billed *some* but not all of the PO line — accrual = PO line value minus billed-to-date |
| **Potential missed billing** | Supplier cost/PO/bill exists and is complete, but no corresponding customer BillingItem/Invoice exists for that TicketCharge |
| **Variance** | Both sides complete, but PO line value ≠ Supplier Bill line value beyond a tolerance — flagged alongside whichever of the above states applies, not instead of it |

This only works because the join is at the TicketCharge line — a ticket with three charges split across two vendors needs each charge reconciled independently, which is exactly why TicketCharge (not Ticket or Opportunity) has to be the join key.

## 4. Architecture — kept fully separate from the existing sync

Unchanged from the v1 draft's isolation requirement:

- New, standalone module: `src/lib/autotask-qpo/` — no shared transform/picklist files with `src/lib/autotask/`.
- Reuses only `AutotaskClient` (`src/lib/autotask/client.ts`) — confirmed low-risk (stateless, read-only HTTP wrapper, no entity-specific logic), per your go-ahead on open item 1.
- New tables only, additive migration, no ALTER on existing tables.
- New cron route (`src/app/api/autotask-qpo/sync/route.ts`), new `import_logs.filename` values, own schedule slot — proposed **06:30**, after the existing Autotask run (06:00) and the planned Xero run (06:15), pending confirmation there's nothing else in that window (open item 5).

```
src/lib/autotask-qpo/
  types.ts        — AutotaskTicketCharge, AutotaskBillingItem, AutotaskPurchaseOrder,
                     AutotaskPurchaseOrderItem, AutotaskTicketLite, AutotaskInvoiceLite
  transform.ts     — Autotask record → DB row mapping
  sync.ts          — syncTicketCharges(), syncBillingItems(), syncPurchaseOrders(), syncTicketsLite()

src/app/api/autotask-qpo/
  sync/route.ts    — GET (Vercel Cron, Bearer CRON_SECRET) + POST (manual, admin/sales_manager)
  status/route.ts  — last sync time, row counts, error state
```

## 5. Autotask REST API entities and fields

| Need | Entity | Endpoint | Key fields |
|---|---|---|---|
| Ticket Charges | `TicketCharges` | `/TicketCharges/query` | `id`, `ticketID`, `productID`, `billingCodeID`, `unitQuantity`, `unitPrice`, `unitCost`, `billableAmount` (= qty × price), `extendedCost` (= qty × cost), `isBillableToCompany`, `isBilled`, `status` (Pending / Waiting Approval / Need To Order / Ready to Ship), `statusLastModifiedDate` |
| Billing Items | `BillingItems` | `/BillingItems/query` | `id`, `ticketChargeID` (→ TicketCharges — **confirmed FK**), `ticketID`, `invoiceID`, `purchaseOrderNumber`, `vendorID`, `ourCost`, `rate`, `quantity`, `totalAmount`, `itemDate`, `postedDate`, `billingCodeID` |
| Purchase Orders | `PurchaseOrders` | `/PurchaseOrders/query` | `id`, `vendorID`, `status` (New/Submitted/Received Partial/Received Full/Canceled), `vendorInvoiceNumber`, `externalPONumber`, `freight`, `taxRegionID` |
| PO lines | `PurchaseOrderItems` | `/PurchaseOrderItems/query` | `id`, `orderID` (→ PurchaseOrders), `chargeID` (→ TicketCharges/ContractCharges/ProjectCharges — **likely FK, to confirm live, see Section 8**), `ticketID`, `projectID`, `contractID`, `productID`, `quantity`, `unitCost` |
| Vendors | `Companies` | `/Companies/query` (filter `companyType = Vendor`) | `id`, `companyName` — reuse the Companies snapshot the existing Opportunities sync already fetches, no second call needed |
| Tickets (lite) | `Tickets` | `/Tickets/query` | `id`, `ticketNumber`, `title`, `accountID`, `purchaseOrderNumber`, `status` |
| Invoices (lite) | `Invoices` | `/Invoices/query` | `id`, `invoiceNumber`, `companyID` |

Notes from the docs that affect the build:

- **`TicketCharges` is the only genuinely two-way-linked entity here** — `BillingItem.ticketChargeID` is a confirmed field reference straight back to it, and `PurchaseOrderItem.chargeID` is documented as an integer FK-shaped field (its target entity isn't named explicitly in the REST field docs — it covers TicketCharge/ContractCharge/ProjectCharge cost records generically). This is exactly the relationship you flagged in open item 4 — needs a live check, see Section 8.
- **`TicketCharges` becomes read-only once `isBilled = True`** — good for this use case, since a billed charge won't change under us mid-reconciliation.
- **`BillingItems` is read-only via the API entirely** (query only) — no risk of the sync accidentally being pointed at a write path.
- **`PurchaseOrder.status` lifecycle** (New → Submitted → Received Partial/Full, or Canceled) directly feeds the "partial billing" and "accrual" states in Section 3 — a PO sitting at Received Partial is the clearest possible signal for a partial-accrual row.
- **`ourCost` (BillingItem) and `unitCost`/`unitPrice` (TicketCharge)** can return no data if the querying API user lacks the "view sensitive/cost data" permission — worth confirming the API user configured for `AUTOTASK_USERNAME` has that permission before the build, otherwise cost columns come back null silently rather than erroring.

## 6. Matching Autotask records to each other, then to Xero

| Link | Field | Match type |
|---|---|---|
| BillingItem → TicketCharge | `BillingItem.ticketChargeID` | Exact FK — confirmed |
| PurchaseOrderItem → TicketCharge | `PurchaseOrderItem.chargeID` | Documented as an FK-shaped field; **needs live confirmation it actually resolves to TicketCharge.id and not just ContractCharge/ProjectCharge in this instance's usage** — Section 8 |
| PurchaseOrderItem → PurchaseOrder | `PurchaseOrderItem.orderID` | Exact FK |
| BillingItem → Invoice | `BillingItem.invoiceID` → `Invoices.invoiceNumber` | Exact FK, needs the lightweight Invoices pull (Section 2) |
| BillingItem → PurchaseOrder (fallback only) | `BillingItem.purchaseOrderNumber` (free text) vs. `PurchaseOrder.externalPONumber`/`vendorInvoiceNumber` | Text match — only needed where `PurchaseOrderItem.chargeID` doesn't resolve; treat as a lower-confidence corroborating signal, same class as the Xero spec's Bill→PO history-note match |
| Autotask Invoice → Xero Sales Invoice | `Invoices.invoiceNumber` ↔ `Xero Invoice.InvoiceNumber` | Exact, per `xero-integration-spec.md` Section 5 |
| Autotask PO → Xero PO | `PurchaseOrder` number ↔ `Xero PurchaseOrder.PurchaseOrderNumber` | Exact, per `xero-integration-spec.md` Section 5 |
| Xero PO → Xero Supplier Bill | History & Notes text ("Copied from Purchase Order N") | Indirect, text-derived — the one fragile link, unchanged from the Xero spec |
| **Customer/Vendor identity, both systems** | **`Xero Contact.AccountNumber` = Autotask `Company.id`** | Exact, direct — confirmed by you against live data. This applies to both customer and vendor Companies, since Autotask doesn't distinguish contact record shape by company type. This is a materially simpler join than anything else in this chain and should be the anchor for company-level matching in the reporting view — worth calling out explicitly in `xero-integration-spec.md`'s Section 5 too, since it was stated there generically without confirming it holds for vendors specifically. |

## 7. What this means for the Finance report's column list

| Report column | Source | Status |
|---|---|---|
| Ticket / Ticket Charge | `TicketCharges` + `Tickets` (lite) | Available |
| Billing Item / Invoice No. | `BillingItems` (via `ticketChargeID`) + `Invoices` (lite) | Available |
| PO No. / PO Item / Vendor / PO Cost | `PurchaseOrderItems` (via `chargeID`, pending Section 8) + `PurchaseOrders` + `Companies` | Available once Section 8 confirms the FK; text-match fallback otherwise |
| Xero Sales Invoice / line | `xero_invoices` / `xero_invoice_lines` (per Xero spec) joined via Invoice Number | Requires the Xero build from `xero-integration-spec.md` |
| Xero PO / Supplier Bill / line | `xero_purchase_orders` / Xero Bills (per Xero spec) joined via PO Number / history note | Requires the Xero build |
| Customer Invoiced? / Supplier Billed? / Accrual Required / Unbilled Cost/Sale / Variance | Derived — Section 3 logic over the joined rows | No new source data; a reporting view/query once both sides exist |

Quote No. / Quote Line / Description / Qty / Cost / Sell from the original ask remain Phase 2 (Section 2) — TicketCharge already carries qty/cost/price at the same grain, so most of that column set is actually satisfied by TicketCharge directly; only the pre-sale Quote artifact itself is deferred.

## 8. Live-data validation plan (run before committing the build)

Two things need testing against the real instance, both raised as open items last round:

1. **Does `PurchaseOrderItem.chargeID` resolve to `TicketCharge.id`?** Pull a handful of `PurchaseOrderItems` where `ticketID` is not null, take their `chargeID`, and query `TicketCharges` for that `id` directly. If it resolves and the ticket matches, that's the strong FK link (Section 6) and the `purchaseOrderNumber` text-match fallback becomes a true fallback, not the primary path. If it doesn't resolve cleanly (e.g. it's actually pointing at a different cost-record ID space, or is frequently null), the text match on PO number becomes load-bearing and the report's confidence flag needs to reflect that.
2. **Which entities expose a usable incremental field?** Rather than rely on the docs (which only confirm `TicketCharge.statusLastModifiedDate` — cost-status only, not a full last-modified) call `AutotaskClient.getEntityFields()` (already implemented, `src/lib/autotask/client.ts:145`) against `TicketCharges`, `BillingItems`, `PurchaseOrders`, `PurchaseOrderItems`, and `Tickets` and inspect the actual field list returned by this instance. This is the same technique the existing Opportunities sync could have used but didn't need to (Opportunities has no such field at all). Expect `BillingItems` to be the highest-volume entity here — if it has no incremental field either, the sync design needs the same "age cutoff, skip re-writing settled rows" pattern `sync.ts` already uses for Opportunities, not a naive full pull every run.

Once you've added the Autotask credentials to `.env.local`, I'll write a small standalone script (reads env vars, makes a handful of read-only `queryAll` calls, prints the results — no writes, nothing touching the existing sync) to answer both of these directly rather than leaving them as assumptions.

## 9. Database schema

New Supabase migration, e.g. `supabase/migrations/013_autotask_qpo.sql` — additive only.

```sql
autotask_vendors           (id PK, autotask_company_id UNIQUE, company_name)

autotask_tickets_lite      (id PK, autotask_id UNIQUE, ticket_number, title, account_id,
                             purchase_order_number, status)

autotask_ticket_charges    (id PK, autotask_id UNIQUE, ticket_id FK → autotask_tickets_lite.autotask_id,
                             product_id, billing_code_id, unit_quantity, unit_price, unit_cost,
                             billable_amount, extended_cost, is_billable_to_company, is_billed,
                             status, status_last_modified, raw jsonb)

autotask_billing_items     (id PK, autotask_id UNIQUE, ticket_charge_id FK → autotask_ticket_charges.autotask_id,
                             ticket_id, invoice_id, purchase_order_number, vendor_id,
                             our_cost, rate, quantity, total_amount, item_date, posted_date,
                             billing_code_id, raw jsonb)

autotask_purchase_orders   (id PK, autotask_id UNIQUE, vendor_id FK → autotask_vendors.autotask_company_id,
                             external_po_number, vendor_invoice_number, status, freight, raw jsonb)

autotask_po_items          (id PK, autotask_id UNIQUE, order_id FK → autotask_purchase_orders.autotask_id,
                             charge_id FK → autotask_ticket_charges.autotask_id,  -- nullable until Section 8 confirms
                             ticket_id, project_id, contract_id, product_id, quantity, unit_cost)

autotask_invoices_lite     (id PK, autotask_id UNIQUE, invoice_number, company_id)
```

A reporting view chains `autotask_ticket_charges → autotask_billing_items → autotask_invoices_lite` (customer side) and `autotask_ticket_charges → autotask_po_items → autotask_purchase_orders → autotask_vendors` (supplier side), each further joined to the Xero tables from `xero-integration-spec.md` via Invoice Number / PO Number, with company identity resolved via the `AccountNumber` = Autotask company ID key from Section 6. The five-state logic from Section 3 is computed in this view, not stored.

## 10. Sync mechanics

Same conventions as the existing Opportunities sync — ID-cursor pagination (`queryAll()`, already handles this), batch upsert on `autotask_id` with `onConflict`, row-by-row retry fallback on batch failure. Full-vs-incremental per entity is decided by Section 8's live check, not assumed here.

Fetch order (dependencies within the new module only):
1. Vendors, Tickets (lite) — independent
2. TicketCharges — depends on Tickets (lite) existing for the FK, but fetches directly by its own filter
3. BillingItems, PurchaseOrders, PurchaseOrderItems, Invoices (lite) — independent fetches; FK resolution happens at transform time against step 1/2's data

## 11. Open items

1. ~~AutotaskClient reuse~~ — resolved, reuse confirmed.
2. Incremental sync fields — pending live `getEntityFields()` check (Section 8.2).
3. ~~Quote Line → BillingItem line-level gap~~ — resolved by rescoping; Quotes deferred to Phase 2 (Section 2).
4. `PurchaseOrderItem.chargeID` vs. `BillingItem.purchaseOrderNumber` as the primary PO↔Charge link — pending live check (Section 8.1).
5. Sync timing — proposed 06:30, confirm no conflicts.
6. Contracts/Projects excluded from v1 — confirmed by Finance.
7. **New**: confirm the Autotask API user's security level includes "view sensitive/cost data" — several key cost fields (`ourCost`, `unitCost`, `unitPrice`) silently return null without it rather than erroring, which would quietly break the reconciliation's cost side.

## 12. Build sequence

1. Live-data validation (Section 8) — answers items 2 and 4 before any code is written
2. New migration (`013_autotask_qpo.sql`)
3. `autotask-qpo/types.ts` + `transform.ts`
4. Vendors + Tickets (lite) sync
5. TicketCharges sync
6. BillingItems sync
7. Purchase Orders + PurchaseOrderItems sync (using the confirmed `chargeID` link from step 1)
8. Invoices (lite) sync
9. Cron wiring + status route
10. Reporting view implementing Section 3's five-state logic, joined to the Xero tables once `xero-integration-spec.md` is built
