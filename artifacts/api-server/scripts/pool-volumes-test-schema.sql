CREATE TABLE pool_sync (
  chain text PRIMARY KEY,
  cursor text,
  next_index integer NOT NULL DEFAULT 0,
  root text,
  state jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pool_activity (
  chain text NOT NULL,
  tx text NOT NULL,
  position integer NOT NULL,
  kind text NOT NULL,
  token text NOT NULL,
  amount text NOT NULL,
  relayer_fee text NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (chain, tx, position)
);

CREATE INDEX pool_activity_chain_time_idx ON pool_activity(chain, occurred_at);
