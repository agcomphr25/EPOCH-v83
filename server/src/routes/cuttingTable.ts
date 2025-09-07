import { Router } from 'express';
import { db } from '../../db';
import { 
  cuttingRequirements, 
  cuttingMaterials, 
  cuttingComponents,
  cuttingProductCategories,
  allOrders,
  insertCuttingRequirementSchema,
  insertCuttingMaterialSchema
} from '../../schema';
import { eq, and, isNull, sql, desc, asc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// ============================================================================
// GET CUTTING REQUIREMENTS WITH JOINED DATA
// ============================================================================
router.get('/cutting-requirements', async (req, res) => {
  try {
    console.log('📋 CUTTING TABLE: Fetching cutting requirements...');
    
    const requirements = await db
      .select({
        // Cutting requirement fields
        id: cuttingRequirements.id,
        orderId: cuttingRequirements.orderId,
        materialId: cuttingRequirements.materialId,
        componentId: cuttingRequirements.componentId,
        cutsRequired: cuttingRequirements.cutsRequired,
        cutsCompleted: cuttingRequirements.cutsCompleted,
        isCompleted: cuttingRequirements.isCompleted,
        assignedTo: cuttingRequirements.assignedTo,
        startedAt: cuttingRequirements.startedAt,
        completedAt: cuttingRequirements.completedAt,
        notes: cuttingRequirements.notes,
        createdAt: cuttingRequirements.createdAt,
        updatedAt: cuttingRequirements.updatedAt,
        
        // Material fields
        materialName: cuttingMaterials.materialName,
        materialType: cuttingMaterials.materialType,
        yieldPerCut: cuttingMaterials.yieldPerCut,
        wasteFactor: cuttingMaterials.wasteFactor,
        
        // Component fields
        componentName: cuttingComponents.componentName,
        quantityRequired: cuttingComponents.quantityRequired,
        
        // Category fields
        categoryName: cuttingProductCategories.categoryName,
        isP1: cuttingProductCategories.isP1,
        
        // Order fields
        orderDate: allOrders.orderDate,
        dueDate: allOrders.dueDate,
        customerId: allOrders.customerId,
        modelId: allOrders.modelId,
        currentDepartment: allOrders.currentDepartment,
      })
      .from(cuttingRequirements)
      .leftJoin(cuttingMaterials, eq(cuttingRequirements.materialId, cuttingMaterials.id))
      .leftJoin(cuttingComponents, eq(cuttingRequirements.componentId, cuttingComponents.id))
      .leftJoin(cuttingProductCategories, eq(cuttingComponents.productCategoryId, cuttingProductCategories.id))
      .leftJoin(allOrders, eq(cuttingRequirements.orderId, allOrders.orderId))
      .orderBy(
        asc(cuttingRequirements.isCompleted), // Incomplete first
        asc(allOrders.dueDate), // Then by due date
        desc(cuttingRequirements.createdAt) // Then by creation date
      );

    console.log(`📋 CUTTING TABLE: Found ${requirements.length} cutting requirements`);
    res.json(requirements);
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error fetching cutting requirements:', error);
    res.status(500).json({ 
      error: 'Failed to fetch cutting requirements',
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
// COMPLETE CUTTING REQUIREMENTS
// ============================================================================
const completeCuttingSchema = z.object({
  requirementIds: z.array(z.number().positive()),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/cutting-requirements/complete', async (req, res) => {
  try {
    console.log('✅ CUTTING TABLE: Completing cutting requirements...');
    
    const { requirementIds, assignedTo, notes } = completeCuttingSchema.parse(req.body);
    
    // Update cutting requirements
    const updateData: any = {
      cutsCompleted: sql`cuts_required`, // Set completed = required
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
    
    for (const requirementId of requirementIds) {
      const result = await db
        .update(cuttingRequirements)
        .set(updateData)
        .where(eq(cuttingRequirements.id, requirementId))
        .returning();
      
      results.push(...result);
    }

    console.log(`✅ CUTTING TABLE: Completed ${results.length} cutting requirements`);
    
    res.json({
      success: true,
      completedRequirements: results.length,
      message: `Successfully completed ${results.length} cutting requirement(s)`
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error completing requirements:', error);
    res.status(500).json({ 
      error: 'Failed to complete cutting requirements',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// PROGRESS ORDERS TO NEXT DEPARTMENT
// ============================================================================
const progressOrdersSchema = z.object({
  orderIds: z.array(z.string().min(1)),
});

router.post('/cutting-table/progress-orders', async (req, res) => {
  try {
    console.log('🔄 CUTTING TABLE: Progressing orders to next department...');
    
    const { orderIds } = progressOrdersSchema.parse(req.body);
    
    let progressedOrders = 0;
    
    for (const orderId of orderIds) {
      // Check if all cutting requirements for this order are completed
      const pendingRequirements = await db
        .select()
        .from(cuttingRequirements)
        .where(
          and(
            eq(cuttingRequirements.orderId, orderId),
            eq(cuttingRequirements.isCompleted, false)
          )
        );
      
      if (pendingRequirements.length === 0) {
        // All cutting requirements completed, progress to next department
        // For P1 orders: Cutting Table → Layup/Plugging
        // For P2 orders: Cutting Table → Barcode
        
        // Get order info to determine P1 vs P2
        const order = await db
          .select({ 
            currentDepartment: allOrders.currentDepartment,
            // Add a field to identify P2 orders if available, otherwise default to P1
          })
          .from(allOrders)
          .where(eq(allOrders.orderId, orderId))
          .limit(1);
        
        if (order.length > 0) {
          // Default to P1 workflow: Cutting Table → Layup
          const nextDepartment = 'Layup';
          
          await db
            .update(allOrders)
            .set({
              currentDepartment: nextDepartment,
              updatedAt: new Date(),
            })
            .where(eq(allOrders.orderId, orderId));
          
          progressedOrders++;
          console.log(`🔄 CUTTING TABLE: Order ${orderId} progressed to ${nextDepartment}`);
        }
      } else {
        console.log(`⚠️ CUTTING TABLE: Order ${orderId} has ${pendingRequirements.length} pending cutting requirements`);
      }
    }

    res.json({
      success: true,
      progressedOrders,
      totalOrders: orderIds.length,
      message: `Successfully progressed ${progressedOrders} of ${orderIds.length} orders`
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error progressing orders:', error);
    res.status(500).json({ 
      error: 'Failed to progress orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// CREATE CUTTING REQUIREMENTS FOR ORDER
// ============================================================================
const createRequirementsSchema = z.object({
  orderId: z.string().min(1),
  materialType: z.enum(['Carbon Fiber', 'Fiberglass', 'Primtex']).optional(),
  forceCreate: z.boolean().default(false),
});

router.post('/cutting-requirements/create', async (req, res) => {
  try {
    console.log('➕ CUTTING TABLE: Creating cutting requirements for order...');
    
    const { orderId, materialType, forceCreate } = createRequirementsSchema.parse(req.body);
    
    // Check if requirements already exist for this order
    const existingRequirements = await db
      .select()
      .from(cuttingRequirements)
      .where(eq(cuttingRequirements.orderId, orderId));
    
    if (existingRequirements.length > 0 && !forceCreate) {
      return res.status(400).json({
        error: 'Cutting requirements already exist for this order',
        existingCount: existingRequirements.length
      });
    }
    
    // Get order information
    const orderInfo = await db
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);
    
    if (orderInfo.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderInfo[0];
    
    // Determine which components are needed based on order
    // This is a simplified example - you'd implement business logic here
    let targetMaterialType = materialType;
    
    // If no material type specified, infer from stock model or features
    if (!targetMaterialType) {
      const modelId = order.modelId?.toLowerCase() || '';
      if (modelId.includes('carbon') || modelId.includes('cf_')) {
        targetMaterialType = 'Carbon Fiber';
      } else if (modelId.includes('fiberglass') || modelId.includes('fg_')) {
        targetMaterialType = 'Fiberglass';
      } else {
        targetMaterialType = 'Fiberglass'; // Default
      }
    }
    
    // Get components for the target material type
    const components = await db
      .select({
        id: cuttingComponents.id,
        materialId: cuttingComponents.materialId,
        componentName: cuttingComponents.componentName,
        quantityRequired: cuttingComponents.quantityRequired,
        materialType: cuttingMaterials.materialType,
      })
      .from(cuttingComponents)
      .leftJoin(cuttingMaterials, eq(cuttingComponents.materialId, cuttingMaterials.id))
      .leftJoin(cuttingProductCategories, eq(cuttingComponents.productCategoryId, cuttingProductCategories.id))
      .where(
        and(
          eq(cuttingMaterials.materialType, targetMaterialType),
          eq(cuttingComponents.isActive, true),
          eq(cuttingMaterials.isActive, true),
          eq(cuttingProductCategories.isActive, true)
        )
      );
    
    if (components.length === 0) {
      return res.status(400).json({
        error: `No active components found for material type: ${targetMaterialType}`
      });
    }
    
    // Create cutting requirements
    const newRequirements = [];
    
    for (const component of components) {
      const requirementData = {
        orderId,
        materialId: component.materialId,
        componentId: component.id,
        cutsRequired: component.quantityRequired, // Default to quantity required
        cutsCompleted: 0,
        isCompleted: false,
      };
      
      const requirement = await db
        .insert(cuttingRequirements)
        .values(requirementData)
        .returning();
      
      newRequirements.push(...requirement);
    }
    
    console.log(`➕ CUTTING TABLE: Created ${newRequirements.length} cutting requirements for order ${orderId}`);
    
    res.json({
      success: true,
      orderId,
      materialType: targetMaterialType,
      requirementsCreated: newRequirements.length,
      requirements: newRequirements
    });
  } catch (error) {
    console.error('❌ CUTTING TABLE: Error creating requirements:', error);
    res.status(500).json({ 
      error: 'Failed to create cutting requirements',
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

export default router;