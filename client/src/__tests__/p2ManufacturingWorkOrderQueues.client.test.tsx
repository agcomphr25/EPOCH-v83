import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const navigation = read('client/src/components/Navigation.tsx');
const page = read('client/src/pages/P2WorkOrderQueuePage.tsx');

describe('P2 W/O Queues client surface', () => {
  it('keeps the P2 dropdown distinct from the unchanged P1 manager', () => {
    expect(navigation).toContain('P2 W/O Queues');
    expect(navigation).toContain('P1 Department Manager');
    expect(navigation).toContain('/p2-work-orders/queues/');
    expect(navigation).toContain('/department-queue/production-queue');
  });

  it('uses authoritative shared Departments rather than a hard-coded P2 taxonomy', () => {
    expect(navigation).toContain(
      "apiRequest('/api/shared-departments?routingOnly=true')"
    );
    expect(navigation).toContain('department.id');
    expect(navigation).not.toContain("label: 'P2 Assembly'");
  });

  it('keeps reads and execution disabled unless exact VITE flags are true', () => {
    expect(page).toContain(
      'VITE_P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED ==='
    );
    expect(page).toContain(
      "VITE_P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED === 'true'"
    );
    expect(page).toContain(
      "VITE_P2_TRAVELER_PROVISIONING_WRITES_ENABLED === 'true'"
    );
    expect(page).toContain("can('p2.travelers.provision')");
    expect(page).toContain('P2 W/O Queues are disabled');
  });

  it('shows blocked work and real structured blockers without client BOM explosion', () => {
    expect(page).toContain('Blocked work remains visible');
    expect(page).toContain('Waiting on manufactured child');
    expect(page).toContain('Waiting on material');
    expect(page).toContain('shortageQuantity');
    expect(page).not.toContain('bom_lines');
  });
});
