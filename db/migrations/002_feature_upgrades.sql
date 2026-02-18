ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tips_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tip_url text;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS borrow_duration_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS owner_requested_return_at timestamptz;

DO $$ BEGIN
  ALTER TABLE items
    ADD CONSTRAINT items_borrow_duration_positive CHECK (borrow_duration_days > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  rating_type text NOT NULL CHECK (rating_type IN ('item', 'person')),
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text,
  transfer_id uuid REFERENCES transfers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_item_rating_once
  ON ratings(item_id, reviewer_user_id, rating_type)
  WHERE rating_type = 'item';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_person_rating_once
  ON ratings(item_id, reviewer_user_id, target_user_id, rating_type)
  WHERE rating_type = 'person';
