import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P2 project document coverage builder boundary', () => {
  const projectsRoute = readFileSync(join(process.cwd(), 'server/src/routes/projects.ts'), 'utf8');

  it('labels the combined work-instruction and spec-sheet requirement', () => {
    expect(projectsRoute).toContain("label: 'Work Instructions / Spec Sheet'");
    expect(projectsRoute).toContain("source: 'Form & Document Builder'");
  });

  it('opens the Form & Document Builder for the project', () => {
    expect(projectsRoute).toContain('route: `/forms/document-builder?projectId=${encodeURIComponent(id)}`');
  });

  it('counts builder documents as part coverage', () => {
    expect(projectsRoute).toContain('getProjectManufacturingDocumentRefs(id).catch(() => [])');
    expect(projectsRoute).toContain('builderDocumentParts.has(String(partNumber).trim().toLowerCase())');
  });
});
