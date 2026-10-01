CREATE TABLE rewards_accounts (
  privy_did text PRIMARY KEY,
  email text UNIQUE,
  enrolled boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_did text NOT NULL REFERENCES rewards_accounts(privy_did),
  points integer NOT NULL,
  reason text NOT NULL,
  route text,
  order_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rewards_ledger_terminal_order_unique
  ON rewards_ledger(route, order_reference)
  WHERE route IS NOT NULL AND order_reference IS NOT NULL
    AND reason IN ('swap_completed', 'swap_capped');

CREATE UNIQUE INDEX rewards_ledger_reversal_unique
  ON rewards_ledger(route, order_reference)
  WHERE route IS NOT NULL AND order_reference IS NOT NULL
    AND reason = 'swap_reversed';