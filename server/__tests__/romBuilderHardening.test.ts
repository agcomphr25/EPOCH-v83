import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('ROM Builder hardening', () => {
  const route = read('server/src/routes/estimating.ts');
  const page = read('client/src/pages/RFQBuilderPage.tsx');
  const migration = read('migrations/0241_rom_builder_approval_authority.sql');

  it('binds controlled approvals to capability-authorized authenticated actors', () => {
    expect(route).toContain('requireEstimatingApprovalAuthority');
    expect(route).toContain('getUserPermissions(actor.id, actor.role)');
    expect(route).toContain('signerUserId: actor.id');
    expect(route).toContain('signerDisplayName: actor.username');
    expect(route).not.toContain('data.signerUserId');
    expect(route).not.toContain('data.signerDisplayName');
    expect(migration).toContain('estimating.approve.estimator');
    expect(migration).toContain('estimating.approve.engineering');
    expect(migration).toContain('estimating.approve.finance');
    expect(migration).toContain('estimating.approve.executive');
  });

  it('replaces RFQ parts through one transactional bulk request', () => {
    expect(route).toMatch(/router\.put\('\/rfqs\/:id\/parts'[\s\S]*?db\.transaction/);
    expect(route).toContain('FOR UPDATE');
    expect(page).toContain('method: "PUT", body: { parts: valid }');
    const saveParts = page.match(/const saveParts[\s\S]*?\n  };/)?.[0] ?? '';
    expect(saveParts).not.toContain('method: "DELETE"');
  });

  it('makes quote handoff transactional and retry-safe', () => {
    expect(route).toMatch(/create-draft-quote'[\s\S]*?db\.transaction/);
    expect(route).toContain('return { quoteId: existingQuote.id, quoteNumber: existingQuote.quoteNumber, reused: true }');
    expect(route).toContain('ESTIMATING_PRICING_REQUIRED');
    expect(route).toMatch(/recordAuditEvent\([\s\S]*?, tx\);/);
    expect(page).toContain('Boolean(linkedQuoteId)');
    expect(page).toContain('Draft Quote Created');
  });
});
