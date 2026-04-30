-- ============================================================
-- ICT SalesLocker -- Targets Module
-- ============================================================

-- Company-level targets (independent of rep targets)
-- Covers full business including non-CRM revenue
CREATE TABLE company_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year         INTEGER NOT NULL,
  quarter_num  INTEGER NOT NULL CHECK (quarter_num BETWEEN 1 AND 4),
  revenue_target NUMERIC(14,2),  -- total company revenue target
  margin_target  NUMERIC(14,2),  -- total company GP target
  notes        TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (year, quarter_num)
);

-- Individual rep targets (margin-driven)
CREATE TABLE rep_targets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autotask_name         TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  year                  INTEGER NOT NULL,
  quarter_num           INTEGER NOT NULL CHECK (quarter_num BETWEEN 1 AND 4),
  -- Personal margin target (all reps have this)
  personal_margin_target NUMERIC(12,2),
  -- Team pool margin target (optional — for reps who also contribute to a shared account pool)
  team_margin_target    NUMERIC(12,2),
  notes                 TEXT,
  updated_by            TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (autotask_name, year, quarter_num)
);

CREATE INDEX idx_rep_targets_name ON rep_targets(autotask_name);
CREATE INDEX idx_rep_targets_period ON rep_targets(year, quarter_num);

-- Triggers
CREATE TRIGGER company_targets_updated_at
  BEFORE UPDATE ON company_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rep_targets_updated_at
  BEFORE UPDATE ON rep_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE company_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_targets      ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read targets
CREATE POLICY "company_targets_read" ON company_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "rep_targets_read"     ON rep_targets     FOR SELECT TO authenticated USING (true);

-- Admin only can write
CREATE POLICY "company_targets_write" ON company_targets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "rep_targets_write" ON rep_targets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
