-- ============================================================
-- ICT SalesIQ — new customer engagements
-- ============================================================
-- Feeds the "New customer engagements" section of the Monthly Business
-- Performance Review: customers created in the last 30 days that have a
-- quote against them.
--
--   autotask_customers : Autotask Companies, keeping the create date.
--                        The sync only writes companies created inside a
--                        rolling window, and rows stay once written, so
--                        older reports keep their history.
--   autotask_quotes    : Autotask Quotes. company_id is resolved at sync
--                        time through the quote's opportunity.
--
-- No hard foreign keys, same as 020: joins use the autotask_* ids.
-- ============================================================

CREATE TABLE autotask_customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_id   BIGINT NOT NULL UNIQUE,
  company_name  TEXT NOT NULL,
  create_date   TIMESTAMPTZ,
  is_active     BOOLEAN,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_at_customers_created ON autotask_customers (create_date);

CREATE TABLE autotask_quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_id     BIGINT NOT NULL UNIQUE,
  name            TEXT,
  opportunity_id  BIGINT,
  company_id      BIGINT,
  create_date     TIMESTAMPTZ,
  raw             JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_at_quotes_company     ON autotask_quotes (company_id);
CREATE INDEX idx_at_quotes_opportunity ON autotask_quotes (opportunity_id);

-- RLS: authenticated users can read; only the service-role sync job writes.
ALTER TABLE autotask_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE autotask_quotes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "at_customers_select" ON autotask_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "at_quotes_select"    ON autotask_quotes    FOR SELECT TO authenticated USING (true);

-- Per 017: every new table needs its own grants in the same file.
GRANT SELECT ON public.autotask_customers, public.autotask_quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autotask_customers, public.autotask_quotes TO service_role;
