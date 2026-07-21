#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(required.name, ', ') INTO missing
  FROM (VALUES
    ('security_access_attempts_immutable'),
    ('security_rule_versions_immutable'),
    ('security_audit_events_immutable'),
    ('security_audit_events_chain')
  ) required(name)
  LEFT JOIN pg_trigger trigger ON trigger.tgname = required.name AND NOT trigger.tgisinternal
  WHERE trigger.oid IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'missing controls: %', missing; END IF;
  IF (SELECT COUNT(*) FROM schema_migrations WHERE version IN ('001_governed_access.sql','002_reader_lifecycle.sql','003_tenant_actor_integrity.sql')) <> 3 THEN
    RAISE EXCEPTION 'governed access migrations are not recorded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname IN (
      'security_access_rules_tenant_created_by_fkey',
      'security_access_rule_versions_tenant_changed_by_fkey',
      'security_readers_tenant_created_by_fkey'
    )
    GROUP BY true HAVING COUNT(*) = 3
  ) THEN RAISE EXCEPTION 'tenant-scoped actor foreign keys are missing'; END IF;
END $$;
SQL
echo "governed access schema controls verified"
