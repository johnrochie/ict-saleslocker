-- ============================================================
-- ICT SalesIQ — Account Management programme
-- ============================================================
-- am_customers : which customers each Account Manager owns, and their tier.
--                Maintained in SalesIQ for now (the spreadsheet of accounts
--                and targets is not wired in yet). Tier drives the visit target.
-- opportunities.lead_source : Autotask "Lead Source". AMs pick
--                "Account Management Visit" on opportunities that come out
--                of a visit, which is how SalesIQ links quotes to visits.
-- ============================================================

CREATE TABLE am_customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company          TEXT NOT NULL,            -- must match the Autotask company name
  account_manager  TEXT NOT NULL,            -- Autotask resource name, "Surname, Firstname"
  tier             TEXT NOT NULL CHECK (tier IN ('1+', '1', '2', '3', '4', '5')),
  annual_revenue   NUMERIC(15,2),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_am_customers_company ON am_customers (LOWER(company));
CREATE INDEX idx_am_customers_am ON am_customers (account_manager);

CREATE TRIGGER am_customers_updated_at
  BEFORE UPDATE ON am_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE am_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "am_customers_select" ON am_customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "am_customers_write" ON am_customers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.am_customers TO authenticated, service_role;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_source TEXT;
CREATE INDEX IF NOT EXISTS idx_opportunities_lead_source ON opportunities (lead_source);
