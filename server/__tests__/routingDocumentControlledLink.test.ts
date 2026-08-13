import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Form & Document Builder controlled-document linkage', () => {
  const route = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
  const migration = readFileSync(
    join(process.cwd(), 'migrations/0277_routing_document_controlled_link.sql'),
    'utf8'
  );
  const client = readFileSync(
    join(process.cwd(), 'client/src/pages/RoutingDocumentManagement.tsx'),
    'utf8'
  );

  it('returns authoritative MDR identity and revision evidence with builder rows', () => {
    expect(route).toContain('LEFT JOIN controlled_documents cd ON cd.id = rd.controlled_document_id');
    expect(route).toContain('controlled_revision_checksum_status');
    expect(route).toContain('controlled_working_draft_revision_id');
  });

  it('persists the MDR identity for newly generated and imported documents', () => {
    expect(route).toContain('SET controlled_document_id = ${controlledDocument.id}');
    expect(route).toContain('controlledDocumentId: controlledDocument.id');
  });

  it('backfills only unambiguous historical file matches', () => {
    expect(migration).toContain('HAVING COUNT(*) = 1');
    expect(migration).toContain('WHERE rd.controlled_document_id IS NULL');
    expect(migration).toContain('ON DELETE RESTRICT');
  });

  it('routes review and viewing through the controlled MDR workflow', () => {
    expect(client).toContain('Review / View Controlled PDF');
    expect(client).toContain('/master-document-register?documentId=');
    expect(client).not.toContain('window.open(doc.fileUrl');
  });
});
