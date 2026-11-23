-- ============================================================
-- ICT SalesIQ — Autotask ticket charges / billing (customer side)
-- ============================================================
-- Phase 1 of docs/autotask-quotes-po-spec.md: TicketCharges -> BillingItems
-- -> Invoices, plus lite Tickets for company/ticket lookup.
-- Supplier side (POs, PO items, vendors) is deliberately NOT here yet.
--
-- No hard foreign keys: the sync pulls a rolling window of charges and
-- billing items independently, so a billing item can legitimately point
-- at a charge outside the window. Joins are done on the autotask_* ids.
-- ============================================================

CREATE TABLE autotask_tickets_lite (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_id     BIGINT NOT NULL UNIQUE,
  ticket_number   TEXT,
  title           TEXT,
  company_id      BIGINT,
  company_name    TEXT,
  status          INTEGER,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_at_tickets_company ON autotask_tickets_lite (LOWER(company_name));

CREATE TABLE autotask_ticket_charges (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_id             BIGINT NOT NULL UNIQUE,
  ticket_id               BIGINT,
  name                    TEXT,
  description             TEXT,
  product_id              BIGINT,
  billing_code_id         BIGINT,
  unit_quantity           NUMERIC(15,4),
  unit_price              NUMERIC(15,4),
  unit_cost               NUMERIC(15,4),
  billable_amount         NUMERIC(15,2),
  extended_cost           NUMERIC(15,2),
  is_billable_to_company  BOOLEAN,
  is_billed               BOOLEAN,
  status                  INTEGER,
  charge_date             TIMESTAMPTZ,        -- createDate, falling back to datePurchased
  status_last_modified    TIMESTAMPTZ,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_at_charges_ticket ON autotask_ticket_charges (ticket_id);
CREATE INDEX idx_at_charges_date   ON autotask_ticket_charges (charge_date);

CREATE TABLE autotask_billing_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_id             BIGINT NOT NULL UNIQUE,
  ticket_charge_id        BIGINT,
  ticket_id               BIGINT,
  invoice_id              BIGINT,
  purchase_order_number   TEXT,
  vendor_id               BIGINT,
  our_cost                NUMERIC(15,2),
  rate                    NUMERIC(15,4),
  quantity                NUMERIC(15,4),
  total_amount            NUMERIC(15,2),
  item_date               TIMESTAMPTZ,
  posted_date             TIMESTAMPTZ,
  billing_code_id         BIGINT,
  raw                     JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_at_billing_charge  ON autotask_billing_items (ticket_charge_id);
CREATE INDEX idx_at_billing_invoice ON autotask_billing_items (invoice_id);

CREATE TABLE autotask_invoices_lite (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_id     BIGINT NOT NULL UNIQUE,
  invoice_number  TEXT,
  company_id      BIGINT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: authenticated users can read; only the service-role sync job writes.
ALTER TABLE autotask_tickets_lite   ENABLE ROW LEVEL SECURITY;
ALTER TABLE autotask_ticket_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE autotask_billing_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE autotask_invoices_lite  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "at_tickets_select"  ON autotask_tickets_lite   FOR SELECT TO authenticated USING (true);
CREATE POLICY "at_charges_select"  ON autotask_ticket_charges FOR SELECT TO authenticated USING (true);
CREATE POLICY "at_billing_select"  ON autotask_billing_items  FOR SELECT TO authenticated USING (true);
CREATE POLICY "at_invoices_select" ON autotask_invoices_lite  FOR SELECT TO authenticated USING (true);

-- Per 017: every new table needs its own grants in the same file.
GRANT SELECT ON public.autotask_tickets_lite, public.autotask_ticket_charges,
                public.autotask_billing_items, public.autotask_invoices_lite TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autotask_tickets_lite, public.autotask_ticket_charges,
                public.autotask_billing_items, public.autotask_invoices_lite TO service_role;
