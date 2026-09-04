import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getManufacturingCategoriesForDepartment,
  getManufacturingDepartmentIdentities,
} from '../../../shared/utils/manufacturingRouting';

const source = readFileSync(
  resolve(process.cwd(), 'client/src/pages/ManufacturingQueue.tsx'),
  'utf8'
);
const routingDefinitions = readFileSync(
  resolve(process.cwd(), 'shared/utils/manufacturingRouting.ts'),
  'utf8'
);
const queueRoute = readFileSync(
  resolve(process.cwd(), 'server/src/routes/manufacturingQueue.ts'),
  'utf8'
);

describe('Manufacturing Queue department selector', () => {
  it('loads all shared departments before applying production queue eligibility', () => {
    const queueSelectorSource = source.slice(
      0,
      source.indexOf('function AddQueueItemDialog')
    );
    expect(queueSelectorSource).toContain(
      "apiRequest('/api/shared-departments?includeInactive=true')"
    );
    expect(queueSelectorSource).not.toContain(
      "apiRequest('/api/shared-departments?routingOnly=true')"
    );
    expect(source).toContain('department.productionEnabled !== false');
    expect(source).toContain(
      'sharedDepartments\n        .filter((department) => department.name.trim().length > 0)'
    );
  });

  it('loads routing-enabled departments for stock-build readiness', () => {
    const stockBuildSource = source.slice(
      source.indexOf('function AddQueueItemDialog')
    );
    expect(stockBuildSource).toContain(
      "apiRequest('/api/shared-departments?routingOnly=true')"
    );
    expect(stockBuildSource).toContain('selectedRoutingDepartment');
  });

  it('derives every canonical manufacturing fallback from the shared route definitions', () => {
    expect(source).toContain(
      "} from '@shared/utils/manufacturingRouting'"
    );
    expect(source).toContain('Object.values(MANUFACTURING_ROUTE_DEFINITIONS)');
    expect(source).toContain('route.canRelease && route.department');
    expect(source).toContain('getManufacturingDepartmentIdentities');
    for (const department of [
      'Cutting Table',
      'Kitting',
      'CNC',
      'Core',
      'Sub Assembly',
      'Assembly',
      'Layup',
    ]) {
      expect(routingDefinitions).toContain(`department: '${department}'`);
    }
  });

  it('normalizes configured queue aliases through the shared server/client contract', () => {
    expect(getManufacturingCategoriesForDepartment('Kits')).toContain('KIT');
    expect(getManufacturingCategoriesForDepartment('Cores')).toContain('CORE');
    expect(getManufacturingCategoriesForDepartment('Subassembly')).toContain(
      'SUB_ASSEMBLY'
    );
    expect(getManufacturingDepartmentIdentities('Kit')).toContain('kitting');
    expect(source).toContain(
      'getManufacturingDepartmentIdentities(department.name)'
    );
    expect(queueRoute).toContain(
      'const departmentIdentities = getManufacturingDepartmentIdentities(department)'
    );
    expect(queueRoute).toContain('regexp_replace(lower(btrim(');
  });
});
