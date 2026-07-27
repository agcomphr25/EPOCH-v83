export type QualityEvidence = {
  productionComplete: boolean;
  productionCurrent: boolean;
  acceptedQuantity: number;
  scrappedQuantity: number;
  previouslyReleasedQuantity: number;
  finalInspectionRequired: boolean;
  finalInspectionComplete: boolean;
  fullInspectionRequired: boolean;
  allCharacteristicsAccepted: boolean;
  samplingRequired: boolean;
  samplingPlanApproved: boolean;
  samplePassed: boolean;
  faiRequired: boolean;
  faiApproved: boolean;
  testsRequired: boolean;
  testsPassed: boolean;
  certificatesRequired: boolean;
  certificatesCurrent: boolean;
  traceabilityComplete: boolean;
  openNcrQuantity: number;
  reworkPendingReinspection: boolean;
  activeHold: boolean;
  configurationCurrent: boolean;
};

export function evaluateQualityReadiness(e: QualityEvidence) {
  const blockers: string[] = [];
  if (!e.productionComplete || !e.productionCurrent)
    blockers.push('CURRENT_PRODUCTION_COMPLETION_REQUIRED');
  if (e.finalInspectionRequired && !e.finalInspectionComplete)
    blockers.push('FINAL_INSPECTION_REQUIRED');
  if (e.fullInspectionRequired && !e.allCharacteristicsAccepted)
    blockers.push('FULL_INSPECTION_INCOMPLETE');
  if (e.samplingRequired && !e.samplingPlanApproved)
    blockers.push('APPROVED_SAMPLING_PLAN_REQUIRED');
  if (e.samplingRequired && !e.samplePassed)
    blockers.push('SAMPLE_REJECTED_OR_INCOMPLETE');
  if (e.faiRequired && !e.faiApproved) blockers.push('APPROVED_FAI_REQUIRED');
  if (e.testsRequired && !e.testsPassed)
    blockers.push('REQUIRED_TESTS_NOT_PASSED');
  if (e.certificatesRequired && !e.certificatesCurrent)
    blockers.push('CURRENT_CERTIFICATES_REQUIRED');
  if (!e.traceabilityComplete) blockers.push('TRACEABILITY_INCOMPLETE');
  if (e.openNcrQuantity > 0) blockers.push('APPLICABLE_NCR_UNRESOLVED');
  if (e.reworkPendingReinspection)
    blockers.push('REWORK_REINSPECTION_REQUIRED');
  if (e.activeHold) blockers.push('ACTIVE_QUALITY_HOLD');
  if (!e.configurationCurrent)
    blockers.push('CONFIGURATION_OR_EFFECTIVITY_STALE');
  const eligibleQuantity = Math.max(
    0,
    e.acceptedQuantity -
      e.scrappedQuantity -
      e.previouslyReleasedQuantity -
      e.openNcrQuantity
  );
  return {
    state: blockers.length
      ? 'BLOCKED'
      : eligibleQuantity > 0
        ? 'READY_FOR_RELEASE'
        : 'IN_PROGRESS',
    blockers,
    eligibleQuantity,
  } as const;
}

export function validateReleaseSelection(input: {
  requestedQuantity: number;
  eligibleQuantity: number;
  serialNumbers: string[];
  batchLots: string[];
}) {
  if (!Number.isFinite(input.requestedQuantity) || input.requestedQuantity <= 0)
    throw new Error('RELEASE_QUANTITY_REQUIRED');
  if (input.requestedQuantity > input.eligibleQuantity)
    throw new Error('RELEASE_EXCEEDS_ELIGIBLE_QUANTITY');
  const serials = new Set(
    input.serialNumbers.map((value) => value.trim()).filter(Boolean)
  );
  const batches = new Set(
    input.batchLots.map((value) => value.trim()).filter(Boolean)
  );
  if (serials.size !== input.serialNumbers.length)
    throw new Error('DUPLICATE_SERIAL_SELECTION');
  if (batches.size !== input.batchLots.length)
    throw new Error('DUPLICATE_BATCH_SELECTION');
  if (serials.size && serials.size !== input.requestedQuantity)
    throw new Error('SERIAL_QUANTITY_MISMATCH');
}
