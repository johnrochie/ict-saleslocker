-- Autotask stage tags changed: "Leads" is now "New Lead", and a new
-- "Awaiting Approval" stage exists. Unmatched stages count at 0% in
-- Weighted Pipeline, so give them weights.
--   New Lead          -> 0%  (same as the old Leads stage)
--   Awaiting Approval -> 10% (same as Stage 2 Formal Quote / Proposal Sent)

UPDATE stage_weights SET stage = 'New Lead' WHERE stage = 'Leads';

INSERT INTO stage_weights (stage, weight_pct, display_order) VALUES
  ('Awaiting Approval', 10, 9)
ON CONFLICT (stage) DO UPDATE SET weight_pct = EXCLUDED.weight_pct;
