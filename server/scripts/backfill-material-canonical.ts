import { pool } from '../db';
import { deriveCanonicalMaterial } from '../src/utils/deriveCanonicalMaterial';

async function backfillMaterialCanonical() {
  console.log('Starting backfill of material_canonical and source_snapshot...');

  const result = await pool.query(`
    SELECT po.id, po.order_id, po.item_id, po.item_name, po.po_id, po.po_item_id, po.po_number,
           po.specifications, po.material_canonical,
           poi.stock_model_id, poi.stock_model_name, poi.custom_options, poi.unit_price
    FROM production_orders po
    LEFT JOIN purchase_order_items poi ON poi.id = po.po_item_id
    WHERE po.material_canonical = '' OR po.material_canonical IS NULL
  `);

  const rows = result.rows || result;
  console.log(`Found ${rows.length} rows to backfill`);

  let updated = 0;
  for (const row of rows) {
    const stockModelId = row.item_id || row.stock_model_id || '';
    const material = deriveCanonicalMaterial(stockModelId);

    const snapshot = {
      po_id: row.po_id,
      po_item_id: row.po_item_id,
      po_number: row.po_number,
      sku: stockModelId,
      stock_model_name: row.stock_model_name || row.item_name || stockModelId,
      material: material,
      options: row.custom_options ?? null,
      unit_price: row.unit_price ?? null,
      created_at: new Date().toISOString(),
      backfilled: true,
    };

    await pool.query(
      `UPDATE production_orders SET material_canonical = $1, source_snapshot = $2 WHERE id = $3`,
      [material, JSON.stringify(snapshot), row.id]
    );
    updated++;
  }

  console.log(`Backfill complete: updated ${updated} rows`);
}

backfillMaterialCanonical()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
