-- Minimal production-shaped tables for the marketing health/sending integration test.
-- Executed only against the temporary PostgreSQL instance.
CREATE TABLE marketing_subscriptions (
  email text PRIMARY KEY,
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL,
  source text NOT NULL,
  verified_at timestamptz,
  confirmation_token_hash text,
  confirmation_expires_at timestamptz,
  last_confirmation_sent_at timestamptz,
  unsubscribe_token_hash text UNIQUE,
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text
);
CREATE TABLE marketing_deliveries (
  id text PRIMARY KEY,
  email text NOT NULL,
  campaign_key text,
  kind text NOT NULL,
  status text NOT NULL,
  provider_message_id text UNIQUE,
  webhook_expected_at timestamptz,
  webhook_acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_key, email)
);
CREATE TABLE marketing_events (
  id text PRIMARY KEY,
  provider_message_id text NOT NULL,
  recipient_email text,
  reason text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_webhook_receipts (
  id text PRIMARY KEY,
  provider_message_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_webhook_status (
  key text PRIMARY KEY,
  failed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_webhook_processing (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_webhook_processing_event_idx ON marketing_webhook_processing (event_id);
CREATE TABLE marketing_campaigns (
  key text PRIMARY KEY,
  content_hash text NOT NULL
);
CREATE TABLE marketing_send_pace (
  key text PRIMARY KEY,
  next_at timestamptz NOT NULL
);