import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('project document coverage missing-part descriptions', () => {
  const projectDetailPage = readFileSync(
    join(process.cwd(), 'client/src/pages/ProjectDetailPage.tsx'),
    'utf8'
  );

  it('shows the linked inventory description when a missing AG part is hovered', () => {
    expect(projectDetailPage).toContain('const missingPartDescriptions = item.missingPartDescriptions ?? {}');
    expect(projectDetailPage).toContain('title={description || undefined}');
    expect(projectDetailPage).toContain('Missing: ${part}. ${description}');
  });
});
