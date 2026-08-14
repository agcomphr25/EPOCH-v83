import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('All Orders customer search fields', () => {
  const storage = readFileSync(join(process.cwd(), 'server/storage.ts'), 'utf8');

  it('includes the customer email in the paginated orders search', () => {
    const paginatedStart = storage.indexOf('async getAllOrdersWithPaymentStatusPaginated(');
    const nextMethodStart = storage.indexOf('async getOrdersByDepartment(', paginatedStart);
    const paginatedMethod = storage.slice(paginatedStart, nextMethodStart);

    expect(paginatedMethod).toContain("LOWER(COALESCE(c.email, '')) LIKE ${searchPattern}");
  });
});
