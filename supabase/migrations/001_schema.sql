-- ============================================================
-- ICT SalesLocker — Phase 1 Schema
-- Run this in Supabase SQL Editor on a fresh project
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- OPPORTUNITIES
-- ============================================================
CREATE TABLE opportunities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Composite key for CSV upsert (Company | OpportunityName | CreateDate)
  composite_key         TEXT UNIQUE NOT NULL,

  -- Core identity
  company               TEXT NOT NULL,
  opportunity_name      TEXT NOT NULL,
  opportunity_owner     TEXT,
  account_manager       TEXT,

  -- Classification (stored, not used in reporting)
  category              TEXT,
  classification        TEXT,

  -- Stage & Status (raw values from Autotask)
  stage                 TEXT,
  status                TEXT,

  -- Normalised status — derived during CSV import
  -- Values: pipeline | on_hold | on_hold_stale | won | lost | portal
  normalised_status     TEXT NOT NULL DEFAULT 'pipeline',

  -- Dates
  created_date          TIMESTAMPTZ,
  projected_close_date  DATE,
  closed_date           DATE,
  last_activity         TIMESTAMPTZ,

  -- Financials
  revenue_total         NUMERIC(15,2) DEFAULT 0,
  revenue_one_time      NUMERIC(15,2) DEFAULT 0,
  cost_total            NUMERIC(15,2) DEFAULT 0,
  cost_one_time         NUMERIC(15,2) DEFAULT 0,
  gross_profit          NUMERIC(15,2) DEFAULT 0,
  gross_margin_pct      NUMERIC(8,4)  DEFAULT 0,

  -- Extra Autotask fields
  age_days              INTEGER,
  contact               TEXT,
  description           TEXT,
  line_of_business      TEXT,
  product_category      TEXT,
  market                TEXT,
  rating                TEXT,

  -- Data quality flags (set during import)
  cost_missing          BOOLEAN DEFAULT FALSE,  -- cost_total = 0 on non-zero revenue
  is_negative_margin    BOOLEAN DEFAULT FALSE,  -- gross_profit < 0
  is_overdue            BOOLEAN DEFAULT FALSE,  -- active & projected_close_date > 7 days past

  -- Import metadata
  last_imported_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opportunities_normalised_status ON opportunities(normalised_status);
CREATE INDEX idx_opportunities_account_manager   ON opportunities(account_manager);
CREATE INDEX idx_opportunities_opportunity_owner ON opportunities(opportunity_owner);
CREATE INDEX idx_opportunities_category          ON opportunities(category);
CREATE INDEX idx_opportunities_projected_close   ON opportunities(projected_close_date);
CREATE INDEX idx_opportunities_created_date      ON opportunities(created_date);

-- ============================================================
-- STAGE WEIGHTS (used for weighted pipeline / forecasting)
-- ============================================================
CREATE TABLE stage_weights (
  stage          TEXT PRIMARY KEY,
  weight_pct     NUMERIC(5,2) NOT NULL,
  display_order  INTEGER      NOT NULL
);

INSERT INTO stage_weights (stage, weight_pct, display_order) VALUES
  ('Leads',                                         0,   1),
  ('Stage 1 First Contact / Qualification',         5,   2),
  ('Stage 2 Formal Quote / Proposal Sent',          10,  3),
  ('Stage 3 Final Few / Final 2',                   50,  4),
  ('Stage 4 Verbal Confirmation / Contract Sent',   90,  5),
  ('Stage 5 PO Received',                           100, 6),
  ('Quarantine',                                    0,   7),
  ('Lost',                                          0,   8);

-- ============================================================
-- IMPORT LOGS
-- ============================================================
CREATE TABLE import_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_at     TIMESTAMPTZ DEFAULT NOW(),
  imported_by     TEXT,                    -- user email
  filename        TEXT,
  rows_processed  INTEGER DEFAULT 0,
  rows_inserted   INTEGER DEFAULT 0,
  rows_updated    INTEGER DEFAULT 0,
  rows_skipped    INTEGER DEFAULT 0,
  error_count     INTEGER DEFAULT 0,
  errors          JSONB,                   -- array of {row, message}
  status          TEXT DEFAULT 'success'   -- success | partial | failed
);

-- ============================================================
-- USER PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  full_name       TEXT,
  role            TEXT DEFAULT 'read_only',  -- admin | sales_manager | sales_rep | read_only
  autotask_name   TEXT,                      -- e.g. "Roche, John" — matches CSV owner fields
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE opportunities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_weights  ENABLE ROW LEVEL SECURITY;

-- Opportunities: all authenticated users can read
CREATE POLICY "opportunities_select" ON opportunities
  FOR SELECT TO authenticated USING (true);

-- Opportunities: only admin/manager can insert or update
CREATE POLICY "opportunities_insert" ON opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "opportunities_update" ON opportunities
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );

-- Profiles: users see own record; admins see all
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Stage weights: all authenticated users can read
CREATE POLICY "stage_weights_select" ON stage_weights
  FOR SELECT TO authenticated USING (true);

-- Import logs: admin/manager only
CREATE POLICY "import_logs_select" ON import_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "import_logs_insert" ON import_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );
