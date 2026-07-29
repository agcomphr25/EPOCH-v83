import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root=path.resolve(import.meta.dirname,'../..');
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('migrations/0229_epoch_software_validation.sql');
const route=read('server/src/routes/epochSoftwareValidation.ts');
const auditRoute=read('server/src/routes/auditReadiness.ts');
const app=read('client/src/App.tsx');
const nav=read('client/src/components/Navigation.tsx');
const safeBoot=read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('EPOCH software-validation architecture',()=>{
  it('registers the direct QMS route and Section 2 source integration',()=>{
    expect(app).toContain('path="/qms/epoch-software-validation"');
    expect(nav).toContain("path: '/qms/epoch-software-validation'");
    expect(route).toContain("router.use(authenticateToken)");
    expect(auditRoute).toContain('getAuditReadinessValidationStatus');
    expect(auditRoute).toContain('EPOCH_VALIDATION_INCOMPLETE');
  });
  it('uses server sequences and normalized records',()=>{
    for(const seq of ['package_number','requirement_number','risk_number','test_number','execution_number','defect_number'])
      expect(migration).toContain(`qms_epoch_validation_${seq}_seq`);
    for(const table of ['packages','intended_use_revisions','requirements','risks','plans','protocols',
      'protocol_steps','executions','execution_steps','evidence','defects','approvals','snapshots','periodic_reviews','events'])
      expect(migration).toContain(`qms_epoch_validation_${table}`);
    expect(route).toContain("nextval('qms_epoch_validation_package_number_seq')");
    expect(route).not.toMatch(/count\(\*\)[^\n]*package_number/);
  });
  it('enforces capabilities, server-derived results, locking, and controlled reopening',()=>{
    for(const capability of ['VIEW','CREATE','EDIT','PLAN_APPROVE','TEST_EXECUTE','TEST_REVIEW',
      'DEFECT_MANAGE','FINAL_APPROVE','REOPEN','EXPORT','ADMIN'])
      expect(migration).toContain(`EPOCH_VALIDATION_${capability}`);
    expect(route).toContain('deriveExecutionResult');
    expect(route).toContain('VALIDATION_PACKAGE_LOCKED');
    expect(route).toContain('PACKAGE_REOPENED');
    expect(route).toContain('FINAL_READINESS_BLOCKED');
    expect(route).toContain('CRITICAL_HIGH_RISK_REQUIRES_APPROVED_PROTOCOL');
  });
  it('seeds draft-only suggested libraries and never auto-approves',()=>{
    expect(migration).toContain('qms_epoch_validation_requirement_library');
    expect(migration).toContain('qms_epoch_validation_protocol_templates');
    expect(migration).toContain("'Backups are available and representative records can be restored.'");
    expect(migration).toContain("'Outage and recovery drill'");
    const ptInsert = migration.match(/INSERT INTO qms_epoch_validation_protocol_templates[\s\S]+?ON CONFLICT\(template_key\) DO NOTHING/)?.[0] ?? '';
    expect(ptInsert).not.toContain(",'RELEASED'");
  });
  it('registers the additive migration in both safe-boot lists',()=>{
    expect(safeBoot.match(/0229_epoch_software_validation\.sql/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain('ON CONFLICT(library_key) DO NOTHING');
    expect(migration).toContain('ON CONFLICT(template_key) DO NOTHING');
  });
});
