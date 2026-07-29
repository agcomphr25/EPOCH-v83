import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
  pool: { query: vi.fn() },
  pgPool: {},
  rawSql: vi.fn(),
}));

vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
  syncManufacturingQueueOnUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '../db';
import { DatabaseStorage } from '../storage';

describe('vendor notes search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes vendor notes when searching for an alternate name', async () => {
    const lmsVendor = {
      id: 42,
      name: 'LMS',
      notes: 'Alternate name: L. Miller & Sons',
      isActive: true,
    };
    vi.mocked(pool.query)
      .mockResolvedValueOnce([lmsVendor] as never)
      .mockResolvedValueOnce([{ count: '1' }] as never);

    const result = await new DatabaseStorage().getAllVendors({
      search: 'L. Miller & Sons',
      page: 1,
      pageSize: 10,
    });

    const searchSql = String(vi.mocked(pool.query).mock.calls[0][0]);
    expect(searchSql).toContain("v.notes ILIKE '%L. Miller & Sons%'");
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 42, name: 'LMS' }),
    ]));
    expect(result.meta.total).toBe(1);
  });
});
