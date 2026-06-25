-- ============================================================
-- ICT SalesIQ — PO Approval Workflow
-- ============================================================

-- System settings table (shared config store)
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT
);

-- Default PO approval margin threshold
INSERT INTO system_settings (key, value, description) VALUES
  ('po_approval_margin_threshold', '20', 'Deals below this gross margin % require PO approval before ordering')
ON CONFLICT (key) DO NOTHING;

-- PO approval requests
CREATE TABLE po_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  autotask_id       INTEGER,
  company           TEXT,
  opportunity_name  TEXT,
  requested_by      TEXT NOT NULL,
  requested_at      TIMESTAMPTZ DEFAULT NOW(),
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  notes             TEXT,
  gross_margin_pct  NUMERIC(8,4),
  revenue_total     NUMERIC(15,2),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Only one pending request per opportunity at a time
CREATE UNIQUE INDEX po_approvals_pending_unique
  ON po_approvals(opportunity_id)
  WHERE status = 'pending';

CREATE INDEX idx_po_approvals_status        ON po_approvals(status);
CREATE INDEX idx_po_approvals_requested_by  ON po_approvals(requested_by);
CREATE INDEX idx_po_approvals_opportunity   ON po_approvals(opportunity_id);

-- Updated_at trigger
CREATE TRIGGER po_approvals_updated_at
  BEFORE UPDATE ON po_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE po_approvals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read approvals (reps see their own via app logic)
CREATE POLICY "po_approvals_select" ON po_approvals
  FOR SELECT TO authenticated USING (true);

-- Any authenticated user can insert (request an approval)
CREATE POLICY "po_approvals_insert" ON po_approvals
  FOR INSERT TO authenticated WITH CHECK (true);

-- Only admin/manager can update (approve/reject)
CREATE POLICY "po_approvals_update" ON po_approvals
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')
    )
  );

-- System settings: all authenticated can read
CREATE POLICY "system_settings_select" ON system_settings
  FOR SELECT TO authenticated USING (true);

-- Only admin can update settings
CREATE POLICY "system_settings_update" ON system_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
