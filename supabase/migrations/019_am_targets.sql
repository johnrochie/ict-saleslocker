-- ============================================================
-- ICT SalesIQ — Account Management target settings
-- ============================================================
-- am_tier_settings    : visits / phone calls per year for each tier. Editable
--                       in the app; falls back to the defaults in config.ts if a
--                       tier has no row.
-- am_target_overrides : fixed monthly visit target for an AM. month = '' is a
--                       standing override; 'YYYY-MM' applies to that month only
--                       and wins over the standing one. No row = calculated
--                       from the AM's customers' tiers.
-- ============================================================

CREATE TABLE am_tier_settings (
  tier            TEXT PRIMARY KEY CHECK (tier IN ('1+', '1', '2', '3', '4', '5')),
  visits_per_year INTEGER NOT NULL DEFAULT 0 CHECK (visits_per_year >= 0),
  calls_per_year  INTEGER NOT NULL DEFAULT 0 CHECK (calls_per_year >= 0),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO am_tier_settings (tier, visits_per_year, calls_per_year) VALUES
  ('1+', 4, 0), ('1', 4, 0), ('2', 4, 0), ('3', 2, 0), ('4', 0, 2), ('5', 0, 1);

CREATE TABLE am_target_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager TEXT NOT NULL,
  month           TEXT NOT NULL DEFAULT '',
  monthly_target  NUMERIC(6,1) NOT NULL CHECK (monthly_target >= 0),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_manager, month)
);

ALTER TABLE am_tier_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE am_target_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "am_tier_settings_select" ON am_tier_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "am_target_overrides_select" ON am_target_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "am_tier_settings_write" ON am_tier_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')));

CREATE POLICY "am_target_overrides_write" ON am_target_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'sales_manager')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.am_tier_settings    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.am_target_overrides TO authenticated, service_role;
