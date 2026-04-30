-- ============================================================
-- ICT SalesLocker -- Sales Pulse Reports
-- ============================================================

CREATE TABLE sales_pulse_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_label   TEXT NOT NULL,       -- e.g. "Week of 28 Apr - 4 May 2026"
  week_start   DATE NOT NULL,
  week_end     DATE NOT NULL,
  
  -- Editable narrative sections (admin edits before publishing)
  meeting_notes      TEXT DEFAULT '',
  pipeline_narrative TEXT DEFAULT '',
  target_narrative   TEXT DEFAULT '',
  support_notes      TEXT DEFAULT 'Nothing at present.',
  
  -- Auto-generated data snapshot stored for reference
  data_snapshot JSONB,
  
  -- Status
  status       TEXT DEFAULT 'draft',  -- 'draft' | 'published'
  created_by   TEXT,
  published_at TIMESTAMPTZ,
  
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (week_start)
);

CREATE TRIGGER pulse_updated_at
  BEFORE UPDATE ON sales_pulse_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sales_pulse_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse_admin_only" ON sales_pulse_reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
