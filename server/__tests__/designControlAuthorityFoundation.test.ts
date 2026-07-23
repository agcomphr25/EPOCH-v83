import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  DESIGN_CONTROL_STEP_KEYS,
  DESIGN_CONTROL_WORKFLOW,
  workflowItemLookupKeys,
} from '../../shared/designControlWorkflow';
import { deriveDesignControlAuthorityState } from '../src/services/designControlAuthorityService';

describe('Design Control authority foundation', () => {
  it('defines one stable twelve-step workflow with the release gate last', () => {
    expect(DESIGN_CONTROL_WORKFLOW).toHaveLength(12);
    expect(DESIGN_CONTROL_STEP_KEYS).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    expect(DESIGN_CONTROL_WORKFLOW.map((step) => step.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(DESIGN_CONTROL_WORKFLOW.at(-1)).toMatchObject({
      key: '12',
      releaseGate: true,
    });
  });

  it('retains legacy aliases while using stable canonical keys', () => {
    const releaseApproval = DESIGN_CONTROL_WORKFLOW[11].approvals[0];
    expect(workflowItemLookupKeys(releaseApproval)).toContain(
      releaseApproval.key
    );
    expect(workflowItemLookupKeys(releaseApproval)).toContain(
      'Engineering release approval'
    );
  });

  it('derives authority only from explicit persisted states', () => {
    expect(deriveDesignControlAuthorityState([])).toBe('NOT_INITIALIZED');
    expect(
      deriveDesignControlAuthorityState([{ authorityStatus: 'authoritative' }])
    ).toBe('AUTHORITATIVE');
    expect(
      deriveDesignControlAuthorityState([
        { authorityStatus: 'reconciliation_required' },
        { authorityStatus: 'reconciliation_required' },
      ])
    ).toBe('RECONCILIATION_REQUIRED');
    expect(
      deriveDesignControlAuthorityState([
        { authorityStatus: 'authoritative' },
        { authorityStatus: 'authoritative' },
      ])
    ).toBe('INVALID_STATE');
    expect(
      deriveDesignControlAuthorityState([{ authorityStatus: 'superseded' }])
    ).toBe('SUPERSEDED_ONLY');
  });

  it('enforces authority, permissions, and non-destructive reconciliation at integration seams', () => {
    const root = process.cwd();
    const migration = readFileSync(
      join(root, 'migrations/0207_design_control_authority_foundation.sql'),
      'utf8'
    );
    const projectRoutes = readFileSync(
      join(root, 'server/src/routes/rdProjects.ts'),
      'utf8'
    );
    const qmsRoutes = readFileSync(
      join(root, 'server/src/routes/qmsDesignControl.ts'),
      'utf8'
    );
    const releaseService = readFileSync(
      join(root, 'server/src/services/engineeringReleaseService.ts'),
      'utf8'
    );
    const rdProjectsPage = readFileSync(
      join(root, 'client/src/pages/RDProjectsPage.tsx'),
      'utf8'
    );
    const qmsPage = readFileSync(
      join(root, 'client/src/pages/QMSDesignControlPage.tsx'),
      'utf8'
    );

    expect(migration).toContain(
      'design_control_records_authoritative_rd_project_unique'
    );
    expect(migration).toContain(
      "WHERE authority_status = 'authoritative' AND rd_project_id IS NOT NULL"
    );
    expect(migration).not.toMatch(
      /\bDELETE\s+FROM\s+design_control_records\b/i
    );
    expect(projectRoutes).toContain(
      "requirePermission('design.control.create')"
    );
    expect(projectRoutes).toContain(
      "requirePermission('design.control.admin')"
    );
    expect(projectRoutes).toContain('z.string().trim().min(1)');
    expect(projectRoutes).toContain("outcome: 'possible_duplicate'");
    expect(qmsRoutes).toContain("from '../../../shared/designControlWorkflow'");
    expect(qmsPage).toContain("from '@shared/designControlWorkflow'");
    expect(releaseService).toContain("authorityStatus !== 'authoritative'");
    expect(rdProjectsPage).toContain('const projects = sharedProjects');
    expect(rdProjectsPage).toContain('Browser-local project data needs review');
  });
});
