-- Additive DEVELOPMENT schema. Production schema is applied by Replit Publish.
CREATE TABLE IF NOT EXISTS launch_catalog (
  network text NOT NULL,
  mint text NOT NULL,
  token jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  generated_at timestamptz,
  PRIMARY KEY (network, mint)
);
CREATE INDEX IF NOT EXISTS launch_catalog_fetched_at_idx ON launch_catalog (fetched_at);