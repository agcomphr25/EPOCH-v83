import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('p1FulfillmentAttemptService', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/services/p1FulfillmentAttemptService.ts'),
    'utf8',
  );

  it('models the automated fulfillment pipeline steps explicitly', () => {
    expect(source).toContain("'READINESS'");
    expect(source).toContain("'UPS_LABEL'");
    expect(source).toContain("'SHIPMENT_RECORD'");
    expect(source).toContain("'FULFILLMENT_UPDATE'");
    expect(source).toContain("'ACCOUNTING_HANDOFF'");
    expect(source).toContain("'CUSTOMER_NOTIFICATION'");
  });

  it('moves failed or uncertain work into a shipping exception queue with user guidance', () => {
    expect(source).toContain("status: 'EXCEPTION'");
    expect(source).toContain('failedStep: input.failedStep');
    expect(source).toContain('failureCode: input.failureCode');
    expect(source).toContain('failureMessage: input.failureMessage');
    expect(source).toContain('remediationHint: input.remediationHint');
    expect(source).toContain('listOpenP1FulfillmentExceptions');
  });

  it('keeps completed attempts idempotent-friendly for future accounting handoff wiring', () => {
    expect(source).toContain("status: 'COMPLETED'");
    expect(source).toContain('journalEntryId');
    expect(source).toContain('shipmentRecordId');
    expect(source).toContain('trackingNumber');
  });

  it('surfaces control gaps where shipping state and fulfillment state disagree', () => {
    expect(source).toContain('listP1FulfillmentControlGaps');
    expect(source).toContain('trackingNumber');
    expect(source).toContain('shippedDate');
    expect(source).toContain('Fulfilled');
  });
});
