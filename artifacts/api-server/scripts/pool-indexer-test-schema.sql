-- The four pool tables the indexer writes, as in lib/db/src/schema/shielded-pool.ts.
CREATE TABLE pool_commitments (
  chain text NOT NULL,
  index integer NOT NULL,
  commitment text NOT NULL,
  encrypted_output text NOT NULL,
  tx text NOT NULL,
  PRIMARY KEY (chain, index)
);

CREATE TABLE pool_nullifiers (
  chain text NOT NULL,
  nullifier text NOT NULL,
  tx text NOT NULL,
  PRIMARY KEY (chain, nullifier)
);

CREATE TABLE pool_fees (
  chain text NOT NULL,
  token text NOT NULL,
  kind text NOT NULL,
  amount text NOT NULL,
  tx text NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY (chain, tx, position)
);

CREATE INDEX pool_fees_chain_token_idx ON pool_fees(chain, token);

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

CREATE TABLE pool_sync (
  chain text PRIMARY KEY,
  cursor text,
  next_index integer NOT NULL DEFAULT 0,
  root text,
  state jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
