import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, '../pages/EpochSoftwareValidationPage.tsx'),
  'utf8'
);

describe('EPOCH software validation readiness UI', () => {
  it('renders the server-derived checklist and opens controlled editing', () => {
    expect(source).toContain('d.packageReadiness.items.map');
    expect(source).toContain('Edit package readiness');
    expect(source).toContain("method:'PATCH'");
  });

  it('provides exact identifier guidance and separate authenticated confirmations', () => {
    expect(source).toContain(
      'Production commit SHA, release tag, or deployment identifier'
    );
    expect(source).toContain('A PR number alone is not sufficient.');
    expect(source).toContain('/confirm-${kind}');
    expect(source).toContain('Confirm deployment date');
    expect(source).toContain('Confirm environment separation');
  });

  it('uses active employee and Audit Readiness option sources', () => {
    expect(source).toContain("queryKey:['/api/employees']");
    expect(source).toContain("queryKey:['/api/qms/as9100-audit-readiness']");
    expect(source).toContain('Software owner');
    expect(source).toContain('Quality owner');
    expect(source).toContain('Validation lead');
  });
});
