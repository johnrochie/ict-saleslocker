-- ============================================================
-- ICT SalesIQ — Bullhorn recruitment data
-- ============================================================
-- Synced copies of Bullhorn JobOrder / JobSubmission / Placement
-- records, kept for the Recruitment dashboard. RLS enabled with a
-- single read-open policy for authenticated users — writes happen
-- only via the service-role sync job — mirroring xero_contacts in
-- 012_xero_contacts.sql.

CREATE TABLE IF NOT EXISTS bullhorn_job_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bullhorn_id      BIGINT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  company_name     TEXT,
  hiring_manager   TEXT,
  location         TEXT,
  salary           TEXT,
  employment_type  TEXT,
  status           TEXT,
  is_open          BOOLEAN NOT NULL DEFAULT TRUE,
  date_added       TIMESTAMPTZ,
  notes            TEXT,
  raw              JSONB,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bullhorn_job_orders_is_open    ON bullhorn_job_orders(is_open);
CREATE INDEX idx_bullhorn_job_orders_date_added ON bullhorn_job_orders(date_added);

CREATE TABLE IF NOT EXISTS bullhorn_submissions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bullhorn_id            BIGINT NOT NULL UNIQUE,
  job_order_bullhorn_id  BIGINT NOT NULL REFERENCES bullhorn_job_orders(bullhorn_id) ON DELETE CASCADE,
  candidate_bullhorn_id  BIGINT,
  candidate_name         TEXT,
  status                 TEXT,
  cv_sent                BOOLEAN NOT NULL DEFAULT FALSE,
  date_added             TIMESTAMPTZ,
  date_web_response      TIMESTAMPTZ,
  comments               TEXT,
  raw                    JSONB,
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bullhorn_submissions_job_order ON bullhorn_submissions(job_order_bullhorn_id);
CREATE INDEX idx_bullhorn_submissions_status    ON bullhorn_submissions(status);

CREATE TABLE IF NOT EXISTS bullhorn_placements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bullhorn_id            BIGINT NOT NULL UNIQUE,
  job_order_bullhorn_id  BIGINT REFERENCES bullhorn_job_orders(bullhorn_id) ON DELETE SET NULL,
  candidate_name         TEXT,
  role_title             TEXT,
  company_name           TEXT,
  start_date             TIMESTAMPTZ,
  employment_type        TEXT,
  notes                  TEXT,
  raw                    JSONB,
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bullhorn_placements_start_date ON bullhorn_placements(start_date);

CREATE TRIGGER bullhorn_job_orders_updated_at  BEFORE UPDATE ON bullhorn_job_orders  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER bullhorn_submissions_updated_at BEFORE UPDATE ON bullhorn_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER bullhorn_placements_updated_at  BEFORE UPDATE ON bullhorn_placements  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE bullhorn_job_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bullhorn_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bullhorn_placements  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bullhorn_job_orders_select" ON bullhorn_job_orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bullhorn_submissions_select" ON bullhorn_submissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bullhorn_placements_select" ON bullhorn_placements
  FOR SELECT TO authenticated USING (true);
