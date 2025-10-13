import { Client } from 'pg';
import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { molds } from '../../schema.js';

/**
 * Sync molds from external database to current database
 * This script connects to the external database and copies all mold data
 */
export async function syncMoldsFromExternal() {
  console.log('🔄 Starting mold synchronization from external database...');
  
  // Get external database URL from environment
  const externalDbUrl = process.env.EXTERNAL_DATABASE_URL;
  if (!externalDbUrl) {
    throw new Error('EXTERNAL_DATABASE_URL environment variable not set');
  }

  // Connect to external database
  const externalClient = new Client({
    connectionString: externalDbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await externalClient.connect();
    console.log('✅ Connected to external database');

    // Fetch all molds from external database
    const externalMoldsResult = await externalClient.query(`
      SELECT 
        id,
        mold_id,
        model_name,
        instance_number,
        enabled,
        multiplier,
        stock_models,
        created_at,
        updated_at,
        is_active,
        bom_sku,
        department,
        composite_items
      FROM molds 
      ORDER BY id
    `);

    const externalMolds = externalMoldsResult.rows;
    console.log(`📦 Found ${externalMolds.length} molds in external database`);

    // Clear current molds table
    console.log('🗑️ Clearing current molds table...');
    await db.delete(molds);

    // Insert all molds from external database
    console.log('📥 Inserting molds from external database...');
    
    for (const externalMold of externalMolds) {
      try {
        await db.insert(molds).values({
          id: externalMold.id,
          moldId: externalMold.mold_id,
          modelName: externalMold.model_name,
          instanceNumber: externalMold.instance_number,
          enabled: externalMold.enabled ?? true,
          multiplier: externalMold.multiplier ?? 2,
          stockModels: externalMold.stock_models || [],
          createdAt: externalMold.created_at || new Date(),
          updatedAt: externalMold.updated_at || new Date(),
          isActive: externalMold.is_active ?? true,
          bomSku: externalMold.bom_sku || null,
          department: externalMold.department || 'P1',
          compositeItems: externalMold.composite_items || {}
        });
        
        console.log(`✅ Synced mold: ${externalMold.mold_id} (${externalMold.model_name})`);
      } catch (error) {
        console.error(`❌ Error syncing mold ${externalMold.mold_id}:`, error);
      }
    }

    // Verify sync
    const currentMoldsCount = await db.$count(molds);
    console.log(`📊 Sync complete! Current database now has ${currentMoldsCount} molds`);

    // Show sample of synced molds
    const sampleMolds = await db.select({
      moldId: molds.moldId,
      modelName: molds.modelName,
      stockModels: molds.stockModels
    }).from(molds).limit(5);

    console.log('📋 Sample synced molds:');
    sampleMolds.forEach(mold => {
      console.log(`   ${mold.moldId}: ${mold.modelName} (${mold.stockModels?.join(', ') || 'No stock models'})`);
    });

    return {
      success: true,
      syncedCount: externalMolds.length,
      message: `Successfully synced ${externalMolds.length} molds from external database`
    };

  } catch (error) {
    console.error('❌ Error during mold synchronization:', error);
    throw error;
  } finally {
    await externalClient.end();
    console.log('🔌 Disconnected from external database');
  }
}

// Allow running this script directly
if (import.meta.main || process.argv[1]?.endsWith('sync-molds.ts')) {
  syncMoldsFromExternal()
    .then(result => {
      console.log('🎉 Mold sync completed successfully:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Mold sync failed:', error);
      process.exit(1);
    });
}