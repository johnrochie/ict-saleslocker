# Xero Integration — Technical Spec

Status: Draft for review
Owner: John Roche
Last updated: 2026-07-02

## 1. Purpose

Autotask data (Opportunities, Quotes, Tickets, Sales Invoices, Purchase Orders, and line items) is already in the warehouse. Cloud Depot pushes a copy of the billing side of that data into Xero as it's invoiced. This project pulls the Xero side back into Supabase and joins it to the existing Autotask data, so we can report the full chain:

```
Opportunity → Quote → Ticket → Sales Invoice → Purchase Order → Purchase Invoice/Bill → GL Account
```

Primary driver: management reporting that shows sales pipeline next to actual financial performance (AR, cash collected, cost of sale) in one place, without switching to Xero.

## 2. Scope

In scope for v1:

- Sales Invoices + line items
- Purchase Orders + line items
- Purchase Invoices/Bills + line items
- Chart of Accounts (GL accounts)
- Contacts (for joining to Autotask companies)

Explicitly out of scope for v1 (candidates for a later phase):

- Xero Journals (as-posted GL feed) — see [Section 6](#6-gl-classification-accountcode-vs-journals) for the decision this depends on
- Payments detail beyond what's already on the Invoice object
- Any write-back to Xero — this integration is read-only

## 3. Architecture

Mirrors the existing Autotask integration pattern rather than introducing a new one:

```
src/lib/xero/
  client.ts       — XeroClient wrapper (xero-node SDK), OAuth2 token handling
  sync.ts         — orchestrator: syncContacts(), syncInvoices(), syncPurchaseOrders()
  transform.ts    — Xero record → DB row mapping
  types.ts

src/app/api/xero/
  connect/route.ts   — starts the OAuth2 consent redirect
  callback/route.ts  — exchanges the auth code for a token set, stores it
  sync/route.ts       — GET (Vercel Cron, Bearer CRON_SECRET) + POST (manual, admin/sales_manager)
  status/route.ts     — last sync time, row counts, error state
```

Key difference from Autotask: Xero uses OAuth2 with a refreshable token, not a static API key. The access token expires after ~30 minutes; the refresh token is valid for 60 days and rotates on each use. This needs a persistent store — see `xero_tokens` in [Section 7](#7-database-schema).

Sync runs on Vercel Cron, added to the existing `vercel.json`, offset from the Autotask run (06:00) to avoid overlap — e.g. 06:15.

## 4. Xero API endpoints and fields

All via the Accounting API (`xero-node` SDK).

| Need | Endpoint | Key fields |
|---|---|---|
| Sales Invoices + lines | `GET /Invoices` (`Type=ACCREC`) | `InvoiceID`, `InvoiceNumber`, `Reference`, `Contact`, `Date`, `DueDate`, `Status`, `Total`, `AmountDue`, `AmountPaid`; `LineItems[]`: `LineItemID`, `Description`, `Quantity`, `UnitAmount`, `LineAmount`, `AccountCode`, `TaxType`, `Tracking[]` |
| Purchase Invoices/Bills + lines | Same `/Invoices` endpoint (`Type=ACCPAY`) | Same shape as above |
| Purchase Orders + lines | `GET /PurchaseOrders` (separate endpoint) | `PurchaseOrderID`, `PurchaseOrderNumber`, `Reference`, `Contact`, `Date`, `DeliveryDate`, `Status`, `Total`; `LineItems[]` same shape |
| Chart of Accounts | `GET /Accounts` | `AccountID`, `Code`, `Name`, `Type`, `TaxType`, `Class`, `Status`, `ReportingCode` |
| Contacts | `GET /Contacts` | `ContactID`, `Name`, `AccountNumber` |
| (Phase 2) As-posted GL | `GET /Journals` | `JournalID`, `JournalNumber`, `JournalDate`, `SourceType`, `SourceID`; `JournalLines[]`: `AccountCode`, `NetAmount`, `GrossAmount`, `TaxAmount` |
| (Phase 2, Bill→PO linkage) | `GET /Invoices/{InvoiceID}/History` | `HistoryRecords[].Details` — free-text audit entries |

Pagination notes:

- `Invoices`, `PurchaseOrders`, `Accounts`, `Contacts` support `If-Modified-Since` — incremental sync from day one, avoiding the full-table-pull pattern Autotask is stuck with.
- `Journals` is paginated by `offset` (last `JournalNumber` seen), not by date — a different cursor to track if/when Phase 2 is built.
- Required scopes: `accounting.transactions.read`, `accounting.contacts.read`, `accounting.settings.read`, and `accounting.journals.read` if Phase 2 goes ahead.
- Xero rate limits: 60 calls/minute, 5,000/day per org. The client wrapper must respect `Retry-After` on 429s.

## 5. Matching Xero records back to Autotask

Confirmed directly from the live Xero/Autotask instances (screenshots reviewed 2026-07-02):

| Entity | Xero field | Autotask field | Match type |
|---|---|---|---|
| Contact | `Contact.AccountNumber` | Account Number | Exact, direct |
| Sales Invoice | `Invoice.InvoiceNumber` | Invoice History → "Invoice Number" column | Exact, direct |
| Sales Invoice (secondary) | `Invoice.Reference` | "Purchase Order Number" field on the Autotask invoice | Corroborating only |
| Purchase Order | `PurchaseOrder.PurchaseOrderNumber` | Autotask P.O. Number | Exact, direct — same number in both systems |
| Purchase Invoice/Bill | `Invoice.Reference` | Vendor's own invoice number | Not usable for Autotask linkage |
| Purchase Invoice/Bill → PO | History & Notes entry, e.g. *"Copied from Purchase Order 7"* | — | Indirect, text-derived |

Important correction from earlier assumptions: **the join key for Sales Invoices is the human-readable Invoice Number, not Autotask's internal Invoice ID.** The internal Invoice ID (e.g. `2762`) never appears anywhere in Xero.

### The one fragile link: Bills → Purchase Orders

The Bill's `Reference` field carries the vendor's own invoice number, not an Autotask key. The real linkage is a free-text note in Xero's History & Notes ("Copied from Purchase Order N"), which is only available via `GET /Invoices/{InvoiceID}/History`, not on the `Invoice` object itself.

Approach:

1. Fetch history for each Bill, regex-extract the PO number from entries matching `Copied from Purchase Order (\d+)`.
2. Where no such entry exists (bill entered manually, not converted from a PO), fall back to matching by Contact + Amount + Date proximity, and mark the match low-confidence.
3. Surface unmatched/low-confidence bills for manual review rather than silently joining or dropping them.

## 6. GL classification: AccountCode vs Journals

Two levels of GL detail are available:

- **`LineItem.AccountCode`** on the Invoice — the account Cloud Depot mapped the line to at creation time (a fixed Autotask billing-code → Xero account mapping). Fast to pull, matches the invoice line grain exactly.
- **`Journals`** — Xero's own system-generated ledger, which reflects the actual posted amounts including anything that happened after invoice creation (credit notes, void-and-rebill, manual reclassification, bank-rule adjustments).

`LineItem.AccountCode` is not guaranteed to match the final posting if the invoice was later adjusted. For most reporting this is an acceptable approximation; it is not audit-grade.

**Decision needed from finance before Phase 2 scoping:** is `AccountCode`-based classification sufficient for v1, with `Journals` reconciliation added later, or is the as-posted view required from day one? Recommendation: build v1 on `AccountCode` (materially cheaper — one endpoint, no offset-based journal pagination, no history-note parsing), and add `Journals` in Phase 2 if v1 numbers need to be reconciled against the actual ledger.

## 7. Database schema

New Supabase migration, e.g. `supabase/migrations/011_xero.sql`. Follows the existing composite-key dedup convention (dedup by Xero's own GUID, batch upsert with `onConflict`, row-by-row fallback on batch failure) — simpler here than the Autotask case, since Xero record GUIDs are stable and there's no composite-key workaround needed.

```sql
xero_tokens              (id, tenant_id, access_token, refresh_token, expires_at)

xero_contacts            (xero_contact_id PK, account_number, name, status, raw jsonb)
xero_accounts            (xero_account_id PK, code, name, type, tax_type, status, reporting_code)

xero_invoices            (xero_invoice_id PK, invoice_type ACCREC/ACCPAY, invoice_number,
                           reference, xero_contact_id FK, status, date, due_date,
                           sub_total, total_tax, total, amount_due, amount_paid, raw jsonb)
xero_invoice_lines       (id PK, xero_invoice_id FK, line_item_id, description, quantity,
                           unit_amount, line_amount, account_code, xero_account_id FK, tracking jsonb)

xero_purchase_orders     (xero_po_id PK, po_number, reference, xero_contact_id FK,
                           status, date, delivery_date, total, raw jsonb)
xero_purchase_order_lines(id PK, xero_po_id FK, description, quantity, unit_price,
                           line_amount, account_code, xero_account_id FK)

-- bridge to the existing Autotask warehouse tables
xero_autotask_link       (id PK, entity_type enum('contact','sales_invoice','purchase_order','bill'),
                           xero_id, autotask_id, match_method enum('exact_field',
                           'history_note_parse','fuzzy_fallback','manual'),
                           confidence numeric, matched_at)
```

Phase 2 additions (if `Journals` is approved):

```sql
xero_journals            (xero_journal_id PK, journal_number, journal_date, reference,
                           source_type, source_id, raw jsonb)
xero_journal_lines       (id PK, xero_journal_id FK, account_code, xero_account_id FK,
                           net_amount, gross_amount, tax_amount, tracking jsonb)
```

`xero_journals.source_id` joins to `xero_invoices.xero_invoice_id` where `source_type` is `ACCREC`/`ACCPAY`.

A reporting view chains `opportunities → quotes → tickets → autotask_invoices` (existing warehouse tables) through `xero_autotask_link` to `xero_invoices → xero_invoice_lines → xero_accounts`, and equivalently for the PO/bill side.

## 8. Credentials

Following the existing convention (env vars, no secrets manager): `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`. Document these, plus the currently-undocumented Autotask/cron vars, in `.env.local.example` while this is being built.

## 9. Open items to resolve before build starts

1. Are Autotask Invoice Numbers unique per company, or globally unique? Affects whether the Sales Invoice join needs a Contact qualifier.
2. What tolerance (amount/date window) should the Bill→PO fallback match use when no history note is found?
3. Xero Developer app registration: who owns it, is there more than one Xero org/tenant, and are the required scopes grantable on the current Xero plan?
4. Finance decision from Section 6: `AccountCode` only for v1, or `Journals` from day one?
5. Sync timing: confirmed 06:15 offset from the Autotask cron, or a different time?

## 10. Build sequence

1. Xero app registration + OAuth2 credentials
2. `xero_tokens` table + connect/callback routes — get an authenticated session working first
3. Contacts sync (no dependencies, validates the `AccountNumber` join)
4. Chart of Accounts sync (small, static reference data)
5. Sales Invoices + lines sync, joined via `xero_autotask_link`
6. Purchase Orders + lines sync
7. Purchase Invoices/Bills + lines sync, including the History-note PO linkage
8. Dashboard cards: Outstanding AR, Overdue Invoices, Cash Collected, alongside existing Pipeline/Revenue cards
9. Cron wiring + status/monitoring route
10. Phase 2 (conditional on Section 6 decision): Journals sync + reconciliation view
