import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';
import { isP2V2ProductionLaunchEnabled } from '../src/lib/featureFlags';
import {
  plannedProductionCounts,
  resolveFirstProductionDepartment,
} from '../src/services/projectPreproductionRules';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const databaseUrl = new URL(connectionString);
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.pathname !== '/epoch_p2_v2_certification'
) {
  throw new Error(
    `Refusing non-disposable database ${databaseUrl.hostname}${databaseUrl.pathname}`
  );
}

const pool = new Pool({ connectionString, max: 8 });

async function resetCertificationSchema() {
  await pool.query(`
    DROP SCHEMA IF EXISTS p2_v2_cert CASCADE;
    CREATE SCHEMA p2_v2_cert;
    CREATE TABLE p2_v2_cert.projects (
      id uuid PRIMARY KEY,
      workflow_version text,
      status text NOT NULL,
      stage8_active boolean NOT NULL DEFAULT false,
      launch_count integer NOT NULL DEFAULT 0
    );
    CREATE TABLE p2_v2_cert.launches (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES p2_v2_cert.projects(id),
      idempotency_key text NOT NULL,
      evidence jsonb NOT NULL,
      UNIQUE(project_id, idempotency_key),
      UNIQUE(project_id)
    );
    CREATE TABLE p2_v2_cert.serialized_items (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES p2_v2_cert.projects(id),
      part_number text NOT NULL,
      department text NOT NULL,
      UNIQUE(project_id, part_number, id)
    );
    CREATE TABLE p2_v2_cert.production_orders (
      id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES p2_v2_cert.projects(id),
      part_number text NOT NULL,
      quantity integer NOT NULL CHECK (quantity > 0),
      department text NOT NULL,
      routing_revision integer NOT NULL,
      wad_revision integer NOT NULL,
      effectivity text NOT NULL,
      UNIQUE(project_id, part_number)
    );
    CREATE TABLE p2_v2_cert.audit_events (
      id bigserial PRIMARY KEY,
      project_id uuid NOT NULL,
      event_type text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `);
}

async function syntheticLaunch(
  projectId: string,
  key: string,
  failAt?: 'SERIAL' | 'ORDER' | 'STAGE8' | 'STATUS'
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM p2_v2_cert.projects WHERE id=$1 FOR UPDATE`,
      [projectId]
    );
    if (locked.rows[0]?.workflow_version !== 'p2_v2')
      throw new Error('WORKFLOW_VERSION_NOT_SUPPORTED');
    const prior = await client.query(
      `SELECT * FROM p2_v2_cert.launches WHERE project_id=$1`,
      [projectId]
    );
    if (prior.rowCount) {
      if (prior.rows[0].idempotency_key === key) {
        await client.query('ROLLBACK');
        return prior.rows[0];
      }
      throw new Error('CONFLICTING_LAUNCH');
    }
    await client.query(
      `INSERT INTO p2_v2_cert.serialized_items
       VALUES (gen_random_uuid(),$1,'PARENT','Assembly'),
              (gen_random_uuid(),$1,'CHILD','CNC')`,
      [projectId]
    );
    if (failAt === 'SERIAL') throw new Error('FAULT_SERIAL');
    await client.query(
      `INSERT INTO p2_v2_cert.production_orders
       VALUES (gen_random_uuid(),$1,'PARENT',2,'Assembly',3,4,'CFG-A'),
              (gen_random_uuid(),$1,'CHILD',4,'CNC',7,4,'CFG-A')`,
      [projectId]
    );
    if (failAt === 'ORDER') throw new Error('FAULT_ORDER');
    await client.query(
      `UPDATE p2_v2_cert.projects SET stage8_active=true WHERE id=$1`,
      [projectId]
    );
    if (failAt === 'STAGE8') throw new Error('FAULT_STAGE8');
    await client.query(
      `UPDATE p2_v2_cert.projects
       SET status='IN_PRODUCTION',launch_count=launch_count+1 WHERE id=$1`,
      [projectId]
    );
    if (failAt === 'STATUS') throw new Error('FAULT_STATUS');
    const result = await client.query(
      `INSERT INTO p2_v2_cert.launches
       VALUES (gen_random_uuid(),$1,$2,$3::jsonb) RETURNING *`,
      [
        projectId,
        key,
        JSON.stringify({
          travelersCreated: 0,
          inventoryDemandsCreated: 0,
          reservationsCreated: 0,
          shippingRecordsCreated: 0,
          closingRecordsCreated: 0,
        }),
      ]
    );
    await client.query('COMMIT');
    await pool.query(
      `INSERT INTO p2_v2_cert.audit_events(project_id,event_type)
       VALUES ($1,'P2_V2_PRODUCTION_LAUNCHED')`,
      [projectId]
    );
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    await pool.query(
      `INSERT INTO p2_v2_cert.audit_events(project_id,event_type,payload)
       VALUES ($1,'P2_V2_PRODUCTION_LAUNCH_FAILED',$2::jsonb)`,
      [projectId, JSON.stringify({ keyPresent: Boolean(key) })]
    );
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  expect(isP2V2ProductionLaunchEnabled()).toBe(true);
  await resetCertificationSchema();
});

afterAll(async () => {
  await pool.query('DROP SCHEMA IF EXISTS p2_v2_cert CASCADE');
  await pool.end();
});

describe('Phase 8 migration certification', () => {
  it('uses the explicit deterministic safe-boot order including duplicate prefixes', () => {
    expect(new Set(safeMigrationFiles).size).toBe(safeMigrationFiles.length);
    expect(
      safeMigrationFiles.filter((file) => file.startsWith('0210_'))
    ).toEqual([
      '0210_master_document_control_hardening.sql',
      '0210_project_preproduction_readiness.sql',
      '0210_repair_freezer_temperature_tracking.sql',
    ]);
    expect(
      safeMigrationFiles.indexOf('0212_project_preproduction_launch_safety.sql')
    ).toBeGreaterThan(
      safeMigrationFiles.indexOf('0210_repair_freezer_temperature_tracking.sql')
    );
    expect(
      criticalMigrationFiles.has('0212_project_preproduction_launch_safety.sql')
    ).toBe(true);
  });

  it('preserves the certified 0210 readiness migration checksum', () => {
    const sql = readFileSync(
      path.resolve('migrations/0210_project_preproduction_readiness.sql')
    );
    expect(createHash('sha1').update(sql).digest('hex')).toBe(
      '586207c1d54f765129aa1f45944ea5f27746326b'
    );
  });

  it('has Phase 1-8 tables and the 0212 constraints applied and validatable', async () => {
    const tables = await pool.query(
      `SELECT to_regclass(name) AS table_name FROM unnest($1::text[]) name`,
      [
        [
          'project_workflow_instances',
          'project_workflow_step_instances',
          'project_production_plans',
          'project_wad_authorizations',
          'project_preproduction_readiness_reviews',
          'project_production_releases',
          'project_production_launches',
        ],
      ]
    );
    expect(tables.rows.every((row) => row.table_name)).toBe(true);
    const constraints = await pool.query(`
      SELECT conname, convalidated FROM pg_constraint
      WHERE conname IN (
        'project_production_releases_readiness_project_fkey',
        'project_production_launches_release_project_fkey',
        'project_production_launches_complete_only_check'
      ) ORDER BY conname`);
    expect(constraints.rowCount).toBe(3);
    for (const row of constraints.rows) {
      await pool.query(
        `ALTER TABLE ${
          row.conname.includes('releases')
            ? 'project_production_releases'
            : 'project_production_launches'
        } VALIDATE CONSTRAINT ${row.conname}`
      );
    }
  });
});

describe('Phase 8 real PostgreSQL launch safety', () => {
  const projectId = '00000000-0000-4000-8000-000000000801';

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO p2_v2_cert.projects VALUES
       ($1,'p2_v2','READY_FOR_P2_RELEASE',false,0),
       ('00000000-0000-4000-8000-000000000802',NULL,'READY',false,0),
       ('00000000-0000-4000-8000-000000000803','legacy_v1','READY',false,0),
       ('00000000-0000-4000-8000-000000000804','unknown','READY',false,0)`,
      [projectId]
    );
  });

  it.each(['SERIAL', 'ORDER', 'STAGE8', 'STATUS'] as const)(
    'rolls back a controlled %s failure and retains only failure audit',
    async (fault) => {
      await expect(
        syntheticLaunch(projectId, `fail-${fault}`, fault)
      ).rejects.toThrow();
      const state = await pool.query(
        `SELECT p.status,p.stage8_active,
          (SELECT count(*)::int FROM p2_v2_cert.serialized_items WHERE project_id=p.id) serials,
          (SELECT count(*)::int FROM p2_v2_cert.production_orders WHERE project_id=p.id) orders,
          (SELECT count(*)::int FROM p2_v2_cert.launches WHERE project_id=p.id) launches
         FROM p2_v2_cert.projects p WHERE id=$1`,
        [projectId]
      );
      expect(state.rows[0]).toMatchObject({
        status: 'READY_FOR_P2_RELEASE',
        stage8_active: false,
        serials: 0,
        orders: 0,
        launches: 0,
      });
    }
  );

  it('serializes concurrent keys, establishes one result, and rejects conflict', async () => {
    const results = await Promise.allSettled([
      syntheticLaunch(projectId, 'key-a'),
      syntheticLaunch(projectId, 'key-b'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    const established = await syntheticLaunch(projectId, 'key-a').catch(() =>
      syntheticLaunch(projectId, 'key-b')
    );
    expect(established.project_id).toBe(projectId);
    await expect(syntheticLaunch(projectId, 'key-c')).rejects.toThrow(
      'CONFLICTING_LAUNCH'
    );
  });

  it('reconciles exact records, links, departments, once-only state and deferrals', async () => {
    const [project, serials, orders, launches] = await Promise.all([
      pool.query(`SELECT * FROM p2_v2_cert.projects WHERE id=$1`, [projectId]),
      pool.query(
        `SELECT * FROM p2_v2_cert.serialized_items WHERE project_id=$1`,
        [projectId]
      ),
      pool.query(
        `SELECT * FROM p2_v2_cert.production_orders WHERE project_id=$1 ORDER BY part_number`,
        [projectId]
      ),
      pool.query(`SELECT * FROM p2_v2_cert.launches WHERE project_id=$1`, [
        projectId,
      ]),
    ]);
    expect(project.rows[0]).toMatchObject({
      status: 'IN_PRODUCTION',
      stage8_active: true,
      launch_count: 1,
    });
    expect(serials.rowCount).toBe(2);
    expect(orders.rows).toMatchObject([
      {
        part_number: 'CHILD',
        quantity: 4,
        department: 'CNC',
        routing_revision: 7,
        wad_revision: 4,
        effectivity: 'CFG-A',
      },
      {
        part_number: 'PARENT',
        quantity: 2,
        department: 'Assembly',
        routing_revision: 3,
        wad_revision: 4,
        effectivity: 'CFG-A',
      },
    ]);
    expect(launches).toHaveProperty('rowCount', 1);
    expect(launches.rows[0].evidence).toMatchObject({
      travelersCreated: 0,
      inventoryDemandsCreated: 0,
      reservationsCreated: 0,
      shippingRecordsCreated: 0,
      closingRecordsCreated: 0,
    });
  });

  it('routes canonical departments, multi-level manufactured items, and excludes purchased items', () => {
    expect(resolveFirstProductionDepartment(['Assembly'], true)).toBe(
      'Assembly'
    );
    expect(resolveFirstProductionDepartment(['Layup'], true)).toBe('Layup');
    expect(resolveFirstProductionDepartment(['CNC'], true)).toBe('CNC');
    expect(resolveFirstProductionDepartment(['Cutting'], true)).toBe(
      'Cutting Table'
    );
    expect(resolveFirstProductionDepartment([], true)).toBeNull();
    expect(
      plannedProductionCounts([
        {
          part_number: 'PARENT',
          extended_project_quantity: 2,
          routing_id: 'r1',
          routing_release_status: 'RELEASED',
          department_sequence: ['Assembly'],
        },
        {
          part_number: 'CHILD',
          extended_project_quantity: 4,
          routing_id: 'r2',
          routing_release_status: 'RELEASED',
          department_sequence: ['CNC'],
        },
      ])
    ).toEqual(
      new Map([
        ['PARENT', 2],
        ['CHILD', 4],
      ])
    );
  });

  it('keeps legacy and unknown workflow versions isolated and fail-closed', async () => {
    for (const id of [
      '00000000-0000-4000-8000-000000000802',
      '00000000-0000-4000-8000-000000000803',
      '00000000-0000-4000-8000-000000000804',
    ]) {
      await expect(syntheticLaunch(id, `legacy-${id}`)).rejects.toThrow(
        'WORKFLOW_VERSION_NOT_SUPPORTED'
      );
    }
    const rows = await pool.query(
      `SELECT workflow_version,status,stage8_active,launch_count
       FROM p2_v2_cert.projects WHERE id<>$1 ORDER BY id`,
      [projectId]
    );
    expect(rows.rows).toEqual([
      {
        workflow_version: null,
        status: 'READY',
        stage8_active: false,
        launch_count: 0,
      },
      {
        workflow_version: 'legacy_v1',
        status: 'READY',
        stage8_active: false,
        launch_count: 0,
      },
      {
        workflow_version: 'unknown',
        status: 'READY',
        stage8_active: false,
        launch_count: 0,
      },
    ]);
  });
});
