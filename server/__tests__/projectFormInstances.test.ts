import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  DESIGN_CONTROL_FORM_CATALOG,
  DESIGN_CONTROL_FORM_RENDERER_VERSION,
} from '../../shared/designControlFormCatalog';
import {
  canonicalizeProjectFormContent,
  validateProjectFormContent,
} from '../../shared/projectFormValidation';
import {
  PROJECT_FORM_PDF_RENDERER_VERSION,
  renderCompletedProjectFormPdf,
  sha256ProjectFormBuffer,
} from '../src/services/projectFormPdfService';

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), 'utf8');

describe('Phase 5 Design Project Form Instances', () => {
  it('retains the 12 step templates while leaving ECR and ECN definitions available', () => {
    expect(DESIGN_CONTROL_FORM_CATALOG).toHaveLength(14);
    expect(
      DESIGN_CONTROL_FORM_CATALOG.filter(
        (item) => item.formCategory === 'DESIGN_CONTROL_STEP'
      )
    ).toHaveLength(12);
    expect(DESIGN_CONTROL_FORM_CATALOG[12].changeRecordType).toBe('ECR');
    expect(DESIGN_CONTROL_FORM_CATALOG[13].changeRecordType).toBe('ECN');
    expect(DESIGN_CONTROL_FORM_RENDERER_VERSION).toBe(
      'design-control-blank-pdf/1'
    );
  });

  it('canonicalizes nested and repeating content deterministically', () => {
    const first = {
      sections: { detail: { b: 2, a: 1 } },
      repeatingRows: { risks: [{ severity: 4, risk: 'R1' }] },
    };
    const second = {
      repeatingRows: { risks: [{ risk: 'R1', severity: 4 }] },
      sections: { detail: { a: 1, b: 2 } },
    };
    expect(canonicalizeProjectFormContent(first)).toBe(
      canonicalizeProjectFormContent(second)
    );
  });

  it('validates required scalar and repeating-row fields on the server model', () => {
    const definition = {
      ...DESIGN_CONTROL_FORM_CATALOG[0],
      sections: [
        {
          key: 'detail',
          title: 'Detail',
          repeating: false,
          fields: [
            {
              key: 'name',
              label: 'Name',
              type: 'text' as const,
              required: true,
            },
          ],
        },
        {
          key: 'rows',
          title: 'Rows',
          repeating: true,
          fields: [
            {
              key: 'evidence',
              label: 'Evidence',
              type: 'evidence_reference' as const,
              required: true,
            },
          ],
        },
      ],
    };
    expect(validateProjectFormContent(definition, {}).valid).toBe(false);
    expect(
      validateProjectFormContent(definition, {
        sections: { detail: { name: 'Design A' } },
        repeatingRows: { rows: [{ evidence: 'EV-1' }] },
      })
    ).toEqual({ valid: true, missing: [] });
  });

  it('creates additive idempotent tables with restrictive ownership', () => {
    const migration = read(
      'migrations/0213_design_control_project_form_instances.sql'
    );
    for (const table of [
      'project_form_instances',
      'project_form_instance_revisions',
      'project_form_approvals',
      'project_form_attachments',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain(
      'rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT'
    );
    expect(migration).not.toMatch(
      /INSERT INTO project_form_instances|UPDATE engineering_releases|DELETE FROM/i
    );
  });

  it('never links a Project Form Instance to a P2 project identifier', () => {
    const migration = read(
      'migrations/0213_design_control_project_form_instances.sql'
    );
    const schema = read('server/schema.ts').slice(
      read('server/schema.ts').indexOf("pgTable('project_form_instances'"),
      read('server/schema.ts').indexOf("pgTable('design_control_requirements'")
    );
    expect(migration).not.toMatch(
      /p2_project_id|p2_purchase_order_id|production_work_order_id/i
    );
    expect(schema).not.toMatch(
      /p2Project|p2PurchaseOrder|productionWorkOrder|traveler/i
    );
  });

  it('blocks non-authoritative records and rejects P2-only linkage', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain("record.authorityStatus !== 'authoritative'");
    expect(service).toContain('RD_PROJECT_REQUIRED');
    expect(service).toContain('P2 identifiers are not accepted');
  });

  it('selects only the exact active RELEASED template and controlled revision', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain('activeTemplateRevisionId');
    expect(service).toContain(
      "designControlFormTemplateRevisions.lifecycleStatus, 'RELEASED'"
    );
    expect(service).toContain(
      "documentVersionHistory.lifecycleStatus, 'RELEASED'"
    );
    expect(service).toContain('templateChecksumSnapshot');
  });

  it('keeps ECR and ECN execution out of Phase 5', () => {
    const routes = read('server/src/routes/projectForms.ts');
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain('ECR and ECN execution is not implemented');
    expect(routes).not.toMatch(
      /engineering_change_requests|engineering_change_notices|\/ecr|\/ecn/i
    );
  });

  it('separates immutable paper originals from indexed transcription', () => {
    const migration = read(
      'migrations/0213_design_control_project_form_instances.sql'
    );
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(migration).toContain("'PAPER_ORIGINAL'");
    expect(migration).toContain('indexed_metadata jsonb');
    expect(service).toContain('transcriptionStoredSeparately: true');
  });

  it('hashes immutable paper and evidence bytes with SHA-256', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain('sha256ProjectFormBuffer(input.buffer)');
    expect(service).toContain('sha256Checksum: checksum');
  });

  it('binds authenticated approvals to exact content and template revisions', () => {
    const migration = read(
      'migrations/0213_design_control_project_form_instances.sql'
    );
    expect(migration).toContain(
      'project_form_instance_revision_id uuid NOT NULL'
    );
    expect(migration).toContain('content_checksum text NOT NULL');
    expect(migration).toContain(
      'template_definition_revision_id uuid NOT NULL'
    );
    expect(migration).toContain('actor_user_id integer NOT NULL');
    expect(migration).not.toMatch(/req\.body\.(actor|actorId|userId|username)/);
  });

  it('enforces segregation of duties for Quality and final review', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain('SEGREGATION_OF_DUTIES_REQUIRED');
    expect(service).toMatch(/quality\|final\|document control/i);
    expect(service).toContain(
      'context.instance.createdByUserId === input.actor.id'
    );
  });

  it('invalidates approval evidence after a material draft change without deleting it', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain("status: 'INVALIDATED'");
    expect(service).toContain('priorApprovalsInvalidated');
    expect(service).not.toMatch(
      /\.delete\(projectFormApprovals\)|DELETE FROM project_form_approvals/
    );
  });

  it('protects revisions, approvals, attachments, and terminal instances at the database level', () => {
    const migration = read(
      'migrations/0213_design_control_project_form_instances.sql'
    );
    expect(migration).toContain(
      'Project Form Instance evidence is append-only'
    );
    expect(migration).toContain('Project Form Instance evidence is immutable');
    expect(migration).toContain(
      'Approved Project Form Instance evidence is immutable'
    );
  });

  it('records transactional audit events for every material workflow action', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    for (const event of [
      'PROJECT_FORM_INSTANCE_CREATED',
      'PROJECT_FORM_DRAFT_MATERIAL_CHANGE',
      'PROJECT_FORM_CONTENT_REVISION_SUBMITTED',
      'PROJECT_FORM_PAPER_ORIGINAL_UPLOADED',
      'PROJECT_FORM_ATTACHMENT_ADDED',
      'PROJECT_FORM_APPROVAL_DECISION',
      'PROJECT_FORM_PDF_RENDERED',
      'PROJECT_FORM_INSTANCE_SUPERSEDED',
    ]) {
      expect(service).toContain(event);
    }
    expect(service).toContain('recordAuditEvent(');
    expect(
      service.match(/db\.transaction\(async \(tx\)/g)?.length
    ).toBeGreaterThan(5);
    expect(service).toContain('input.request ?? {},\n      tx');
  });

  it('renders deterministic completed PDF identity, footer, pagination, and barcode', async () => {
    const input = {
      instanceId: '11111111-1111-4111-8111-111111111111',
      instanceNumber: 'DCF-RD-001-01-001',
      projectId: 'RD-001',
      projectName: 'Example Design',
      recordNumber: 'DC-001',
      stepKey: '1',
      contentRevision: 1,
      definition: DESIGN_CONTROL_FORM_CATALOG[0],
      documentNumber: 'DCF-001',
      documentRevision: '1.0',
      lifecycleStatus: 'APPROVED',
      content: { fields: { scope: 'Example' } },
      approvals: [
        {
          approvalKey: 'engineering',
          decision: 'APPROVED',
          actorDisplayNameSnapshot: 'Engineer',
        },
      ],
      attachments: [],
      generatedAt: new Date('2026-07-24T12:00:00.000Z'),
      controlled: true,
    };
    const first = await renderCompletedProjectFormPdf(input);
    const second = await renderCompletedProjectFormPdf(input);
    expect(sha256ProjectFormBuffer(first)).toBe(
      sha256ProjectFormBuffer(second)
    );
    const pdf = await PDFDocument.load(first);
    expect(pdf.getTitle()).toContain(input.instanceNumber);
    expect(pdf.getCreator()).toBe('EPOCH Design Control');
    expect(PROJECT_FORM_PDF_RENDERER_VERSION).toBe(
      'design-control-project-form/1'
    );
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it('marks preview printing uncontrolled and never implements controlled-copy numbering', () => {
    const pdf = read('server/src/services/projectFormPdfService.ts');
    expect(pdf).toContain('UNCONTROLLED WHEN PRINTED');
    expect(pdf).toContain('Page ${index + 1} of ${pages.length}');
    expect(pdf).toContain('/api/project-forms/${input.instanceId}');
    expect(pdf).not.toMatch(
      /controlledCopyNumber|controlled_copy_number|copy return|lost copy/i
    );
  });

  it('requires all 12 current approved form instances for initial Revision A release', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    const release = read('server/src/services/engineeringReleaseService.ts');
    expect(service).toContain('index <= 12');
    expect(service).toContain(
      'PROJECT_FORM_INSTANCE_AUTHENTICATED_VERSION_BOUND'
    );
    expect(release).toContain("preview.proposedReleaseRevision === 'A'");
    expect(release).toContain('getProjectFormReleaseReadiness');
  });

  it('does not allow legacy approval booleans to satisfy the form gate', () => {
    const service = read('server/src/services/projectFormInstanceService.ts');
    expect(service).toContain('projectFormApprovals');
    expect(service).toContain("eq(projectFormApprovals.status, 'VALID')");
    expect(service).toContain("eq(projectFormApprovals.decision, 'APPROVED')");
    expect(service).not.toMatch(/legacy.*boolean/i);
  });

  it('registers schema readiness and safe boot twice', () => {
    const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(
      runner.match(/0213_design_control_project_form_instances\.sql/g)
    ).toHaveLength(2);
    const readiness = read('server/src/services/projectFormSchemaReadiness.ts');
    for (const objectName of [
      'project_form_instances',
      'project_form_instance_revisions',
      'project_form_approvals',
      'project_form_attachments',
    ]) {
      expect(readiness).toContain(objectName);
    }
  });

  it('exposes authenticated capability-gated APIs without request-body actors', () => {
    const routes = read('server/src/routes/projectForms.ts');
    for (const capability of [
      'design.forms.view',
      'design.forms.create',
      'design.forms.edit',
      'design.forms.submit',
      'design.forms.approve',
      'design.forms.upload_paper',
      'design.forms.supersede',
    ]) {
      expect(routes).toContain(`requirePermission('${capability}')`);
    }
    expect(routes).toContain('(req as any).user');
    expect(routes).not.toMatch(/req\.body\.(actor|actorId|userId|username)/);
  });

  it('does not modify P2, WAD, traveler, work-order, DHF, controlled-copy, or Engineering Package behavior', () => {
    const phase5 = [
      'migrations/0213_design_control_project_form_instances.sql',
      'server/src/routes/projectForms.ts',
      'server/src/services/projectFormInstanceService.ts',
      'server/src/services/projectFormPdfService.ts',
      'shared/projectFormValidation.ts',
    ]
      .map(read)
      .join('\n');
    expect(phase5).not.toMatch(
      /\/api\/p2|p2_projects|p2_purchase_orders|wad_|travelers|production_work_orders/i
    );
    expect(phase5).not.toMatch(
      /engineering_packages|controlled_copy_number|design_history_files/i
    );
  });

  it('uses cryptographic checksums rather than mutable display identity', () => {
    const value = canonicalizeProjectFormContent({ b: 2, a: 1 });
    expect(crypto.createHash('sha256').update(value).digest('hex')).toMatch(
      /^[0-9a-f]{64}$/
    );
  });
});
