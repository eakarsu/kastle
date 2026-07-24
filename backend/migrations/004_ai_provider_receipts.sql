CREATE TABLE security_ai_provider_receipts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL CHECK (provider = 'openrouter'),
  provider_request_id VARCHAR(160) NOT NULL,
  model VARCHAR(160) NOT NULL,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT security_ai_receipts_tenant_user_fkey FOREIGN KEY (tenant_id,user_id)
    REFERENCES security_users(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(provider,provider_request_id)
);
CREATE INDEX security_ai_receipts_identity_idx ON security_ai_provider_receipts(tenant_id,user_id,created_at DESC);
