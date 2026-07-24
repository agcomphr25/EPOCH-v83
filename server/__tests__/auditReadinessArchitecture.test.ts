import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const migration = fs.readFileSync(path.join(root, 'migrations/0218_as9100_audit_readiness.sql'), 'utf8');
const route = fs.readFileSync(path.join(root, 'server/src/routes/auditReadiness.ts'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'client/src/components/Navigation.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'client/src/App.tsx'), 'utf8');
const safeBoot = fs.readFileSync(path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'), 'utf8');

describe('AS9100 audit readiness architecture', () => {
  it('registers the protected navigation and route', () => {
    expect(navigation).toContain("path: '/qms/as9100-audit-readiness'");
    expect(app).toContain('<Route path="/qms/as9100-audit-readiness"');
    expect(route).toContain("router.use(authenticateToken)");
    expect(route).toContain("requirePermission('qms.audit_readiness.view')");
    expect(route).toContain("requirePermission('qms.audit_readiness.approve')");
    expect(route).toContain("requirePermission('qms.audit_readiness.export')");
  });

  it('uses an authoritative sequence and normalized persistent records', () => {
    expect(migration).toContain('CREATE SEQUENCE IF NOT EXISTS qms_audit_readiness_number_seq');
    expect(route).toContain("nextval('qms_audit_readiness_number_seq')");
    for (const table of [
      'qms_audit_readiness_assessments', 'qms_audit_readiness_items',
      'qms_audit_readiness_evidence', 'qms_audit_readiness_approvals',
      'qms_audit_readiness_snapshots', 'qms_audit_readiness_events',
    ]) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  });

  it('seeds all 12 controlled Draft template sections without auto-release', () => {
    expect(migration).toContain("'DRAFT'");
    expect(migration).not.toMatch(/EPOCH_AS9100_AUDIT_READINESS'[^;]+,'RELEASED'/s);
    const sectionKeys = [...migration.matchAll(/\('[A-Z]{3}-\d{2}','(\d{2})','/g)].map(match => match[1]);
    expect(new Set(sectionKeys)).toEqual(new Set(['01','02','03','04','05','06','07','08','09','10','11','12']));
  });

  it('enforces evidence, applicability, critical blockers and locked immutability on the server', () => {
    expect(route).toContain('REQUIRED_EVIDENCE_MISSING');
    expect(route).toContain('DESIGN_SCOPE_REQUIRES_APPLICABILITY');
    expect(route).toContain('critical_open_items');
    expect(route).toContain('ASSESSMENT_LOCKED');
    expect(route).toContain('LOCK_BLOCKED');
    expect(route).toContain('STALE_RECORD');
  });

  it('registers the idempotent migration in safe boot', () => {
    expect(safeBoot.match(/0218_as9100_audit_readiness\.sql/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain('ON CONFLICT(template_id,item_key) DO NOTHING');
    expect(migration).toContain('ON CONFLICT(key) DO NOTHING');
  });
});
