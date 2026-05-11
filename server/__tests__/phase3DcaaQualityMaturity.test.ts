import { describe, expect, it } from 'vitest';
import {
  getPhase3DcaaQualityMaturity,
  getPhase3DcaaQualitySummary,
  type Phase3DcaaQualityDomain,
} from '../src/services/phase3DcaaQualityMaturity';

describe('Phase 3 DCAA and quality maturity coverage', () => {
  it('declares all requested Phase 3 maturity domains', () => {
    const domains = getPhase3DcaaQualityMaturity();
    const domainKeys = new Set(domains.map((domain) => domain.domain));

    const expected: Phase3DcaaQualityDomain[] = [
      'DAILY_TIME_CERTIFICATION',
      'SUPERVISOR_APPROVAL_DASHBOARDS',
      'PERIOD_CLOSE_LOCK_REOPEN',
      'NCR_CAPA_EXPANSION',
      'CALIBRATION_LOCKOUT',
    ];

    for (const key of expected) {
      expect(domainKeys.has(key)).toBe(true);
    }
  });

  it('keeps required coverage checks and blocker behavior attached to every control', () => {
    const domains = getPhase3DcaaQualityMaturity();

    for (const domain of domains) {
      expect(domain.controls.length).toBeGreaterThan(0);
      expect(domain.readinessExitCriteria.length).toBeGreaterThan(0);

      for (const control of domain.controls) {
        expect(control.coverageChecks.some((check) => check.requiredForClosure)).toBe(true);
        expect(control.requiredAuditEvents.length).toBeGreaterThan(0);
        expect(control.lockoutOrBlockerBehavior).not.toHaveLength(0);
      }
    }
  });

  it('summarizes the endpoint feature flags used by governance callers', () => {
    const summary = getPhase3DcaaQualitySummary();

    expect(summary.domainCount).toBe(5);
    expect(summary.hasDailyEmployeeTimeCertification).toBe(true);
    expect(summary.hasSupervisorApprovalCompletenessDashboard).toBe(true);
    expect(summary.hasPeriodCloseHardLockReopenChecks).toBe(true);
    expect(summary.hasNcrCapaExpansion).toBe(true);
    expect(summary.hasCalibrationManagementLockout).toBe(true);
    expect(summary.requiredCoverageCheckCount).toBeGreaterThanOrEqual(10);
  });
});
