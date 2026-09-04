import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assignDashboardForWorkOrder } from '../src/lib/workOrderDashboardAssignment';

describe('work-order dashboard route assignment', () => {
  it.each([
    ['Finish', '/department-queue/finish'],
    ['Finish QC', '/department-queue/finish-qc'],
    ['Paint', '/department-queue/paint'],
    ['Quality Control', '/department-queue/qc-shipping'],
    ['Shipping QC', '/department-queue/qc-shipping'],
    ['Shipping', '/department-queue/shipping'],
  ])('uses the mounted department queue for %s', (department, route) => {
    expect(assignDashboardForWorkOrder({ department }).assignedDashboardRoute).toBe(
      route
    );
  });

  it.each([
    ['Finish', '/finish-queue', '/department-queue/finish'],
    ['Quality Control', '/qc-shipping-queue', '/department-queue/qc-shipping'],
    ['Shipping', '/shipping-queue', '/department-queue/shipping'],
    ['CNC', '/cnc-queue', '/cnc-dashboard'],
  ])('replaces a previously stored dead %s route', (department, storedRoute, route) => {
    expect(
      assignDashboardForWorkOrder({
        assignedDepartment: department,
        assignedDashboardRoute: storedRoute,
      }).assignedDashboardRoute
    ).toBe(route);
  });

  it('returns the normalized assignment route from the PM dashboard relay', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/src/routes/pmDashboard.ts'),
      'utf8'
    );
    expect(source).toContain(
      'assignedDashboardRoute: assignment.assignedDashboardRoute'
    );
    expect(source).not.toContain(
      'assignedDashboardRoute: row.assignedDashboardRoute ?? assignment.assignedDashboardRoute'
    );
  });
});
