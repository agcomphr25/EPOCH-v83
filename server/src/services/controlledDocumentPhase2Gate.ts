export const CONTROLLED_DOCUMENT_PHASE2_FLAG =
  'CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED' as const;

export function isControlledDocumentPhase2Enabled(
  value = process.env.CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED
) {
  return value === 'true';
}
