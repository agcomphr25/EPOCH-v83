import type { PoolClient } from 'pg';

import { pool } from '../../db';

export type P1AdjustmentType = 'CANCEL_QUANTITY' | 'RESTORE_QUANTITY';

export interface P1ProductionUnitRow {
  orderId: string;
  productionStatus: string | null;
  currentDepartment: string | null;
  isFulfilled: boolean | null;
  hasShipment: boolean;
}

export interface P1POLineReconciliation {
  purchaseOrderItemId: number;
  originalOrderedQuantity: number;
  canceledDemandQuantity: number;
  activePoQuantity: number;
  shippedQuantity: number;
  workInProgressQuantity: number;
  pendingQueueQuantity: number;
  accountedQuantity: number;
  variance: number;
  availableToProgressQuantity: number;
  inProgressDepartmentBreakdown: Record<string, number>;
  isCanceled: boolean;
}

export interface P1QuantityAdjustment {
  id: string;
  purchaseOrderItemId: number;
  adjustmentType: P1AdjustmentType;
  quantity: number;
  reason: string;
  effectiveAt: string;
  createdAt: string;
  createdByDisplayName: string | null;
  source: string | null;
  reference: string | null;
  idempotencyKey: string | null;
}

const CANCELED_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'SCRAPPED',
  'VOIDED',
]);
const FULL_PO_CANCELED_STATUSES = new Set(['CANCELLED', 'CANCELED']);

function normalized(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function reconcileP1POLine(input: {
  purchaseOrderItemId: number;
  originalOrderedQuantity: number;
  canceledDemandQuantity: number;
  purchaseOrderStatus: string | null;
  productionUnits: P1ProductionUnitRow[];
}): P1POLineReconciliation {
  const unitsByOrderId = new Map<string, P1ProductionUnitRow>();
  for (const unit of input.productionUnits) {
    if (!unit.orderId || unitsByOrderId.has(unit.orderId)) continue;
    unitsByOrderId.set(unit.orderId, unit);
  }

  let shippedQuantity = 0;
  let workInProgressQuantity = 0;
  let pendingQueueQuantity = 0;
  const inProgressDepartmentBreakdown: Record<string, number> = {};

  for (const unit of Array.from(unitsByOrderId.values())) {
    const status = normalized(unit.productionStatus);
    if (CANCELED_STATUSES.has(status)) continue;

    if (unit.hasShipment || unit.isFulfilled) {
      shippedQuantity += 1;
      continue;
    }

    const department =
      String(unit.currentDepartment ?? '').trim() || 'Unassigned';
    if (normalized(department) === 'P1 PRODUCTION QUEUE') {
      pendingQueueQuantity += 1;
      continue;
    }

    workInProgressQuantity += 1;
    inProgressDepartmentBreakdown[department] =
      (inProgressDepartmentBreakdown[department] ?? 0) + 1;
  }

  const isCanceled = FULL_PO_CANCELED_STATUSES.has(
    normalized(input.purchaseOrderStatus)
  );
  const activePoQuantity = isCanceled
    ? 0
    : input.originalOrderedQuantity - input.canceledDemandQuantity;
  const accountedQuantity =
    shippedQuantity + workInProgressQuantity + pendingQueueQuantity;
  const variance = activePoQuantity - accountedQuantity;

  return {
    purchaseOrderItemId: input.purchaseOrderItemId,
    originalOrderedQuantity: input.originalOrderedQuantity,
    canceledDemandQuantity: input.canceledDemandQuantity,
    activePoQuantity,
    shippedQuantity,
    workInProgressQuantity,
    pendingQueueQuantity,
    accountedQuantity,
    variance,
    availableToProgressQuantity: Math.max(variance, 0),
    inProgressDepartmentBreakdown,
    isCanceled,
  };
}

async function getLineReconciliationWithClient(
  client: PoolClient,
  purchaseOrderItemId: number,
  lockLine = false,
  expectedPurchaseOrderId?: number
): Promise<P1POLineReconciliation | null> {
  const lineResult = await client.query<{
    id: number;
    quantity: number;
    po_status: string | null;
  }>(
    `SELECT poi.id, poi.quantity, po.status AS po_status
       FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE poi.id = $1
      ${expectedPurchaseOrderId ? 'AND po.id = $2' : ''}
      ${lockLine ? 'FOR UPDATE OF poi, po' : ''}`,
    expectedPurchaseOrderId
      ? [purchaseOrderItemId, expectedPurchaseOrderId]
      : [purchaseOrderItemId]
  );
  const line = lineResult.rows[0];
  if (!line) return null;

  const adjustmentResult = await client.query<{ net_canceled: string }>(
    `SELECT COALESCE(SUM(
       CASE adjustment_type
         WHEN 'CANCEL_QUANTITY' THEN quantity
         WHEN 'RESTORE_QUANTITY' THEN -quantity
       END
     ), 0)::text AS net_canceled
       FROM purchase_order_item_quantity_adjustments
      WHERE purchase_order_item_id = $1`,
    [purchaseOrderItemId]
  );
  const canceledDemandQuantity = Number(
    adjustmentResult.rows[0]?.net_canceled ?? 0
  );

  const unitResult = await client.query<{
    order_id: string;
    production_status: string | null;
    current_department: string | null;
    is_fulfilled: boolean | null;
    has_shipment: boolean;
  }>(
    `SELECT DISTINCT ON (prod.order_id)
       prod.order_id,
       prod.production_status,
       prod.current_department,
       prod.is_fulfilled,
       EXISTS (
         SELECT 1
           FROM shipment_items si
           JOIN shipment_records sr ON sr.id = si.shipment_id
          WHERE si.order_id = prod.order_id
       ) AS has_shipment
       FROM production_orders prod
      WHERE prod.po_item_id = $1
      ORDER BY prod.order_id, prod.id DESC`,
    [purchaseOrderItemId]
  );
  const shipmentOnlyResult = await client.query<{
    order_id: string;
    quantity: number;
  }>(
    `SELECT si.order_id, MAX(si.quantity)::integer AS quantity
       FROM shipment_items si
       JOIN shipment_records sr ON sr.id = si.shipment_id
      WHERE si.po_item_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM production_orders prod
           WHERE prod.po_item_id = $1
             AND prod.order_id = si.order_id
        )
      GROUP BY si.order_id`,
    [purchaseOrderItemId]
  );

  const productionUnits: P1ProductionUnitRow[] = unitResult.rows.map((row) => ({
    orderId: row.order_id,
    productionStatus: row.production_status,
    currentDepartment: row.current_department,
    isFulfilled: row.is_fulfilled,
    hasShipment: row.has_shipment,
  }));
  for (const shipment of shipmentOnlyResult.rows) {
    for (let index = 0; index < Number(shipment.quantity); index += 1) {
      productionUnits.push({
        orderId: `${shipment.order_id}#shipment-${index + 1}`,
        productionStatus: 'SHIPPED',
        currentDepartment: 'Shipped',
        isFulfilled: false,
        hasShipment: true,
      });
    }
  }

  return reconcileP1POLine({
    purchaseOrderItemId,
    originalOrderedQuantity: Number(line.quantity),
    canceledDemandQuantity,
    purchaseOrderStatus: line.po_status,
    productionUnits,
  });
}

export async function getP1POLineReconciliation(
  purchaseOrderItemId: number
): Promise<P1POLineReconciliation | null> {
  const client = await pool.connect();
  try {
    return await getLineReconciliationWithClient(client, purchaseOrderItemId);
  } finally {
    client.release();
  }
}

export async function getP1POReconciliation(
  purchaseOrderId: number
): Promise<P1POLineReconciliation[]> {
  const client = await pool.connect();
  try {
    const items = await client.query<{ id: number }>(
      'SELECT id FROM purchase_order_items WHERE po_id = $1 ORDER BY id',
      [purchaseOrderId]
    );
    const lines: P1POLineReconciliation[] = [];
    for (const item of items.rows) {
      const line = await getLineReconciliationWithClient(client, item.id);
      if (line) lines.push(line);
    }
    return lines;
  } finally {
    client.release();
  }
}

export function shouldCloseP1POFromReconciliation(
  lines: P1POLineReconciliation[]
): boolean {
  return (
    lines.length > 0 &&
    lines.some((line) => line.activePoQuantity > 0) &&
    lines.every(
      (line) =>
        line.activePoQuantity === 0 ||
        (line.shippedQuantity >= line.activePoQuantity &&
          line.workInProgressQuantity === 0 &&
          line.pendingQueueQuantity === 0 &&
          line.availableToProgressQuantity === 0)
    )
  );
}

/** Close an OPEN P1 PO when all active customer demand has shipped. */
export async function reconcileAndCloseP1PO(purchaseOrderId: number): Promise<{
  closed: boolean;
  eligible: boolean;
  lines: P1POLineReconciliation[];
}> {
  const lines = await getP1POReconciliation(purchaseOrderId);
  const eligible = shouldCloseP1POFromReconciliation(lines);
  if (!eligible) return { closed: false, eligible, lines };

  const result = await pool.query(
    `UPDATE purchase_orders
        SET status = 'CLOSED', updated_at = NOW()
      WHERE id = $1
        AND UPPER(COALESCE(status, '')) = 'OPEN'
      RETURNING id`,
    [purchaseOrderId]
  );

  return { closed: result.rowCount === 1, eligible, lines };
}

export async function getP1QuantityAdjustmentHistory(
  purchaseOrderItemId: number,
  expectedPurchaseOrderId?: number
): Promise<P1QuantityAdjustment[]> {
  const result = await pool.query<{
    id: string;
    purchase_order_item_id: number;
    adjustment_type: P1AdjustmentType;
    quantity: number;
    reason: string;
    effective_at: Date;
    created_at: Date;
    created_by_user_id: number;
    created_by_display_name: string | null;
    source: string | null;
    reference: string | null;
    idempotency_key: string | null;
  }>(
    `SELECT adj.*
       FROM purchase_order_item_quantity_adjustments adj
       JOIN purchase_order_items poi ON poi.id = adj.purchase_order_item_id
      WHERE adj.purchase_order_item_id = $1
       ${expectedPurchaseOrderId ? 'AND poi.po_id = $2' : ''}
      ORDER BY adj.effective_at, adj.created_at, adj.id`,
    expectedPurchaseOrderId
      ? [purchaseOrderItemId, expectedPurchaseOrderId]
      : [purchaseOrderItemId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    purchaseOrderItemId: row.purchase_order_item_id,
    adjustmentType: row.adjustment_type,
    quantity: Number(row.quantity),
    reason: row.reason,
    effectiveAt: row.effective_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    createdByDisplayName: row.created_by_display_name,
    source: row.source,
    reference: row.reference,
    idempotencyKey: row.idempotency_key,
  }));
}

export class P1QuantityAdjustmentConflict extends Error {
  constructor(
    message: string,
    public readonly reconciliation: P1POLineReconciliation
  ) {
    super(message);
  }
}

export function validateP1QuantityAdjustment(
  current: P1POLineReconciliation,
  adjustmentType: P1AdjustmentType,
  quantity: number
): number {
  const proposedCanceled =
    adjustmentType === 'CANCEL_QUANTITY'
      ? current.canceledDemandQuantity + quantity
      : current.canceledDemandQuantity - quantity;

  if (proposedCanceled < 0) {
    throw new P1QuantityAdjustmentConflict(
      'Restore quantity exceeds currently canceled customer demand',
      current
    );
  }
  if (proposedCanceled > current.originalOrderedQuantity) {
    throw new P1QuantityAdjustmentConflict(
      'Cancellation exceeds the original ordered quantity',
      current
    );
  }

  const proposedActive = current.isCanceled
    ? 0
    : current.originalOrderedQuantity - proposedCanceled;
  if (
    adjustmentType === 'CANCEL_QUANTITY' &&
    proposedActive < current.accountedQuantity
  ) {
    throw new P1QuantityAdjustmentConflict(
      'Cancellation would reduce active PO demand below shipped, in-progress, and pending units',
      current
    );
  }
  return proposedCanceled;
}

export async function createP1QuantityAdjustment(input: {
  purchaseOrderId: number;
  purchaseOrderItemId: number;
  adjustmentType: P1AdjustmentType;
  quantity: number;
  reason: string;
  createdByUserId: number;
  createdByDisplayName: string;
  effectiveAt?: Date;
  source?: string | null;
  reference?: string | null;
  idempotencyKey?: string | null;
}): Promise<{
  adjustment: P1QuantityAdjustment;
  reconciliation: P1POLineReconciliation;
  replayed: boolean;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await getLineReconciliationWithClient(
      client,
      input.purchaseOrderItemId,
      true,
      input.purchaseOrderId
    );
    if (!current) throw new Error('P1 purchase-order line not found');

    if (input.idempotencyKey) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM purchase_order_item_quantity_adjustments
          WHERE purchase_order_item_id = $1 AND idempotency_key = $2`,
        [input.purchaseOrderItemId, input.idempotencyKey]
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        const history = await getP1QuantityAdjustmentHistory(
          input.purchaseOrderItemId,
          input.purchaseOrderId
        );
        return {
          adjustment: history.find(
            (entry) => entry.id === existing.rows[0].id
          )!,
          reconciliation: current,
          replayed: true,
        };
      }
    }

    validateP1QuantityAdjustment(current, input.adjustmentType, input.quantity);

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO purchase_order_item_quantity_adjustments (
         purchase_order_item_id, adjustment_type, quantity, reason,
         effective_at, created_by_user_id, created_by_display_name,
         source, reference, idempotency_key
       ) VALUES ($1,$2,$3,$4,COALESCE($5, now()),$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        input.purchaseOrderItemId,
        input.adjustmentType,
        input.quantity,
        input.reason.trim(),
        input.effectiveAt ?? null,
        input.createdByUserId,
        input.createdByDisplayName,
        input.source ?? 'P1_PURCHASE_ORDERS_UI',
        input.reference ?? null,
        input.idempotencyKey ?? null,
      ]
    );
    const reconciliation = await getLineReconciliationWithClient(
      client,
      input.purchaseOrderItemId
    );
    await client.query('COMMIT');

    const history = await getP1QuantityAdjustmentHistory(
      input.purchaseOrderItemId,
      input.purchaseOrderId
    );
    return {
      adjustment: history.find(
        (entry) => entry.id === insertResult.rows[0].id
      )!,
      reconciliation: reconciliation!,
      replayed: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createP1QuantityAdjustmentBatch(input: {
  purchaseOrderId: number;
  adjustments: Array<{
    purchaseOrderItemId: number;
    adjustmentType: P1AdjustmentType;
    quantity: number;
    reason: string;
    createdByUserId: number;
    createdByDisplayName: string;
    effectiveAt?: Date;
    source?: string | null;
    reference?: string | null;
    idempotencyKey: string;
    importRowId?: string;
    priorCanceledQuantity?: number;
  }>;
}): Promise<Array<{ adjustmentId: string; purchaseOrderItemId: number }>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ordered = [...input.adjustments].sort(
      (a, b) => a.purchaseOrderItemId - b.purchaseOrderItemId
    );
    const inserted: Array<{
      adjustmentId: string;
      purchaseOrderItemId: number;
    }> = [];

    for (const adjustment of ordered) {
      const current = await getLineReconciliationWithClient(
        client,
        adjustment.purchaseOrderItemId,
        true,
        input.purchaseOrderId
      );
      if (!current) throw new Error('P1 purchase-order line not found');

      const existing = await client.query<{ id: string }>(
        `SELECT id
           FROM purchase_order_item_quantity_adjustments
          WHERE purchase_order_item_id = $1
            AND idempotency_key = $2`,
        [adjustment.purchaseOrderItemId, adjustment.idempotencyKey]
      );
      if (existing.rows[0]) {
        inserted.push({
          adjustmentId: existing.rows[0].id,
          purchaseOrderItemId: adjustment.purchaseOrderItemId,
        });
        continue;
      }

      validateP1QuantityAdjustment(
        current,
        adjustment.adjustmentType,
        adjustment.quantity
      );
      const result = await client.query<{ id: string }>(
        `INSERT INTO purchase_order_item_quantity_adjustments (
           purchase_order_item_id, adjustment_type, quantity, reason,
           effective_at, created_by_user_id, created_by_display_name,
           source, reference, idempotency_key
         ) VALUES ($1,$2,$3,$4,COALESCE($5, now()),$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          adjustment.purchaseOrderItemId,
          adjustment.adjustmentType,
          adjustment.quantity,
          adjustment.reason.trim(),
          adjustment.effectiveAt ?? null,
          adjustment.createdByUserId,
          adjustment.createdByDisplayName,
          adjustment.source ?? 'P1_CUSTOMER_DOCUMENT_IMPORT',
          adjustment.reference ?? null,
          adjustment.idempotencyKey,
        ]
      );
      inserted.push({
        adjustmentId: result.rows[0].id,
        purchaseOrderItemId: adjustment.purchaseOrderItemId,
      });
      if (adjustment.importRowId) {
        await client.query(
          `UPDATE p1_customer_po_document_import_rows
              SET prior_canceled_quantity = $2,
                  applied_cancellation_quantity = $3,
                  adjustment_id = $4,
                  validation_status = 'APPLIED',
                  validation_message = 'Cancellation applied from customer document'
            WHERE id = $1`,
          [
            adjustment.importRowId,
            adjustment.priorCanceledQuantity ?? current.canceledDemandQuantity,
            adjustment.quantity,
            result.rows[0].id,
          ]
        );
      }
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
