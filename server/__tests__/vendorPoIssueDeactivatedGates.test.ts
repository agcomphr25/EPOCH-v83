import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(process.cwd(), 'server/src/routes/vendorPOs.ts'), 'utf8');

describe('vendor PO issuance with temporarily deactivated controls', () => {
  it('guards inactive qualification and compliance queries', () => {
    const issueRoute = source.slice(
      source.indexOf("router.post('/:id/issue'"),
      source.indexOf("router.post('/:id/rfq-transition'"),
    );
    const gateStart = issueRoute.indexOf('if (!VENDOR_PO_ISSUE_GATES_DEACTIVATED) {');
    const qualification = issueRoute.indexOf('getVendorQualificationBlockers');
    const issueWithoutEmail = issueRoute.indexOf('if (skip)');

    expect(gateStart).toBeGreaterThan(0);
    expect(qualification).toBeGreaterThan(gateStart);
    expect(issueWithoutEmail).toBeGreaterThan(qualification);
    expect(issueRoute.slice(qualification, issueWithoutEmail).trimEnd()).toMatch(/}\s*$/);
  });

  it('reports the failing issuance stage', () => {
    expect(source).toContain('`Failed to issue vendor PO during ${issueStage}`');
  });
});
