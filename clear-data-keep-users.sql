-- ============================================================
-- Clear all data except users
-- KEEP: users
-- DELETE: everything else
-- Run: psql $DATABASE_URL -f clear-data-keep-users.sql
-- ============================================================

BEGIN;

-- Disable FK enforcement so we can truncate in any order
SET session_replication_role = replica;

TRUNCATE TABLE
  -- Auth / sessions (except users)
  refresh_tokens,
  password_reset_tokens,
  invitations,

  -- Organizations & memberships
  memberships,
  organizations,
  organization_driver_settings,
  organization_subscriptions,
  onboarding_progress,

  -- Customer portal
  customer_portal_accounts,
  customer_portal_invitations,
  customer_refresh_tokens,
  customer_notification_reads,

  -- Fleet
  drivers,
  driver_breaks,
  driver_action_events,
  vehicles,
  vehicle_inspections,
  vehicle_health_snapshots,
  vehicle_telematics_states,

  -- Orders & dispatch
  order_stops,
  order_status_histories,
  order_notes,
  order_documents,
  orders,
  dispatch_stops,
  dispatch_status_histories,
  dispatch_assignments,
  dispatch_conflict_states,
  dispatch_delivery_proofs,
  delivery_attempts,
  dispatches,

  -- Routes
  route_stops,
  routes,

  -- Customers & CRM
  customers,
  lead_timeline_events,
  leads,

  -- Finance
  invoice_line_items,
  invoices,
  payments,
  expenses,
  payment_provider_configs,
  payment_webhook_deliveries,

  -- Telematics / GPS
  gps_positions,
  geofence_events,
  geofences,
  telematics_alerts,
  telematics_devices,
  telematics_settings,
  tracking_sessions,
  trips,

  -- Notifications
  notification_delivery_queue,
  notification_preferences,
  notification_settings,
  notification_template_versions,
  notification_templates,
  notifications,

  -- Subscriptions & billing
  subscription_history,
  subscription_plans,
  usage_records,
  usage_snapshots,

  -- Workflows
  workflow_execution_steps,
  workflow_executions,
  workflow_logs,
  workflow_schedules,
  workflow_webhooks,
  workflow_versions,
  workflow_templates,
  workflows,

  -- API / Webhooks
  api_keys,
  api_usage_records,
  webhook_delivery_attempts,
  webhook_deliveries,
  webhook_endpoints,

  -- Imports
  import_errors,
  import_mappings,
  import_rows,
  import_sessions,

  -- AI
  ai_tool_calls,
  ai_messages,
  ai_conversations,
  ai_memories,
  ai_knowledge_docs,

  -- Platform
  audit_logs,
  email_providers,
  email_tracking,
  feature_flag_overrides,
  feature_flags,
  platform_notifications,
  platform_support_sessions,
  support_tickets

RESTART IDENTITY;

-- Re-enable FK enforcement
SET session_replication_role = DEFAULT;

COMMIT;

-- Verify users are intact
SELECT COUNT(*) AS users_remaining FROM users;
