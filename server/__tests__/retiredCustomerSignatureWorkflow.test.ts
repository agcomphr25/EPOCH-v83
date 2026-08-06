import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeMigrationFiles } from '../scripts/migrations/runSafeBootMigrations';

const root = path.resolve(import.meta.dirname, '../..');
const retiredMigrations = [
  '0167_repair_customer_signature_fulfilled_orders.sql',
  '0171_all_orders_finalize_to_p1_queue.sql',
  '0175_repair_remaining_ff_signature_queue_orders.sql',
];

const retiredOneTimeRepairs = [
  '0005_backfill_production_orders_item_codes.sql',
  '0011_fix_finalized_orders_in_production_departments.sql',
  '0027_brian_ramirez_account_fix.sql',
  '0056_backfill_fulfilled_orders_shipped_date.sql',
  '0080_link_users_to_employees.sql',
  '0113_routing_step_intent_backfill.sql',
  '0137_normalize_10300_customer_payment_clearing.sql',
  '0144_rename_10300_customer_payment_clearing.sql',
  '0152_vendor_po_return_email.sql',
  '0168_vendor_rfq_contact_email.sql',
  '0169_vendor_rfq_pdf_attachment.sql',
  '0170_vendor_rfq_contact_name.sql',
  '0192_backfill_routed_timer_oven_cure_logs.sql',
  '0197_route_p1_metal_accessories_to_shipping_qc.sql',
  '0198_repair_p1_metal_accessory_classification.sql',
  '0200_reconcile_oem_shipment_fulfillment.sql',
  '0201_close_fully_shipped_p1_purchase_orders.sql',
  '0238_reverse_0167_fulfilled_orders.sql',
  '0239_correct_0238_non_unique_id_collateral.sql',
  '0240_restore_0167_replay_orders.sql',
  '0243_close_direct_shipped_p1_purchase_orders.sql',
  '0244_restore_shipped_orders_after_0167_id_collision.sql',
  '0246_restore_open_paint_orders_after_0167_collateral.sql',
  '0247_retire_duplicate_traveler_roc2600719.sql',
  '0253_void_duplicate_epoch_validation_packages.sql',
  '0257_restore_shipping_qc_after_0171_replay.sql',
];

const staleRegistrations = [
  '0037_project_closing_approval_fields.sql',
  '0049_settings_table.sql',
  '0049_timekeeping_schema.sql',
  '0052_dcaa_scheduler_state.sql',
  '0055_labor_session_request_ref.sql',
  '0168_p2_invoice_numbering.sql',
];

describe('retired customer-signature order workflow', () => {
  it('does not ship or replay obsolete queue migrations', () => {
    for (const migration of retiredMigrations) {
      expect(fs.existsSync(path.join(root, 'migrations', migration))).toBe(false);
      expect(safeMigrationFiles).not.toContain(migration);
    }
  });

  it('does not mount customer signature request or settings routes', () => {
    const routes = fs.readFileSync(path.join(root, 'server/src/routes/index.ts'), 'utf8');
    expect(routes).not.toContain("app.use('/api/followup-orders'");
    expect(routes).not.toContain("app.use('/api/sign-order-settings'");
  });

  it('does not expose customer signing pages in the application router', () => {
    const app = fs.readFileSync(path.join(root, 'client/src/App.tsx'), 'utf8');
    expect(app).not.toContain('SignOrderPage');
    expect(app).not.toContain('/sign-order');
  });

  it('does not replay historical data repairs or reference missing files', () => {
    for (const migration of [...retiredOneTimeRepairs, ...staleRegistrations]) {
      expect(safeMigrationFiles).not.toContain(migration);
    }
  });
});
