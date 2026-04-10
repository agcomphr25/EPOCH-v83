/**
 * One-time production data fix script
 * Deletes 9 erroneous duplicate OEM shipment records for Pure Precision
 * created on April 9, 2026 (RFPO-002481 / RFPO-002612).
 *
 * Keeps:
 *   71f8d49e-fa44-43e6-b1f1-1f582273f381 (tracking 1Z27835W0195160227, 30 lbs)
 *   7ada8ec0-757d-47f0-a4c2-bbb9d75f89a4 (tracking 1Z27835W0194157448, 27 lbs)
 */

import { Pool } from 'pg';

const DUPLICATE_IDS = [
  'e42782a4-a598-45e9-8bf5-33cd37c72f07',
  '0b010b48-5ed9-4cfb-ab42-4d2740d74b90',
  'e1d7799b-fc3f-430c-ad46-af3de25701f0',
  '295df76e-583e-4b56-959d-76e813c9a425',
  '96db5b72-db2a-4c5f-8da6-4933a33305cb',
  'd76d96fa-a5b8-4612-8857-9a15fecce3cf',
  'd59c90da-241f-42b7-98cb-9547585b8d1f',
  'f6f46251-74f9-4d9f-80a3-0c2633e0a6d8',
  '63402c3c-70e5-431d-a13e-f51c4b7ec5c9',
];

const KEEP_IDS = [
  '71f8d49e-fa44-43e6-b1f1-1f582273f381',
  '7ada8ec0-757d-47f0-a4c2-bbb9d75f89a4',
];

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    console.log('Connecting to database...');

    await client.query('BEGIN');

    // Step 1: Pre-flight verification - confirm the records to delete exist
    const preCheckResult = await client.query(
      `SELECT id, master_tracking_number, total_weight_lbs
       FROM shipment_records
       WHERE id = ANY($1::uuid[])`,
      [DUPLICATE_IDS]
    );
    console.log(`Pre-flight: Found ${preCheckResult.rowCount} of 9 expected duplicate shipment records.`);
    if (preCheckResult.rowCount !== 9) {
      console.warn('WARNING: Expected 9 records to delete, found ' + preCheckResult.rowCount);
    }
    for (const row of preCheckResult.rows) {
      console.log(`  - ${row.id} | tracking: ${row.master_tracking_number} | ${row.total_weight_lbs} lbs`);
    }

    // Step 2: Verify the records to KEEP still exist
    const keepCheckResult = await client.query(
      `SELECT id, master_tracking_number, total_weight_lbs
       FROM shipment_records
       WHERE id = ANY($1::uuid[])`,
      [KEEP_IDS]
    );
    console.log(`\nKeep check: Found ${keepCheckResult.rowCount} of 2 records to keep:`);
    for (const row of keepCheckResult.rows) {
      console.log(`  KEEP: ${row.id} | tracking: ${row.master_tracking_number} | ${row.total_weight_lbs} lbs`);
    }
    if (keepCheckResult.rowCount !== 2) {
      throw new Error(`Expected 2 records to keep, found ${keepCheckResult.rowCount}. Aborting.`);
    }

    // Step 3: Count shipment_items to be deleted
    const itemCountResult = await client.query(
      `SELECT COUNT(*) AS count FROM shipment_items WHERE shipment_id = ANY($1::uuid[])`,
      [DUPLICATE_IDS]
    );
    const itemCount = parseInt(itemCountResult.rows[0].count, 10);
    console.log(`\nFound ${itemCount} shipment_items associated with the 9 duplicate records.`);
    if (itemCount !== 99) {
      console.warn(`WARNING: Expected 99 shipment_items, found ${itemCount}`);
    }

    // Step 4: Delete shipment_items (child records first)
    const deleteItemsResult = await client.query(
      `DELETE FROM shipment_items WHERE shipment_id = ANY($1::uuid[])`,
      [DUPLICATE_IDS]
    );
    console.log(`\nDeleted ${deleteItemsResult.rowCount} shipment_items.`);

    // Step 5: Delete shipment_records (parent records)
    const deleteRecordsResult = await client.query(
      `DELETE FROM shipment_records WHERE id = ANY($1::uuid[])`,
      [DUPLICATE_IDS]
    );
    console.log(`Deleted ${deleteRecordsResult.rowCount} shipment_records.`);

    // Step 6: Post-deletion verification
    const postCheckResult = await client.query(
      `SELECT id FROM shipment_records WHERE id = ANY($1::uuid[])`,
      [DUPLICATE_IDS]
    );
    if (postCheckResult.rowCount !== 0) {
      throw new Error(`Post-check failed: ${postCheckResult.rowCount} duplicate records still exist. Rolling back.`);
    }
    console.log('\nPost-check: All 9 duplicate records successfully removed.');

    const postKeepResult = await client.query(
      `SELECT id, master_tracking_number FROM shipment_records WHERE id = ANY($1::uuid[])`,
      [KEEP_IDS]
    );
    if (postKeepResult.rowCount !== 2) {
      throw new Error(`Post-keep check failed: Expected 2 records to still exist, found ${postKeepResult.rowCount}. Rolling back.`);
    }
    console.log('Post-check: Both correct shipments still exist:');
    for (const row of postKeepResult.rows) {
      console.log(`  KEPT: ${row.id} | tracking: ${row.master_tracking_number}`);
    }

    await client.query('COMMIT');
    console.log('\nTransaction committed successfully.');
    console.log('Summary: Deleted 9 shipment_records and 99 shipment_items for Pure Precision duplicate OEM shipments (April 9, 2026).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error — transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
