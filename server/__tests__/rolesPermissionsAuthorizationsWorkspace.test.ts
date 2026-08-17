import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Roles, Permissions & Authorizations workspace continuity', () => {
  const page = read('client/src/pages/admin/RolesPermissionsPage.tsx');
  const route = read('server/src/routes/permissions.ts');

  it('protects employee authority information server-side and keeps the projection read-only', () => {
    expect(route).toContain(
      "router.get('/authority-workspace', requireAdminAccess"
    );
    const projection = route.slice(
      route.indexOf("router.get('/authority-workspace'"),
      route.indexOf('/** POST /api/permissions/roles')
    );
    expect(projection).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it('does not mutate existing assignments or controlled workflows', () => {
    expect(page).not.toContain('useMutation');
    expect(page).not.toContain('Apply template');
    expect(page).not.toContain('Apply</Button>');
    expect(page).not.toContain('CERTIFICATION_AUTHORIZATION_ENFORCEMENT =');
  });

  it('preserves the complete user-account view independently of employee linkage', () => {
    expect(page).toContain("queryKey: ['/api/users']");
    expect(page).toContain('<TabsTrigger value="users">Users</TabsTrigger>');
    expect(page).toContain('Complete EPOCH account list');
    expect(page).toContain('they are not linked to an employee record');
    expect(page).toContain('user.employeeDisplayName');
    expect(page).toContain('Not linked');
  });

  it('reuses the Training-owned matrix and distinguishes competence from authority', () => {
    const normalizedPage = page.replace(/\s+/g, ' ');
    expect(page).toContain('<CertificationAuthorizationMatrix />');
    expect(normalizedPage).toContain(
      'Training completion alone does not grant controlled authority.'
    );
    expect(normalizedPage).toContain(
      'This report describes current EPOCH records. It does not independently grant authority.'
    );
  });

  it('reports unavailable data without converting it to zero', () => {
    expect(page).toContain("'Not available'");
    expect(page).toContain('dataAvailability');
  });

  it('shows split enforcement state without changing either source', () => {
    expect(route).toContain(
      "process.env.CERTIFICATION_AUTHORIZATION_ENFORCEMENT === 'true'"
    );
    expect(route).toContain(
      "controllingSource: 'CERTIFICATION_AUTHORIZATION_ENFORCEMENT'"
    );
    expect(page).toContain(
      'The two controls disagree. No setting was changed.'
    );
  });

  it('labels templates as recommendations and supplies no apply action', () => {
    expect(page).toContain(
      'Recommendation only. No Apply action is available.'
    );
    expect(page).toContain('Preview recommended settings');
    expect(page).toContain('Compare with current employee');
  });

  it('does not fabricate missing audit history', () => {
    expect(page).toContain('current state is not presented as history');
  });

  it('preserves synthetic labeling and audited commit metadata', () => {
    const sample = read(
      'docs/audits/generated/synthetic-employee-access-matrix.csv'
    );
    const disposition = JSON.parse(
      read('docs/audits/generated/migration-disposition.json')
    );
    expect(sample).toContain('Synthetic Quality Inspector');
    expect(sample).toContain('SYN-001');
    expect(disposition.generatedFrom).toBe(
      '22f478990ee2a59f2780b79ac71507b9818e0242'
    );
  });
});
