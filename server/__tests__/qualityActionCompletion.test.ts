import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(root, ...parts), 'utf8');
const service = read('server', 'src', 'services', 'changeControlService.ts');
const routes = read('server', 'src', 'routes', 'changeControl.ts');
const qualityPage = read('client', 'src', 'pages', 'QMSChangeControlPage.tsx');
const workspace = read('client', 'src', 'components', 'qms', 'QualityActionWorkspace.tsx');
const employeePage = read('client', 'src', 'pages', 'MyQualityActionsPage.tsx');
const p2Changes = read('client', 'src', 'components', 'p2', 'P2ChangesTab.tsx');
const schema = read('server', 'schema.ts');

describe('Quality Action completion architecture', () => {
  it('batch-loads register state with bounded queries instead of per-row enrichment', () => {
    const listSlice = service.slice(
      service.indexOf('export async function listChangeControlRecords'),
      service.indexOf('async function loadQualityActionState(')
    );
    expect(listSlice).toContain('loadQualityActionStates(result.rows)');
    expect(listSlice).not.toContain('result.rows.map(async');
    expect(listSlice).toContain('Promise.all([');
    expect(listSlice).toContain('change_control_record_id=ANY($1::uuid[])');
  });

  it('exposes capability-gated screening, controls, verification, and effectiveness routes', () => {
    for (const capability of [
      'qms.quality_action.screen',
      'qms.quality_action.assign_investigation',
      'qms.quality_action.assess_impact',
      'qms.quality_action.authorize_implementation',
      'qms.quality_action.verify_implementation',
      'qms.quality_action.verify_effectiveness',
      'qms.quality_action.close',
    ]) {
      expect(routes).toContain(`requirePermission('${capability}')`);
    }
    expect(service).toContain('PCR_VERIFIER_INDEPENDENCE_REQUIRED');
    expect(service).toContain('PCR_CONTROLS_IMMUTABLE_AFTER_RELEASE');
  });

  it('implements the 14-question assessment and immutable recommendation decisions in the UI', () => {
    const questions = workspace.slice(
      workspace.indexOf('const ASSESSMENT_QUESTIONS'),
      workspace.indexOf('] as const;', workspace.indexOf('const ASSESSMENT_QUESTIONS')),
    );
    expect(questions.match(/\['[A-Z_]+', '/g)).toHaveLength(14);
    expect(workspace).toContain('Save immutable assessment version');
    expect(workspace).toContain('Override with reason');
    expect(workspace).toContain('Current recommendations');
  });

  it('provides complete Quality and employee PCR workflow surfaces', () => {
    for (const label of [
      'QMS screening and investigation',
      'Functional approvals',
      'Implementation gates and authorization',
      'Verification and closure',
      'Relationship management',
      'CAR effectiveness review',
    ]) expect(workspace).toContain(label);
    expect(employeePage).toContain('Submission never authorizes implementation');
    expect(employeePage).toContain('/api/change-control/my-pcrs');
    expect(qualityPage).toContain('All next actions');
  });

  it('migrates P2 callers to the controlled PCR endpoints', () => {
    expect(p2Changes).toContain("apiRequest('/api/change-control/pcrs'");
    expect(p2Changes).toContain('/api/change-control/pcrs/${id}/decisions');
    expect(p2Changes).toContain('/api/change-control/pcrs/${id}/actions/deny');
    expect(p2Changes).not.toContain('/api/p2/changes/${id}/approve');
    expect(p2Changes).not.toContain('/api/p2/changes/${id}/reject');
  });

  it('aligns Drizzle with migration-backed PCR control fields', () => {
    for (const column of [
      "qualityActionStatus: text('quality_action_status')",
      "requesterUserId: integer('requester_user_id')",
      "impactAssessment: jsonb('impact_assessment')",
      "implementationAuthorizedAt: timestamp('implementation_authorized_at')",
      "verificationResults: text('verification_results')",
      "reopenReason: text('reopen_reason')",
    ]) expect(schema).toContain(column);
  });
});
