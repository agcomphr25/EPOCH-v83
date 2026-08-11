import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0264_p2_recursive_production_demand_foundation.sql';
const migration = readFileSync(
  join(process.cwd(), 'migrations', migrationName),
  'utf8'
);
const schema = readFileSync(join(process.cwd(), 'server/schema.ts'), 'utf8');

describe('P2 recursive production-demand Phase 2 foundation', () => {
  it('is registered for deterministic safe boot', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles.has(migrationName)).toBe(true);
  });

  it('aligns the four migration-owned tables with application schema models', () => {
    for (const table of [
      'project_production_demands',
      'project_production_demand_dependencies',
      'project_production_demand_execution_links',
      'project_production_demand_allocations',
    ]) {
      expect(migration).toContain(`TABLE IF NOT EXISTS ${table}`);
      expect(schema).toContain(`'${table}'`);
    }
    for (const column of [
      'demand_line_identity',
      'demand_key',
      'effective_customer_quantity',
      'customer_demand_event_digest',
      'replacement_for_demand_id',
    ]) {
      expect(schema).toContain(`'${column}'`);
    }
  });

  it('is additive and performs no legacy backfill or execution mutation', () => {
    expect(migration).not.toMatch(
      /\b(?:UPDATE\s+[a-z_]+\s+SET|DELETE\s+FROM|TRUNCATE)\b/i
    );
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+(?:p2_production_orders|production_work_orders|travelers)/i
    );
    expect(migration).toContain('no legacy backfill');
  });

  it('owns a launch-scoped recursive demand identity', () => {
    expect(migration).toContain('project_production_demands');
    expect(migration).toContain('parent_demand_id UUID');
    expect(migration).toContain(
      'UNIQUE (production_launch_id,production_plan_item_id,po_item_id,assembly_path)'
    );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('UNIQUE (production_launch_id,demand_key)');
  });

  it('freezes BOM, routing, plan, release, quantity, and authority evidence', () => {
    for (const field of [
      'production_release_id',
      'production_plan_item_id',
      'gross_required_quantity',
      'bom_revision_id',
      'routing_revision_snapshot',
      'authority_snapshot',
      'demand_line_identity',
      'customer_demand_event_digest',
      'customer_demand_snapshot',
    ]) {
      expect(migration).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
  });

  it('binds root quantities to the current-main immutable customer-demand ledger', () => {
    expect(migration).toContain(
      'FOREIGN KEY (po_item_id,demand_line_identity)'
    );
    expect(migration).toContain('original_customer_quantity');
    expect(migration).toContain('effective_customer_quantity');
    expect(migration).toContain(
      "customer_demand_event_digest ~ '^[0-9a-f]{64}$'"
    );
  });

  it('models controlled cancellation, supersession, scrap, and replacement lineage', () => {
    expect(migration).toContain('supersedes_demand_id UUID');
    expect(migration).toContain('replacement_for_demand_id UUID');
    expect(migration).toContain("'CANCELLED','SUPERSEDED'");
    expect(migration).toContain("'ISSUE','REPLACEMENT'");
    expect(migration).toContain(
      'enforce_project_production_demand_status_transition'
    );
  });

  it('accepts UNRESOLVED only as explicit blocked evidence', () => {
    expect(migration).toContain("'STOCK_SATISFIED','UNRESOLVED'");
    expect(migration).toContain("'BLOCKED_UNRESOLVED'");
  });

  it('models child gates without silently authorizing floor work', () => {
    expect(migration).toContain('project_production_demand_dependencies');
    expect(migration).toContain("'COMPLETE','ACCEPT','ISSUE_OR_SCAN'");
    expect(migration).toContain('project_production_demand_execution_links');
    expect(migration).toContain('project_production_demand_allocations');
  });

  it('keeps stock netting distinct from reservation and issue evidence', () => {
    expect(migration).toContain(
      "'NETTING_SNAPSHOT','RESERVATION','ISSUE','REPLACEMENT'"
    );
    expect(migration).toContain(
      "'PLANNED','ACTIVE','CONSUMED','RELEASED','CANCELLED'"
    );
  });
});
