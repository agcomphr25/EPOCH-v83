import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), 'utf8');
const qmsRoute = read('server/src/routes/qmsDesignControl.ts');
const permissions = read('server/middleware/requirePermission.ts');
const matrix = read('server/src/designControlAuthorization.ts');
const capabilities = read('server/src/capabilities.ts');
const seed = read('server/index.ts');
const safeBoot = read('server/scripts/migrations/runSafeBootMigrations.ts');
const report = read('docs/design-control-production-readiness.md');

describe('Phase 12 Design Control production-readiness hardening', () => {
  it('authenticates the complete QMS Design Control router', () => {
    expect(qmsRoute).toContain('router.use(authenticateToken)');
  });

  it('capability-gates every QMS Design Control read surface', () => {
    for (const route of [
      '/',
      '/oversight/projects',
      '/:id',
      '/:id/manufacturing-evidence',
      '/:id/engineering-release-preview',
      '/:id/readiness',
    ]) {
      expect(qmsRoute).toMatch(
        new RegExp(
          `router\\.get\\(\\s*['"]${route.replaceAll('/', '\\/')}['"]\\s*,\\s*requireDesignControlView`
        )
      );
    }
  });

  it('fails closed when none of the permitted capabilities is present', () => {
    expect(permissions).toContain('requireAnyPermission');
    expect(permissions).toContain('requiredAnyCapability');
    expect(permissions).toContain(
      "return res.status(403).json({ error: 'Permission check failed' })"
    );
  });

  it('defines a central action-to-capability matrix', () => {
    for (const action of [
      'projectAdministration',
      'designControlView',
      'designControlCreate',
      'stepApproval',
      'verification',
      'validation',
      'engineeringRelease',
      'ecrDisposition',
      'ecnImplementation',
      'projectFormApproval',
      'controlledCopyReconciliation',
      'dhfVerification',
      'auditorReadOnly',
      'legacyReconciliation',
    ]) {
      expect(matrix).toContain(`${action}:`);
    }
  });

  it('models representative roles without granting ordinary users access', () => {
    for (const role of [
      'designEngineer',
      'engineeringApprover',
      'quality',
      'manufacturingOperations',
      'projectProgramManager',
      'documentControl',
      'designAdministrator',
      'auditor',
      'ordinaryUser',
    ]) {
      expect(matrix).toContain(`${role}:`);
    }
    expect(matrix).toContain('ordinaryUser: []');
  });

  it('registers all Design Control authority capabilities in both catalogs', () => {
    for (const capability of [
      'design.control.view',
      'design.control.create',
      'design.control.admin',
    ]) {
      expect(capabilities).toContain(`'${capability}'`);
      expect(seed).toContain(`key: '${capability}'`);
    }
  });

  it('keeps P2 migration 0220 separate from DHF migration 0221', () => {
    expect(
      safeBoot.match(/0220_p2_v2_production_execution\.sql/g)
    ).toHaveLength(2);
    expect(safeBoot.match(/0221_design_history_files\.sql/g)).toHaveLength(2);
    expect(
      safeBoot.indexOf('0220_p2_v2_production_execution.sql')
    ).toBeLessThan(safeBoot.indexOf('0221_design_history_files.sql'));
  });

  it('documents that no shared or production database was contacted', () => {
    expect(report).toContain(
      'No production, shared development, shared staging, or unidentified database was contacted.'
    );
  });

  it('does not claim PostgreSQL certification without an isolated database', () => {
    expect(report).toContain('PostgreSQL certification: **BLOCKED**');
    expect(report).toContain('Final classification: **BLOCKED**');
    expect(report).not.toContain('Final classification: **READY**');
  });

  it('records the tested main commit and P2 isolation boundary', () => {
    expect(report).toContain('410815d2eab29759f71aff4da3e4f8e0b63bb65c');
    expect(report).toContain(
      'P2 Projects remain customer-PO/manufacturing records'
    );
  });
});
