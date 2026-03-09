import { pool } from '../../db';

export interface UnitRow {
  id: number;
  symbol: string;
  family_id: number;
  conversion_to_base: number;
}

export interface UnitWithFamily extends UnitRow {
  family_name: string;
}

export async function getUnitById(unitId: number): Promise<UnitRow | null> {
  const rows = await pool.query(
    'SELECT id, symbol, family_id, conversion_to_base::float FROM units WHERE id = $1',
    [unitId]
  ) as UnitRow[];
  return rows[0] ?? null;
}

export async function getUnitBySymbol(symbol: string): Promise<UnitRow | null> {
  const rows = await pool.query(
    'SELECT id, symbol, family_id, conversion_to_base::float FROM units WHERE symbol = $1',
    [symbol]
  ) as UnitRow[];
  return rows[0] ?? null;
}

export async function getAllUnitsWithFamilies(): Promise<UnitWithFamily[]> {
  const rows = await pool.query(`
    SELECT u.id, u.symbol, u.family_id, u.conversion_to_base::float, f.name AS family_name
    FROM units u
    JOIN unit_families f ON f.id = u.family_id
    ORDER BY f.name, u.symbol
  `) as UnitWithFamily[];
  return rows;
}

export async function validateSameFamily(
  purchaseUnitId: number,
  usageUnitId: number
): Promise<{ valid: boolean; purchaseFamilyName?: string; usageFamilyName?: string }> {
  const rows = await pool.query(`
    SELECT u.id, u.family_id, f.name AS family_name
    FROM units u
    JOIN unit_families f ON f.id = u.family_id
    WHERE u.id = ANY($1::int[])
  `, [[purchaseUnitId, usageUnitId]]) as Array<{ id: number; family_id: number; family_name: string }>;

  const purchase = rows.find(r => r.id === purchaseUnitId);
  const usage = rows.find(r => r.id === usageUnitId);

  if (!purchase || !usage) {
    return { valid: false };
  }

  return {
    valid: purchase.family_id === usage.family_id,
    purchaseFamilyName: purchase.family_name,
    usageFamilyName: usage.family_name,
  };
}

export async function convertUnits(
  value: number,
  fromUnitId: number,
  toUnitId: number
): Promise<number> {
  if (fromUnitId === toUnitId) return value;

  const rows = await pool.query(
    'SELECT id, family_id, conversion_to_base::float FROM units WHERE id = ANY($1::int[])',
    [[fromUnitId, toUnitId]]
  ) as Array<{ id: number; family_id: number; conversion_to_base: number }>;

  const from = rows.find(r => r.id === fromUnitId);
  const to = rows.find(r => r.id === toUnitId);

  if (!from || !to) {
    throw new Error(`Unit ID not found: ${!from ? fromUnitId : toUnitId}`);
  }
  if (from.family_id !== to.family_id) {
    throw new Error('Cannot convert between units from different measurement families');
  }

  const valueInBase = value * from.conversion_to_base;
  return valueInBase / to.conversion_to_base;
}
