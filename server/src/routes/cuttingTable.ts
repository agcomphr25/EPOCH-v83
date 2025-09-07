import { Router } from 'express';
import { db } from '../../db';
import { 
  packetCuttingQueue, 
  cuttingMaterials, 
  packetTypes,
  stockPacketMapping,
  insertCuttingMaterialSchema,
  allOrders
} from '../../schema';
import { eq, and, isNull, sql, desc, asc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// ============================================================================
// GET PACKET CUTTING QUEUE WITH JOINED DATA
// ============================================================================
router.get('/packet-cutting-queue', async (req, res) => {
  try {
    console.log('📋 CUTTING TABLE: Fetching packet cutting queue...');
    
    const queue = await db
      .select({
        // Queue fields
        id: packetCuttingQueue.id,
        packetTypeId: packetCuttingQueue.packetTypeId,
        materialId: packetCuttingQueue.materialId,
        packetsNeeded: packetCuttingQueue.packetsNeeded,
        packetsCut: packetCuttingQueue.packetsCut,
        priorityLevel: packetCuttingQueue.priorityLevel,
        requestedBy: packetCuttingQueue.requestedBy,
        assignedTo: packetCuttingQueue.assignedTo,
        startedAt: packetCuttingQueue.startedAt,
        completedAt: packetCuttingQueue.completedAt,
        notes: packetCuttingQueue.notes,
        isCompleted: packetCuttingQueue.isCompleted,
        createdAt: packetCuttingQueue.createdAt,
        updatedAt: packetCuttingQueue.updatedAt,
        
        // Packet type fields
        packetName: packetTypes.packetName,
        packetMaterialType: packetTypes.materialType,
        packetDescription: packetTypes.description,
        
        // Material fields
        materialName: cuttingMaterials.materialName,
        materialType: cuttingMaterials.materialType,
        yieldPerCut: cuttingMaterials.yieldPerCut,
        wasteFactor: cuttingMaterials.wasteFactor,
      })
      .from(packetCuttingQueue)
      .leftJoin(packetTypes, eq(packetCuttingQueue.packetTypeId, packetTypes.id))
      .leftJoin(cuttingMaterials, eq(packetCuttingQueue.materialId, cuttingMaterials.id))
      .orderBy(
        asc(packetCuttingQueue.isCompleted), // Incomplete first
        asc(packetCuttingQueue.priorityLevel), // Then by priority
        desc(packetCuttingQueue.createdAt) // Then by creation date
      );

    console.log(`📋 CUTTING TABLE: Found ${queue.length} packet cutting tasks`);
    res.json(queue);
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error fetching packet cutting queue:', error);
    res.status(500).json({ 
      error: 'Failed to fetch packet cutting queue',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// GET CUTTING MATERIALS
// ============================================================================
router.get('/cutting-materials', async (req, res) => {
  try {
    console.log('🔧 CUTTING TABLE: Fetching cutting materials...');
    
    const materials = await db
      .select()
      .from(cuttingMaterials)
      .where(eq(cuttingMaterials.isActive, true))
      .orderBy(asc(cuttingMaterials.materialType), asc(cuttingMaterials.materialName));

    console.log(`🔧 CUTTING TABLE: Found ${materials.length} active materials`);
    res.json(materials);
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error fetching materials:', error);
    res.status(500).json({ 
      error: 'Failed to fetch cutting materials',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// GET PACKET TYPES
// ============================================================================
router.get('/packet-types', async (req, res) => {
  try {
    console.log('📦 CUTTING TABLE: Fetching packet types...');
    
    const types = await db
      .select()
      .from(packetTypes)
      .where(eq(packetTypes.isActive, true))
      .orderBy(asc(packetTypes.materialType), asc(packetTypes.packetName));

    console.log(`📦 CUTTING TABLE: Found ${types.length} active packet types`);
    res.json(types);
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error fetching packet types:', error);
    res.status(500).json({ 
      error: 'Failed to fetch packet types',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// COMPLETE PACKET CUTTING TASKS
// ============================================================================
const completePacketCuttingSchema = z.object({
  queueIds: z.array(z.number().positive()),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/packet-cutting-queue/complete', async (req, res) => {
  try {
    console.log('✅ CUTTING TABLE: Completing packet cutting tasks...');
    
    const { queueIds, assignedTo, notes } = completePacketCuttingSchema.parse(req.body);
    
    // Update packet cutting queue items
    const updateData: any = {
      packetsCut: sql`packets_needed`, // Set cut = needed
      isCompleted: true,
      completedAt: new Date(),
      updatedAt: new Date(),
    };
    
    if (assignedTo) {
      updateData.assignedTo = assignedTo;
    }
    
    if (notes) {
      updateData.notes = notes;
    }

    const results = [];
    
    for (const queueId of queueIds) {
      const result = await db
        .update(packetCuttingQueue)
        .set(updateData)
        .where(eq(packetCuttingQueue.id, queueId))
        .returning();
      
      results.push(...result);
    }

    console.log(`✅ CUTTING TABLE: Completed ${results.length} packet cutting tasks`);
    
    res.json({
      success: true,
      completedTasks: results.length,
      message: `Successfully completed ${results.length} packet cutting task(s)`
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error completing packet cutting tasks:', error);
    res.status(500).json({ 
      error: 'Failed to complete packet cutting tasks',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// UPDATE PACKET CUTTING PROGRESS
// ============================================================================
const updatePacketProgressSchema = z.object({
  queueId: z.number().positive(),
  packetsCut: z.number().min(0),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

router.patch('/packet-cutting-queue/:id', async (req, res) => {
  try {
    console.log('📝 CUTTING TABLE: Updating packet cutting progress...');
    
    const queueId = parseInt(req.params.id);
    const { packetsCut, assignedTo, notes } = updatePacketProgressSchema.parse(req.body);
    
    // Get current queue item to check packets needed
    const currentItem = await db
      .select()
      .from(packetCuttingQueue)
      .where(eq(packetCuttingQueue.id, queueId))
      .limit(1);
    
    if (currentItem.length === 0) {
      return res.status(404).json({ error: 'Packet cutting task not found' });
    }
    
    const item = currentItem[0];
    const isCompleted = packetsCut >= item.packetsNeeded;
    
    const updateData: any = {
      packetsCut,
      isCompleted,
      updatedAt: new Date(),
    };
    
    if (isCompleted) {
      updateData.completedAt = new Date();
    }
    
    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo;
    }
    
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const result = await db
      .update(packetCuttingQueue)
      .set(updateData)
      .where(eq(packetCuttingQueue.id, queueId))
      .returning();

    console.log(`📝 CUTTING TABLE: Updated packet cutting progress for task ${queueId}`);
    
    res.json({
      success: true,
      updatedTask: result[0]
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error updating packet cutting progress:', error);
    res.status(500).json({ 
      error: 'Failed to update packet cutting progress',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// ADD NEW PACKET CUTTING REQUEST
// ============================================================================
const addPacketRequestSchema = z.object({
  packetTypeId: z.number().positive(),
  materialId: z.number().positive(),
  packetsNeeded: z.number().positive(),
  priorityLevel: z.number().min(1).max(5).default(1),
  requestedBy: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/packet-cutting-queue', async (req, res) => {
  try {
    console.log('➕ CUTTING TABLE: Adding new packet cutting request...');
    
    const requestData = addPacketRequestSchema.parse(req.body);
    
    const newRequest = await db
      .insert(packetCuttingQueue)
      .values(requestData)
      .returning();
    
    console.log(`➕ CUTTING TABLE: Created packet cutting request for ${requestData.packetsNeeded} packets`);
    
    res.json({
      success: true,
      request: newRequest[0]
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error creating packet cutting request:', error);
    res.status(500).json({ 
      error: 'Failed to create packet cutting request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// ADD CUTTING MATERIAL
// ============================================================================
router.post('/cutting-materials', async (req, res) => {
  try {
    console.log('➕ CUTTING TABLE: Adding new cutting material...');
    
    const materialData = insertCuttingMaterialSchema.parse(req.body);
    
    const newMaterial = await db
      .insert(cuttingMaterials)
      .values(materialData)
      .returning();
    
    console.log(`➕ CUTTING TABLE: Created material: ${materialData.materialName}`);
    
    res.json({
      success: true,
      material: newMaterial[0]
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error creating material:', error);
    res.status(500).json({ 
      error: 'Failed to create cutting material',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// AUTO-POPULATE PACKET CUTTING FROM PRODUCTION ORDERS
// ============================================================================
router.post('/packet-cutting-queue/auto-populate', async (req, res) => {
  try {
    console.log('🔄 CUTTING TABLE: Auto-populating packet cutting queue from production orders...');
    
    // Get orders that need cutting (in P1 Production Queue - orders waiting to start manufacturing)
    const ordersNeedingCutting = await db
      .select()
      .from(allOrders)
      .where(and(
        eq(allOrders.currentDepartment, 'P1 Production Queue'),
        eq(allOrders.status, 'FINALIZED'),
        eq(allOrders.isCancelled, false)
      ));

    console.log(`🔄 Found ${ordersNeedingCutting.length} orders needing cutting`);

    // Group orders by stock model and determine packet requirements
    const packetRequirements = new Map<string, {
      packetTypeId: number;
      materialId: number;
      count: number;
      orders: string[];
    }>();

    for (const order of ordersNeedingCutting) {
      const modelId = order.modelId;
      let packetTypeId: number;
      let materialId: number;

      // Determine packet type and material based on model ID
      const isCarbonFiber = modelId?.startsWith('cf_') || 
                           modelId?.includes('mesa_universal') || 
                           modelId?.includes('apr_') ||
                           modelId?.startsWith('apr_') ||
                           modelId?.includes('carbon') ||
                           modelId?.includes('tikka') ||  // Tikka actions are CF
                           modelId?.includes('m1a_carbon');
      
      const isFiberglass = modelId?.startsWith('fg_') || 
                          modelId?.includes('fiberglass') ||
                          modelId?.endsWith('_fg') ||  // Models ending with _fg
                          modelId === 'fg';  // Handle edge case
      
      if (isCarbonFiber) {
        // Carbon Fiber models (all use same CF packets)
        packetTypeId = 1; // CF Packets
        materialId = 2; // Gruit Carbon Fiber
      } else if (isFiberglass) {
        // Fiberglass models (all use same FG packets)  
        packetTypeId = 2; // FG Packets
        materialId = 1; // Primtex Fiberglass
      } else {
        console.log(`⚠️ Unknown model type: ${modelId}, skipping...`);
        continue;
      }

      const key = `${packetTypeId}-${materialId}`;
      if (!packetRequirements.has(key)) {
        packetRequirements.set(key, {
          packetTypeId,
          materialId,
          count: 0,
          orders: []
        });
      }

      const req = packetRequirements.get(key)!;
      req.count++;
      req.orders.push(order.orderId || 'Unknown');
    }

    console.log(`🔄 Grouped into ${packetRequirements.size} packet requirement types`);

    // Clear existing incomplete packet cutting tasks to avoid duplicates
    await db.delete(packetCuttingQueue).where(eq(packetCuttingQueue.isCompleted, false));
    console.log('🧹 Cleared existing incomplete packet cutting tasks');

    // Insert new packet cutting requirements
    const insertedTasks = [];
    for (const [key, req] of Array.from(packetRequirements.entries())) {
      const newTask = await db
        .insert(packetCuttingQueue)
        .values({
          packetTypeId: req.packetTypeId,
          materialId: req.materialId,
          packetsNeeded: req.count,
          packetsCut: 0,
          priorityLevel: 2, // Normal priority
          requestedBy: 'Auto-Population System',
          notes: `Auto-generated from ${req.count} production orders`,
          isCompleted: false
        })
        .returning();

      insertedTasks.push(newTask[0]);
    }

    console.log(`✅ CUTTING TABLE: Auto-populated ${insertedTasks.length} packet cutting requirements`);
    
    res.json({
      success: true,
      message: `Auto-populated ${insertedTasks.length} packet cutting requirements from ${ordersNeedingCutting.length} orders`,
      ordersAnalyzed: ordersNeedingCutting.length,
      packetTypesCreated: insertedTasks.length,
      tasks: insertedTasks
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error auto-populating packet cutting queue:', error);
    res.status(500).json({ 
      error: 'Failed to auto-populate packet cutting queue',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// GET ORDERS NEEDING CUTTING (for analysis)
// ============================================================================
router.get('/orders-needing-cutting', async (req, res) => {
  try {
    console.log('🔍 CUTTING TABLE: Analyzing orders needing cutting...');
    
    const ordersNeedingCutting = await db.query.allOrders.findMany({
      where: (orders, { and, eq, not }) => and(
        eq(orders.currentDepartment, 'P1 Production Queue'),
        eq(orders.status, 'FINALIZED'),
        eq(orders.isCancelled, false)
      ),
    });

    // Group by model ID for analysis
    const analysis = ordersNeedingCutting.reduce((acc, order) => {
      const modelId = order.modelId || 'unknown';
      if (!acc[modelId]) {
        const isCarbonFiber = modelId.startsWith('cf_') || 
                             modelId.includes('mesa_universal') || 
                             modelId.includes('apr_') ||
                             modelId.startsWith('apr_') ||
                             modelId.includes('carbon') ||
                             modelId.includes('tikka') ||  // Tikka actions are CF
                             modelId.includes('m1a_carbon');
        
        const isFiberglass = modelId.startsWith('fg_') || 
                            modelId.includes('fiberglass') ||
                            modelId.endsWith('_fg') ||  // Models ending with _fg
                            modelId === 'fg';  // Handle edge case

        acc[modelId] = {
          count: 0,
          orders: [],
          materialType: isCarbonFiber ? 'Carbon Fiber' : 
                       isFiberglass ? 'Fiberglass' : 'Other',
          stockType: (modelId.includes('adj') || modelId.includes('adjustable')) ? 'Adjustable' : 'Standard'
        };
      }
      acc[modelId].count++;
      acc[modelId].orders.push(order.orderId);
      return acc;
    }, {} as Record<string, any>);

    console.log(`🔍 Found ${ordersNeedingCutting.length} orders needing cutting across ${Object.keys(analysis).length} model types`);
    
    res.json({
      totalOrders: ordersNeedingCutting.length,
      modelBreakdown: analysis,
      orders: ordersNeedingCutting
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error analyzing orders:', error);
    res.status(500).json({ 
      error: 'Failed to analyze orders needing cutting',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// LEGACY ENDPOINTS (for backward compatibility)
// ============================================================================
// Redirect old cutting-requirements endpoint to new packet-cutting-queue endpoint
router.get('/cutting-requirements', (req, res) => {
  res.redirect('/api/packet-cutting-queue');
});


export default router;