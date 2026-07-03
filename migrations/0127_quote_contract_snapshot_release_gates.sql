-- Section 2 quoting contracts: snapshot clause payloads and release-gate support.

ALTER TABLE quote_snapshots
  ADD COLUMN IF NOT EXISTS contractual_clauses JSONB;
