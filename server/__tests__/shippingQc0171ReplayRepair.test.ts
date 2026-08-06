import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const root = path.resolve(import.meta.dirname, '../..');
const repairMigration = '0257_restore_shipping_qc_after_0171_replay.sql';

describe('Shipping QC migration 0171 replay repair', () => {
  it('does not move Shipping QC orders back to P1 Production Queue', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/0171_all_orders_finalize_to_p1_queue.sql'),
      'utf8',
    );

    expect(sql).not.toContain("current_department IN ('P1 Production Queue', 'Shipping QC')");
    expect(sql).not.toMatch(/current_department\s*=\s*'Shipping QC'[\s\S]*current_department\s*=\s*'P1 Production Queue'/);
    expect(sql).toContain("current_department = 'Awaiting Customer ' || 'Signature'");
  });

  it('restores only unambiguous open Shipping QC transitions and records evidence', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations', repairMigration),
      'utf8',
    );

    expect(sql).toContain("ao.status = 'FINALIZED'");
    expect(sql).toContain("ao.current_department = 'P1 Production Queue'");
    expect(sql).toContain("transition.entity_type = 'p1_order'");
    expect(sql).toContain("transition.department = 'Shipping QC'");
    expect(sql).toContain('transition.exited_at IS NULL');
    expect(sql).toContain('other_open.exited_at IS NULL');
    expect(sql).toContain("reason_code = 'RESTORE_SHIPPING_QC_AFTER_0171_REPLAY'");
    expect(sql).toContain("status = 'IN_PROGRESS'");
    expect(sql).toContain("current_department = 'Shipping QC'");
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it('runs the restoration as a critical safe-boot migration', () => {
    expect(safeMigrationFiles).toContain(repairMigration);
    expect(criticalMigrationFiles.has(repairMigration)).toBe(true);
  });
});
