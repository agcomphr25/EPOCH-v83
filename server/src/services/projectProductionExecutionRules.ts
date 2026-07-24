export type ProductionEvidenceInput = {
  authorizedQuantity: number;
  completedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  scrappedQuantity: number;
  productionOrdersRequired: number;
  productionOrdersComplete: number;
  travelerMode: 'INDIVIDUAL' | 'BATCH' | 'NO_TRAVELER_EXCEPTION';
  requiredTravelers: number;
  currentTravelers: number;
  incompleteTravelerSteps: number;
  missingTravelerActors: number;
  missingMaterialGenealogy: number;
  invalidMaterialConsumptions: number;
  openLaborEntries: number;
  trainingGaps: number;
  calibrationGaps: number;
  incompleteInspections: number;
  incompleteTests: number;
  incompleteSpecialProcesses: number;
  openNcrs: number;
  incompleteRework: number;
  activeHolds: number;
  baselineChanged: boolean;
  mixedConfiguration: boolean;
  noTravelerExceptionApproved: boolean;
  manufacturingEngineeringApprovalRequired: boolean;
};

export type ProductionReadiness = {
  state: 'IN_PROGRESS' | 'BLOCKED' | 'READY_FOR_COMPLETION_REVIEW' | 'STALE';
  blockers: string[];
  warnings: string[];
};

export function evaluateProductionCompletion(
  evidence: ProductionEvidenceInput
): ProductionReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (evidence.baselineChanged)
    blockers.push(
      'The released Production Plan, WAD, configuration, or effectivity baseline changed after launch.'
    );
  if (evidence.mixedConfiguration)
    blockers.push('Mixed or unidentified configuration/effectivity exists.');
  if (evidence.productionOrdersComplete < evidence.productionOrdersRequired)
    blockers.push(
      'Every required manufactured production order must be complete.'
    );
  if (evidence.completedQuantity < evidence.authorizedQuantity)
    blockers.push('Authorized manufactured quantity is underproduced.');
  if (evidence.completedQuantity > evidence.authorizedQuantity)
    blockers.push('Unauthorized overproduction was detected.');
  if (
    evidence.acceptedQuantity +
      evidence.rejectedQuantity +
      evidence.scrappedQuantity !==
    evidence.authorizedQuantity
  )
    blockers.push(
      'All authorized quantities must be dispositioned and reconciled.'
    );
  if (evidence.scrappedQuantity > 0)
    blockers.push(
      'Scrapped quantity is not accepted completion; disposition and replacement quantity are required.'
    );
  if (
    evidence.travelerMode !== 'NO_TRAVELER_EXCEPTION' &&
    evidence.currentTravelers < evidence.requiredTravelers
  )
    blockers.push('Required current traveler evidence is missing.');
  if (
    evidence.travelerMode === 'NO_TRAVELER_EXCEPTION' &&
    !evidence.noTravelerExceptionApproved
  )
    blockers.push('The no-traveler exception lacks approved justification.');
  if (evidence.incompleteTravelerSteps)
    blockers.push('Released routing operations are not complete.');
  if (evidence.missingTravelerActors)
    blockers.push(
      'Completed traveler steps require an attributable actor and timestamp.'
    );
  if (evidence.missingMaterialGenealogy)
    blockers.push(
      'Required material lot or received-unit genealogy is incomplete.'
    );
  if (evidence.invalidMaterialConsumptions)
    blockers.push(
      'Expired, quarantined, or rejected material consumption is invalid.'
    );
  if (evidence.openLaborEntries)
    blockers.push('Required labor entries remain open.');
  if (evidence.trainingGaps)
    blockers.push(
      'Required employee training or certification is not current.'
    );
  if (evidence.calibrationGaps)
    blockers.push(
      'Required calibrated equipment evidence is missing or expired.'
    );
  if (evidence.incompleteInspections)
    blockers.push(
      'Required in-process inspections or sampling remain incomplete.'
    );
  if (evidence.incompleteTests)
    blockers.push('Required production tests remain incomplete.');
  if (evidence.incompleteSpecialProcesses)
    blockers.push('Required special-process evidence is incomplete.');
  if (evidence.openNcrs)
    blockers.push('An unresolved blocking NCR affects Production completion.');
  if (evidence.incompleteRework)
    blockers.push(
      'Rework requires approved instructions, completion, and reinspection.'
    );
  if (evidence.activeHolds)
    blockers.push('An active applicable Production hold remains unresolved.');
  if (evidence.manufacturingEngineeringApprovalRequired)
    warnings.push(
      'Manufacturing Engineering approval is required by routing, rework, exception, or effectivity conditions.'
    );
  return {
    state: evidence.baselineChanged
      ? 'STALE'
      : blockers.length
        ? 'BLOCKED'
        : 'READY_FOR_COMPLETION_REVIEW',
    blockers,
    warnings,
  };
}
