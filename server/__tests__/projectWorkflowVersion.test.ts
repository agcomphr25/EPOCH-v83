import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it, vi } from 'vitest';

import {
  getWorkflowVersionForNewProject,
  ProjectWorkflowVersionError,
  resolveProjectWorkflowVersion,
  serializeProjectWorkflowVersion,
} from '../src/services/projectWorkflowVersionService';

const root = resolve(__dirname, '../..');
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('project workflow version resolution', () => {
  it.each([null, undefined])('treats %s as legacy_v1', (value) => {
    expect(resolveProjectWorkflowVersion(value)).toBe('legacy_v1');
  });

  it('accepts both known explicit versions', () => {
    expect(resolveProjectWorkflowVersion('legacy_v1')).toBe('legacy_v1');
    expect(resolveProjectWorkflowVersion('p2_v2')).toBe('p2_v2');
  });

  it('rejects an unknown non-null version with a structured error', () => {
    expect.assertions(3);
    try {
      resolveProjectWorkflowVersion('future_v3');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectWorkflowVersionError);
      expect((error as ProjectWorkflowVersionError).toJSON()).toEqual(
        expect.objectContaining({
          error: 'UNKNOWN_PROJECT_WORKFLOW_VERSION',
          workflowVersion: 'future_v3',
        })
      );
      expect((error as Error).message).toContain('future_v3');
    }
  });

  it('serializes stored NULL separately from its effective legacy version', () => {
    expect(serializeProjectWorkflowVersion({ workflowVersion: null })).toEqual({
      workflowVersion: null,
      effectiveWorkflowVersion: 'legacy_v1',
    });
  });

  it.each([undefined, 'false', 'invalid', 'true'])(
    'keeps new creation fail-closed for flag %s',
    (flag) => {
      const warning = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      expect(getWorkflowVersionForNewProject(flag)).toBe('legacy_v1');
      warning.mockRestore();
    }
  );
});

describe('Phase 1 additive migration and repair guards', () => {
  const migration = read('migrations/0199_project_workflow_version.sql');
  const startup = read('server/index.ts');

  it('adds a nullable column with no default and no project data update', () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS workflow_version TEXT/i
    );
    expect(migration).not.toMatch(
      /workflow_version TEXT\s+(?:NOT NULL|DEFAULT)/i
    );
    expect(migration).not.toMatch(/UPDATE\s+projects\b/i);
  });

  it('limits stored non-null versions to legacy_v1 and p2_v2', () => {
    expect(migration).toContain("workflow_version IN ('legacy_v1', 'p2_v2')");
  });

  it('keeps NULL and legacy_v1 eligible for legacy step repair while excluding p2_v2', () => {
    expect(startup).toContain(
      "COALESCE(p.workflow_version, 'legacy_v1') = 'legacy_v1'"
    );
  });
});

describe('legacy creation and response compatibility guards', () => {
  const projectsRoute = read('server/src/routes/projects.ts');
  const quotesRoute = read('server/src/routes/quotes.ts');

  it.each([
    ['manual', projectsRoute],
    ['accepted quote', quotesRoute],
  ])(
    '%s creation explicitly stores the fail-closed workflow version',
    (_name, source) => {
      expect(source).toContain(
        'workflowVersion: getWorkflowVersionForNewProject()'
      );
    }
  );

  it.each([
    ['manual', projectsRoute],
    ['accepted quote', quotesRoute],
  ])('%s creation uses the centralized legacy definition', (_name, source) => {
    expect(source).toContain(
      "getInitializableProjectWorkflowSteps('legacy_v1')"
    );
  });

  it('preserves the two existing initial-status expressions', () => {
    expect(projectsRoute).toContain('status: stepType.initialStatus');
    expect(projectsRoute).toContain(
      "isQuoteStep && quoteId ? { linkedQuoteId: quoteId, status: 'completed'"
    );
    expect(quotesRoute).toContain('status: stepDef.initialStatus');
  });

  it('adds version serialization without replacing existing project response fields', () => {
    expect(
      projectsRoute.match(/\.\.\.serializeProjectWorkflowVersion\(project\)/g)
        ?.length
    ).toBeGreaterThanOrEqual(3);
    expect(projectsRoute).toContain('...project,');
    expect(projectsRoute).toContain('steps,');
  });
});
