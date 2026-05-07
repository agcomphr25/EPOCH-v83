/**
 * Schema parity guard for the vendor_pos / Purchasing-Controls tables.
 *
 * Background: in May 2026 a POST /api/vendor-pos failed in production with
 *   `column "requisition_id" of relation "vendor_pos" does not exist`
 * because the Drizzle schema (server/schema.ts) had declared seven Task #83
 * Purchasing-Controls columns months earlier, but no migration ever added
 * them to the live database. Drizzle INSERT lists every schema column, so
 * any column-level drift turns every INSERT into a 500.
 *
 * This test compares the Drizzle column set for a curated list of
 * Task #83-critical tables against information_schema.columns on the live
 * database. Any column declared in code but missing from the DB fails the
 * build with a clear, actionable message naming the table and column.
 *
 * Scoped narrowly on purpose — a full whole-schema diff is noisy because
 * boot-time DDL, deprecated tables, and cross-schema (timekeeping.) tables
 * all need exemptions. This file is the seed; add other tables to
 * GUARDED_TABLES as recurrences are observed.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { getTableColumns, getTableName } from 'drizzle-orm';
import {
  vendorPOs,
  purchaseRequisitions,
  purchaseRequisitionLines,
  purchaseRequisitionApprovals,
} from '../schema';

const GUARDED_TABLES = [
  vendorPOs,
  purchaseRequisitions,
  purchaseRequisitionLines,
  purchaseRequisitionApprovals,
] as const;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

async function getLiveColumns(tableName: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((r) => r.column_name));
}

function getDrizzleColumnNames(table: any): string[] {
  const cols = getTableColumns(table);
  return Object.values(cols).map((c: any) => c.name);
}

describe('Schema parity — Task #83 Purchasing Controls tables', () => {
  for (const table of GUARDED_TABLES) {
    const tableName = getTableName(table as any);

    it(`every Drizzle column on "${tableName}" exists in the live database`, async () => {
      const liveColumns = await getLiveColumns(tableName);
      expect(liveColumns.size, `table "${tableName}" missing from live DB`).toBeGreaterThan(0);

      const drizzleColumns = getDrizzleColumnNames(table);
      const missing = drizzleColumns.filter((c) => !liveColumns.has(c));

      expect(
        missing,
        `Schema/DB drift on "${tableName}": columns declared in server/schema.ts but missing from the live database: ${missing.join(', ')}. Add a migration that runs ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ... for each.`,
      ).toEqual([]);
    });
  }
});
