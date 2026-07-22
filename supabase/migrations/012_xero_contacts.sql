-- ============================================================
-- ICT SalesIQ — Xero Contacts
-- ============================================================

CREATE TABLE IF NOT EXISTS xero_contacts (
  xero_contact_id UUID PRIMARY KEY,
  account_number  TEXT,
  name            TEXT NOT NULL,
  email           TEXT,
  status          TEXT,
  is_customer     BOOLEAN,
  is_supplier     BOOLEAN,
  raw             JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_xero_contacts_account_number ON xero_contacts(account_number);
CREATE INDEX idx_xero_contacts_name           ON xero_contacts(name);

-- RLS: authenticated users can read (needed for dashboard joins);
-- only the service-role (admin) client, used by the sync job, can write.
ALTER TABLE xero_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xero_contacts_select" ON xero_contacts
  FOR SELECT TO authenticated USING (true);
