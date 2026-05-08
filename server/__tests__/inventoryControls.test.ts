import { describe, expect, it } from 'vitest';
import {
  MATERIAL_TRACEABILITY_REQUIREMENTS,
  validateInventoryStatusAction,
} from '../src/constants/inventoryControls';

describe('inventory status action controls', () => {
  it('makes quarantined material view-only except disposition changes', () => {
    expect(validateInventoryStatusAction('QUARANTINE', 'view')).toEqual({ ok: true });
    expect(validateInventoryStatusAction('QUARANTINE', 'status_change')).toEqual({ ok: true });
    expect(validateInventoryStatusAction('QUARANTINE', 'move')).toMatchObject({
      ok: false,
      code: 'ACTION_BLOCKED',
    });
  });

  it('limits rejected material to scrap or MRB', () => {
    expect(validateInventoryStatusAction('REJECTED', 'scrap')).toEqual({ ok: true });
    expect(validateInventoryStatusAction('REJECTED', 'mrb')).toEqual({ ok: true });
    expect(validateInventoryStatusAction('REJECTED', 'reserve')).toMatchObject({
      ok: false,
      code: 'ACTION_BLOCKED',
    });
  });

  it('blocks all non-view actions for scrapped material', () => {
    expect(validateInventoryStatusAction('SCRAPPED', 'view')).toEqual({ ok: true });
    expect(validateInventoryStatusAction('SCRAPPED', 'move')).toMatchObject({
      ok: false,
      code: 'ACTION_BLOCKED',
    });
  });

  it('prevents expired material from allocation-style actions', () => {
    expect(validateInventoryStatusAction('EXPIRED', 'reserve')).toMatchObject({
      ok: false,
      code: 'ACTION_BLOCKED',
    });
    expect(validateInventoryStatusAction('EXPIRED', 'consume')).toMatchObject({
      ok: false,
      code: 'ACTION_BLOCKED',
    });
    expect(validateInventoryStatusAction('EXPIRED', 'scrap')).toEqual({ ok: true });
  });

  it('requires approval for held material actions', () => {
    expect(validateInventoryStatusAction('HOLD', 'view')).toEqual({ ok: true });
    expect(validateInventoryStatusAction('HOLD', 'move')).toMatchObject({
      ok: false,
      code: 'APPROVAL_REQUIRED',
    });
    expect(validateInventoryStatusAction('HOLD', 'move', 'approval-123')).toEqual({ ok: true });
  });
});

describe('material traceability requirements', () => {
  it('formalizes required evidence by department', () => {
    expect(MATERIAL_TRACEABILITY_REQUIREMENTS).toEqual([
      { department: 'Layup', requiredTraceability: ['ICN', 'lot', 'expiration', 'out-time'] },
      { department: 'CNC', requiredTraceability: ['serial'] },
      { department: 'Finish', requiredTraceability: ['batch number'] },
      { department: 'QC', requiredTraceability: ['cert package'] },
    ]);
  });
});
