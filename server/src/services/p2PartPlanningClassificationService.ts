import { createHash } from 'crypto';

import { pool } from '../../db';
import { P2DemandQuantityError } from './p2CustomerDemandQuantityPolicy';

export type PlanningClassification =
  | 'MANUFACTURED'
  | 'PURCHASED'
  | 'RAW_MATERIAL'
  | 'CUSTOMER_SUPPLIED';

type Actor = { userId: number; displayName: string; role: string };
const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function getPlanningClassificationHistory(
  inventoryItemId: number
) {
  const result = await pool.query(
    `SELECT c.*,ii.ag_part_number,ii.name part_name
       FROM p2_part_planning_classifications c
       JOIN inventory_items ii ON ii.id=c.inventory_item_id
      WHERE c.inventory_item_id=$1 ORDER BY c.revision_number DESC`,
    [inventoryItemId]
  );
  return result.rows;
}

export async function createPlanningClassificationDraft(input: {
  inventoryItemId: number;
  classification: PlanningClassification;
  partConfigurationRevision: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  ownershipSource: string;
  sourceRecordType: string;
  sourceRecordId: string;
  sourceRevision: string;
  changeReason: string;
  actor: Actor;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock($1,$2)`, [
      7312,
      input.inventoryItemId,
    ]);
    const item = await client.query(
      `SELECT id FROM inventory_items WHERE id=$1 FOR SHARE`,
      [input.inventoryItemId]
    );
    if (!item.rows[0])
      throw new P2DemandQuantityError(
        'PART_NOT_FOUND',
        'The part master record was not found.',
        404
      );
    const revision = await client.query(
      `SELECT COALESCE(max(revision_number),0)+1 revision
         FROM p2_part_planning_classifications WHERE inventory_item_id=$1`,
      [input.inventoryItemId]
    );
    const revisionNumber = Number(revision.rows[0].revision);
    const content = {
      inventoryItemId: input.inventoryItemId,
      revisionNumber,
      classification: input.classification,
      partConfigurationRevision: input.partConfigurationRevision.trim(),
      effectiveFrom: input.effectiveFrom || null,
      effectiveTo: input.effectiveTo || null,
      ownershipSource: input.ownershipSource.trim(),
      sourceRecordType: input.sourceRecordType.trim(),
      sourceRecordId: input.sourceRecordId.trim(),
      sourceRevision: input.sourceRevision.trim(),
      changeReason: input.changeReason.trim(),
    };
    const inserted = await client.query(
      `INSERT INTO p2_part_planning_classifications
       (inventory_item_id,revision_number,classification,part_configuration_revision,
        effective_from,effective_to,ownership_source,source_record_type,source_record_id,
        source_revision,change_reason,content_checksum,created_by,created_by_display_name,created_by_role)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        input.inventoryItemId,
        revisionNumber,
        input.classification,
        content.partConfigurationRevision,
        input.effectiveFrom || null,
        input.effectiveTo || null,
        content.ownershipSource,
        content.sourceRecordType,
        content.sourceRecordId,
        content.sourceRevision,
        content.changeReason,
        checksum(content),
        input.actor.userId,
        input.actor.displayName,
        input.actor.role,
      ]
    );
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function releasePlanningClassification(
  inventoryItemId: number,
  classificationId: string,
  expectedConcurrencyVersion: number,
  actor: Actor
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock($1,$2)`, [
      7312,
      inventoryItemId,
    ]);
    const draft = await client.query(
      `SELECT * FROM p2_part_planning_classifications
        WHERE id=$1 AND inventory_item_id=$2 FOR UPDATE`,
      [classificationId, inventoryItemId]
    );
    const row = draft.rows[0];
    if (!row)
      throw new P2DemandQuantityError(
        'CLASSIFICATION_NOT_FOUND',
        'The classification revision was not found.',
        404
      );
    if (row.status !== 'DRAFT')
      throw new P2DemandQuantityError(
        'CLASSIFICATION_NOT_DRAFT',
        'Only a draft classification can be released.'
      );
    if (Number(row.concurrency_version) !== expectedConcurrencyVersion)
      throw new P2DemandQuantityError(
        'CLASSIFICATION_VERSION_CONFLICT',
        'The classification changed; reload before releasing.'
      );
    if (Number(row.created_by) === actor.userId)
      throw new P2DemandQuantityError(
        'INDEPENDENT_RELEASE_REQUIRED',
        'A different authorized person must release the classification.',
        403
      );
    const current = await client.query(
      `SELECT id FROM p2_part_planning_classifications
        WHERE inventory_item_id=$1 AND status='RELEASED' AND effective_to IS NULL
        FOR UPDATE`,
      [inventoryItemId]
    );
    if (
      current.rows.length &&
      row.effective_from &&
      new Date(row.effective_from).getTime() > Date.now()
    )
      throw new P2DemandQuantityError(
        'FUTURE_EFFECTIVITY_TRANSITION_REQUIRED',
        'A future classification cannot silently end the currently released classification. Create an authorized effectivity transition first.'
      );
    const overlap = await client.query(
      `SELECT id FROM p2_part_planning_classifications
        WHERE inventory_item_id=$1 AND status='RELEASED' AND effective_to IS NOT NULL
          AND tstzrange(COALESCE(effective_from,'-infinity'::timestamptz),effective_to,'[)') &&
              tstzrange(COALESCE($2::timestamptz,'-infinity'::timestamptz),
                        COALESCE($3::timestamptz,'infinity'::timestamptz),'[)')
        LIMIT 1`,
      [inventoryItemId, row.effective_from, row.effective_to]
    );
    if (overlap.rows[0])
      throw new P2DemandQuantityError(
        'CLASSIFICATION_EFFECTIVITY_CONFLICT',
        'This classification overlaps another released classification.'
      );
    await client.query(
      `UPDATE p2_part_planning_classifications
          SET status='SUPERSEDED',updated_at=now(),concurrency_version=concurrency_version+1
        WHERE inventory_item_id=$1 AND status='RELEASED' AND effective_to IS NULL`,
      [inventoryItemId]
    );
    const released = await client.query(
      `UPDATE p2_part_planning_classifications
          SET status='RELEASED',released_by=$3,released_by_display_name=$4,released_by_role=$5,
              released_at=clock_timestamp(),updated_at=now(),concurrency_version=concurrency_version+1
        WHERE id=$1 AND inventory_item_id=$2 AND status='DRAFT' AND concurrency_version=$6 RETURNING *`,
      [
        classificationId,
        inventoryItemId,
        actor.userId,
        actor.displayName,
        actor.role,
        expectedConcurrencyVersion,
      ]
    );
    if (!released.rows[0])
      throw new P2DemandQuantityError(
        'CLASSIFICATION_VERSION_CONFLICT',
        'The classification changed; reload before releasing.'
      );
    await client.query('COMMIT');
    return released.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
