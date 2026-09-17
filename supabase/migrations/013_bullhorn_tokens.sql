-- ============================================================
-- ICT SalesIQ — Bullhorn session storage
-- ============================================================
-- Bullhorn layers a REST session (BhRestToken + restUrl) on top of
-- a standard OAuth2 access/refresh token pair. Both are stored here.
-- Unlike Xero (multi-tenant), Bullhorn is single-org, so this is an
-- append-only log rather than an upsert-by-tenant table: each token
-- refresh or REST re-login inserts a new row, and the client always
-- reads the most recent one (mirrors how getConnectedClient() reads
-- xero_tokens, just without the tenant_id unique key).

CREATE TABLE IF NOT EXISTS bullhorn_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token          TEXT NOT NULL,
  refresh_token         TEXT NOT NULL,
  token_expires_at      TIMESTAMPTZ NOT NULL,
  bh_rest_token         TEXT,
  rest_url              TEXT,
  rest_token_expires_at TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bullhorn_tokens_updated_at ON bullhorn_tokens(updated_at DESC);

CREATE TRIGGER bullhorn_tokens_updated_at
  BEFORE UPDATE ON bullhorn_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS enabled with no policies — only the service-role (admin) client,
-- which bypasses RLS, may read or write tokens. No authenticated-user
-- policy is defined on purpose: these are org-wide API credentials,
-- not per-user data.
ALTER TABLE bullhorn_tokens ENABLE ROW LEVEL SECURITY;
