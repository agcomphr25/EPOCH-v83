-- Store the canonical company website on vendor profiles. Existing vendor
-- address and phone columns are TEXT and already support international values;
-- this migration intentionally preserves them without format constraints.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS website TEXT;
