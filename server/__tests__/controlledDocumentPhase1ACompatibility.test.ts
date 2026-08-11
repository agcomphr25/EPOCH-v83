import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const route = read('server/src/routes/controlledDocuments.ts');
const client = read('client/src/pages/MasterDocumentRegister.tsx');
const auth = read('server/middleware/auth.ts');
const auditRoute = route.slice(
  route.indexOf("'/legacy-audit'"),
  route.indexOf('// Get single document')
);

describe('Master Document Register Phase 1A compatibility', () => {
  it('does not require step-up for every ordinary internal document', () => {
    expect(route).toContain('controlledDocumentRequiresStepUp');
    expect(route).toContain("accessRule || 'authenticated'");
    expect(route).not.toContain(
      "requirePermission('documents.view'), requireStepUp(), async"
    );
  });

  it('requires stronger authentication for protected policies', () => {
    expect(route).toContain('doc.mfaRequired');
    expect(route).toContain("['restricted', 'classified', 'cui', 'itar']");
    expect(route).toContain("accessRule === 'explicit_grant'");
    expect(route).toContain("accessRule === 'admin_only'");
    expect(auth).toContain("code: 'STEP_UP_REQUIRED'");
  });

  it('uses one access-policy evaluator for View, Download, history, and Exact Revision', () => {
    expect(
      route.match(
        /controlledDocumentViewPermission,\s*controlledDocumentAccessPolicy/g
      )
    ).toHaveLength(8);
    expect(route).toContain('hasPolicyVaultGrant');
    expect(route).toContain("action: 'denied'");
  });

  it('handles Exact Revision step-up through the credential dialog', () => {
    expect(client).toContain('apiPath?: string');
    expect(client).toContain('apiPath: apiPathOverride');
    expect(client).toContain('access.apiPath');
    expect(client).not.toMatch(
      /onClick=\{\(\) => window\.open\([\s\S]{0,200}revisions\/\$\{version\.id\}/
    );
  });

  it('offers inline View only for PDF and labels original file types', () => {
    expect(client).toContain('{doc.releasedRevisionIsPdf && (');
    expect(client).toContain('getReleasedFileTypeLabel');
    expect(client).toContain('Download Released Revision');
    expect(client).toContain('Preview Exact Revision');
    expect(route).toContain("'UNSUPPORTED_PREVIEW_TYPE'");
    expect(route).toContain("'PREVIEW_UNAVAILABLE'");
  });

  it('returns useful file, access, revision, and reconciliation errors', () => {
    for (const code of [
      'FILE_REFERENCE_MISSING',
      'FILE_NOT_ACCESSIBLE',
      'UNSUPPORTED_PREVIEW_TYPE',
      'ACCESS_DENIED',
      'REVISION_RECORD_MISSING',
      'EXTERNAL_REFERENCE_REQUIRES_RECONCILIATION',
    ])
      expect(route).toContain(code);
    expect(auth).toContain('STEP_UP_REQUIRED');
  });

  it('keeps external references behind EPOCH APIs', () => {
    expect(client).not.toMatch(/window\.open\(doc\.filePath/);
    expect(route).not.toContain('return res.redirect(external');
  });

  it('retains truthful legacy compatibility labels', () => {
    for (const label of [
      'Released and Verified',
      'Legacy Approved — Verification Required',
      'File Reconciliation Required',
      'Draft',
      'Awaiting Approval',
      'Superseded',
      'Obsolete',
      'Void',
    ])
      expect(`${route}\n${client}`).toContain(label);
  });

  it('categorizes the required legacy reconciliation conditions', () => {
    for (const category of [
      'HAS_MATCHING_RELEASE_POINTER',
      'RELEASED_MISSING_POINTER',
      'LEGACY_APPROVED_OR_ACTIVE',
      'PARENT_FILE_WITHOUT_REVISION',
      'REVISION_CHECKSUM_MISSING',
      'FILE_ACCESSIBLE',
      'FILE_INACCESSIBLE',
      'EXTERNAL_MUTABLE_URL',
      'DUPLICATE_NORMALIZED_DOCUMENT_NUMBER',
      'CROSS_DOCUMENT_POINTER',
      'MULTIPLE_ACTIVE_WORKING_REVISIONS',
      'MISSING_APPROVAL_IDENTITY_OR_DATE',
      'EXPIRED_OR_REVIEW_DUE',
      'NO_FILE_ATTACHED',
    ])
      expect(auditRoute).toContain(category);
  });

  it('keeps the audit report read-only and preserves access logs', () => {
    expect(auditRoute).toContain('readOnly: true');
    expect(auditRoute).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\bINSERT\b|\bUPDATE\b|\bDELETE\b/
    );
    expect(route).toContain('writeAccessLog');
  });
});
