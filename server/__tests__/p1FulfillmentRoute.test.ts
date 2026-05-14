import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('p1Fulfillment routes', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'server/src/routes/p1Fulfillment.ts'),
    'utf8',
  );
  const indexSource = readFileSync(
    join(process.cwd(), 'server/src/routes/index.ts'),
    'utf8',
  );

  it('exposes exception and control-gap queues for shipping users', () => {
    expect(routeSource).toContain("router.get('/exceptions'");
    expect(routeSource).toContain("router.get('/control-gaps'");
    expect(routeSource).toContain("requirePermission('shipping.view')");
    expect(indexSource).toContain("app.use('/api/p1-fulfillment', p1FulfillmentRoutes)");
  });

  it('exposes lifecycle endpoints for automated shipping steps to report outcomes', () => {
    expect(routeSource).toContain("router.post('/attempts'");
    expect(routeSource).toContain("router.post('/attempts/:attemptId/step'");
    expect(routeSource).toContain("router.post('/attempts/:attemptId/fail'");
    expect(routeSource).toContain("router.post('/attempts/:attemptId/complete'");
    expect(routeSource).toContain("router.post('/attempts/:attemptId/cancel'");
  });
});
