import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  assertExpectedDesignControlVersion,
  canonicalDesignControlContent,
  checksumDesignControlContent,
  materialStepContent,
  requireDesignControlDecisionComment,
} from '../src/services/designControlApprovalService';
import { DESIGN_CONTROL_WORKFLOW } from '../../shared/designControlWorkflow';

const readRepoFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('authenticated Design Control approvals', () => {
  it('produces deterministic checksums while retaining meaningful array order', () => {
    const first = materialStepContent({
      formData: { beta: 2, alpha: { zulu: true, able: 'yes' } },
      checklist: { reviewed: true },
      attachments: [{ id: 'a' }, { id: 'b' }],
    });
    const reorderedKeys = materialStepContent({
      attachments: [{ id: 'a' }, { id: 'b' }],
      checklist: { reviewed: true },
      formData: { alpha: { able: 'yes', zulu: true }, beta: 2 },
    });
    const reorderedAttachments = {
      ...first,
      attachments: [...first.attachments].reverse(),
    };

    expect(canonicalDesignControlContent(first)).toBe(
      canonicalDesignControlContent(reorderedKeys)
    );
    expect(checksumDesignControlContent(first)).toBe(
      checksumDesignControlContent(reorderedKeys)
    );
    expect(checksumDesignControlContent(first)).not.toBe(
      checksumDesignControlContent(reorderedAttachments)
    );
  });

  it('defines stable capability-bound approval keys for every workflow slot', () => {
    const slots = DESIGN_CONTROL_WORKFLOW.flatMap((step) => step.approvals);
    expect(slots.length).toBeGreaterThan(0);
    expect(new Set(slots.map((slot) => slot.key)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(slot.key).toMatch(/^[a-z0-9_]+$/);
      expect(slot.requiredCapability).toMatch(/^design\./);
      expect(slot.allowedRoles?.length).toBeGreaterThan(0);
      expect(slot.signatureMeaning).toContain(
        'exact Design Control step version'
      );
    }
  });

  it('persists immutable version-bound decisions and retires checkbox release submission', () => {
    const migration = readRepoFile(
      'migrations/0208_design_control_authenticated_approvals.sql'
    );
    const route = readRepoFile('server/src/routes/qmsDesignControl.ts');
    expect(migration).toContain('design_control_step_content_versions');
    expect(migration).toContain('design_control_step_approvals');
    expect(migration).toContain('prevent_design_control_step_approval_delete');
    expect(migration).toContain('approved_content_checksum');
    expect(route).toContain('AUTHENTICATED_APPROVAL_REQUIRED');
    expect(route).not.toMatch(
      /router\.patch[\s\S]*?req\.body\?\.approvals[\s\S]*?saveDesignControlStepDraft/
    );
  });

  it('does not add Design Control approval behavior to P2 routes or workflow files', () => {
    const changedP2Files = [
      'server/src/routes/p2.ts',
      'server/src/routes/p2V2.ts',
      'shared/p2Workflow.ts',
    ].filter((path) => {
      try {
        return readRepoFile(path).includes('design_control_step_approvals');
      } catch {
        return false;
      }
    });
    expect(changedP2Files).toEqual([]);
  });

  it('rejects stale draft and submission versions while allowing the exact current version', () => {
    expect(() =>
      assertExpectedDesignControlVersion('version-2', 'version-2')
    ).not.toThrow();
    expect(() => assertExpectedDesignControlVersion(null, null)).not.toThrow();
    expect(() =>
      assertExpectedDesignControlVersion('version-1', 'version-2')
    ).toThrowError(
      expect.objectContaining({
        code: 'STALE_CONTENT_VERSION',
        statusCode: 409,
      })
    );
  });

  it('requires attributable reasons for rejection and return decisions', () => {
    expect(requireDesignControlDecisionComment('APPROVED', '')).toBeUndefined();
    expect(
      requireDesignControlDecisionComment('REJECTED', 'Unsafe output')
    ).toBe('Unsafe output');
    for (const decision of ['REJECTED', 'RETURNED_FOR_REVISION'] as const) {
      expect(() =>
        requireDesignControlDecisionComment(decision, '  ')
      ).toThrowError(
        expect.objectContaining({
          code: 'DECISION_COMMENT_REQUIRED',
          statusCode: 422,
        })
      );
    }
  });

  it('binds submitted approval roles to verified employee accounts without name matching', () => {
    const migration = readRepoFile(
      'migrations/0275_design_control_verified_approval_assignments.sql'
    );
    const service = readRepoFile(
      'server/src/services/designControlApprovalService.ts'
    );
    expect(migration).toContain('design_control_step_approval_assignments');
    expect(migration).toContain(
      'employee_id integer NOT NULL REFERENCES employees'
    );
    expect(migration).toContain('user_id integer NOT NULL REFERENCES users');
    expect(migration).toContain("WHERE status <> 'REASSIGNED'");
    expect(service).toContain('eq(users.employeeId, selection.employeeId)');
    expect(service).toContain("eq(employees.employmentStatus, 'ACTIVE')");
    expect(service).toContain("'APPROVER_NOT_ASSIGNED'");
    expect(service).toContain("'INDEPENDENCE_REQUIRED'");
    expect(service).toContain("'ADMIN_APPROVAL_BYPASS_FORBIDDEN'");
    expect(service).not.toMatch(/employeeName\s*===\s*/);
  });

  it('provides audited exact-version reassignment while preserving legacy evidence as unverified', () => {
    const service = readRepoFile(
      'server/src/services/designControlApprovalService.ts'
    );
    expect(service).toContain("'DESIGN_CONTROL_APPROVER_REASSIGNED'");
    expect(service).toContain("'AUDITED_AUTHORIZED_REASSIGNMENT'");
    expect(service).toContain("'LEGACY_UNVERIFIED_APPROVAL_EVIDENCE'");
    expect(service).toContain('satisfiesAuthenticatedGate: false');
  });

  it('uses Design Control capabilities rather than login-role names for employee eligibility', () => {
    const service = readRepoFile(
      'server/src/services/designControlApprovalService.ts'
    );
    const editor = readRepoFile(
      'client/src/features/design-control/DesignControlStepEditor.tsx'
    );
    expect(service).toContain(
      'permissions.permissionSet.has(slot.requiredCapability!)'
    );
    expect(service).not.toContain('APPROVER_ROLE_MISMATCH');
    expect(editor).toContain('Select an active employee...');
    expect(editor).toContain('canRouteApprovers');
    expect(editor).toContain('Change approver');
    expect(editor).toContain('/reassign');
  });
});
