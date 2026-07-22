import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('document-from-template production schema fallback', () => {
  const route = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
  const start = route.indexOf('const createDocumentFromTemplate');
  const end = route.indexOf("router.post('/documents/from-template'", start);
  const handler = route.slice(start, end);

  it('uses schema-aware inserts for every persisted document record', () => {
    expect(handler).toContain("insertPublicRowReturning('routing_documents'");
    expect(handler).toContain("insertPublicRowReturning('spec_sheets'");
    expect(handler).toContain("insertPublicRowReturning('controlled_documents'");
    expect(handler).toContain("insertPublicRowReturning('document_version_history'");
    expect(handler).not.toContain('db.insert(routingDocuments)');
    expect(handler).not.toContain('db.insert(specSheets)');
  });

  it('returns the production failure detail to the client', () => {
    expect(handler).toContain('const { status, reason, message } = getStorageErrorResponse(error)');
    expect(handler).toContain('stage: creationStage');
    expect(handler).toContain('details: message');
  });

  it('stores the finished PDF centrally and queues it for MDR acceptance', () => {
    expect(route).toContain('return saveControlledDocumentFile(storedFileName, fileBuffer);');
    expect(handler).toContain("insertPublicRowReturning('controlled_documents'");
    expect(handler).toContain("status: 'pending'");
    expect(handler).toContain('file_path: fileUrl');
  });
});
