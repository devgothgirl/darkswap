-- Additive development schema only. Production schema is applied by Replit Publish.
CREATE TABLE IF NOT EXISTS launch_challenges (
 id text PRIMARY KEY, wallet text NOT NULL, network text NOT NULL, origin text NOT NULL,
 browser_hash text NOT NULL, message text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS launch_sessions (
 token_hash text PRIMARY KEY, wallet text NOT NULL, origin text NOT NULL, network text NOT NULL,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS launch_drafts (
 id text PRIMARY KEY, wallet text NOT NULL, input jsonb NOT NULL, status text NOT NULL DEFAULT 'preparation_ready' CHECK(status IN ('preparation_ready','unavailable')),
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 dark_pair boolean, dark_points double precision, referral_volume double precision, creator_score double precision,
 campaign_eligible boolean, builder_eligible boolean, incentive_state text NOT NULL DEFAULT 'planned'
);
CREATE INDEX IF NOT EXISTS launch_drafts_owner_idx ON launch_drafts(wallet);
CREATE TABLE IF NOT EXISTS launch_logos (
 id text PRIMARY KEY, wallet text NOT NULL, upload_path text NOT NULL, safe_path text, content_type text NOT NULL,
 declared_size integer NOT NULL, safe_size integer, width integer, height integer,
 expires_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS launch_logos_owner_idx ON launch_logos(wallet);
CREATE TABLE IF NOT EXISTS launch_configuration (id text PRIMARY KEY, input jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS launch_reviews (
 id text PRIMARY KEY, target text NOT NULL, target_type text NOT NULL, network text NOT NULL, status text NOT NULL DEFAULT 'under_review',
 input jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS launch_reviews_target_idx ON launch_reviews(network,target);
CREATE TABLE IF NOT EXISTS launch_audit (
 id text PRIMARY KEY, actor_wallet text NOT NULL, action text NOT NULL, target_id text, summary text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS launch_creator_evidence (
 id text PRIMARY KEY, wallet text NOT NULL, mint text NOT NULL, network text NOT NULL, evidence_url text NOT NULL,
 verified_at timestamptz, token jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 dark_pair boolean, dark_points double precision, referral_volume double precision, creator_score double precision,
 campaign_eligible boolean, builder_eligible boolean, incentive_state text NOT NULL DEFAULT 'planned'
);
CREATE INDEX IF NOT EXISTS launch_creator_owner_idx ON launch_creator_evidence(wallet);