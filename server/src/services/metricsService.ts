import { pool } from '../../db';

const EXCLUDED = `status NOT IN ('SCRAPPED', 'CANCELLED', 'FULFILLED')`;

export async function getCNCQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department = 'CNC'
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getGunsmithQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department = 'Gunsmith'
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getFinishQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department IN ('Finish', 'Finish QC')
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getOrdersInProduction(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department IS NOT NULL
       AND current_department NOT IN ('P1 Production Queue', 'Shipping', '')
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getOrdersCompletedToday(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE status = 'FULFILLED'
       AND DATE(updated_at) = CURRENT_DATE`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getP1QueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department = 'P1 Production Queue'
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getLayupQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department = 'Layup/Plugging'
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getBarcodeQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department = 'Barcode'
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getPaintQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department = 'Paint'
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getShippingQueueSize(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM all_orders
     WHERE current_department IN ('Shipping QC', 'Shipping')
       AND ${EXCLUDED}`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getOpenInventoryShortages(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM inventory_balances
     WHERE quantity_available < 0
        OR quantity_on_hand < 0`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getP2OpenPOs(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM p2_purchase_orders
     WHERE status NOT IN ('COMPLETED', 'CANCELED')`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getP2PendingBOMs(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM p2_purchase_orders
     WHERE bom_configured = false
       AND status NOT IN ('COMPLETED', 'CANCELED')`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getP2ItemsInProduction(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM p2_serialized_items
     WHERE status NOT IN ('PENDING', 'SCHEDULED', 'COMPLETED', 'SHIPPED', 'CANCELED')
       AND status IS NOT NULL`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getP2ItemsPendingQC(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM p2_serialized_items
     WHERE status = 'FINAL_QC'`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getP2ItemsCompletedWeek(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM p2_serialized_items
     WHERE status = 'COMPLETED'
       AND completed_at > NOW() - INTERVAL '7 days'`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getCuttingTableActiveItems(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM p2_production_orders
     WHERE status IN ('pending', 'in_progress', 'queued', 'PENDING')`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getOpenCreditMemos(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM credit_memos
     WHERE status = 'active'`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export async function getOpenTickets(): Promise<number> {
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM tickets
     WHERE status NOT IN ('closed', 'resolved')`,
  ) as any[];
  return rows[0]?.count ?? 0;
}

export type MetricSlug =
  | 'cnc_queue_size'
  | 'gunsmith_queue_size'
  | 'finish_queue_size'
  | 'orders_in_production'
  | 'orders_completed_today'
  | 'p1_queue_size'
  | 'layup_queue_size'
  | 'barcode_queue_size'
  | 'paint_queue_size'
  | 'shipping_queue_size'
  | 'open_inventory_shortages'
  | 'p2_open_pos'
  | 'p2_pending_boms'
  | 'p2_items_in_production'
  | 'p2_items_pending_qc'
  | 'p2_items_completed_week'
  | 'cutting_table_active_items'
  | 'open_credit_memos'
  | 'open_tickets';

export const METRIC_FUNCTIONS: Record<MetricSlug, () => Promise<number>> = {
  cnc_queue_size:            getCNCQueueSize,
  gunsmith_queue_size:       getGunsmithQueueSize,
  finish_queue_size:         getFinishQueueSize,
  orders_in_production:      getOrdersInProduction,
  orders_completed_today:    getOrdersCompletedToday,
  p1_queue_size:             getP1QueueSize,
  layup_queue_size:          getLayupQueueSize,
  barcode_queue_size:        getBarcodeQueueSize,
  paint_queue_size:          getPaintQueueSize,
  shipping_queue_size:       getShippingQueueSize,
  open_inventory_shortages:  getOpenInventoryShortages,
  p2_open_pos:               getP2OpenPOs,
  p2_pending_boms:           getP2PendingBOMs,
  p2_items_in_production:    getP2ItemsInProduction,
  p2_items_pending_qc:       getP2ItemsPendingQC,
  p2_items_completed_week:   getP2ItemsCompletedWeek,
  cutting_table_active_items: getCuttingTableActiveItems,
  open_credit_memos:         getOpenCreditMemos,
  open_tickets:              getOpenTickets,
};
