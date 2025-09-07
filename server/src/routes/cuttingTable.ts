import { Router } from 'express';
import { db } from '../../db';
import { 
  packetCuttingQueue, 
  cuttingMaterials, 
  packetTypes,
  stockPacketMapping,
  insertCuttingMaterialSchema
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
// LEGACY ENDPOINTS (for backward compatibility)
// ============================================================================
// Redirect old cutting-requirements endpoint to new packet-cutting-queue endpoint
router.get('/cutting-requirements', (req, res) => {
  res.redirect('/api/packet-cutting-queue');
});

export default router;