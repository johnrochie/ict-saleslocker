-- ============================================================
-- ICT SalesLocker -- Deal exclusions
-- Manager-hidden deals that shouldn't appear in exec reporting
-- (Exec Pack, Pipeline Summary, Wins Summary) — e.g. a rep hasn't
-- updated the CRM or the deal is misreported. The opportunity row
-- itself is untouched and still shows on the operational Pipeline page.
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_exclusions (
  opportunity_id  uuid PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  reason          text,
  hidden_by       text,
  hidden_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS: readable by all authenticated users; writes go through service-role API
ALTER TABLE deal_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_deal_exclusions" ON deal_exclusions;
CREATE POLICY "authenticated_read_deal_exclusions" ON deal_exclusions
  FOR SELECT USING (auth.role() = 'authenticated');
