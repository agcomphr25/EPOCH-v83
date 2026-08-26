import { createHash, randomUUID } from 'node:crypto';

import { pool } from '../../db';

type Actor = {
  userId: number;
  employeeId: number | null;
  displayName: string;
  role: string;
};
type PrintInput = {
  labelFormat: 'avery-5160' | 'avery-5163' | 'receiving-4x6';
  printerName: string;
  copies: number;
  reprintReason?: string;
  idempotencyKey: string;
};
const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class P2ReceivingBarcodeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409
  ) {
    super(message);
  }
}

export async function resolveP2ReceivingBarcodeIdentity(
  receiptId: number,
  unitId: number,
  actor: Actor
) {
  if (!actor.employeeId)
    throw new P2ReceivingBarcodeError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `p2-receiving-barcode:${unitId}`,
    ]);
    const existing = await client.query(
      `SELECT * FROM p2_receiving_barcode_identities WHERE received_unit_id=$1`,
      [unitId]
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return existing.rows[0];
    }
    const source = await client.query(
      `SELECT u.*,r.receipt_number,r.vendor_po_id,r.vendor_po_number,r.vendor_id,r.vendor_name,
        l.ag_part_number,l.description,i.id inventory_item_id,i.revision item_revision,
        p.id policy_id,p.revision_number policy_revision,p.policy_type,p.content_checksum policy_checksum,
        p.shelf_life_controlled,p.heat_lot_required,p.date_code_required,p.coc_required,
        p.material_certification_required,p.test_report_required,p.receiving_inspection_required,p.customer_custody_required
       FROM received_units u JOIN receipts r ON r.id=u.receipt_id JOIN receipt_lines l ON l.id=u.receipt_line_id
       JOIN inventory_items i ON lower(btrim(i.ag_part_number))=lower(btrim(l.ag_part_number))
       JOIN inventory_item_traceability_policies p ON p.inventory_item_id=i.id AND p.status='RELEASED' AND p.effective_to IS NULL
       WHERE u.id=$1 AND u.receipt_id=$2 FOR UPDATE OF u`,
      [unitId, receiptId]
    );
    if (source.rows.length !== 1)
      throw new P2ReceivingBarcodeError(
        'RECEIVING_BARCODE_AUTHORITY_MISSING',
        'Resolve one exact Inventory Item and released traceability policy before provisioning a Receiving barcode.',
        422
      );
    const row = source.rows[0];
    const missing: string[] = [];
    if (row.policy_type === 'SERIAL' && !row.serial_number)
      missing.push('serial number');
    if (row.policy_type === 'LOT' && !row.lot_number)
      missing.push('lot number');
    if (row.policy_type === 'BATCH' && !row.batch_number)
      missing.push('batch number');
    if (row.heat_lot_required && !row.heat_lot) missing.push('heat lot');
    if (
      row.shelf_life_controlled &&
      (!row.manufacture_date || !row.expiration_date)
    )
      missing.push('manufacture and expiration dates');
    if (row.coc_required && !row.cert_reference)
      missing.push('certificate reference');
    if (missing.length)
      throw new P2ReceivingBarcodeError(
        'RECEIVING_TRACEABILITY_EVIDENCE_REQUIRED',
        `Complete required Receiving evidence: ${missing.join(', ')}.`,
        422
      );
    const internalIdentity = `P2-RCV:${unitId}:${randomUUID()}`;
    const barcodeValue = `P2RCV:${randomUUID()}`;
    const snapshot = {
      receivedUnitId: unitId,
      receiptId,
      receiptLineId: row.receipt_line_id,
      inventoryItemId: row.inventory_item_id,
      itemRevision: row.item_revision,
      agPartNumber: row.ag_part_number,
      description: row.description,
      quantity: row.quantity,
      uom: row.uom,
      supplierIdentity: {
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
      },
      vendorPurchaseOrder: {
        id: row.vendor_po_id,
        number: row.vendor_po_number,
      },
      traceabilityPolicy: {
        id: row.policy_id,
        revision: row.policy_revision,
        type: row.policy_type,
        checksum: row.policy_checksum,
      },
      evidence: {
        lotNumber: row.lot_number,
        batchNumber: row.batch_number,
        serialNumber: row.serial_number,
        heatLot: row.heat_lot,
        manufactureDate: row.manufacture_date,
        expirationDate: row.expiration_date,
        certReference: row.cert_reference,
      },
      dispositionAtProvisioning: row.disposition,
    };
    const saved = await client.query(
      `INSERT INTO p2_receiving_barcode_identities (received_unit_id,receipt_id,receipt_line_id,inventory_item_id,traceability_policy_id,traceability_policy_type,internal_identity,barcode_value,authority_snapshot,authority_checksum,created_by_user_id,created_by_employee_id,created_by_display_name,created_by_role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING *`,
      [
        unitId,
        receiptId,
        row.receipt_line_id,
        row.inventory_item_id,
        row.policy_id,
        row.policy_type,
        internalIdentity,
        barcodeValue,
        JSON.stringify(snapshot),
        checksum(snapshot),
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    await client.query('COMMIT');
    return saved.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordP2ReceivingBarcodePrint(
  receiptId: number,
  unitId: number,
  input: PrintInput,
  actor: Actor
) {
  const identity = await resolveP2ReceivingBarcodeIdentity(
    receiptId,
    unitId,
    actor
  );
  const prior = await pool.query(
    `SELECT count(*)::int count FROM p2_receiving_barcode_print_events WHERE identity_id=$1`,
    [identity.id]
  );
  if (prior.rows[0].count > 0 && !input.reprintReason?.trim())
    throw new P2ReceivingBarcodeError(
      'REPRINT_REASON_REQUIRED',
      'A reprint reason is required after the first controlled print.',
      422
    );
  const requestHash = checksum({ identityId: identity.id, ...input });
  const replay = await pool.query(
    `SELECT * FROM p2_receiving_barcode_print_events WHERE identity_id=$1 AND request_key=$2`,
    [identity.id, input.idempotencyKey]
  );
  if (replay.rows[0]) {
    if (replay.rows[0].request_hash !== requestHash)
      throw new P2ReceivingBarcodeError(
        'PRINT_IDEMPOTENCY_CONFLICT',
        'The print idempotency key was used with different evidence.'
      );
    return { replayed: true, identity, event: replay.rows[0] };
  }
  const saved = await pool.query(
    `INSERT INTO p2_receiving_barcode_print_events (identity_id,received_unit_id,barcode_value,label_format,printer_name,copies,reprint_reason,request_key,request_hash,actor_user_id,actor_employee_id,actor_display_name,actor_role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      identity.id,
      unitId,
      identity.barcode_value,
      input.labelFormat,
      input.printerName.trim(),
      input.copies,
      input.reprintReason?.trim() || null,
      input.idempotencyKey,
      requestHash,
      actor.userId,
      actor.employeeId,
      actor.displayName,
      actor.role,
    ]
  );
  return {
    replayed: false,
    identity,
    event: saved.rows[0],
    changesInventory: false,
  };
}
