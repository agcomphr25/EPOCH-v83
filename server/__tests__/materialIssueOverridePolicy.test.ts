/**
 * Unit tests for the material-issue override reason-code catalog
 * (Task #144 Step 6).
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateOverride,
  getOverrideReasonSpec,
  listOverrideReasons,
} from '../src/services/materialIssueOverridePolicy';

const baseOverride = {
  reason: 'ROUTING_STEP_BYPASS' as const,
  approverUserId: 42, approvalId: '00000000-0000-0000-0000-000000000001',
  approverDisplayName: 'Sup Sammy',
  approverRole: 'Production Supervisor',
  writtenReason: 'Production sequence re-planned per ECO-7421',
};

describe('ROUTING_STEP_BYPASS catalog entry', () => {
  it('is present and lists WRONG_ROUTING_STEP among bypassable gates', () => {
    const spec = getOverrideReasonSpec('ROUTING_STEP_BYPASS');
    expect(spec).toBeDefined();
    expect(spec!.bypassesGates).toContain('WRONG_ROUTING_STEP');
    expect(spec!.requiresWrittenReason).toBe(true);
  });

  it('is enumerated by listOverrideReasons', () => {
    const codes = listOverrideReasons().map((r) => r.reason);
    expect(codes).toContain('ROUTING_STEP_BYPASS');
  });
});

describe('evaluateOverride', () => {
  it('clears WRONG_ROUTING_STEP for an authorized supervisor', () => {
    expect(evaluateOverride(baseOverride, 'WRONG_ROUTING_STEP')).toEqual({ ok: true });
  });

  it('rejects an unknown reason code', () => {
    expect(
      evaluateOverride({ ...baseOverride, reason: 'NOT_A_REAL_REASON' as any }, 'WRONG_ROUTING_STEP').ok,
    ).toBe(false);
  });

  it('rejects ROUTING_STEP_BYPASS when used to clear an unrelated gate', () => {
    expect(evaluateOverride(baseOverride, 'LOT_QUARANTINED').ok).toBe(false);
  });

  it('rejects an unauthorized role', () => {
    expect(
      evaluateOverride(
        { ...baseOverride, approverRole: 'Operator' },
        'WRONG_ROUTING_STEP',
      ).ok,
    ).toBe(false);
  });

  it('rejects an empty written reason', () => {
    expect(
      evaluateOverride(
        { ...baseOverride, writtenReason: '' },
        'WRONG_ROUTING_STEP',
      ).ok,
    ).toBe(false);
  });

  it('rejects a missing approver display name', () => {
    expect(
      evaluateOverride(
        { ...baseOverride, approverDisplayName: '' },
        'WRONG_ROUTING_STEP',
      ).ok,
    ).toBe(false);
  });

  it('lets EMERGENCY_PRODUCTION owner clear LOT_QUARANTINED', () => {
    expect(
      evaluateOverride(
        {
          reason: 'EMERGENCY_PRODUCTION',
          approvalId: '00000000-0000-0000-0000-000000000002',
          approverUserId: 1,
          approverDisplayName: 'Owner Olive',
          approverRole: 'OWNER',
          writtenReason: 'Customer line-down — exec approval per call w/ John',
        },
        'LOT_QUARANTINED',
      ).ok,
    ).toBe(true);
  });

  it('rejects ROUTING_STEP_BYPASS when claimed by ADMIN (not in allowed roles)', () => {
    expect(
      evaluateOverride(
        { ...baseOverride, approverRole: 'ADMIN' },
        'WRONG_ROUTING_STEP',
      ).ok,
    ).toBe(false);
  });

  it('rejects override missing approverUserId (server-verification anchor)', () => {
    expect(
      evaluateOverride(
        { ...baseOverride, approverUserId: undefined as unknown as number },
        'WRONG_ROUTING_STEP',
      ).ok,
    ).toBe(false);
  });
});
