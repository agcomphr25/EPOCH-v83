import { createHash } from 'crypto';

import type { PoolClient } from 'pg';

import { pool } from '../../db';
import {
  P2DemandQuantityError,
  validateDemandDelta,
  type P2DemandEventType,
} from './p2CustomerDemandQuantityPolicy';

export { P2DemandQuantityError } from './p2CustomerDemandQuantityPolicy';

async function lockLine(client: PoolClient, poId: number, itemId: number) {
  const result = await client.query(
    `SELECT poi.id,poi.po_id,poi.quantity,poi.demand_line_identity,poi.part_number,
            'EA'::text unit_of_measure
       FROM p2_purchase_order_items poi
      WHERE poi.id=$1 AND poi.po_id=$2 FOR UPDATE`,
    [itemId, poId]
  );
  if (!result.rows[0])
    throw new P2DemandQuantityError(
      'P2_DEMAND_LINE_NOT_FOUND',
      'The customer purchase-order line was not found.',
      404
    );
  return result.rows[0];
}

export async function getP2DemandQuantityHistory(poId: number, itemId: number) {
  const result = await pool.query(
    `SELECT poi.id po_item_id,poi.po_id,poi.part_number,poi.quantity original_quantity,
            poi.demand_line_identity,
            COALESCE(sum(e.quantity_delta),0)::numeric quantity_delta,
            (poi.quantity+COALESCE(sum(e.quantity_delta),0))::numeric effective_quantity,
            COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.effective_at,e.id)
              FILTER (WHERE e.id IS NOT NULL),'[]'::jsonb) events
       FROM p2_purchase_order_items poi
       LEFT JOIN p2_customer_demand_quantity_events e
         ON e.po_item_id=poi.id
      WHERE poi.id=$1 AND poi.po_id=$2
      GROUP BY poi.id`,
    [itemId, poId]
  );
  if (!result.rows[0])
    throw new P2DemandQuantityError(
      'P2_DEMAND_LINE_NOT_FOUND',
      'The customer purchase-order line was not found.',
      404
    );
  return result.rows[0];
}

export async function recordP2DemandQuantityEvent(input: {
  poId: number;
  itemId: number;
  eventType: P2DemandEventType;
  quantityDelta: number;
  unitOfMeasure: string;
  reason: string;
  customerEvidenceReference?: string | null;
  idempotencyKey: string;
  actor: { userId: number; displayName: string; role: string };
}) {
  validateDemandDelta(input.eventType, input.quantityDelta);
  if (
    input.eventType.startsWith('CUSTOMER_') &&
    !input.customerEvidenceReference?.trim()
  )
    throw new P2DemandQuantityError(
      'CUSTOMER_EVIDENCE_REQUIRED',
      'Customer evidence is required for customer-demand cancellation or reinstatement.',
      400
    );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const line = await lockLine(client, input.poId, input.itemId);
    const replay = await client.query(
      `SELECT * FROM p2_customer_demand_quantity_events
        WHERE demand_line_identity=$1 AND idempotency_key=$2`,
      [line.demand_line_identity, input.idempotencyKey]
    );
    if (replay.rows[0]) {
      const prior = replay.rows[0];
      if (
        prior.event_type !== input.eventType ||
        Number(prior.quantity_delta) !== input.quantityDelta ||
        prior.unit_of_measure !== input.unitOfMeasure.trim() ||
        (prior.customer_evidence_reference ?? null) !==
          (input.customerEvidenceReference?.trim() || null) ||
        prior.reason !== input.reason.trim()
      )
        throw new P2DemandQuantityError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different customer-demand change.'
        );
      await client.query('COMMIT');
      return { event: replay.rows[0], replayed: true };
    }
    const state = await client.query(
      `SELECT COALESCE(sum(quantity_delta),0)::numeric delta
         FROM p2_customer_demand_quantity_events WHERE po_item_id=$1`,
      [input.itemId]
    );
    const chain = await client.query(
      `SELECT event_hash prior_hash FROM p2_customer_demand_quantity_events
        WHERE demand_line_identity=$1 ORDER BY effective_at DESC,id DESC LIMIT 1`,
      [line.demand_line_identity]
    );
    const effective =
      Number(line.quantity) +
      Number(state.rows[0]?.delta ?? 0) +
      input.quantityDelta;
    if (effective < 0)
      throw new P2DemandQuantityError(
        'DEMAND_QUANTITY_BELOW_ZERO',
        'The change exceeds the remaining customer demand.'
      );
    const time = (await client.query(`SELECT clock_timestamp() effective_at`))
      .rows[0].effective_at;
    const priorHash = chain.rows[0]?.prior_hash ?? null;
    const eventHash = createHash('sha256')
      .update(
        JSON.stringify([
          priorHash,
          line.demand_line_identity,
          input.eventType,
          input.quantityDelta,
          input.unitOfMeasure,
          input.customerEvidenceReference?.trim() || null,
          input.reason.trim(),
          new Date(time).toISOString(),
        ])
      )
      .digest('hex');
    const inserted = await client.query(
      `INSERT INTO p2_customer_demand_quantity_events
       (demand_line_identity,po_id,po_item_id,event_type,quantity_delta,unit_of_measure,
        effective_at,customer_evidence_reference,reason,idempotency_key,prior_event_hash,event_hash,
        recorded_by,recorded_by_display_name,recorded_by_role)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        line.demand_line_identity,
        input.poId,
        input.itemId,
        input.eventType,
        input.quantityDelta,
        input.unitOfMeasure.trim(),
        time,
        input.customerEvidenceReference?.trim() || null,
        input.reason.trim(),
        input.idempotencyKey,
        priorHash,
        eventHash,
        input.actor.userId,
        input.actor.displayName,
        input.actor.role,
      ]
    );
    await client.query('COMMIT');
    return {
      event: inserted.rows[0],
      replayed: false,
      effectiveQuantity: effective,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
