-- Remove ghost migration entries that don't exist in prisma/migrations/ directory
-- These were applied in a previous session but never committed to filesystem

DELETE FROM _prisma_migrations
WHERE migration_name IN (
  '20260712101307_add_password_reset_and_email_verification',
  '20260713000000_add_billing_subscription_foundation',
  '20260713100000_add_delivery_proofs',
  '20260713164432_add_import_sessions',
  '20260713170626_add_import_column_mapping',
  '20260713180951_add_notification_priority_and_background_jobs',
  '20260714014244_add_ai_conversations',
  '20260714220000_add_workflows',
  '20260715000000_add_customer_portal',
  '20260716000000_add_developer_portal',
  '20260717000000_add_driver_mobile_platform',
  '20260714121200_add_security_platform',
  '20260714181814_add_notification_auto_resolved',
  '20260717010000_fix_schema_index_definitions',
  '20260717020000_scope_idempotency_key_per_org'
);

-- Verify remaining migrations match filesystem
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;
