-- ============================================================
-- ICT SalesLocker — Commission Engine (Phase 2)
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Category mappings ─────────────────────────────────────
-- Maps Autotask opportunity categories to commission categories
CREATE TABLE commission_category_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_category TEXT NOT NULL UNIQUE,
  commission_category TEXT NOT NULL,  -- 'hardware' | 'maintenance' | 'support_services' | 'exclude'
  notes           TEXT,
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO commission_category_mappings (autotask_category, commission_category, notes) VALUES
  ('Hardware Sale (4006)',        'hardware',         'Standard hardware sales'),
  ('DOJ Tender Sales',            'hardware',         'DOJ framework hardware'),
  ('Storage & Logistics (4011)',  'hardware',         'Storage treated as hardware'),
  ('Annual Maintenance (ICT)',    'maintenance',      'ICT annual maintenance contracts'),
  ('Reseller Warranty (4014)',    'maintenance',      'Reseller warranty renewals'),
  ('Deployments & Projects (4004)', 'support_services', 'Deployment and project work'),
  ('Strategic Sales (4017)',      'support_services', 'Strategic / consulting sales'),
  ('Software Sale (4010)',        'exclude',          'Excluded from commission calc by default');

-- ── Type 1 rate table ─────────────────────────────────────
-- Category × business type → commission rate
CREATE TABLE commission_type1_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_type  TEXT NOT NULL,  -- 'new_client' | 'existing_client' | 'renewal'
  commission_category TEXT NOT NULL,  -- 'hardware' | 'maintenance' | 'support_services'
  rate_pct       NUMERIC(6,4) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,
  notes          TEXT,
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_type, commission_category, effective_from)
);

INSERT INTO commission_type1_rates (business_type, commission_category, rate_pct, notes) VALUES
  ('new_client',      'hardware',          0.15,  'New client hardware — 15%'),
  ('new_client',      'maintenance',       0.08,  'New client maintenance — 8%'),
  ('new_client',      'support_services',  0.04,  'New client support services — 4%'),
  ('existing_client', 'hardware',          0.10,  'Existing client hardware — 10%'),
  ('existing_client', 'maintenance',       0.04,  'Existing client maintenance — 4%'),
  ('existing_client', 'support_services',  0.02,  'Existing client support services — 2%'),
  ('renewal',         'maintenance',       0.02,  'Renewals — enterprise hardware maintenance — 2%');

-- ── Per-rep commission configuration ──────────────────────
CREATE TABLE commission_rep_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_name         TEXT NOT NULL,  -- matches opportunities.account_manager
  display_name          TEXT NOT NULL,
  commission_type       TEXT NOT NULL,  -- 'type1' | 'type2' | 'type3'
  is_active             BOOLEAN DEFAULT TRUE,

  -- Type 1 settings
  burden_rate           NUMERIC(6,4) DEFAULT 0.25,  -- 25% burden on gross

  -- Type 2 settings
  quarterly_threshold   NUMERIC(12,2),  -- e.g. 18000
  threshold_rate        NUMERIC(6,4) DEFAULT 0.10,  -- 10% above threshold

  -- Type 3 settings
  annual_margin_target  NUMERIC(12,2),   -- e.g. 450000
  annual_bonus          NUMERIC(12,2),   -- e.g. 56000
  stage1_threshold      NUMERIC(12,2),   -- e.g. 450000 (accelerator start)
  stage1_rate           NUMERIC(6,4) DEFAULT 0.20,
  stage2_threshold      NUMERIC(12,2),   -- e.g. 950000
  stage2_rate           NUMERIC(6,4) DEFAULT 0.25,
  rollover_enabled      BOOLEAN DEFAULT TRUE,

  effective_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to          DATE,
  notes                 TEXT,
  updated_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Deal-level client type classification ─────────────────
-- New client vs existing client vs renewal per deal
-- Auto-detected but overrideable by admin/rep
CREATE TABLE commission_deal_classifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composite_key   TEXT NOT NULL UNIQUE,
  company         TEXT NOT NULL,
  business_type   TEXT NOT NULL,  -- 'new_client' | 'existing_client' | 'renewal'
  auto_detected   BOOLEAN DEFAULT TRUE,
  override_by     TEXT,
  override_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comm_classifications_composite ON commission_deal_classifications(composite_key);

-- ── Quarterly commission calculations ─────────────────────
CREATE TABLE commission_calculations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_name   TEXT NOT NULL,
  display_name    TEXT,
  commission_type TEXT NOT NULL,
  year            INTEGER NOT NULL,
  quarter_num     INTEGER NOT NULL CHECK (quarter_num BETWEEN 1 AND 4),
  quarter_label   TEXT NOT NULL,  -- 'Q1 2026'

  -- Aggregated input
  total_revenue       NUMERIC(12,2) DEFAULT 0,
  total_direct_costs  NUMERIC(12,2) DEFAULT 0,
  total_burdened_cost NUMERIC(12,2) DEFAULT 0,
  total_margin        NUMERIC(12,2) DEFAULT 0,  -- after burden for Type 1
  deals_included      INTEGER DEFAULT 0,

  -- Commission output
  commission_base     NUMERIC(12,2) DEFAULT 0,  -- margin on which commission is calculated
  commission_earned   NUMERIC(12,2) DEFAULT 0,  -- the commission amount
  quarterly_bonus     NUMERIC(12,2) DEFAULT 0,  -- Type 3 quarterly portion of annual bonus
  total_payable       NUMERIC(12,2) DEFAULT 0,  -- commission + bonus

  -- Type 3 cumulative (for rollover)
  cumulative_margin_ytd   NUMERIC(12,2) DEFAULT 0,
  cumulative_target_ytd   NUMERIC(12,2) DEFAULT 0,

  -- Status
  status          TEXT DEFAULT 'draft',  -- 'draft' | 'approved' | 'paid'
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (autotask_name, year, quarter_num)
);

-- ── Deal-level commission lines ───────────────────────────
CREATE TABLE commission_deal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id  UUID REFERENCES commission_calculations(id) ON DELETE CASCADE,
  composite_key   TEXT NOT NULL,
  company         TEXT NOT NULL,
  opportunity_name TEXT NOT NULL,
  autotask_name   TEXT NOT NULL,
  quarter_label   TEXT NOT NULL,

  -- Deal financials
  revenue         NUMERIC(12,2) DEFAULT 0,
  direct_cost     NUMERIC(12,2) DEFAULT 0,
  subtotal_for_burden NUMERIC(12,2) DEFAULT 0,
  burdened_cost   NUMERIC(12,2) DEFAULT 0,
  total_cost      NUMERIC(12,2) DEFAULT 0,
  margin          NUMERIC(12,2) DEFAULT 0,

  -- Classification & rate
  business_type   TEXT,   -- new_client | existing_client | renewal
  commission_category TEXT,
  rate_applied    NUMERIC(6,4) DEFAULT 0,
  commission_value NUMERIC(12,2) DEFAULT 0,

  -- Overrides
  override_applied   BOOLEAN DEFAULT FALSE,
  override_reason    TEXT,
  override_by        TEXT,
  override_at        TIMESTAMPTZ,

  closed_date     DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comm_lines_calc ON commission_deal_lines(calculation_id);
CREATE INDEX idx_comm_lines_composite ON commission_deal_lines(composite_key);

-- ── Audit trail ───────────────────────────────────────────
CREATE TABLE commission_audit_trail (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,  -- 'create' | 'update' | 'override' | 'approve' | 'pay'
  changed_by  TEXT NOT NULL,
  changed_at  TIMESTAMPTZ DEFAULT NOW(),
  old_values  JSONB,
  new_values  JSONB,
  reason      TEXT
);

-- ── Triggers for updated_at ───────────────────────────────
CREATE TRIGGER comm_rep_configs_updated_at
  BEFORE UPDATE ON commission_rep_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER comm_calculations_updated_at
  BEFORE UPDATE ON commission_calculations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE commission_category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_type1_rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rep_configs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_deal_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_calculations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_deal_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_audit_trail       ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config tables
CREATE POLICY "comm_cat_map_read"  ON commission_category_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "comm_rates_read"    ON commission_type1_rates       FOR SELECT TO authenticated USING (true);
CREATE POLICY "comm_rep_read"      ON commission_rep_configs        FOR SELECT TO authenticated USING (true);
CREATE POLICY "comm_class_read"    ON commission_deal_classifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "comm_calc_read"     ON commission_calculations       FOR SELECT TO authenticated USING (true);
CREATE POLICY "comm_lines_read"    ON commission_deal_lines         FOR SELECT TO authenticated USING (true);
CREATE POLICY "comm_audit_read"    ON commission_audit_trail        FOR SELECT TO authenticated USING (true);

-- Only admin/manager can write
CREATE POLICY "comm_cat_map_write" ON commission_category_mappings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
CREATE POLICY "comm_rates_write"   ON commission_type1_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
CREATE POLICY "comm_rep_write"     ON commission_rep_configs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
CREATE POLICY "comm_class_write"   ON commission_deal_classifications FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
CREATE POLICY "comm_calc_write"    ON commission_calculations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
CREATE POLICY "comm_lines_write"   ON commission_deal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
CREATE POLICY "comm_audit_write"   ON commission_audit_trail FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','sales_manager')));
