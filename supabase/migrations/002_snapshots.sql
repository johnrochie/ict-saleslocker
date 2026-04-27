-- ============================================================
-- ICT SalesLocker — Pipeline Snapshots
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE pipeline_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Snapshot identity
  snapshot_name    TEXT NOT NULL,   -- e.g. "Leadership Meeting — 22 Apr 2026"
  snapshot_date    DATE NOT NULL,   -- date the snapshot was taken
  taken_by         TEXT,            -- user email

  -- Opportunity data at time of snapshot
  composite_key    TEXT NOT NULL,
  company          TEXT NOT NULL,
  opportunity_name TEXT NOT NULL,
  account_manager  TEXT,
  opportunity_owner TEXT,
  category         TEXT,
  stage            TEXT,
  status           TEXT,
  normalised_status TEXT,
  revenue_total    NUMERIC(15,2) DEFAULT 0,
  gross_profit     NUMERIC(15,2) DEFAULT 0,
  gross_margin_pct NUMERIC(8,4)  DEFAULT 0,
  projected_close_date DATE,
  age_days         INTEGER,

  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_name         ON pipeline_snapshots(snapshot_name);
CREATE INDEX idx_snapshots_date         ON pipeline_snapshots(snapshot_date);
CREATE INDEX idx_snapshots_composite    ON pipeline_snapshots(composite_key);

-- RLS
ALTER TABLE pipeline_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select" ON pipeline_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "snapshots_insert" ON pipeline_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "snapshots_delete" ON pipeline_snapshots
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
