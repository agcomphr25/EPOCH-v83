import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1 production order workflow boundary', () => {
  const productionQueueSource = readFileSync(
    join(process.cwd(), 'server/src/routes/productionQueue.ts'),
    'utf8',
  );
  const p1QueueSource = readFileSync(
    join(process.cwd(), 'server/src/routes/p1POQueue.ts'),
    'utf8',
  );

  it('keeps Purchase Order Management demand out of the regular production queue', () => {
    expect(productionQueueSource).toContain(
      "COALESCE(o.order_source, 'SALES') <> 'PO_RELEASE'",
    );
    expect(productionQueueSource).not.toContain('FROM production_orders p');
  });

  it('creates only production_orders while scheduling PO demand', () => {
    const scheduleStart = p1QueueSource.indexOf("router.post('/schedule'");
    const progressStart = p1QueueSource.indexOf("router.post('/progress'");
    const scheduleSource = p1QueueSource.slice(scheduleStart, progressStart);

    expect(scheduleStart).toBeGreaterThanOrEqual(0);
    expect(progressStart).toBeGreaterThan(scheduleStart);
    expect(scheduleSource).toContain('INSERT INTO production_orders');
    expect(scheduleSource).toContain('ON CONFLICT (order_id) DO NOTHING');
    expect(scheduleSource).not.toContain('INSERT INTO all_orders');
  });

  it('does not create regular orders when retrying missing PO demand', () => {
    const retryStart = p1QueueSource.indexOf("router.post('/retry-stuck/:poNumber'");
    const backfillStart = p1QueueSource.indexOf("router.post('/backfill-production-orders'");
    const retrySource = p1QueueSource.slice(retryStart, backfillStart);

    expect(retryStart).toBeGreaterThanOrEqual(0);
    expect(backfillStart).toBeGreaterThan(retryStart);
    expect(retrySource).toContain('INSERT INTO production_orders');
    expect(retrySource).not.toContain('INSERT INTO all_orders');
  });
});
