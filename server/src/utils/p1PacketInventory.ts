import { eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { inventoryItems } from '../../schema';

export type P1PacketMaterialType = 'carbon_fiber' | 'fiberglass' | 'mesa' | 'cheek_riser';

type PacketDemand = {
  materialType: P1PacketMaterialType;
  packetName: string;
  quantity: number;
};

type PacketInventoryAdjustment = PacketDemand & {
  inventoryItemId: number | null;
  appliedQuantity: number;
  previousOnHand: number;
  nextOnHand: number;
  reason?: string;
};

const MATERIAL_PACKET_NAMES: Record<PacketDemand['materialType'], string> = {
  carbon_fiber: 'Carbon Fiber Packet',
  fiberglass: 'Fiberglass Packet',
  mesa: 'Mesa Packet',
  cheek_riser: 'Cheek Riser',
};

const MATERIAL_PACKET_ALIASES: Record<PacketDemand['materialType'], string[]> = {
  carbon_fiber: ['Carbon Fiber Packet', 'Carbon Fiber Stock', 'CF Stock'],
  fiberglass: ['Fiberglass Packet', 'Fiberglass Stock', 'FG Stock'],
  mesa: ['Mesa Packet', 'Mesa Stock'],
  cheek_riser: ['Cheek Riser', 'Cheek Risers', 'Cheekriser'],
};

function parseInventoryCount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
}

export function normalizeP1PacketMaterialType(value: unknown): P1PacketMaterialType | null {
  const normalized = normalizeText(value);
  if (!normalized || normalized === 'unknown') return null;
  if (normalized.includes('cheek riser') || normalized.includes('cheekriser')) return 'cheek_riser';
  if (normalized === 'mesa' || normalized.includes('mesa packet') || normalized.includes('mesa stock')) return 'mesa';
  if (normalized === 'cf' || normalized.includes('carbon') || normalized.includes('carbon fiber')) return 'carbon_fiber';
  if (normalized === 'fg' || normalized.includes('fiberglass') || normalized.includes('fiber glass')) return 'fiberglass';
  return null;
}

export function getP1PacketName(materialType: P1PacketMaterialType): string {
  return MATERIAL_PACKET_NAMES[materialType];
}

function hasAdjustableStock(value: unknown): boolean {
  const normalized = normalizeText(value);
  return /\badjustable\b/.test(normalized) || /\badj\b/.test(normalized);
}

function materialTypeFromStockModel(modelId: unknown): PacketDemand['materialType'] | null {
  const normalized = normalizeText(modelId);
  if (!normalized || normalized === 'none' || normalized === 'no stock') return null;
  return normalizeP1PacketMaterialType(normalized);
}

export function getP1PacketDemandsForOrder(order: {
  modelId?: string | null;
  features?: unknown;
}): PacketDemand[] {
  const demands: PacketDemand[] = [];
  const materialType = materialTypeFromStockModel(order.modelId);

  if (materialType) {
    demands.push({
      materialType,
      packetName: MATERIAL_PACKET_NAMES[materialType],
      quantity: 1,
    });
  }

  if (hasAdjustableStock(order.modelId) || hasAdjustableStock(order.features)) {
    demands.push({
      materialType: 'cheek_riser',
      packetName: MATERIAL_PACKET_NAMES.cheek_riser,
      quantity: 1,
    });
  }

  return demands;
}

async function resolvePacketInventoryItem(tx: any, demand: Pick<PacketDemand, 'materialType' | 'packetName'>) {
  const aliases = Array.from(new Set([demand.packetName, ...(MATERIAL_PACKET_ALIASES[demand.materialType] || [])]));
  const normalizedAliases = aliases.map(alias => alias.toLowerCase());

  const [exact] = await tx
    .select()
    .from(inventoryItems)
    .where(
      or(
        ...normalizedAliases.map(alias => sql`LOWER(${inventoryItems.name}) = ${alias}`),
        ...normalizedAliases.map(alias => sql`LOWER(${inventoryItems.agPartNumber}) = ${alias}`),
        sql`LOWER(${inventoryItems.agPartNumber}) = ${demand.materialType.toLowerCase()}`
      )
    )
    .limit(1)
    .for('update');

  if (exact) return exact;

  const [fallback] = await tx
    .select()
    .from(inventoryItems)
    .where(
      or(
        ...aliases.flatMap(alias => [
          ilike(inventoryItems.name, `%${alias}%`),
          ilike(inventoryItems.description, `%${alias}%`),
          ilike(inventoryItems.agPartNumber, `%${alias}%`),
        ]),
        ilike(inventoryItems.agPartNumber, `%${demand.materialType}%`)
      )
    )
    .limit(1)
    .for('update');

  return fallback || null;
}

export async function adjustPacketInventoryItem(
  tx: any,
  inventoryItemId: number,
  quantityDelta: number
): Promise<PacketInventoryAdjustment> {
  const [item] = await tx
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, inventoryItemId))
    .limit(1)
    .for('update');

  if (!item) {
    throw new Error(`Packet inventory item ${inventoryItemId} not found`);
  }

  const previousOnHand = parseInventoryCount((item as any).onHand ?? (item as any).quantityInStock ?? (item as any).available);
  const nextOnHand = Math.max(0, previousOnHand + quantityDelta);
  const committed = parseInventoryCount((item as any).committed);

  await tx
    .update(inventoryItems)
    .set({
      onHand: nextOnHand,
      quantityInStock: nextOnHand,
      available: Math.max(0, nextOnHand - committed),
      lastUpdated: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, inventoryItemId));

  return {
    materialType: materialTypeFromStockModel(item.name) || 'carbon_fiber',
    packetName: item.name || 'Packet',
    quantity: Math.abs(quantityDelta),
    inventoryItemId,
    appliedQuantity: quantityDelta,
    previousOnHand,
    nextOnHand,
  };
}

export async function adjustPacketInventoryForMaterial(
  tx: any,
  materialType: P1PacketMaterialType,
  quantityDelta: number
): Promise<PacketInventoryAdjustment> {
  const demand = {
    materialType,
    packetName: MATERIAL_PACKET_NAMES[materialType],
  };
  const item = await resolvePacketInventoryItem(tx, demand);

  if (!item) {
    throw new Error(`Packet inventory item not found for ${demand.packetName}`);
  }

  return adjustPacketInventoryItem(tx, item.id, quantityDelta);
}

export async function consumeP1PacketInventoryForOrder(order: {
  orderId?: string | null;
  modelId?: string | null;
  features?: unknown;
}): Promise<PacketInventoryAdjustment[]> {
  const demands = getP1PacketDemandsForOrder(order);
  if (demands.length === 0) return [];

  return db.transaction(async (tx) => {
    const adjustments: PacketInventoryAdjustment[] = [];

    for (const demand of demands) {
      const item = await resolvePacketInventoryItem(tx, demand);
      if (!item) {
        adjustments.push({
          ...demand,
          inventoryItemId: null,
          appliedQuantity: 0,
          previousOnHand: 0,
          nextOnHand: 0,
          reason: 'packet_inventory_item_not_found',
        });
        continue;
      }

      const previousOnHand = parseInventoryCount((item as any).onHand ?? (item as any).quantityInStock ?? (item as any).available);
      const appliedQuantity = Math.min(demand.quantity, previousOnHand);
      const nextOnHand = Math.max(0, previousOnHand - appliedQuantity);
      const committed = parseInventoryCount((item as any).committed);

      await tx
        .update(inventoryItems)
        .set({
          onHand: nextOnHand,
          quantityInStock: nextOnHand,
          available: Math.max(0, nextOnHand - committed),
          lastUpdated: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, item.id));

      adjustments.push({
        ...demand,
        inventoryItemId: item.id,
        appliedQuantity: -appliedQuantity,
        previousOnHand,
        nextOnHand,
        reason: appliedQuantity < demand.quantity ? 'insufficient_packet_inventory' : undefined,
      });
    }

    return adjustments;
  });
}
