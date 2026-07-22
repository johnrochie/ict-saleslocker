-- ============================================================
-- ICT SalesIQ — Xero OAuth token storage
-- ============================================================

CREATE TABLE IF NOT EXISTS xero_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL UNIQUE,
  tenant_name   TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  id_token      TEXT,
  scope         TEXT,
  token_type    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER xero_tokens_updated_at
  BEFORE UPDATE ON xero_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS enabled with no policies — only the service-role (admin) client,
-- which bypasses RLS, may read or write tokens. No authenticated-user
-- policy is defined on purpose: these are org-wide OAuth credentials,
-- not per-user data.
ALTER TABLE xero_tokens ENABLE ROW LEVEL SECURITY;
