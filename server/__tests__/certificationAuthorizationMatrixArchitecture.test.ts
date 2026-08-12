import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Certification & Authorization Matrix architecture', () => {
  it('uses one Training-owned API and the same component at both entry points', () => {
    const matrix = read('client/src/pages/CertificationAuthorizationMatrix.tsx');
    const training = read('client/src/pages/TrainingControlCenter.tsx');
    const p2 = read('client/src/pages/P2ControlCenter.tsx');
    expect(matrix).toContain('/api/training/certification-authorizations');
    expect(training).toContain('<CertificationAuthorizationMatrix />');
    expect(p2).toContain('<CertificationAuthorizationMatrix defaultProgram="P2" defaultStatus="ACTIVE" />');
    expect(p2).not.toContain('<P2CertificationsManager />');
  });

  it('separates authorities and keeps prospective enforcement disabled by default', () => {
    const migration = read('migrations/0270_certification_authorization_matrix.sql');
    for (const authority of ['WORK','QC_INSPECTION','ROUTING_RELEASE','FINAL_QC','FINAL_PRODUCT_RELEASE','COC_APPROVAL']) expect(migration).toContain(`'${authority}'`);
    expect(migration).toContain("VALUES ('prospective_enforcement', false)");
    expect(migration).toContain("'WORK', 'DRAFT'");
    expect(migration).not.toMatch(/legacy_p2[\s\S]{0,400}'FINAL_(QC|PRODUCT_RELEASE)'/);
  });

  it('retains immutable revisions, use snapshots, and prevents overlapping active scope', () => {
    const migration = read('migrations/0270_certification_authorization_matrix.sql');
    expect(migration).toContain('certification_authorization_events');
    expect(migration).toContain('certification_authorization_use_snapshots');
    expect(migration).toContain('uq_cert_auth_active_scope');
    expect(migration).toContain("WHERE status = 'ACTIVE'");
  });

  it('gates traveler work and final product release server-side', () => {
    expect(read('server/src/lib/travelerGates.ts')).toContain("type: 'WORK'");
    expect(read('server/src/routes/projectQualityRelease.ts')).toContain("type:'FINAL_PRODUCT_RELEASE'");
  });
});
