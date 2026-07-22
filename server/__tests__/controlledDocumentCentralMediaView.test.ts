import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Master Document Register central-media file resolution', () => {
  const source = readFileSync(join(process.cwd(), 'server/src/routes/controlledDocuments.ts'), 'utf8');
  const resolverStart = source.indexOf('const resolveControlledDocumentFile');
  const resolverEnd = source.indexOf('const formatControlledDocumentFooterDate', resolverStart);
  const resolver = source.slice(resolverStart, resolverEnd);

  it('resolves generated /api/media/file URLs into the served central media directory', () => {
    expect(resolver).toContain("trimmed.startsWith('/api/media/file/')");
    expect(resolver).toContain("path.resolve(process.cwd(), 'uploads', 'media-library')");
    expect(resolver).toContain("decodeURIComponent(trimmed.slice('/api/media/file/'.length))");
  });

  it('also resolves stored media-library paths used by central-storage records', () => {
    expect(resolver).toContain("normalizedMediaPath.startsWith('uploads/media-library/')");
    expect(resolver).toContain('resolvedMediaPath.startsWith(`${centralMediaRoot}${path.sep}`)');
  });

  it('rejects encoded or relative traversal outside the central media directory', () => {
    expect(resolver).toContain('path.basename(fileName) !== fileName');
    expect(resolver).toContain('return null;');
  });
});
