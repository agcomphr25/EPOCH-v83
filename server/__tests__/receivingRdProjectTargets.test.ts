import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('receiving R&D project targets', () => {
  const routeSource = readFileSync(join(process.cwd(), 'server/src/routes/receiving.ts'), 'utf8');
  const schemaSource = readFileSync(join(process.cwd(), 'server/schema.ts'), 'utf8');
  const migrationSource = readFileSync(
    join(process.cwd(), 'migrations/0227_receiving_rd_project_targets.sql'),
    'utf8',
  );

  it('combines production projects and Design R&D projects in the receiving target list', () => {
    const targetQuery = routeSource.slice(
      routeSource.indexOf('async function getOpenReceivingProjectTargets'),
      routeSource.indexOf('async function resolveDefaultTargetProjectId'),
    );
    expect(targetQuery).toContain('FROM projects p');
    expect(targetQuery).toContain('FROM rd_projects rp');
    expect(targetQuery).toContain("'rd_project'::text AS \"targetType\"");
  });

  it('stores R&D targets through their own foreign key and prevents dual assignment', () => {
    expect(schemaSource).toContain("targetRdProjectId: text('target_rd_project_id')");
    expect(migrationSource).toContain('REFERENCES rd_projects(id)');
    expect(migrationSource).toContain('received_units_single_project_target_check');
    expect(migrationSource).toContain('target_project_id IS NULL OR target_rd_project_id IS NULL');
  });
});
