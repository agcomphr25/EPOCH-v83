import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const service = read(
  'server/src/services/projectTechnicalConfigurationReviewService.ts'
);
const route = read('server/src/routes/projectTechnicalConfigurationReview.ts');
const migration = read(
  'migrations/0209_project_technical_configuration_reviews.sql'
);
const productionPlanning = read(
  'server/src/services/projectProductionPlanningService.ts'
);
const wadAuthorization = read(
  'server/src/services/projectWadAuthorizationService.ts'
);
const designMigration = read(
  'migrations/0203_project_design_applicability_decisions.sql'
);

describe('Phase 8B technical and configuration review boundaries', () => {
  it('adds revision-controlled technical review storage without rewriting Phase 5 or legacy data', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS project_technical_configuration_reviews'
    );
    expect(migration).toContain('lock_version INTEGER NOT NULL DEFAULT 1');
    expect(migration).toContain('source_snapshot JSONB NOT NULL');
    expect(migration).toContain('technical_baseline JSONB NOT NULL');
    expect(migration).not.toMatch(/UPDATE\s+(projects|project_steps)\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b/i);
    expect(designMigration).toContain(
      'CREATE TABLE IF NOT EXISTS project_design_applicability_decisions'
    );
  });

  it('requires the three commercial predecessors and a current authoritative baseline', () => {
    expect(service).toContain(
      "const required = ['rfq_risk_assessment', 'estimate_quote', 'contract_review']"
    );
    expect(service).toContain('evaluateCommercialBaseline(projectId, tx)');
    expect(service).toContain(
      'sourceSnapshot(projectId, ctx.project.po_id, tx)'
    );
    expect(service).toContain(
      'released drawing/specification revision or approved exception is required'
    );
    expect(service).toContain(
      'Every technical/configuration conflict requires a resolution.'
    );
    expect(service).toContain(
      'Required technical information remains missing.'
    );
  });

  it('uses manufacturing functions, conditional Supply Chain, and segregation of duties', () => {
    for (const role of [
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'SUPPLY_CHAIN',
    ])
      expect(service).toContain(`'${role}'`);
    expect(service).toContain(
      "...(supplyChainRequired ? ['SUPPLY_CHAIN'] : [])"
    );
    expect(service).toContain(
      'One actor cannot represent multiple required manufacturing functions.'
    );
    expect(service).toContain('step_revision_snapshot');
    expect(service).toContain('revision: review.revision_number');
  });

  it('preserves submitted history, invalidates superseded approvals, and rejects concurrent writes', () => {
    expect(migration).toContain("OLD.status <> 'DRAFT'");
    expect(service).toContain(
      'WHERE id=${reviewId} AND lock_version=${expectedRevision}'
    );
    expect(service).toContain("'STALE_REVISION'");
    expect(service).toContain("status='SUPERSEDED'");
    expect(service).toContain("'{invalidated}'");
    expect(route).not.toMatch(/router\.delete/i);
  });

  it('references only released technical evidence and exposes no Design Control mutation', () => {
    expect(service).toContain("'CONTROLLED_DOCUMENT'");
    expect(service).toContain("'BOM_REVISION'");
    expect(service).toContain("'ENGINEERING_RELEASE'");
    expect(service).toContain(
      'SELECT id,release_revision revision,release_status status,released_at updated_at FROM engineering_releases'
    );
    expect(service).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE)\s+(?:rd_projects|design_projects|engineering_changes|ecrs|ecns)\b/i
    );
    expect(route).not.toMatch(
      /design-(?:input|output|verification|validation|release)|\becr\b|\becn\b/i
    );
  });

  it('propagates stale technical-baseline blockers without changing released production records', () => {
    expect(productionPlanning).toContain(
      'evaluateTechnicalConfigurationBaseline(projectId, tx)'
    );
    expect(wadAuthorization).toContain(
      'evaluateTechnicalConfigurationBaseline'
    );
    expect(productionPlanning).toContain(
      "'TECHNICAL_CONFIGURATION_BASELINE_INVALID'"
    );
    for (const source of [service, productionPlanning, wadAuthorization]) {
      expect(source).not.toMatch(
        /(?:INSERT\s+INTO|DELETE\s+FROM)\s+(?:production_orders|travelers|inventory_transactions|shipments|project_closings)\b/i
      );
    }
  });

  it('fails closed outside definition-version 2 and keeps build-to-print independent of Design Projects', () => {
    expect(service).toContain("workflowVersion !== 'p2_v2'");
    expect(service).toContain('Number(instances[0].definition_version) !== 2');
    expect(service).not.toContain('CUSTOMER_BUILD_TO_PRINT');
    expect(service).not.toContain('Design Project');
    expect(service).not.toContain('createDesign');
  });
});
