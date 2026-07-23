import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  canonicalDesignControlContent,
  checksumDesignControlContent,
  materialStepContent,
} from '../src/services/designControlApprovalService';
import { DESIGN_CONTROL_WORKFLOW } from '../../shared/designControlWorkflow';

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

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
    const reorderedAttachments = { ...first, attachments: [...first.attachments].reverse() };

    expect(canonicalDesignControlContent(first)).toBe(canonicalDesignControlContent(reorderedKeys));
    expect(checksumDesignControlContent(first)).toBe(checksumDesignControlContent(reorderedKeys));
    expect(checksumDesignControlContent(first)).not.toBe(checksumDesignControlContent(reorderedAttachments));
  });

  it('defines stable capability-bound approval keys for every workflow slot', () => {
    const slots = DESIGN_CONTROL_WORKFLOW.flatMap((step) => step.approvals);
    expect(slots.length).toBeGreaterThan(0);
    expect(new Set(slots.map((slot) => slot.key)).size).toBe(slots.length);
    for (const slot of slots) {
      expect(slot.key).toMatch(/^[a-z0-9_]+$/);
      expect(slot.requiredCapability).toMatch(/^design\./);
      expect(slot.allowedRoles?.length).toBeGreaterThan(0);
      expect(slot.signatureMeaning).toContain('exact Design Control step version');
    }
  });

  it('persists immutable version-bound decisions and retires checkbox release submission', () => {
    const migration = readRepoFile('migrations/0208_design_control_authenticated_approvals.sql');
    const route = readRepoFile('server/src/routes/qmsDesignControl.ts');
    expect(migration).toContain('design_control_step_content_versions');
    expect(migration).toContain('design_control_step_approvals');
    expect(migration).toContain('prevent_design_control_step_approval_delete');
    expect(migration).toContain('approved_content_checksum');
    expect(route).toContain('AUTHENTICATED_APPROVAL_REQUIRED');
    expect(route).not.toMatch(/router\.patch[\s\S]*?req\.body\?\.approvals[\s\S]*?saveDesignControlStepDraft/);
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
});
