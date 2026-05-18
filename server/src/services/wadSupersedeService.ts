/**
 * wadSupersedeService — Task #258
 *
 * When a project has a pre-WAD (P2) work order assigned for a given part,
 * the WAD-generated work order for that same part on that project is
 * redundant. This service cancels redundant WAD WOs and records an audit
 * event capturing which P2 WO superseded them.
 *
 * Idempotent: already-CANCELLED / COMPLETED WAD WOs are skipped, so it is
 * safe to call from the link-po path, from WAD generation, and from the
 * one-time backfill script.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';

type Executor = AuditLedgerTx;

export interface CancelSupersededWadOptions {
  tx?: Executor;
  actor?: { id?: number | null; username?: string | null; role?: string | null };
  reasonPrefix?: string;
  sourceService?: string;
}

export interface CancelledWadRecord {
  productionWorkOrderId: string;
  workOrderNumber: string;
  partNumber: string;
  previousStatus: string;
  supersedingP2PoNumbers: string[];
}

export interface CancelSupersededWadResult {
  projectId: string;
  cancelledCount: number;
  cancelled: CancelledWadRecord[];
}

interface CandidateRow {
  id: string;
  workOrderNumber: string;
  partNumber: string;
  status: string;
  supersedingPoNumbers: string[] | null;
}

interface UpdateResultRow {
  id: string;
}

interface PgQueryResult<T> {
  rows: T[];
}

function asRows<T>(result: unknown): T[] {
  if (result && typeof result === 'object' && Array.isArray((result as PgQueryResult<T>).rows)) {
    return (result as PgQueryResult<T>).rows;
  }
  if (Array.isArray(result)) {
    return result as T[];
  }
  return [];
}

/**
 * Find every active WAD `production_work_orders` row on `projectId` whose
 * part number is already covered by a P2 PO linked to the project, mark
 * them CANCELLED, and record an audit event per cancellation.
 *
 * Errors propagate to the caller — callers MUST run this inside the same
 * transaction as the P2-link / WAD-create write so partial state cannot
 * persist if cancellation fails.
 */
export async function cancelWadWorkOrdersSupersededByP2(
  projectId: string,
  options: CancelSupersededWadOptions = {},
): Promise<CancelSupersededWadResult> {
  const sourceService = options.sourceService ?? 'wadSupersedeService';
  const reasonPrefix = options.reasonPrefix ?? 'Superseded by P2 work order';
  const executor: Executor = options.tx ?? db;

  const candidates = await findCandidates(projectId, executor);
  if (candidates.length === 0) {
    return { projectId, cancelledCount: 0, cancelled: [] };
  }

  const cancelled: CancelledWadRecord[] = [];
  for (const row of candidates) {
    const supersedingNumbers = row.supersedingPoNumbers ?? [];
    const reason = supersedingNumbers.length
      ? `${reasonPrefix} ${supersedingNumbers.join(', ')}`
      : reasonPrefix;

    const updated = await markCancelled(row.id, executor);
    if (!updated) continue;

    cancelled.push({
      productionWorkOrderId: row.id,
      workOrderNumber: row.workOrderNumber,
      partNumber: row.partNumber,
      previousStatus: row.status,
      supersedingP2PoNumbers: supersedingNumbers,
    });

    await recordAuditEvent(
      {
        eventType: 'WAD_WO_SUPERSEDED_BY_P2',
        subjectType: 'production_work_order',
        subjectId: row.id,
        sourceService,
        actor: options.actor,
        reason,
        payload: {
          projectId,
          workOrderNumber: row.workOrderNumber,
          partNumber: row.partNumber,
          previousStatus: row.status,
          supersedingP2PoNumbers: supersedingNumbers,
        },
      },
      options.tx,
    );
  }

  return { projectId, cancelledCount: cancelled.length, cancelled };
}

async function findCandidates(
  projectId: string,
  executor: Executor,
): Promise<CandidateRow[]> {
  const result = await executor.execute(sql`
    WITH project_po_link AS (
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = ${projectId}::uuid AND p.po_id IS NOT NULL
      UNION
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = ${projectId}::uuid AND ps.linked_p2_order_id IS NOT NULL
    ),
    p2_parts AS (
      SELECT DISTINCT
        TRIM(poi.part_number) AS part_number,
        po.po_number AS po_number
      FROM project_po_link ppl
      JOIN p2_purchase_orders po ON po.id = ppl.po_id
      JOIN p2_purchase_order_items poi ON poi.po_id = po.id
      WHERE poi.part_number IS NOT NULL
        AND TRIM(poi.part_number) <> ''
    ),
    p2_parts_agg AS (
      SELECT
        part_number,
        ARRAY_AGG(DISTINCT po_number ORDER BY po_number) AS po_numbers
      FROM p2_parts
      GROUP BY part_number
    )
    SELECT
      wo.id::text AS id,
      wo.work_order_number AS "workOrderNumber",
      wo.part_number AS "partNumber",
      wo.status AS status,
      pp.po_numbers AS "supersedingPoNumbers"
    FROM production_work_orders wo
    JOIN p2_parts_agg pp ON TRIM(wo.part_number) = pp.part_number
    WHERE wo.project_id = ${projectId}::uuid
      AND wo.status NOT IN ('CANCELLED', 'CANCELED', 'COMPLETE', 'COMPLETED', 'CLOSED')
      AND wo.work_order_number LIKE 'WAD-%'
  `);

  return asRows<CandidateRow>(result).map((r) => ({
    id: String(r.id),
    workOrderNumber: String(r.workOrderNumber ?? ''),
    partNumber: String(r.partNumber ?? ''),
    status: String(r.status ?? ''),
    supersedingPoNumbers: Array.isArray(r.supersedingPoNumbers)
      ? r.supersedingPoNumbers
      : null,
  }));
}

async function markCancelled(
  workOrderId: string,
  executor: Executor,
): Promise<boolean> {
  const result = await executor.execute(sql`
    UPDATE production_work_orders
    SET status = 'CANCELLED', updated_at = NOW()
    WHERE id = ${workOrderId}::uuid
      AND status NOT IN ('CANCELLED', 'CANCELED', 'COMPLETE', 'COMPLETED', 'CLOSED')
    RETURNING id
  `);
  return asRows<UpdateResultRow>(result).length > 0;
}
