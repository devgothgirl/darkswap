CREATE TABLE private_swap_order_claims (
  quote_hash text PRIMARY KEY,
  recipient_hash text NOT NULL,
  state text NOT NULL,
  response jsonb,
  provider_request jsonb,
  provider_response jsonb,
  rewards_account_did text,
  rewards_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE near_orders (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL,
  state text NOT NULL,
  provider_request jsonb,
  deposit_address text,
  provider_response jsonb,
  order_details jsonb,
  rewards_account_did text,
  rewards_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE near_swap_previews (
  quote_id uuid PRIMARY KEY,
  input jsonb NOT NULL,
  from_asset jsonb NOT NULL,
  to_asset jsonb NOT NULL,
  units text NOT NULL,
  min_out text NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);