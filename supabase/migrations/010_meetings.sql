-- ============================================================
-- ICT SalesIQ — Meetings (Autotask CompanyToDos + CompanyNotes sync)
-- ============================================================
-- Mirrors the "To-Do & Note Search" CSV previously uploaded manually
-- on the Weekly Report. Autotask splits this across two entities:
--   - CompanyToDos  — scheduled/upcoming meetings
--   - CompanyNotes  — meetings that have already taken place
--     (a completed To-Do converts into a Note)
-- Both entities have independent ID sequences, so the natural key
-- is (source, autotask_id), not autotask_id alone.
-- ============================================================

CREATE TABLE meetings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source            TEXT NOT NULL,             -- 'todo' | 'note'
  autotask_id       INTEGER NOT NULL,

  company           TEXT NOT NULL,
  opportunity       TEXT,
  contact           TEXT,
  assigned_to       TEXT,
  action_type       TEXT,                      -- resolved picklist label
  classification    TEXT,

  start_date        DATE,
  start_time        TEXT,
  description       TEXT,

  last_imported_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (source, autotask_id)
);

CREATE INDEX idx_meetings_start_date  ON meetings(start_date);
CREATE INDEX idx_meetings_assigned_to ON meetings(assigned_to);
CREATE INDEX idx_meetings_company     ON meetings(company);

CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON meetings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "meetings_insert" ON meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "meetings_update" ON meetings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );
