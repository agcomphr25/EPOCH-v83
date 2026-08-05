import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const route = read('server/src/routes/controlledDocuments.ts');
const client = read('client/src/pages/MasterDocumentRegister.tsx');
const lifecycleService = read(
  'server/src/services/controlledDocumentLifecycleService.ts'
);
const releasedHandler = route.slice(
  route.indexOf("router.get('/:id/view'"),
  route.indexOf('// Delete document')
);

describe('Master Document Register released-revision access', () => {
  it('serves released 1.1 instead of a working draft 1.2 for normal View and Download', () => {
    expect(releasedHandler).toContain('getReleasedRevisionForControlledUse');
    expect(route).toContain(
      'candidate.id === document.currentReleasedRevisionId'
    );
    expect(releasedHandler).not.toContain(': state.currentRevision');
    expect(releasedHandler).not.toContain('doc.filePath');
    expect(releasedHandler).not.toContain('revisions[revisions.length - 1]');
  });

  it('fails closed for both missing and cross-document released pointers', () => {
    expect(route).toContain("'NO_RELEASED_REVISION'");
    expect(route).toContain("'RELEASED_REVISION_POINTER_INVALID'");
    expect(route).toContain('revision.documentId !== document.id');
    expect(route).toContain(
      "eventType: 'CONTROLLED_DOCUMENT_RELEASE_POINTER_INVALID'"
    );
  });

  it('stamps the exact served revision identity and lifecycle in PDF footers', () => {
    expect(route).toContain('revision.versionNumber');
    expect(route).toContain(
      'revision.effectiveDate || revision.releasedAt || revision.createdAt'
    );
    expect(route).toContain('revision.lifecycleStatus || revision.status');
    expect(releasedHandler).toContain(
      'addControlledDocumentFooter(buffer, doc, revision)'
    );
  });

  it('keeps external references behind the API and out of controlled release', () => {
    expect(client).not.toMatch(/window\.open\(doc\.filePath/);
    expect(client).toContain('/api/controlled-documents/${doc.id}/${mode}');
    expect(releasedHandler).toContain(
      "'EXTERNAL_REFERENCE_REQUIRES_RECONCILIATION'"
    );
    expect(route).toContain(
      'External references cannot be approved or released'
    );
  });

  it('requires lifecycle permission for exact draft and review revision bytes', () => {
    expect(route).toContain('assertExactRevisionPermission(actor, revision)');
    expect(route).toContain("['documents.edit_draft', 'documents.revise']");
    expect(route).toContain("['documents.approve', 'documents.release']");
    expect(route).toContain("'DRAFT_REVISION_ACCESS_DENIED'");
  });

  it('centralizes restricted, explicit-grant, and admin-only enforcement', () => {
    expect(
      route.match(
        /requirePermission\('documents\.view'\), controlledDocumentAccessPolicy/g
      )
    ).toHaveLength(3);
    expect(route).toContain("accessRule === 'explicit_grant'");
    expect(route).toContain("classification === 'restricted'");
    expect(route).toContain("classification === 'classified'");
    expect(route).toContain("accessRule !== 'admin_only'");
    expect(route).toContain('hasControlledDocumentGrant');
    expect(route).not.toContain(
      "requirePermission('documents.view'), requireStepUp(), async"
    );
  });

  it('verifies the selected revision checksum before recording allowed access', () => {
    const verifyIndex = releasedHandler.indexOf('await verifyStoredRevision');
    const logIndex = releasedHandler.indexOf("action: 'view'");
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(logIndex).toBeGreaterThan(verifyIndex);
    expect(lifecycleService).toContain(
      "'CONTROLLED_DOCUMENT_CHECKSUM_MISMATCH'"
    );
  });
});
