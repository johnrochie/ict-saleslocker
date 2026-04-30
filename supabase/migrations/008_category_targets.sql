-- ============================================================
-- ICT SalesLocker -- Category Revenue Targets
-- GL-code product-line targets + Autotask category mapping
-- ============================================================

-- Annual targets by GL category (quarterly = annual / 4)
CREATE TABLE IF NOT EXISTS category_revenue_targets (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year                  integer NOT NULL,
  category_name         text NOT NULL,
  gl_code               text,
  annual_revenue_target numeric(14,2) NOT NULL DEFAULT 0,
  is_framework          boolean NOT NULL DEFAULT false,
  sort_order            integer NOT NULL DEFAULT 0,
  updated_by            text,
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(year, category_name)
);

-- Autotask opportunity category -> GL category name
-- Seed with known values; update autotask_category to match your Autotask setup
CREATE TABLE IF NOT EXISTS autotask_gl_map (
  autotask_category  text PRIMARY KEY,
  gl_category_name   text NOT NULL,
  notes              text
);

-- RLS: readable by all authenticated users; writes go through service-role API
ALTER TABLE category_revenue_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE autotask_gl_map          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_cat_targets" ON category_revenue_targets;
DROP POLICY IF EXISTS "authenticated_read_gl_map"      ON autotask_gl_map;

CREATE POLICY "authenticated_read_cat_targets" ON category_revenue_targets
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read_gl_map" ON autotask_gl_map
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── Seed 2026 targets ─────────────────────────────────────
INSERT INTO category_revenue_targets
  (year, category_name, gl_code, annual_revenue_target, is_framework, sort_order)
VALUES
  (2026, 'Hardware Sales',              '4006', 5585000, false,  1),
  (2026, 'Dedicated Resources',         '4003', 3484097, false,  2),
  (2026, 'Dispatch Services',           '4005', 1526875, false,  3),
  (2026, 'Strategic Sales',              null,  1237000, false,  4),
  (2026, 'Annual Maintenance',          '4001',  798683, false,  5),
  (2026, 'MSP',                         '4016',  735114, false,  6),
  (2026, 'Deployment & Projects',       '4004',  670000, false,  7),
  (2026, 'Reseller Warranty',           '4014',  214327, false,  8),
  (2026, 'Customer Rebate',              null,   120500, false,  9),
  (2026, 'Storage & Logistics',          null,   108780, false, 10),
  (2026, 'Software Sales',               null,    36000, false, 11),
  (2026, 'Reseller Services / General', '4015',   25200, false, 12),
  -- Framework accounts
  (2026, 'OGP (Lot 1)',                  null,  5900000, true,  20),
  (2026, 'OGP (Lot 2)',                  null,  1800000, true,  21),
  (2026, 'Garda',                        null,  5000000, true,  22),
  (2026, 'DOJ',                          null,  1500000, true,  23)
ON CONFLICT (year, category_name) DO NOTHING;

-- ── Seed Autotask category mappings ──────────────────────
-- Update autotask_category values to match your Autotask category names exactly.
-- Run: SELECT DISTINCT category FROM opportunities ORDER BY 1
-- to see all category values in your data.
INSERT INTO autotask_gl_map (autotask_category, gl_category_name, notes) VALUES
  -- Hardware
  ('Hardware Sale (4006)',           'Hardware Sales',              'Standard Autotask hardware category'),
  ('Hardware',                       'Hardware Sales',              null),
  -- Software
  ('Software Sale (4010)',           'Software Sales',              null),
  ('Software',                       'Software Sales',              null),
  -- Annual Maintenance
  ('Annual Maintenance (ICT)',       'Annual Maintenance',          null),
  ('Annual Maintenance',             'Annual Maintenance',          null),
  -- Dedicated Resources
  ('Dedicated Resources (4003)',     'Dedicated Resources',         null),
  ('Dedicated Resources',            'Dedicated Resources',         null),
  -- Reseller Warranty
  ('Reseller Warranty (4014)',       'Reseller Warranty',           null),
  ('Reseller Warranty',              'Reseller Warranty',           null),
  -- MSP / Managed Services
  ('Managed Services',               'MSP',                         'Generic MSP'),
  ('Managed Services- Account Mgmt','MSP',                         null),
  ('Managed Services Account Mgmt', 'MSP',                         null),
  -- Storage & Logistics
  ('Storage & Logistics (4011)',     'Storage & Logistics',         null),
  ('Storage & Logistics',            'Storage & Logistics',         null),
  -- Deployment & Projects
  ('Deployments & Projects (4004)',  'Deployment & Projects',       null),
  ('Deployment & Projects',          'Deployment & Projects',       null),
  ('Projects',                       'Deployment & Projects',       null),
  ('Professional Services',          'Deployment & Projects',       null),
  -- Strategic Sales
  ('Strategic Sales (4017)',         'Strategic Sales',             null),
  ('Strategic Sales',                'Strategic Sales',             null),
  -- Dispatch Services
  ('Dispatch Services',              'Dispatch Services',           null),
  ('Dispatch',                       'Dispatch Services',           null),
  ('Break-Fix',                      'Dispatch Services',           null),
  -- Customer Rebate
  ('Customer Rebate',                'Customer Rebate',             null),
  -- Reseller Services
  ('Reseller Services',              'Reseller Services / General', null),
  ('Reseller Services / General',    'Reseller Services / General', null),
  -- DOJ framework (tracked via Autotask category)
  ('DOJ Tender Sales',               'DOJ',                         'Framework deals via Autotask category')
ON CONFLICT (autotask_category) DO NOTHING;

-- ── View: quarterly revenue actuals by GL category ────────
-- Joins won opportunities through autotask_gl_map.
-- Unmatched categories are excluded; add rows to autotask_gl_map to include them.
CREATE OR REPLACE VIEW v_category_quarterly_actuals AS
SELECT
  m.gl_category_name                                  AS category_name,
  EXTRACT(YEAR    FROM o.closed_date::date)::integer  AS year,
  EXTRACT(QUARTER FROM o.closed_date::date)::integer  AS quarter_num,
  SUM(o.revenue_total)                                AS actual_revenue,
  SUM(o.gross_profit)                                 AS actual_gp,
  COUNT(*)                                            AS deal_count
FROM opportunities o
JOIN autotask_gl_map m ON m.autotask_category = o.category
WHERE o.normalised_status = 'won'
  AND o.closed_date IS NOT NULL
GROUP BY 1, 2, 3;
