UPDATE users
SET neighborhood = 'Ladd Park'
WHERE neighborhood IS DISTINCT FROM 'Ladd Park';

ALTER TABLE users
  ALTER COLUMN neighborhood SET DEFAULT 'Ladd Park';

ALTER TABLE users
  ALTER COLUMN neighborhood SET NOT NULL;

UPDATE items
SET pickup_area = 'Ladd Park'
WHERE pickup_area IS DISTINCT FROM 'Ladd Park';

ALTER TABLE items
  ALTER COLUMN pickup_area SET DEFAULT 'Ladd Park';
