import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('controlled document storage durability', () => {
  it('persists uploaded files through object storage instead of deployment-local assets', () => {
    const source = readFileSync(
      new URL('../src/routes/controlledDocuments.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('storage: multer.memoryStorage()');
    expect(source).toContain("scope: 'controlled-documents'");
    expect(source).toContain('getFileStorageProvider().uploadBuffer');
    expect(source).not.toContain('req.file.filename');
    expect(source).not.toContain('multer.diskStorage');
  });
});
