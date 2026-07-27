import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateQualityReadiness,
  validateReleaseSelection,
} from '../src/services/projectQualityReleaseRules';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0222_p2_v2_quality_product_release.sql');
const service = read('server/src/services/projectQualityReleaseService.ts');
const routes = read('server/src/routes/projectQualityRelease.ts');

const ready = {
  productionComplete: true,
  productionCurrent: true,
  acceptedQuantity: 5,
  scrappedQuantity: 0,
  previouslyReleasedQuantity: 0,
  finalInspectionRequired: true,
  finalInspectionComplete: true,
  fullInspectionRequired: false,
  allCharacteristicsAccepted: true,
  samplingRequired: false,
  samplingPlanApproved: false,
  samplePassed: false,
  faiRequired: false,
  faiApproved: false,
  testsRequired: false,
  testsPassed: false,
  certificatesRequired: false,
  certificatesCurrent: true,
  traceabilityComplete: true,
  openNcrQuantity: 0,
  reworkPendingReinspection: false,
  activeHold: false,
  configurationCurrent: true,
};

describe('P2 V2 Quality and controlled Product Release', () => {
  it('requires current Production completion and authoritative Quality evidence', () => {
    expect(
      evaluateQualityReadiness({ ...ready, productionComplete: false }).blockers
    ).toContain('CURRENT_PRODUCTION_COMPLETION_REQUIRED');
    expect(
      evaluateQualityReadiness({ ...ready, finalInspectionComplete: false })
        .blockers
    ).toContain('FINAL_INSPECTION_REQUIRED');
    expect(
      evaluateQualityReadiness({ ...ready, traceabilityComplete: false })
        .blockers
    ).toContain('TRACEABILITY_INCOMPLETE');
  });

  it('enforces full inspection, approved sampling, FAI, tests, certificates and NCR/rework gates', () => {
    const result = evaluateQualityReadiness({
      ...ready,
      fullInspectionRequired: true,
      allCharacteristicsAccepted: false,
      samplingRequired: true,
      samplingPlanApproved: false,
      samplePassed: false,
      faiRequired: true,
      faiApproved: false,
      testsRequired: true,
      testsPassed: false,
      certificatesRequired: true,
      certificatesCurrent: false,
      openNcrQuantity: 1,
      reworkPendingReinspection: true,
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'FULL_INSPECTION_INCOMPLETE',
        'APPROVED_SAMPLING_PLAN_REQUIRED',
        'SAMPLE_REJECTED_OR_INCOMPLETE',
        'APPROVED_FAI_REQUIRED',
        'REQUIRED_TESTS_NOT_PASSED',
        'CURRENT_CERTIFICATES_REQUIRED',
        'APPLICABLE_NCR_UNRESOLVED',
        'REWORK_REINSPECTION_REQUIRED',
      ])
    );
  });

  it('reconciles partial releases without counting scrap or unresolved NCR quantity', () => {
    expect(
      evaluateQualityReadiness({
        ...ready,
        acceptedQuantity: 10,
        scrappedQuantity: 2,
        previouslyReleasedQuantity: 3,
        openNcrQuantity: 1,
      }).eligibleQuantity
    ).toBe(4);
    expect(() =>
      validateReleaseSelection({
        requestedQuantity: 5,
        eligibleQuantity: 4,
        serialNumbers: [],
        batchLots: [],
      })
    ).toThrow('RELEASE_EXCEEDS_ELIGIBLE_QUANTITY');
  });

  it('requires exact, unique serial identity', () => {
    expect(() =>
      validateReleaseSelection({
        requestedQuantity: 2,
        eligibleQuantity: 2,
        serialNumbers: ['S1', 'S1'],
        batchLots: [],
      })
    ).toThrow('DUPLICATE_SERIAL_SELECTION');
    expect(() =>
      validateReleaseSelection({
        requestedQuantity: 2,
        eligibleQuantity: 2,
        serialNumbers: ['S1'],
        batchLots: [],
      })
    ).toThrow('SERIAL_QUANTITY_MISMATCH');
  });

  it('adds immutable release identity, allocation uniqueness, holds and explicit authority', () => {
    expect(migration).toContain('project_product_releases');
    expect(migration).toContain('project_product_release_serial_unique');
    expect(migration).toContain('project_product_release_holds');
    expect(migration).toContain('projects.quality_release.release_product');
    expect(routes).toContain('projects.quality_release.release_product');
  });

  it('uses transactions, advisory serialization, idempotency and creates no shipment', () => {
    expect(service).toContain('db.transaction');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('IDEMPOTENCY_CONFLICT');
    expect(service).toContain('shipmentCreated: false');
    expect(service).not.toMatch(/INSERT INTO (?:p2_)?shipments/i);
  });

  it('fails closed for legacy and unknown workflows and keeps Design Control untouched', () => {
    expect(service).toContain("version !== 'p2_v2'");
    expect(service).toContain('UNKNOWN_WORKFLOW_VERSION');
    expect(migration).not.toMatch(/design_(?:control|projects)|ecr|ecn/i);
  });
});
