CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('available', 'checked_out', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE waitlist_status AS ENUM ('waiting', 'skipped', 'fulfilled', 'removed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transfer_type AS ENUM ('create', 'checkout', 'pass', 'return');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM ('pending_accept', 'completed', 'cancelled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE token_purpose AS ENUM ('item_view', 'handoff_accept');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text,
  phone text,
  neighborhood text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  pickup_area text NOT NULL,
  status item_status NOT NULL DEFAULT 'available',
  current_holder_id uuid REFERENCES users(id),
  qr_code_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status waitlist_status NOT NULL DEFAULT 'waiting',
  position int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_unique_waiting
  ON waitlist_entries(item_id, user_id)
  WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES users(id),
  to_user_id uuid REFERENCES users(id),
  type transfer_type NOT NULL,
  status transfer_status NOT NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  transfer_id uuid REFERENCES transfers(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose token_purpose NOT NULL,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_owner ON items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_status_category ON items(status, category);
CREATE INDEX IF NOT EXISTS idx_waitlist_item_status_created ON waitlist_entries(item_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_transfers_item_initiated ON transfers(item_id, initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_item_purpose_expiry ON tokens(item_id, purpose, expires_at);
