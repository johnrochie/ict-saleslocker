-- ============================================================
-- ICT SalesLocker — Commission Account Splits
-- ============================================================

-- Company-level default splits
-- Applied automatically to all deals for that company
CREATE TABLE commission_company_splits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company       TEXT NOT NULL UNIQUE,
  rep1_name     TEXT NOT NULL,   -- autotask_name of first rep
  rep1_pct      NUMERIC(5,2) NOT NULL DEFAULT 50,
  rep2_name     TEXT,            -- autotask_name of second rep (null = 100% to rep1)
  rep2_pct      NUMERIC(5,2),
  notes         TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT company_splits_total CHECK (
    (rep2_name IS NULL AND rep1_pct = 100) OR
    (rep2_name IS NOT NULL AND rep1_pct + COALESCE(rep2_pct, 0) = 100)
  )
);

-- Deal-level splits — overrides company default for a specific deal
CREATE TABLE commission_deal_splits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composite_key TEXT NOT NULL UNIQUE,
  company       TEXT NOT NULL,
  rep1_name     TEXT NOT NULL,
  rep1_pct      NUMERIC(5,2) NOT NULL DEFAULT 100,
  rep2_name     TEXT,
  rep2_pct      NUMERIC(5,2),
  notes         TEXT,
  override_by   TEXT,
  override_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT deal_splits_total CHECK (
    (rep2_name IS NULL AND rep1_pct = 100) OR
    (rep2_name IS NOT NULL AND rep1_pct + COALESCE(rep2_pct, 0) = 100)
  )
);

CREATE INDEX idx_company_splits_company ON commission_company_splits(company);
CREATE INDEX idx_deal_splits_composite  ON commission_deal_splits(composite_key);

-- RLS
ALTER TABLE commission_company_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_deal_splits    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_splits_read" ON commission_company_splits FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_splits_write" ON commission_company_splits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));

CREATE POLICY "deal_splits_read" ON commission_deal_splits FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_splits_write" ON commission_deal_splits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
