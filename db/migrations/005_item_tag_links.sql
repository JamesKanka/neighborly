ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_tag_token_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS item_tag_qr_code_url text;

DO $$ BEGIN
  ALTER TABLE items
    ADD CONSTRAINT items_item_tag_token_version_positive CHECK (item_tag_token_version > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
