/**
 * Seed script to create the initial Carbon Fiber Stock Kit BOM
 * Run with: tsx server/db/seed-stock-bom.ts
 */

import { db } from '../db';
import { bomDefinitions, bomItems } from '../schema';

async function seedCarbonFiberStockBOM() {
  console.log('🌱 Seeding Carbon Fiber Stock Kit BOM...');

  try {
    // Create the BOM definition
    const [bom] = await db.insert(bomDefinitions).values({
      modelName: 'AR-15 Carbon Fiber Stock Kit',
      sku: 'AR15-CF-KIT',
      revision: 'A',
      description: 'Complete carbon fiber rifle stock kit with materials and labor for layup, CNC, finish, and optional paint',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    console.log(`✅ Created BOM definition: ${bom.modelName} (ID: ${bom.id})`);

    // Insert BOM items (materials and labor)
    const items = await db.insert(bomItems).values([
      // Core Materials (Required)
      {
        bomId: bom.id,
        partName: 'Foam Core Blank',
        quantity: 1,
        firstDept: 'Layup',
        itemType: 'material',
        isOptional: false,
        assemblyLevel: 1,
        notes: 'High-density foam for stock core',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Carbon Fiber Sheet 12x24',
        quantity: 4,
        firstDept: 'Layup',
        itemType: 'material',
        isOptional: false,
        assemblyLevel: 1,
        notes: '2x2 twill weave carbon fiber',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Epoxy Resin - Quart',
        quantity: 1,
        firstDept: 'Layup',
        itemType: 'material',
        isOptional: false,
        assemblyLevel: 1,
        notes: 'West System 105 or equivalent',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Hardener - Pint',
        quantity: 1,
        firstDept: 'Layup',
        itemType: 'material',
        isOptional: false,
        assemblyLevel: 1,
        notes: 'West System 206 or equivalent',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Hardware (Required)
      {
        bomId: bom.id,
        partName: 'QD Sling Mount',
        quantity: 2,
        firstDept: 'Assembly/Disassembly',
        itemType: 'manufactured',
        isOptional: false,
        assemblyLevel: 1,
        notes: 'Quick-detach sling mounting points',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Bottom Metal - AICS Style',
        quantity: 1,
        firstDept: 'Assembly/Disassembly',
        itemType: 'manufactured',
        isOptional: false,
        assemblyLevel: 1,
        notes: 'Aluminum bottom metal for magazine',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Stock Bedding Screws (4-pack)',
        quantity: 1,
        firstDept: 'Assembly/Disassembly',
        itemType: 'manufactured',
        isOptional: false,
        assemblyLevel: 1,
        notes: 'Stainless steel action screws',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Optional Components
      {
        bomId: bom.id,
        partName: 'Picatinny Rail Section 3-slot',
        quantity: 2,
        firstDept: 'Assembly/Disassembly',
        itemType: 'manufactured',
        isOptional: true,
        assemblyLevel: 1,
        notes: 'Optional M-LOK to Picatinny rails',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Paint - Custom Color',
        quantity: 1,
        firstDept: 'Paint',
        itemType: 'material',
        isOptional: true,
        assemblyLevel: 1,
        notes: 'Cerakote or Duracoat finish',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Required Labor
      {
        bomId: bom.id,
        partName: 'Layup Labor',
        quantity: 1,
        firstDept: 'Layup',
        itemType: 'labor',
        isOptional: false,
        laborHours: 3.5,
        hourlyRate: 35.00,
        assemblyLevel: 2,
        notes: 'Carbon fiber layup and vacuum bagging',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'CNC Machining',
        quantity: 1,
        firstDept: 'Layup',
        itemType: 'labor',
        isOptional: false,
        laborHours: 2.0,
        hourlyRate: 45.00,
        assemblyLevel: 2,
        notes: 'CNC router work for stock shaping and inletting',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        bomId: bom.id,
        partName: 'Finish Sanding & QC',
        quantity: 1,
        firstDept: 'Finish',
        itemType: 'labor',
        isOptional: false,
        laborHours: 1.5,
        hourlyRate: 30.00,
        assemblyLevel: 2,
        notes: 'Final sanding, inspection, and quality control',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },

      // Optional Labor
      {
        bomId: bom.id,
        partName: 'Paint Application',
        quantity: 1,
        firstDept: 'Paint',
        itemType: 'labor',
        isOptional: true,
        laborHours: 2.0,
        hourlyRate: 35.00,
        assemblyLevel: 2,
        notes: 'Custom paint/coating application and curing',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]).returning();

    console.log(`✅ Created ${items.length} BOM items`);

    // Summary
    const materials = items.filter(i => i.itemType === 'material' || i.itemType === 'manufactured');
    const labor = items.filter(i => i.itemType === 'labor');
    const required = items.filter(i => !i.isOptional);
    const optional = items.filter(i => i.isOptional);

    console.log('\n📊 BOM Summary:');
    console.log(`   Total Items: ${items.length}`);
    console.log(`   Materials: ${materials.length} (${materials.filter(m => !m.isOptional).length} required, ${materials.filter(m => m.isOptional).length} optional)`);
    console.log(`   Labor: ${labor.length} (${labor.filter(l => !l.isOptional).length} required, ${labor.filter(l => l.isOptional).length} optional)`);

    const totalLaborCost = labor.reduce((sum, l) => {
      return sum + ((l.laborHours || 0) * (l.hourlyRate || 0));
    }, 0);
    console.log(`   Total Labor Cost: $${totalLaborCost.toFixed(2)}`);

    console.log('\n✅ Carbon Fiber Stock Kit BOM seeded successfully!');
    console.log(`   BOM ID: ${bom.id}`);
    console.log(`   Access in UI: BOM Administration → Stock BOMs tab`);

  } catch (error) {
    console.error('❌ Error seeding BOM:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the seed
seedCarbonFiberStockBOM();
