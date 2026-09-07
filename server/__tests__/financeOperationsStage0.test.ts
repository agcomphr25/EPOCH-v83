import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';
import {
  FINANCE_EVIDENCE_RETENTION_DAYS,
  getFinanceOperationsCapabilityState,
  isFinancePilotUser,
  requireFinancePilotUser,
} from '../src/lib/financeOperationsPolicy';
import { buildFinanceEvidenceHash } from '../src/services/financeDecisionLedger.service';

vi.mock('../src/services/auditLedgerService', () => ({
  canonicalize(value: unknown): string {
    const normalize = (candidate: any): any => {
      if (Array.isArray(candidate)) return candidate.map(normalize);
      if (candidate && typeof candidate === 'object') {
        return Object.keys(candidate)
          .sort()
          .reduce<Record<string, unknown>>((result, key) => {
            result[key] = normalize(candidate[key]);
            return result;
          }, {});
      }
      return candidate;
    };
    return JSON.stringify(normalize(value));
  },
  recordAuditEvent: vi.fn(),
}));

const flagNames = [
  'FINANCE_ATTENTION_CENTER_ENABLED',
  'FINANCE_AR_DRAFT_PREPARATION_ENABLED',
  'FINANCE_AI_EXPLANATIONS_ENABLED',
] as const;

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('Finance Operations Stage 0 controls', () => {
  beforeEach(() => {
    for (const name of flagNames) delete process.env[name];
  });

  it('fails closed and keeps AI authority non-consequential', () => {
    const state = getFinanceOperationsCapabilityState();
    expect(state.deterministicOnly).toBe(true);
    expect(state.capabilities).toEqual({
      attentionCenter: false,
      arDraftPreparation: false,
      aiExplanations: false,
    });
    expect(state.controls).toMatchObject({
      aiMayApprove: false,
      aiMayPost: false,
      aiMaySend: false,
      aiMayPay: false,
      attachmentsMayBeSentToAi: false,
      internalFreeTextMayBeSentToAi: false,
      evidenceRetentionDays: FINANCE_EVIDENCE_RETENTION_DAYS,
    });
  });

  it('restricts the pilot to the exact glennj identity', () => {
    expect(isFinancePilotUser({ username: 'glennj' })).toBe(true);
    expect(isFinancePilotUser({ username: 'GLENNJ' })).toBe(true);
    expect(isFinancePilotUser({ username: 'admin' })).toBe(false);

    const deniedResponse = response();
    const deniedNext = vi.fn();
    requireFinancePilotUser(
      { user: { id: 2, username: 'admin', role: 'ADMIN' } } as any,
      deniedResponse,
      deniedNext
    );
    expect(deniedResponse.status).toHaveBeenCalledWith(403);
    expect(deniedNext).not.toHaveBeenCalled();

    const allowedNext = vi.fn();
    requireFinancePilotUser(
      { user: { id: 1, username: 'glennj', role: 'OWNER' } } as any,
      response(),
      allowedNext
    );
    expect(allowedNext).toHaveBeenCalledOnce();
  });

  it('produces stable evidence hashes regardless of object key order', () => {
    const base = {
      subjectType: 'ar_invoice_draft',
      subjectId: 'draft-1',
      sourceVersion: 'v1',
    };
    const first = buildFinanceEvidenceHash({
      ...base,
      evidenceSnapshot: { qty: 10, amount: 8750 },
    });
    const second = buildFinanceEvidenceHash({
      ...base,
      evidenceSnapshot: { amount: 8750, qty: 10 },
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('uses a forward-only retention migration', () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      '../../migrations/0326_finance_operations_stage0_retention.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(() => runMigrationSafetyCheck(sql, migrationPath)).not.toThrow();
    expect(sql).toContain('2555');
    expect(sql).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i);
  });

  it('documents deterministic operation and the consultant approval gate', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const model = fs.readFileSync(
      path.join(
        root,
        'docs/finance-operations/stage-0-capability-control-model.md'
      ),
      'utf8'
    );
    const packet = fs.readFileSync(
      path.join(
        root,
        'docs/finance-operations/cmmc-consultant-review-packet.md'
      ),
      'utf8'
    );
    expect(model).toContain(
      'Finance workflows must remain usable when AI is disabled'
    );
    expect(model).toContain('Pilot tolerance is zero');
    expect(packet).toContain('before any finance data is sent to an AI model');
  });

  it('mounts a fail-closed, pilot-restricted capability endpoint', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const flags = fs.readFileSync(
      path.join(root, 'server/src/lib/featureFlags.ts'),
      'utf8'
    );
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/financeOperations.ts'),
      'utf8'
    );
    const routesIndex = fs.readFileSync(
      path.join(root, 'server/src/routes/index.ts'),
      'utf8'
    );
    for (const name of flagNames) {
      expect(flags).toContain(`envBool('${name}', false)`);
    }
    expect(route).toContain('...requireAdminOrOwner, requireFinancePilotUser');
    expect(routesIndex).toContain(
      "app.use('/api/finance-operations', financeOperationsRoutes)"
    );
  });
});
