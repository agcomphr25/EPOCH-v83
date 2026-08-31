-- Preserve the pre-2026-08-30 meaning of an active Robust BOM after project
-- demand began requiring an explicitly released/effective revision.
--
-- Only active BOMs with no released revision are eligible. Their latest
-- revision is the same revision the project assembly tree previously used.
-- Existing released histories are untouched, and replay is idempotent.
WITH latest_unreleased_active_bom_revisions AS (
  SELECT latest_revision.id
  FROM boms bom
  JOIN LATERAL (
    SELECT revision.id
    FROM bom_revisions revision
    WHERE revision.bom_id = bom.id
    ORDER BY revision.created_at DESC NULLS LAST, revision.id DESC
    LIMIT 1
  ) latest_revision ON TRUE
  WHERE bom.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM bom_revisions released_revision
      WHERE released_revision.bom_id = bom.id
        AND released_revision.is_released = TRUE
    )
)
UPDATE bom_revisions revision
SET is_released = TRUE,
    effective_from = COALESCE(revision.effective_from, revision.created_at, NOW()),
    effective_to = NULL,
    updated_at = NOW()
FROM latest_unreleased_active_bom_revisions candidate
WHERE revision.id = candidate.id
  AND revision.is_released = FALSE;
