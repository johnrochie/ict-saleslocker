-- ============================================================
-- ICT SalesLocker -- Shared Views
-- Centralise common aggregation logic used across modules
-- ============================================================

-- Rep quarterly actuals
-- Used by: Targets, Commission, Pulse, Weekly Report
-- Attribution: account_manager primary, opportunity_owner fallback
-- Excludes: Portal/OGP, null closed_date
CREATE OR REPLACE VIEW v_rep_quarterly_actuals AS
SELECT
  COALESCE(
    NULLIF(account_manager, 'Portal, OGP'),
    opportunity_owner
  ) AS autotask_name,
  EXTRACT(YEAR    FROM closed_date::date)::integer AS year,
  EXTRACT(QUARTER FROM closed_date::date)::integer AS quarter_num,
  SUM(revenue_total) AS actual_revenue,
  SUM(gross_profit)  AS actual_gp,
  COUNT(*)           AS deal_count
FROM opportunities
WHERE normalised_status = 'won'
  AND closed_date IS NOT NULL
  AND COALESCE(NULLIF(account_manager, 'Portal, OGP'), opportunity_owner) IS NOT NULL
GROUP BY 1, 2, 3;

-- Company quarterly actuals (all won deals, excludes portal)
-- Used by: Targets (company attainment), Pulse, Overview
CREATE OR REPLACE VIEW v_company_quarterly_actuals AS
SELECT
  EXTRACT(YEAR    FROM closed_date::date)::integer AS year,
  EXTRACT(QUARTER FROM closed_date::date)::integer AS quarter_num,
  SUM(revenue_total) AS actual_revenue,
  SUM(gross_profit)  AS actual_gp,
  COUNT(*)           AS deal_count
FROM opportunities
WHERE normalised_status = 'won'
  AND closed_date IS NOT NULL
  AND normalised_status != 'portal'
GROUP BY 1, 2;

-- Target attainment (joins rep actuals with rep targets)
-- Used by: Targets dashboard, Pulse report
CREATE OR REPLACE VIEW v_rep_target_attainment AS
SELECT
  rt.autotask_name,
  rt.display_name,
  rt.year,
  rt.quarter_num,
  rt.personal_margin_target,
  rt.team_margin_target,
  COALESCE(ra.actual_revenue, 0) AS actual_revenue,
  COALESCE(ra.actual_gp, 0)      AS actual_gp,
  COALESCE(ra.deal_count, 0)     AS deal_count,
  CASE
    WHEN rt.personal_margin_target > 0
    THEN ROUND((COALESCE(ra.actual_gp, 0) / rt.personal_margin_target * 100)::numeric, 1)
    ELSE NULL
  END AS personal_attainment_pct
FROM rep_targets rt
LEFT JOIN v_rep_quarterly_actuals ra
  ON  ra.autotask_name = rt.autotask_name
  AND ra.year          = rt.year
  AND ra.quarter_num   = rt.quarter_num;

-- RLS: views inherit permissions from underlying tables
-- All authenticated users can read these views (same as opportunities + targets)
