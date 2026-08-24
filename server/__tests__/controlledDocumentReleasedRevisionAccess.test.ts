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
  route.indexOf("'/:id/view'"),
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
    expect(releasedHandler).toMatch(
      /addControlledDocumentFooter\(\s*buffer,\s*doc,\s*revision\s*\)/
    );
  });

  it('keeps stamped footer control information inside the printable page area', () => {
    expect(route).toContain('page.getCropBox()');
    expect(route).toContain('const footerAreaHeight = 48');
    expect(route).toContain('const bottomInset = 18');
    expect(route).toContain('const footerAreaY = pageY - footerAreaHeight');
    expect(route).toContain('page.setMediaBox(');
    expect(route).toContain('page.setCropBox(');
    expect(route).toContain('y: footerAreaY + bottomInset');
    expect(route).toContain('y: footerAreaY + bottomInset + 8');
    expect(route).not.toMatch(/page\.drawText\(text, \{[\s\S]*?y: 8,/);
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
    expect(route).toContain(
      'assertExactRevisionPermission(actor, state.document, revision)'
    );
    expect(route).toContain("'documents.edit_draft'");
    expect(route).toContain("'documents.revise'");
    expect(route).toContain("['documents.approve', 'documents.release']");
    expect(route).toContain('phase2CurrentApprovalCandidate');
    expect(route).toContain("'documents.approve'");
    expect(route).toContain("'DRAFT_REVISION_ACCESS_DENIED'");
  });

  it('provides an authorized checksum-verified exact-revision preview for approvers', () => {
    expect(route).toContain("'/:id/revisions/:revisionId/view'");
    expect(route).toContain("exactRevisionFileHandler('view')");
    expect(route).toContain("exactRevisionFileHandler('download')");
    expect(route).toContain("mode === 'view'");
    expect(route).toMatch(
      /mode === 'view'[\s\S]*addControlledDocumentFooter\([\s\S]*state\.document,[\s\S]*revision/
    );
    expect(route).toContain('action: mode');
    expect(route).toContain("'PREVIEW_UNAVAILABLE'");
    expect(client).toContain('Preview Exact Revision Before Approval');
  });

  it('exposes the stored working draft PDF from the register without treating it as released', () => {
    expect(client).toContain('button-preview-draft-${doc.id}');
    expect(client).toContain('button-download-draft-${doc.id}');
    expect(client).toContain(
      '/api/controlled-documents/${doc.id}/revisions/${doc.currentRevisionId}/view'
    );
    expect(client).toContain('Draft PDF');
    expect(client).toContain('not released for controlled use');
    expect(client).toMatch(
      /!doc\.currentReleasedRevisionId\s*&&\s*doc\.currentRevisionId\s*&&\s*doc\.currentRevisionHasFile/
    );
  });

  it('does not expose draft revision metadata through general document history', () => {
    expect(route).toContain('authorizedRevisionHistory');
    expect(route).toMatch(
      /'\/:id\/versions'[\s\S]*controlledDocumentViewPermission,[\s\S]*controlledDocumentAccessPolicy/
    );
    expect(route).toMatch(
      /'\/:id\/revisions',[\s\S]*controlledDocumentViewPermission,[\s\S]*controlledDocumentAccessPolicy/
    );
    expect(route).toContain('visibleRevisionIds.has(row.revisionId)');
  });

  it('centralizes restricted, explicit-grant, and admin-only enforcement', () => {
    expect(
      route.match(
        /controlledDocumentViewPermission,\s*controlledDocumentAccessPolicy/g
      )
    ).toHaveLength(8);
    expect(route).toContain('canAccessControlledDocument');
    expect(route).toContain("accessRule === 'explicit_grant'");
    expect(route).toContain(
      "['restricted', 'classified', 'cui', 'itar'].includes(classification)"
    );
    expect(route).toContain("if (accessRule === 'admin_only') return false");
    expect(route).toContain('hasPolicyVaultGrant');
    expect(route).not.toContain(
      "requirePermission('documents.view'), requireStepUp(), async"
    );
  });

  it('drives normal controlled-use actions from released revision readiness, not document-level filePath', () => {
    expect(route).toContain('releasedRevisionAvailable: releasedVerified');
    expect(route).toContain('releasedRevisionVersion: released?.versionNumber');
    expect(route).toContain('workingDraftRevisionVersion:');
    expect(client).toContain('doc.releasedRevisionAvailable');
    expect(client).toContain('doc.releasedRevisionVersion');
    expect(client).not.toContain('{doc.filePath && (');
  });

  it('redacts internal file references from viewer metadata responses', () => {
    expect(route).toContain('controlledDocumentMetadata');
    expect(route).toContain('controlledRevisionMetadata');
    expect(route).toMatch(/const \{ filePath, \.\.\.metadata \} = document/);
    expect(route).toMatch(/const \{ filePath, \.\.\.metadata \} = revision/);
    expect(route).toContain('fileReferenceAvailable: Boolean(filePath)');
    expect(client).not.toContain('selectedDocument.filePath');
    expect(client).not.toContain('version.filePath');
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
