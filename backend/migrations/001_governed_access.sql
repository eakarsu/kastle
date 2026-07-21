CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE security_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE security_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 160),
  role text NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'AUDITOR')),
  is_active boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX security_users_tenant_email_key ON security_users (tenant_id, lower(email));

CREATE TABLE security_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  timezone text NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 80),
  default_decision text NOT NULL DEFAULT 'DENY' CHECK (default_decision = 'DENY'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE security_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  holder_name text NOT NULL CHECK (char_length(holder_name) BETWEEN 2 AND 160),
  badge_number text NOT NULL CHECK (char_length(badge_number) BETWEEN 3 AND 80),
  credential_type text NOT NULL CHECK (credential_type IN ('CARD', 'MOBILE', 'FOB')),
  access_level text NOT NULL CHECK (char_length(access_level) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  expires_on date NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, property_id) REFERENCES security_properties(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, badge_number),
  UNIQUE (tenant_id, id)
);

CREATE TABLE security_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 160),
  door_pattern text NOT NULL CHECK (char_length(door_pattern) BETWEEN 1 AND 160),
  action text NOT NULL CHECK (action IN ('ALLOW', 'DENY', 'REQUIRE_MFA')),
  priority integer NOT NULL CHECK (priority BETWEEN 1 AND 100),
  days smallint[] NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES security_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, property_id) REFERENCES security_properties(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, property_id, name),
  UNIQUE (tenant_id, id),
  CHECK (days <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);

CREATE TABLE security_access_rule_versions (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES security_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, rule_id) REFERENCES security_access_rules(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, rule_id, version)
);

CREATE TABLE security_readers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  key_hash char(64) NOT NULL UNIQUE CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  last_seen_at timestamptz,
  created_by uuid NOT NULL REFERENCES security_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, property_id) REFERENCES security_properties(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, property_id, name),
  UNIQUE (tenant_id, id)
);

CREATE TABLE security_access_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  reader_id uuid NOT NULL,
  external_event_id text NOT NULL CHECK (char_length(external_event_id) BETWEEN 8 AND 160),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  credential_id uuid,
  badge_number text NOT NULL CHECK (char_length(badge_number) BETWEEN 3 AND 80),
  door_name text NOT NULL CHECK (char_length(door_name) BETWEEN 1 AND 160),
  direction text NOT NULL CHECK (direction IN ('ENTRY', 'EXIT')),
  mfa_verified boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ALLOW', 'DENY')),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 2 AND 80),
  reason_detail text NOT NULL CHECK (char_length(reason_detail) BETWEEN 2 AND 500),
  matched_rule_id uuid,
  credential_snapshot jsonb,
  rule_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, property_id) REFERENCES security_properties(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reader_id) REFERENCES security_readers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, credential_id) REFERENCES security_credentials(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, matched_rule_id) REFERENCES security_access_rules(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, external_event_id)
);

CREATE TABLE security_audit_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES security_tenants(id) ON DELETE RESTRICT,
  sequence bigint NOT NULL CHECK (sequence > 0),
  actor_type text NOT NULL CHECK (actor_type IN ('USER', 'READER', 'SYSTEM')),
  actor_id text NOT NULL CHECK (char_length(actor_id) BETWEEN 1 AND 160),
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 100),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 2 AND 100),
  entity_id text NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 160),
  payload jsonb NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  previous_hash char(64) NOT NULL CHECK (previous_hash = '0000000000000000000000000000000000000000000000000000000000000000' OR previous_hash ~ '^[a-f0-9]{64}$'),
  event_hash char(64) NOT NULL UNIQUE CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  UNIQUE (tenant_id, sequence)
);

CREATE INDEX security_attempts_tenant_created_idx ON security_access_attempts (tenant_id, created_at DESC);
CREATE INDEX security_attempts_property_door_idx ON security_access_attempts (tenant_id, property_id, door_name, occurred_at DESC);
CREATE INDEX security_rules_evaluation_idx ON security_access_rules (tenant_id, property_id, enabled, priority DESC);
CREATE INDEX security_credentials_lookup_idx ON security_credentials (tenant_id, badge_number, status);
CREATE INDEX security_audit_tenant_sequence_idx ON security_audit_events (tenant_id, sequence);

CREATE FUNCTION security_reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER security_access_attempts_immutable
  BEFORE UPDATE OR DELETE ON security_access_attempts
  FOR EACH ROW EXECUTE FUNCTION security_reject_immutable_change();
CREATE TRIGGER security_rule_versions_immutable
  BEFORE UPDATE OR DELETE ON security_access_rule_versions
  FOR EACH ROW EXECUTE FUNCTION security_reject_immutable_change();
CREATE TRIGGER security_audit_events_immutable
  BEFORE UPDATE OR DELETE ON security_audit_events
  FOR EACH ROW EXECUTE FUNCTION security_reject_immutable_change();

CREATE FUNCTION security_verify_audit_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_sequence bigint;
  expected_previous char(64);
BEGIN
  SELECT COALESCE(MAX(sequence), 0) + 1,
         COALESCE((ARRAY_AGG(event_hash ORDER BY sequence DESC))[1], repeat('0', 64)::char(64))
    INTO expected_sequence, expected_previous
    FROM security_audit_events
   WHERE tenant_id = NEW.tenant_id;
  IF NEW.sequence <> expected_sequence OR NEW.previous_hash <> expected_previous THEN
    RAISE EXCEPTION 'invalid audit chain link' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER security_audit_events_chain
  BEFORE INSERT ON security_audit_events
  FOR EACH ROW EXECUTE FUNCTION security_verify_audit_link();
