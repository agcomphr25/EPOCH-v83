/**
 * Backfill P2 used cutting packets.
 *
 * Finds packet scans that were saved before packet consumption was wired into
 * P2 traveler task start, resolves display barcodes back to built packets, marks
 * those packets CONSUMED, and inserts missing packet/fabric traceability rows.
 *
 * Dry run:
 *   npx tsx server/scripts/backfillP2UsedPackets.ts
 *
 * Apply:
 *   APPLY=1 npx tsx server/scripts/backfillP2UsedPackets.ts
 */

import { and, asc, desc, eq, like } from 'drizzle-orm';
import { db, pgPool } from '../db';
import {
  cuttingBuiltPacketFabricSources,
  cuttingBuiltPackets,
  cuttingFabricInventory,
  p2SerializedItemEvents,
  p2SerializedItemTraceability,
  p2SerializedItems,
  p2WorkTasks,
} from '../schema';

type Candidate = {
  serializedItemId: string;
  department: string;
  barcode: string;
  recordedBy: string;
  recordedAt: Date;
  source: string;
  workTaskId?: string;
  builtPacketId?: number;
};

const BATCH_SIZE = 100;
const APPLY = process.env.APPLY === '1' || process.argv.includes('--apply');

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function getTraceValue(item: any): string {
  return typeof item?.value === 'string' ? item.value.trim() : '';
}

function isPacketLikeTrace(item: any): boolean {
  const text = [
    item?.type,
    item?.label,
    item?.traceabilityType,
    item?.traceabilityLabel,
    item?.value,
    item?.traceabilityValue,
    item?.packetBarcode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return Boolean(
    item?.builtPacketId ||
    item?.packetBarcode ||
    text.includes('packet') ||
    text.includes('mfg-') ||
    text.includes('pkt-') ||
    /-q\d+-\d+$/i.test(text)
  );
}

function normalizeCandidateKey(candidate: Candidate): string {
  return [
    candidate.serializedItemId,
    candidate.department,
    candidate.builtPacketId || '',
    candidate.barcode.toUpperCase(),
  ].join('|');
}

async function resolvePacket(candidate: Candidate): Promise<typeof cuttingBuiltPackets.$inferSelect | null> {
  if (candidate.builtPacketId) {
    const packet = await db.query.cuttingBuiltPackets.findFirst({
      where: eq(cuttingBuiltPackets.id, candidate.builtPacketId),
    });
    if (packet) return packet;
  }

  const barcode = candidate.barcode.trim();
  const exact = await db.query.cuttingBuiltPackets.findFirst({
    where: eq(cuttingBuiltPackets.barcode, barcode),
  });
  if (exact) return exact;

  const mfgMatch = barcode.match(/^MFG-(\d+)-(.+?)(?:-(\d+))?$/i);
  const legacyQueueMatch = barcode.match(/^(.+)-Q(\d+)-(\d+)$/i);
  if (!mfgMatch && !legacyQueueMatch) return null;

  const queueId = parseInt(mfgMatch ? mfgMatch[1] : legacyQueueMatch![2], 10);
  const sequenceText = mfgMatch?.[3] || legacyQueueMatch?.[3] || '';
  const sequence = sequenceText ? parseInt(sequenceText, 10) : null;

  if (sequence !== null) {
    const packetByNumber = await db.query.cuttingBuiltPackets.findFirst({
      where: and(
        like(cuttingBuiltPackets.barcode, `PKT-%-${queueId}-${sequence}-%`),
        eq(cuttingBuiltPackets.packetNumber, sequence)
      ),
    });
    if (packetByNumber) return packetByNumber;

    const rankedPackets = await db
      .select()
      .from(cuttingBuiltPackets)
      .where(like(cuttingBuiltPackets.barcode, `PKT-%-${queueId}-%-%`))
      .orderBy(asc(cuttingBuiltPackets.id));
    if (rankedPackets[sequence - 1]) return rankedPackets[sequence - 1];
  }

  const latestPacket = await db.query.cuttingBuiltPackets.findFirst({
    where: like(cuttingBuiltPackets.barcode, `PKT-%-${queueId}-%-%`),
    orderBy: [desc(cuttingBuiltPackets.id)],
  });
  return latestPacket || null;
}

async function collectCandidatesFromTasks(): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  let offset = 0;

  while (true) {
    const tasks = await db
      .select()
      .from(p2WorkTasks)
      .orderBy(desc(p2WorkTasks.startedAt))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (tasks.length === 0) break;

    for (const task of tasks) {
      for (const item of asArray(task.traceabilityData)) {
        if (!isPacketLikeTrace(item)) continue;
        const barcode = String(item.packetBarcode || getTraceValue(item) || '').trim();
        if (!barcode && !item.builtPacketId) continue;
        candidates.push({
          serializedItemId: task.serializedItemId,
          department: task.department,
          barcode,
          recordedBy: task.employeeName || task.employeeCode || 'backfill',
          recordedAt: task.completedAt || task.startedAt || task.createdAt || new Date(),
          source: 'p2_work_tasks.traceability_data',
          workTaskId: task.id,
          builtPacketId: item.builtPacketId ? Number(item.builtPacketId) : undefined,
        });
      }
    }

    if (tasks.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return candidates;
}

async function collectCandidatesFromTraceability(): Promise<Candidate[]> {
  const records = await db.query.p2SerializedItemTraceability.findMany({
    orderBy: [desc(p2SerializedItemTraceability.createdAt)],
  });

  return records
    .filter(isPacketLikeTrace)
    .map((record) => ({
      serializedItemId: record.serializedItemId,
      department: record.department,
      barcode: record.traceabilityValue.trim(),
      recordedBy: record.recordedBy || 'backfill',
      recordedAt: record.createdAt || new Date(),
      source: 'p2_serialized_item_traceability',
      builtPacketId: record.inventoryPartId && /^\d+$/.test(record.inventoryPartId)
        ? Number(record.inventoryPartId)
        : undefined,
    }))
    .filter((candidate) => candidate.barcode || candidate.builtPacketId);
}

async function collectCandidatesFromAllocatedPackets(): Promise<Candidate[]> {
  const packets = await db.query.cuttingBuiltPackets.findMany({
    where: eq(cuttingBuiltPackets.status, 'ALLOCATED'),
    orderBy: [desc(cuttingBuiltPackets.updatedAt)],
  });

  const candidates: Candidate[] = [];

  for (const packet of packets) {
    if (!packet.allocatedToOrder) continue;

    const serializedItem =
      await db.query.p2SerializedItems.findFirst({ where: eq(p2SerializedItems.id, packet.allocatedToOrder) }) ||
      await db.query.p2SerializedItems.findFirst({ where: eq(p2SerializedItems.barcode, packet.allocatedToOrder) }) ||
      await db.query.p2SerializedItems.findFirst({ where: eq(p2SerializedItems.serialNumber, packet.allocatedToOrder) });

    if (!serializedItem) continue;

    const latestTask = await db.query.p2WorkTasks.findFirst({
      where: eq(p2WorkTasks.serializedItemId, serializedItem.id),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    if (!latestTask) continue;

    candidates.push({
      serializedItemId: serializedItem.id,
      department: latestTask.department || serializedItem.currentDepartment || 'Layup',
      barcode: packet.barcode,
      recordedBy: latestTask.employeeName || packet.consumedBy || packet.createdBy || 'backfill',
      recordedAt: latestTask.completedAt || latestTask.startedAt || packet.updatedAt || packet.buildDate || new Date(),
      source: 'cutting_built_packets.allocated_to_order',
      workTaskId: latestTask.id,
      builtPacketId: packet.id,
    });
  }

  return candidates;
}

async function traceRecordExists(params: {
  serializedItemId: string;
  department: string;
  type: string;
  value: string;
  label?: string;
}) {
  const conditions = [
    eq(p2SerializedItemTraceability.serializedItemId, params.serializedItemId),
    eq(p2SerializedItemTraceability.department, params.department),
    eq(p2SerializedItemTraceability.traceabilityType, params.type),
    eq(p2SerializedItemTraceability.traceabilityValue, params.value),
  ];
  if (params.label) {
    conditions.push(eq(p2SerializedItemTraceability.traceabilityLabel, params.label));
  }

  const existing = await db.query.p2SerializedItemTraceability.findFirst({ where: and(...conditions) });
  return Boolean(existing);
}

async function insertMissingTraceability(candidate: Candidate, packet: typeof cuttingBuiltPackets.$inferSelect) {
  const traceRows: Array<typeof p2SerializedItemTraceability.$inferInsert> = [];

  const packetExists = await traceRecordExists({
    serializedItemId: candidate.serializedItemId,
    department: candidate.department,
    type: 'packet_barcode',
    value: packet.barcode,
  });

  if (!packetExists) {
    traceRows.push({
      serializedItemId: candidate.serializedItemId,
      department: candidate.department,
      inventoryPartId: String(packet.id),
      inventoryPartNumber: packet.barcode,
      traceabilityType: 'packet_barcode',
      traceabilityLabel: 'Packet Barcode',
      traceabilityValue: packet.barcode,
      recordedBy: candidate.recordedBy,
    });
  }

  const sources = await db
    .select({
      sourceId: cuttingBuiltPacketFabricSources.id,
      fabricInventoryId: cuttingBuiltPacketFabricSources.fabricInventoryId,
      fabricType: cuttingBuiltPacketFabricSources.fabricType,
      lotNumber: cuttingBuiltPacketFabricSources.lotNumber,
      batchNumber: cuttingBuiltPacketFabricSources.batchNumber,
      rollNumber: cuttingBuiltPacketFabricSources.rollNumber,
      supplierPartNumber: cuttingBuiltPacketFabricSources.supplierPartNumber,
      internalControlNumber: cuttingBuiltPacketFabricSources.internalControlNumber,
      expirationDate: cuttingBuiltPacketFabricSources.expirationDate,
      invFabric: cuttingFabricInventory.fabric,
      invLotNumber: cuttingFabricInventory.lotNumber,
      invBatchNumber: cuttingFabricInventory.batchNumber,
      invRollNumber: cuttingFabricInventory.rollNumber,
      invInternalControlNumber: cuttingFabricInventory.internalControlNumber,
      invExpirationDate: cuttingFabricInventory.expirationDate,
      invSupplierPartNumber: cuttingFabricInventory.supplierPartNumber,
      invFabricPartNumber: cuttingFabricInventory.fabricPartNumber,
    })
    .from(cuttingBuiltPacketFabricSources)
    .leftJoin(
      cuttingFabricInventory,
      eq(cuttingBuiltPacketFabricSources.fabricInventoryId, cuttingFabricInventory.id)
    )
    .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));

  for (const [index, source] of sources.entries()) {
    const sourceLabel = `Packet ${packet.packetNumber} Source ${index + 1}`;
    const sourcePartNumber = source.supplierPartNumber || source.invSupplierPartNumber || source.invFabricPartNumber || null;
    const fields = [
      ['fabric_type', 'Fabric Type', source.fabricType || source.invFabric],
      ['fabric_lot_number', 'Fabric Lot Number', source.lotNumber || source.invLotNumber],
      ['fabric_batch_number', 'Fabric Batch Number', source.batchNumber || source.invBatchNumber],
      ['fabric_roll_number', 'Fabric Roll Number', source.rollNumber || source.invRollNumber],
      ['fabric_internal_control_number', 'Fabric Internal Control Number', source.internalControlNumber || source.invInternalControlNumber],
      ['fabric_supplier_part_number', 'Fabric Supplier Part Number', sourcePartNumber],
      ['fabric_expiration_date', 'Fabric Expiration Date', source.expirationDate || source.invExpirationDate],
    ] as const;

    for (const [type, label, rawValue] of fields) {
      if (rawValue == null || rawValue === '') continue;
      const value = rawValue instanceof Date ? rawValue.toISOString().slice(0, 10) : String(rawValue);
      const exists = await traceRecordExists({
        serializedItemId: candidate.serializedItemId,
        department: candidate.department,
        type,
        value,
        label: `${sourceLabel} - ${label}`,
      });
      if (exists) continue;

      traceRows.push({
        serializedItemId: candidate.serializedItemId,
        department: candidate.department,
        inventoryPartId: source.fabricInventoryId || null,
        inventoryPartNumber: sourcePartNumber,
        traceabilityType: type,
        traceabilityLabel: `${sourceLabel} - ${label}`,
        traceabilityValue: value,
        recordedBy: candidate.recordedBy,
      });
    }
  }

  if (APPLY && traceRows.length > 0) {
    await db.insert(p2SerializedItemTraceability).values(traceRows);
  }

  return traceRows.length;
}

async function consumePacket(candidate: Candidate, packet: typeof cuttingBuiltPackets.$inferSelect) {
  const serializedItem = await db.query.p2SerializedItems.findFirst({
    where: eq(p2SerializedItems.id, candidate.serializedItemId),
  });

  if (!serializedItem) {
    return { status: 'missing_item' as const, insertedTraceRows: 0 };
  }

  const allocatedToThisItem = [serializedItem.id, serializedItem.barcode, serializedItem.serialNumber]
    .filter(Boolean)
    .includes(packet.allocatedToOrder || '');

  if (packet.status === 'CONSUMED' && allocatedToThisItem) {
    const insertedTraceRows = await insertMissingTraceability(candidate, packet);
    return { status: 'already_consumed' as const, insertedTraceRows };
  }

  if (packet.status === 'CONSUMED' && !allocatedToThisItem) {
    return { status: 'conflict' as const, insertedTraceRows: 0 };
  }

  const insertedTraceRows = await insertMissingTraceability(candidate, packet);
  const note = `Backfilled P2 packet consumption for ${serializedItem.barcode} (${candidate.department}) from ${candidate.source}${candidate.workTaskId ? ` task ${candidate.workTaskId}` : ''}`;

  if (APPLY) {
    await db
      .update(cuttingBuiltPackets)
      .set({
        status: 'CONSUMED',
        allocatedToOrder: serializedItem.id,
        consumedAt: candidate.recordedAt,
        consumedBy: candidate.recordedBy,
        updatedAt: new Date(),
        notes: packet.notes ? `${packet.notes}\n${note}` : note,
      })
      .where(eq(cuttingBuiltPackets.id, packet.id));

    await db.insert(p2SerializedItemEvents).values({
      serializedItemId: serializedItem.id,
      barcode: serializedItem.barcode,
      eventType: 'NOTE',
      performedBy: candidate.recordedBy,
      notes: `Backfilled cutting packet ${packet.barcode} as consumed`,
      metadata: {
        action: 'backfill_p2_used_packet',
        packetId: packet.id,
        packetBarcode: packet.barcode,
        source: candidate.source,
        workTaskId: candidate.workTaskId || null,
      },
    });
  }

  return { status: 'consumed' as const, insertedTraceRows };
}

async function backfill() {
  console.log(`Starting P2 used packet backfill (${APPLY ? 'APPLY' : 'DRY RUN'})...\n`);

  const rawCandidates = [
    ...(await collectCandidatesFromTasks()),
    ...(await collectCandidatesFromTraceability()),
    ...(await collectCandidatesFromAllocatedPackets()),
  ];

  const seen = new Set<string>();
  const candidates = rawCandidates.filter((candidate) => {
    const key = normalizeCandidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let resolved = 0;
  let consumed = 0;
  let alreadyConsumed = 0;
  let conflicts = 0;
  let missingItems = 0;
  let notFound = 0;
  let traceRows = 0;

  console.log(`  Candidate packet scans: ${candidates.length}`);

  for (const candidate of candidates) {
    const packet = await resolvePacket(candidate);
    if (!packet) {
      notFound++;
      console.log(`  NOT FOUND: ${candidate.barcode || `packet id ${candidate.builtPacketId}`} (${candidate.source})`);
      continue;
    }

    resolved++;
    const result = await consumePacket(candidate, packet);
    traceRows += result.insertedTraceRows;

    if (result.status === 'consumed') {
      consumed++;
      console.log(`  ${APPLY ? 'CONSUMED' : 'WOULD CONSUME'}: ${packet.barcode} -> ${candidate.serializedItemId}`);
    } else if (result.status === 'already_consumed') {
      alreadyConsumed++;
    } else if (result.status === 'conflict') {
      conflicts++;
      console.log(`  CONFLICT: ${packet.barcode} is already consumed for ${packet.allocatedToOrder}`);
    } else if (result.status === 'missing_item') {
      missingItems++;
      console.log(`  MISSING ITEM: ${candidate.serializedItemId} for ${packet.barcode}`);
    }
  }

  console.log('\n--- Backfill Summary ---');
  console.log(`  Candidates       : ${candidates.length}`);
  console.log(`  Resolved packets : ${resolved}`);
  console.log(`  ${APPLY ? 'Consumed' : 'Would consume'}       : ${consumed}`);
  console.log(`  Already consumed : ${alreadyConsumed}`);
  console.log(`  Trace rows ${APPLY ? 'inserted' : 'to insert'}: ${traceRows}`);
  console.log(`  Not found        : ${notFound}`);
  console.log(`  Missing items    : ${missingItems}`);
  console.log(`  Conflicts        : ${conflicts}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with APPLY=1 or --apply to write changes.');
  }

  if (conflicts > 0 || missingItems > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  backfill()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pgPool.end();
    });
}

export { backfill };
