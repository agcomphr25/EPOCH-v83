import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCertificationFilesExist,
  resolveCertificationPaths,
} from './resolve-p2-v2-certification-scope.mjs';

const dispatchPaths = [
  'client/src/features/design-control/DesignProjectConfigurationWorkspace.tsx',
  'server/src/routes/rdProjects.ts',
  'server/__tests__/designProjectConfigurationSecurityPostgres.test.ts',
  'migrations/0251_design_project_configuration_workspace.sql',
];

const requiredPhase2Paths = [
  'client/src/features/design-control/DesignProjectConfigurationWorkspace.tsx',
  'client/src/__tests__/DesignProjectConfigurationWorkspace.component.test.tsx',
  'server/src/routes/rdProjects.ts',
  'server/__tests__/designProjectConfigurationWorkspacePhase2.test.ts',
  'server/__tests__/designProjectConfigurationSecurityPostgres.test.ts',
  'server/schema.ts',
  'server/src/services/designControlSchemaReadiness.ts',
  'server/scripts/migrations/runSafeBootMigrations.ts',
  'migrations/0251_design_project_configuration_workspace.sql',
];

test('pull requests use only their changed-file scope', () => {
  assert.deepEqual(
    resolveCertificationPaths({
      eventName: 'pull_request',
      kind: 'eslint',
      dispatchPaths,
      changedPaths: ['server/src/routes/rdProjects.ts'],
    }),
    ['server/src/routes/rdProjects.ts']
  );
});

test('workflow dispatch uses the explicit Phase 2 scope without unrelated files', () => {
  const scope = resolveCertificationPaths({
    eventName: 'workflow_dispatch',
    kind: 'eslint',
    dispatchPaths,
    changedPaths: [],
  });
  assert.ok(scope.includes('server/src/routes/rdProjects.ts'));
  assert.ok(
    scope.includes(
      'server/__tests__/designProjectConfigurationSecurityPostgres.test.ts'
    )
  );
  assert.ok(!scope.includes('client/src/components/PartRoutingWizard.tsx'));
});

test('the dispatch manifest includes every required Phase 2 artifact', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      '.github/p2-v2-workflow-dispatch-certification-manifest.json',
      'utf8'
    )
  );
  for (const file of requiredPhase2Paths)
    assert.ok(manifest.includes(file), file);
});

test('an unrelated file is included only when a pull request changes it', () => {
  const unrelated = 'client/src/components/PartRoutingWizard.tsx';
  const scope = resolveCertificationPaths({
    eventName: 'pull_request',
    kind: 'eslint',
    dispatchPaths,
    changedPaths: [unrelated],
  });
  assert.deepEqual(scope, [unrelated]);
});

test('an empty scope fails instead of scanning the repository', () => {
  assert.throws(
    () =>
      resolveCertificationPaths({
        eventName: 'pull_request',
        kind: 'eslint',
        dispatchPaths,
        changedPaths: [],
      }),
    /refusing a repository-wide fallback/
  );
});

test('missing expected files fail with a clear message', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-cert-scope-'));
  assert.throws(
    () => assertCertificationFilesExist(root, dispatchPaths),
    /Missing required certification file\(s\)/
  );
});

test('workflow retains reachable PostgreSQL stages after formatting', () => {
  const workflow = fs.readFileSync(
    path.resolve('.github/workflows/p2-v2-postgres-certification.yml'),
    'utf8'
  );
  const formatting = workflow.indexOf(
    'Run focused Phase 9-10A formatting certification'
  );
  const postgres = workflow.indexOf('Run isolated PostgreSQL certification');
  assert.ok(formatting >= 0 && postgres > formatting);
  assert.match(
    workflow,
    /designProjectConfigurationSecurityPostgres\.test\.ts/
  );
});
