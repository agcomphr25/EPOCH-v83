import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEmployeeAccessMatrix,
  CONTROLLED_ACTIONS,
} from './employee-access-matrix.mjs';

const fixture = {
  dataClassification: 'SYNTHETIC',
  asOf: '2026-08-14T12:00:00.000Z',
  employees: [
    {
      id: 1,
      employeeNumber: 'SYN-001',
      name: 'Synthetic Quality',
      employmentStatus: 'ACTIVE',
      isActive: true,
    },
    {
      id: 2,
      employeeNumber: 'SYN-002',
      name: 'Synthetic Unlinked',
      employmentStatus: 'ACTIVE',
      isActive: true,
    },
  ],
  users: [
    {
      id: 11,
      employeeId: 1,
      username: 'synthetic-quality',
      role: 'QUALITY',
      isActive: true,
      accessStatus: 'ACTIVE',
    },
  ],
  roleCapabilities: {
    QUALITY: ['quality.inspection.perform', 'quality.product_release.approve'],
  },
  overrides: [
    {
      userId: 11,
      capability: 'quality.product_release.approve',
      effect: 'deny',
    },
  ],
  authorizations: [
    {
      id: 'auth-synthetic-1',
      employeeId: 1,
      authorizationType: 'QC_INSPECTION',
      status: 'ACTIVE',
      effectiveDate: '2026-01-01T00:00:00.000Z',
    },
  ],
  legacyP2Certifications: [],
};

test('builds one row per employee/action without mutating input', () => {
  const before = JSON.stringify(fixture);
  const rows = buildEmployeeAccessMatrix(fixture);
  assert.equal(
    rows.length,
    fixture.employees.length * CONTROLLED_ACTIONS.length
  );
  assert.equal(JSON.stringify(fixture), before);
});

test('applies deny overrides and distinguishes permission from authority', () => {
  const rows = buildEmployeeAccessMatrix(fixture);
  const qc = rows.find(
    (r) => r.employeeId === 1 && r.action === 'QC Inspection'
  );
  const release = rows.find(
    (r) => r.employeeId === 1 && r.action === 'Final Product Release'
  );
  assert.equal(qc.hasPermission, true);
  assert.equal(qc.activeAuthorizationId, 'auth-synthetic-1');
  assert.match(qc.categories, /CURRENT_ACCESS_DOCUMENTED/);
  assert.equal(release.hasPermission, false);
  assert.equal(release.activeAuthorizationId, '');
});

test('classifies unlinked employees without inventing access', () => {
  const rows = buildEmployeeAccessMatrix(fixture).filter(
    (r) => r.employeeId === 2
  );
  assert.ok(
    rows.every((r) => r.categories.includes('UNLINKED_EMPLOYEE_OR_USER'))
  );
  assert.ok(rows.every((r) => r.allowedNow === false));
});
