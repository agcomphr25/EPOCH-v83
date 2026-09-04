import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('employee API and authorization error regression', () => {
  it('does not convert ordinary capability 403 responses into session expiry', () => {
    const queryClient = read('client/src/lib/queryClient.ts');
    expect(queryClient).toContain("body?.error === 'Invalid or expired token'");
    expect(queryClient).toContain("body?.error === 'Authentication required'");
    expect(queryClient).not.toContain(
      '(response.status === 401 || response.status === 403) && !_isRetry'
    );
  });

  it('uses the mounted employee certification and evaluation routes', () => {
    const detail = read('client/src/pages/EmployeeDetail.tsx');
    expect(detail).toContain('/api/employees/certifications?employeeId=');
    expect(detail).toContain('/api/employees/evaluations?employeeId=');
    expect(detail).not.toContain('/api/employee-certifications?employeeId=');
  });

  it('registers the employee qualification table as a critical safe migration', () => {
    const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
    const migration = read(
      'migrations/0325_employee_machine_qualifications.sql'
    );
    expect(
      runner.match(/0325_employee_machine_qualifications\.sql/g)
    ).toHaveLength(2);
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS employee_machine_qualifications'
    );
    expect(migration).toContain(
      'employee_machine_qualifications_dimension_check'
    );
  });
});
