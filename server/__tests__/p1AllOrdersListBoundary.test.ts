import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1 PO All Orders list boundary', () => {
  const storage = readFileSync(join(process.cwd(), 'server/storage.ts'), 'utf8');

  it('excludes linked P1 PO units from both payment-list query paths', () => {
    const standardStart = storage.indexOf('async getAllOrdersWithPaymentStatus(');
    const paginatedStart = storage.indexOf('async getAllOrdersWithPaymentStatusPaginated(');
    const nextMethodStart = storage.indexOf('async getOrdersByDepartment(', paginatedStart);

    const standardMethod = storage.slice(standardStart, paginatedStart);
    const paginatedMethod = storage.slice(paginatedStart, nextMethodStart);

    for (const method of [standardMethod, paginatedMethod]) {
      expect(method).toContain('isNull(allOrders.sourcePoId)');
      expect(method).toContain('isNull(allOrders.sourcePoItemId)');
    }
  });
});
