import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated template document central-storage save path', () => {
  const route = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
  const start = route.indexOf('const createDocumentFromTemplate');
  const end = route.indexOf("router.post('/documents/from-template'", start);
  const handler = route.slice(start, end);

  it('falls back to the served central media directory when object storage rejects a buffer upload', () => {
    expect(route).toContain('async function saveGeneratedTemplatePdf');
    expect(route).toContain("path.posix.join('uploads', 'media-library', storedFileName)");
    expect(route).toContain('await fs.promises.writeFile');
    expect(route).toContain('fileUrl: `/api/media/file/${encodeURIComponent(storedFileName)}`');
  });

  it('registers central storage before queueing the Master Document record', () => {
    const centralIndex = handler.indexOf("insertPublicRowReturning('media_library'");
    const masterIndex = handler.indexOf("insertPublicRowReturning('controlled_documents'");
    expect(centralIndex).toBeGreaterThan(0);
    expect(masterIndex).toBeGreaterThan(centralIndex);
    expect(handler).toContain("status: 'pending'");
  });

  it('returns the exact failed stage and normalized storage detail', () => {
    expect(handler).toContain('stage: creationStage');
    expect(handler).toContain('details: message');
    expect(handler).toContain('reason');
  });

  it('does not discard the saved document when its optional project attachment fails', () => {
    expect(handler).toContain('Optional project attachment failed after template document save:');
    expect(handler).toContain('projectAttachmentWarning');
  });
});
