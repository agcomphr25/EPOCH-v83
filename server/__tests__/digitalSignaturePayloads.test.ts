/**
 * Unit tests for the digital-signature payload builder + classification rules
 * (Task #145, Phase 3). Pure functions — no DB, no service layer.
 */

import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_TRANSACTION_CLASSES,
  buildMaterialIssueSignaturePayload,
  classifyRequiredSignature,
} from '../src/services/digitalSignaturePayloads';

const policy = { scrapThresholdQty: 10, countAdjustmentThresholdQty: 25 };

describe('classifyRequiredSignature', () => {
  it('returns null for routine green-path consume', () => {
    expect(
      classifyRequiredSignature(
        { action: 'consume', reasonCode: 'STD', quantity: 5, lotStatus: 'ACCEPTED' },
        policy,
      ),
    ).toBeNull();
  });

  it('flags explicit isOverride as MATERIAL_OVERRIDE', () => {
    expect(
      classifyRequiredSignature(
        { action: 'consume', quantity: 1, lotStatus: 'ACCEPTED', isOverride: true },
        policy,
      ),
    ).toBe(SIGNATURE_TRANSACTION_CLASSES.MATERIAL_OVERRIDE);
  });

  it('flags reason codes that start with OVERRIDE_', () => {
    expect(
      classifyRequiredSignature(
        { action: 'consume', reasonCode: 'OVERRIDE_INSUFFICIENT_QTY', quantity: 1 },
        policy,
      ),
    ).toBe(SIGNATURE_TRANSACTION_CLASSES.MATERIAL_OVERRIDE);
  });

  it('flags consume against a QUARANTINE lot as QUARANTINE_RELEASE', () => {
    expect(
      classifyRequiredSignature(
        { action: 'consume', quantity: 2, lotStatus: 'QUARANTINE' },
        policy,
      ),
    ).toBe(SIGNATURE_TRANSACTION_CLASSES.QUARANTINE_RELEASE);
  });

  it('flags expired-lot use as EXPIRED_LOT_USE', () => {
    expect(
      classifyRequiredSignature(
        { action: 'issue', quantity: 1, lotStatus: 'ACCEPTED', lotIsExpired: true },
        policy,
      ),
    ).toBe(SIGNATURE_TRANSACTION_CLASSES.EXPIRED_LOT_USE);
  });

  it('flags scrap above threshold', () => {
    expect(
      classifyRequiredSignature({ action: 'consume', reasonCode: 'SCRAP_DAMAGE', quantity: 15 }, policy),
    ).toBe(SIGNATURE_TRANSACTION_CLASSES.SCRAP_ABOVE_THRESHOLD);
  });

  it('does NOT flag scrap below threshold', () => {
    expect(
      classifyRequiredSignature({ action: 'consume', reasonCode: 'SCRAP_DAMAGE', quantity: 2 }, policy),
    ).toBeNull();
  });

  it('flags large count adjustments', () => {
    expect(
      classifyRequiredSignature({ action: 'consume', reasonCode: 'COUNT_ADJ', quantity: 30 }, policy),
    ).toBe(SIGNATURE_TRANSACTION_CLASSES.COUNT_ADJUSTMENT_HIGH);
  });
});

describe('buildMaterialIssueSignaturePayload', () => {
  it('produces a deterministic payload regardless of input field order', () => {
    const a = buildMaterialIssueSignaturePayload(
      SIGNATURE_TRANSACTION_CLASSES.MATERIAL_OVERRIDE,
      {
        action: 'consume',
        materialLotId: 'lot-1',
        quantity: 3,
        unitOfMeasure: 'EA',
        travelerId: 't1',
        travelerStepId: 's1',
        productionWorkOrderId: 'w1',
        chargeCodeId: 42,
        reasonCode: 'OVERRIDE_INSUFFICIENT_QTY',
        approverUserId: 7,
        approverDisplayName: 'Approver',
        signerUserId: 9,
        signerDisplayName: 'Signer',
      },
    );
    expect(a.transactionClass).toBe('MATERIAL_OVERRIDE');
    expect(a.payload).toMatchObject({
      v: 1,
      action: 'consume',
      materialLotId: 'lot-1',
      quantity: 3,
      reasonCode: 'OVERRIDE_INSUFFICIENT_QTY',
      signerUserId: 9,
    });
  });
});
