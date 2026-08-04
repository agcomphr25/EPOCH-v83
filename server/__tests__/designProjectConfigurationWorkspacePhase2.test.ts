import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const routeSource = fs.readFileSync(
  path.join(root, 'server/src/routes/rdProjects.ts'),
  'utf8'
);
const uiSource = fs.readFileSync(
  path.join(
    root,
    'client/src/features/design-control/DesignProjectConfigurationWorkspace.tsx'
  ),
  'utf8'
);
const pageSource = fs.readFileSync(
  path.join(root, 'client/src/pages/RDProjectsPage.tsx'),
  'utf8'
);
const migrationSource = fs.readFileSync(
  path.join(root, 'migrations/0251_design_project_configuration_workspace.sql'),
  'utf8'
);

describe('Design Project configuration workspace Phase 2', () => {
  it('renders a recursive multi-level assembly tree', () => {
    expect(uiSource).toContain(
      '<TreeNode key={relation.id} item={child} depth={depth + 1} />'
    );
  });

  it('offers manufactured and purchased component creation', () => {
    expect(uiSource).toContain("'MANUFACTURED_PART'");
    expect(uiSource).toContain("'PURCHASED_COMPONENT'");
  });

  it('supports explicit existing inventory linkage', () => {
    expect(uiSource).toContain('inventoryItemId');
    expect(routeSource).toContain(
      'inventoryItemId: z.number().int().positive().nullable().optional()'
    );
  });

  it('rejects cross-project relationships', () => {
    expect(routeSource).toContain("return 'CROSS_PROJECT_RELATIONSHIP'");
  });

  it('rejects relationship cycles', () => {
    expect(routeSource).toContain("return 'CONFIGURATION_CYCLE'");
    expect(routeSource).toContain('if (id === parentId) return true');
  });

  it('protects every mutation with a Phase 1 capability', () => {
    const editChecks =
      routeSource.match(
        /requirePermission\('design\.configuration\.edit'\)/g
      ) ?? [];
    expect(editChecks.length).toBeGreaterThanOrEqual(10);
    expect(routeSource).toContain(
      "requirePermission('design.configuration.applicability.approve')"
    );
  });

  it('creates only draft part revisions', () => {
    expect(routeSource).toContain("lifecycleState: 'DRAFT'");
    expect(routeSource).not.toMatch(
      /router\.(patch|put)\('\/:projectId\/configuration\/.*revisions/
    );
  });

  it('does not provide a released-revision edit path', () => {
    expect(routeSource).not.toContain('/revisions/:revisionId');
  });

  it('stores applicability per configuration item', () => {
    expect(routeSource).toContain(
      'ON CONFLICT (configuration_item_id, requirement_role)'
    );
  });

  it('requires justification for Not Applicable', () => {
    expect(routeSource).toContain('NOT_APPLICABLE_JUSTIFICATION_REQUIRED');
    expect(migrationSource).toContain(
      "nullif(btrim(justification), '') IS NOT NULL"
    );
  });

  it('requires the Engineering or Quality approval capability', () => {
    expect(routeSource).toContain(
      "requirePermission('design.configuration.applicability.approve')"
    );
  });

  it('keeps unapproved Not Applicable decisions incomplete', () => {
    expect(routeSource).toContain('Not Applicable — Approval Required');
    expect(routeSource).toContain("approvalStatus === 'APPROVED'");
  });

  it('evaluates coverage separately for each part', () => {
    expect(routeSource).toMatch(
      /configurationCoverage\(\s*req\.params\.projectId,\s*req\.params\.itemId\s*\)/
    );
    expect(uiSource).toContain('evaluated separately for this part');
  });

  it('uses authoritative artifact links rather than metadata', () => {
    expect(routeSource).toContain('designProjectPartRevisionArtifacts');
    expect(routeSource).not.toMatch(/metadata.*status/i);
  });

  it('does not infer links from matching part numbers', () => {
    expect(routeSource).not.toMatch(
      /part_number\s*=|partNumber\s*===.*artifact/i
    );
    expect(uiSource).toContain('no part-number match is used');
  });

  it('leaves legacy projects unchanged until explicit activation', () => {
    expect(routeSource).toContain(
      'Configuration has not been established for this legacy project.'
    );
    expect(routeSource).toContain('DESIGN_PROJECT_CONFIGURATION_ACTIVATED');
  });

  it('keeps the workspace on rd_projects and out of P2', () => {
    expect(migrationSource).toContain('REFERENCES rd_projects(id)');
    expect(routeSource).not.toContain('p2_projects');
  });

  it('marks completeness as informational only', () => {
    expect(routeSource).toContain('informationalOnly: true');
    expect(uiSource).toContain('% informational only');
  });

  it('does not activate a production or Engineering Release gate', () => {
    expect(routeSource).toContain('productionEnforcementEnabled: false');
    expect(routeSource).not.toMatch(
      /engineeringRelease.*(block|gate)|production.*enabled:\s*true/i
    );
  });

  it('uses transactions for multi-record tree mutations', () => {
    expect(routeSource).toMatch(
      /configuration\/items'[\s\S]{0,500}db\.transaction/
    );
    expect(routeSource).toMatch(
      /relationships\/reorder[\s\S]{0,500}db\.transaction/
    );
    expect(routeSource).toMatch(
      /items\/:itemId\/revisions[\s\S]{0,700}db\.transaction/
    );
  });

  it('uses one client request for item and parent creation', () => {
    expect(uiSource).toContain('parentConfigurationItemId: itemForm.parentId');
    expect(uiSource).not.toMatch(
      /if \(created && itemForm\.parentId\)[\s\S]{0,300}configuration\/relationships/
    );
    expect(uiSource).toContain('setSelectedItemId(created.item.id)');
  });

  it('project-scopes applicability submit and approval transitions', () => {
    expect(routeSource.match(/FOR UPDATE OF a/g)).toHaveLength(2);
    expect(routeSource).toContain(
      'AND i.rd_project_id = ${req.params.projectId}'
    );
    expect(routeSource).toContain("applicability.approval_status !== 'DRAFT'");
    expect(routeSource).toContain(
      "applicability.approval_status !== 'PENDING'"
    );
  });

  it('exposes all five guided steps inside the authoritative project page', () => {
    for (const step of [
      'Product Structure',
      'Parts and Revisions',
      'Make/Buy Decisions',
      'Documentation Requirements',
      'Coverage Review',
    ])
      expect(uiSource).toContain(step);
    expect(pageSource).toContain('Part &amp; Assembly Configuration');
  });
});
