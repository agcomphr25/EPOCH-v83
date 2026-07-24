import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  DESIGN_CONTROL_FORM_CATALOG,
  DESIGN_CONTROL_FORM_RENDERER_VERSION,
  DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION,
} from '../../shared/designControlFormCatalog';
import { DESIGN_CONTROL_WORKFLOW } from '../../shared/designControlWorkflow';
import {
  renderDesignControlBlankPdf,
  sha256Buffer,
} from '../src/services/designControlFormPdfService';
import {
  assertDesignControlTemplateSchemaReady,
  DesignControlTemplateSchemaNotReadyError,
} from '../src/services/designControlTemplateSchemaReadiness';
const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), 'utf8');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
};
const definitionChecksum = (value: unknown) =>
  crypto.createHash('sha256').update(canonical(value)).digest('hex');

describe('Phase 4 controlled Design Control form templates', () => {
  it('defines exactly 14 stable unique canonical templates', () => {
    expect(DESIGN_CONTROL_FORM_CATALOG).toHaveLength(14);
    expect(
      new Set(DESIGN_CONTROL_FORM_CATALOG.map((item) => item.templateKey)).size
    ).toBe(14);
    expect(
      new Set(DESIGN_CONTROL_FORM_CATALOG.map((item) => item.documentNumber))
        .size
    ).toBe(14);
    expect(
      DESIGN_CONTROL_FORM_CATALOG.every((item) => item.sections.length >= 3)
    ).toBe(true);
  });

  it('derives the first 12 mappings from the shared workflow and keeps ECR/ECN distinct', () => {
    const workflowForms = DESIGN_CONTROL_FORM_CATALOG.slice(0, 12);
    expect(workflowForms.map((item) => item.workflowStepKey)).toEqual(
      DESIGN_CONTROL_WORKFLOW.map((step) => step.key)
    );
    expect(workflowForms.map((item) => item.approvalRoles)).toEqual(
      DESIGN_CONTROL_WORKFLOW.map((step) =>
        step.approvals.map((approval) => approval.label)
      )
    );
    expect(DESIGN_CONTROL_FORM_CATALOG[12].changeRecordType).toBe('ECR');
    expect(DESIGN_CONTROL_FORM_CATALOG[13].changeRecordType).toBe('ECN');
    expect(
      DESIGN_CONTROL_FORM_CATALOG.slice(12).every(
        (item) => item.workflowStepKey === null
      )
    ).toBe(true);
  });

  it('produces stable canonical-definition checksums', () => {
    const definition = DESIGN_CONTROL_FORM_CATALOG[0];
    const first = definitionChecksum(definition);
    const second = definitionChecksum(JSON.parse(JSON.stringify(definition)));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it('renders deterministic multi-identifier blank PDFs with retained metadata', async () => {
    const input = {
      templateRevisionId: '11111111-1111-4111-8111-111111111111',
      definition: DESIGN_CONTROL_FORM_CATALOG[8],
      documentNumber: 'DCF-009',
      documentRevision: '1.0',
      lifecycleStatus: 'RELEASED',
      generatedAt: new Date('2026-07-23T16:00:00.000Z'),
    };
    const first = await renderDesignControlBlankPdf(input);
    const second = await renderDesignControlBlankPdf(input);
    expect(sha256Buffer(first)).toBe(sha256Buffer(second));
    const pdf = await PDFDocument.load(first);
    expect(pdf.getTitle()).toContain('DCF-009');
    expect(pdf.getSubject()).toContain('revision 1.0');
    expect(pdf.getCreator()).toBe('EPOCH Master Document Register');
    expect(DESIGN_CONTROL_FORM_RENDERER_VERSION).toBe(
      'design-control-blank-pdf/1'
    );
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it('uses additive idempotent migration protections without auto release or destructive legacy rewrite', () => {
    const migration = read('migrations/0211_design_control_form_templates.sql');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS design_control_form_templates'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS design_control_form_template_revisions'
    );
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).toContain('append-only');
    expect(migration).toContain(
      'Released Design Control template definition and artifact identity are immutable'
    );
    expect(migration).not.toMatch(/UPDATE\s+document_templates/i);
    expect(migration).not.toMatch(
      /DELETE\s+FROM\s+(controlled_documents|document_templates)/i
    );
    expect(migration).not.toMatch(
      /lifecycle_status[^;]+RELEASED[^;]+INSERT INTO controlled_documents/is
    );
  });

  it('registers migration for safe boot and critical startup checks', () => {
    const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(
      runner.match(/0211_design_control_form_templates\.sql/g)
    ).toHaveLength(2);
  });

  it('reports partial deployment as structured schema readiness failure', async () => {
    const client = {
      execute: async () => [{ object_name: 'design_control_form_templates' }],
    } as any;
    await expect(
      assertDesignControlTemplateSchemaReady(client)
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'DESIGN_CONTROL_TEMPLATE_SCHEMA_NOT_READY',
        missingObjects: expect.arrayContaining([
          'design_control_form_template_revisions',
          'design_control_form_template_reconciliation',
        ]),
      })
    );
    expect(new DesignControlTemplateSchemaNotReadyError([]).message).toContain(
      'migration'
    );
  });

  it('binds exact MDR revisions, blocks non-released selection, and emits transactional audit evidence', () => {
    const service = read('server/src/services/designControlTemplateService.ts');
    expect(service).toContain('documentVersionHistoryId');
    expect(service).toContain('definitionChecksum');
    expect(service).toContain('templateDefinitionRevisionId');
    expect(service).toContain('recordAuditEvent');
    expect(service).toContain('tx as unknown as Client');
    expect(service).toContain('Only the active RELEASED template revision');
    expect(service).toContain('LEGACY_TEMPLATE_RECONCILIATION_REQUIRED');
    expect(service).toContain('RELEASED_ARTIFACT_CHECKSUM_MISMATCH');
  });

  it('enforces literal template capabilities and authenticated route actors', () => {
    const route = read('server/src/routes/designControlFormTemplates.ts');
    for (const capability of [
      'documents.template.create',
      'documents.template.revise',
      'documents.template.release',
      'documents.template.obsolete',
    ]) {
      expect(route).toContain(`requirePermission('${capability}')`);
    }
    expect(route).toContain('(req as any).user');
    expect(route).not.toMatch(/req\.body\.(actor|actorId|userId|username)/);
  });

  it('includes controlled header, footer, page count, revision, and stable revision barcode content', () => {
    const renderer = read('server/src/services/designControlFormPdfService.ts');
    expect(renderer).toContain('AG COMPOSITES — DESIGN CONTROL FORM');
    expect(renderer).toContain('Page ${index + 1} of ${pages.length}');
    expect(renderer).toContain('Revision ${input.documentRevision}');
    expect(renderer).toContain('input.definition.identification.footerText');
    expect(renderer).toContain(
      '/api/design-control-form-templates/revisions/${input.templateRevisionId}'
    );
    expect(renderer).not.toContain('projectFormInstance');
  });

  it('keeps Phase 5 and P2 business/workflow implementation out of the Phase 4 files', () => {
    const files = [
      'shared/designControlFormCatalog.ts',
      'server/src/routes/designControlFormTemplates.ts',
      'server/src/services/designControlTemplateService.ts',
      'server/src/services/designControlFormPdfService.ts',
      'migrations/0211_design_control_form_templates.sql',
    ]
      .map(read)
      .join('\n');
    expect(files).not.toMatch(
      /\/api\/p2|p2_projects|p2_purchase_orders|project_form_instances|controlled_copy_number/i
    );
    expect(files).not.toMatch(
      /CREATE TABLE[^;]+(engineering_change_requests|engineering_change_notices|dhf)/i
    );
    expect(DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION).toBe('1.0.0');
  });
});
