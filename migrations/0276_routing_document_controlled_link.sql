-- Connect Form & Document Builder records to their authoritative MDR records.
-- The file-path backfill is intentionally limited to unique matches so ambiguous
-- historical records remain unlinked and cannot be approved by inference.

ALTER TABLE routing_documents
  ADD COLUMN IF NOT EXISTS controlled_document_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'routing_documents_controlled_document_id_fkey'
  ) THEN
    ALTER TABLE routing_documents
      ADD CONSTRAINT routing_documents_controlled_document_id_fkey
      FOREIGN KEY (controlled_document_id)
      REFERENCES controlled_documents(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS routing_documents_controlled_document_idx
  ON routing_documents(controlled_document_id);

WITH unique_file_matches AS (
  SELECT rd.id AS routing_document_id, MIN(cd.id::text)::uuid AS controlled_document_id
  FROM routing_documents rd
  JOIN controlled_documents cd
    ON cd.file_path = rd.file_url
  WHERE rd.controlled_document_id IS NULL
    AND rd.file_url IS NOT NULL
    AND rd.file_url <> ''
  GROUP BY rd.id
  HAVING COUNT(*) = 1
)
UPDATE routing_documents rd
SET controlled_document_id = matches.controlled_document_id,
    updated_at = NOW()
FROM unique_file_matches matches
WHERE rd.id = matches.routing_document_id;
