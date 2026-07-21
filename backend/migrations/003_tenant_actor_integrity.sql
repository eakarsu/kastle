ALTER TABLE security_users
  ADD CONSTRAINT security_users_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE security_access_rules
  DROP CONSTRAINT security_access_rules_created_by_fkey,
  ADD CONSTRAINT security_access_rules_tenant_created_by_fkey
    FOREIGN KEY (tenant_id, created_by) REFERENCES security_users(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE security_access_rule_versions
  DROP CONSTRAINT security_access_rule_versions_changed_by_fkey,
  ADD CONSTRAINT security_access_rule_versions_tenant_changed_by_fkey
    FOREIGN KEY (tenant_id, changed_by) REFERENCES security_users(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE security_readers
  DROP CONSTRAINT security_readers_created_by_fkey,
  ADD CONSTRAINT security_readers_tenant_created_by_fkey
    FOREIGN KEY (tenant_id, created_by) REFERENCES security_users(tenant_id, id) ON DELETE RESTRICT;
