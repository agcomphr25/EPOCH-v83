import { describe, expect, it } from 'vitest';
import {
  calculateReadiness,
  canTransition,
  deriveExecutionResult,
  hasMeaningfulNotes,
  packageReadinessBlockers,
  productionIdentifierStatus,
  type PackageReadinessItem,
  type ReadinessCounts,
} from '../src/services/epochSoftwareValidation';

const ready: ReadinessCounts = {
  intendedUseApproved: true,
  requirementsBaselineApproved: true,
  riskAssessmentApproved: true,
  validationPlanApproved: true,
  criticalRequirements: 3,
  criticalRequirementsTested: 3,
  criticalTests: 3,
  criticalTestsPassed: 3,
  openCriticalDefects: 0,
  openHighDefects: 0,
  acceptedHighDefects: 0,
  requiredRetests: 1,
  passedRetests: 1,
  backupPassed: true,
  restorePassed: true,
  outageDrillPassed: true,
  approvalsCurrent: true,
  exactProductionVersionIdentified: true,
};

describe('EPOCH software-validation control rules', () => {
  it('enforces explicit status transitions', () => {
    expect(canTransition('DRAFT', 'PLANNING')).toBe(true);
    expect(canTransition('DRAFT', 'APPROVED_FOR_INTENDED_USE')).toBe(false);
    expect(canTransition('APPROVED_FOR_INTENDED_USE', 'TESTING')).toBe(false);
  });

  it('derives execution results from required steps', () => {
    expect(deriveExecutionResult([{ status: 'PASSED' }, { status: 'FAILED' }])).toBe('FAILED');
    expect(deriveExecutionResult([{ status: 'PASSED' }, { status: 'BLOCKED' }])).toBe('BLOCKED');
    expect(deriveExecutionResult([{ status: 'PASSED' }, { status: 'FAILED', required: false }])).toBe('PASSED');
  });

  it('fails final readiness closed with named blockers', () => {
    expect(calculateReadiness(ready)).toEqual({ ready: true, blockers: [] });
    const blocked = calculateReadiness({ ...ready, openCriticalDefects: 1, restorePassed: false });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toContain('Critical validation defects remain open');
    expect(blocked.blockers).toContain('Restore testing has not passed');
  });

  it('accepts exact production identifiers and rejects PR-only references', () => {
    expect(productionIdentifierStatus('8f14e45fceea167a5a36dedd4bea2543ad6d0f21').valid).toBe(true);
    expect(productionIdentifierStatus('v8.3.0').valid).toBe(true);
    expect(productionIdentifierStatus('deploy-2026-07-30').valid).toBe(true);
    expect(productionIdentifierStatus('pull request #1576')).toEqual({
      valid: false,
      code: 'PRODUCTION_IDENTIFIER_AMBIGUOUS',
    });
    expect(productionIdentifierStatus('1576').valid).toBe(false);
  });

  it('rejects placeholder notes and returns structured package blockers', () => {
    expect(hasMeaningfulNotes('TBD')).toBe(false);
    expect(hasMeaningfulNotes('Validated against the controlled production release.')).toBe(true);
    const items: PackageReadinessItem[] = [
      { key: 'OWNER', label: 'Owner', field: 'ownerId', state: 'MISSING' },
      { key: 'DATE', label: 'Date', field: 'date', state: 'REQUIRES_CONFIRMATION' },
      { key: 'RISK', label: 'Risk', field: 'risk', state: 'COMPLETE' },
    ];
    expect(packageReadinessBlockers(items)).toEqual([
      { field: 'ownerId', code: 'OWNER_INCOMPLETE', message: 'Owner is incomplete.' },
      { field: 'date', code: 'DATE_INCOMPLETE', message: 'Date is incomplete.' },
    ]);
  });
});
