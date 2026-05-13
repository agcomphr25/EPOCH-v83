import { pool } from '../../db';

let p2PurchaseOrderReadinessPromise: Promise<void> | null = null;

export async function ensureP2PurchaseOrderReadSchema(): Promise<void> {
  if (p2PurchaseOrderReadinessPromise) return p2PurchaseOrderReadinessPromise;

  p2PurchaseOrderReadinessPromise = (async () => {
    await pool.query(`SELECT pg_advisory_lock(hashtext('epoch_p2_purchase_order_readiness'))`);
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF to_regclass('public.p2_purchase_orders') IS NOT NULL THEN
            ALTER TABLE public.p2_purchase_orders
              ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS tolerance_authorizer_id integer,
              ADD COLUMN IF NOT EXISTS tolerance_authorizer_name text,
              ADD COLUMN IF NOT EXISTS tolerance_notes text,
              ADD COLUMN IF NOT EXISTS bom_configured boolean DEFAULT false,
              ADD COLUMN IF NOT EXISTS locked_at timestamp,
              ADD COLUMN IF NOT EXISTS locked_by integer,
              ADD COLUMN IF NOT EXISTS source_quote_id uuid,
              ADD COLUMN IF NOT EXISTS contract_review_role text NOT NULL DEFAULT 'secondary',
              ADD COLUMN IF NOT EXISTS created_by_id integer,
              ADD COLUMN IF NOT EXISTS created_by_name text,
              ADD COLUMN IF NOT EXISTS assigned_to_id integer,
              ADD COLUMN IF NOT EXISTS assigned_to_name text,
              ADD COLUMN IF NOT EXISTS bom_owner_id integer,
              ADD COLUMN IF NOT EXISTS bom_owner_name text,
              ADD COLUMN IF NOT EXISTS scheduled_by_id integer,
              ADD COLUMN IF NOT EXISTS scheduled_by_name text,
              ADD COLUMN IF NOT EXISTS production_lead_id integer,
              ADD COLUMN IF NOT EXISTS production_lead_name text,
              ADD COLUMN IF NOT EXISTS project_name text,
              ADD COLUMN IF NOT EXISTS security_classification text NOT NULL DEFAULT 'internal',
              ADD COLUMN IF NOT EXISTS cui_category text,
              ADD COLUMN IF NOT EXISTS itar_category text,
              ADD COLUMN IF NOT EXISTS export_control_jurisdiction text,
              ADD COLUMN IF NOT EXISTS customer_file_access_rule text NOT NULL DEFAULT 'authenticated',
              ADD COLUMN IF NOT EXISTS scrapped_item_count integer NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS scrap_rate_percent real NOT NULL DEFAULT 0;
          END IF;
        END $$;
      `);
    } finally {
      await pool.query(`SELECT pg_advisory_unlock(hashtext('epoch_p2_purchase_order_readiness'))`);
    }
  })().catch((error) => {
    p2PurchaseOrderReadinessPromise = null;
    throw error;
  });

  return p2PurchaseOrderReadinessPromise;
}
