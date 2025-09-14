import { Router } from 'express';
import { db } from '../../db';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// ============================================================================
// GET MATERIAL INVENTORY
// ============================================================================
router.get('/material-inventory', async (req, res) => {
  try {
    console.log('📦 MATERIALS: Fetching material inventory...');
    
    const materials = await db.query('SELECT * FROM material_inventory WHERE is_active = true ORDER BY material_name');

    console.log(`📦 MATERIALS: Found ${materials.rows.length} materials`);
    
    const transformedMaterials = materials.rows.map(material => ({
      id: material.id,
      materialName: material.material_name,
      materialType: material.material_type,
      currentStock: material.current_stock,
      minimumStock: material.minimum_stock,
      maximumStock: material.maximum_stock,
      unit: material.unit,
      locationBuilding: material.location_building,
      locationSection: material.location_section,
      locationShelf: material.location_shelf,
      supplier: material.supplier,
      costPerUnit: parseFloat(material.cost_per_unit || 0),
      lastReceived: material.last_received,
      lastUpdated: material.last_updated,
      notes: material.notes,
      isActive: material.is_active
    }));

    res.json(transformedMaterials);
  } catch (error) {
    console.error('❌ MATERIALS: Error fetching inventory:', error);
    res.status(500).json({ 
      error: 'Failed to fetch material inventory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// ADD MATERIAL TO INVENTORY
// ============================================================================
const addMaterialSchema = z.object({
  materialName: z.string().min(1),
  materialType: z.string().min(1),
  currentStock: z.number().min(0),
  minimumStock: z.number().min(0),
  maximumStock: z.number().min(0),
  unit: z.string().min(1),
  locationBuilding: z.string().min(1),
  locationSection: z.string().optional(),
  locationShelf: z.string().optional(),
  supplier: z.string().optional(),
  costPerUnit: z.number().min(0),
  notes: z.string().optional(),
});

router.post('/material-inventory', async (req, res) => {
  try {
    console.log('➕ MATERIALS: Adding new material...');
    
    const materialData = addMaterialSchema.parse(req.body);
    
    const result = await db.query(`
      INSERT INTO material_inventory (
        material_name, material_type, current_stock, minimum_stock, maximum_stock,
        unit, location_building, location_section, location_shelf, supplier,
        cost_per_unit, notes, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, [
      materialData.materialName,
      materialData.materialType,
      materialData.currentStock,
      materialData.minimumStock,
      materialData.maximumStock,
      materialData.unit,
      materialData.locationBuilding,
      materialData.locationSection || null,
      materialData.locationShelf || null,
      materialData.supplier || null,
      materialData.costPerUnit,
      materialData.notes || null
    ]);
    
    console.log(`➕ MATERIALS: Created material: ${materialData.materialName}`);
    
    const newMaterial = result.rows[0];
    res.json({
      success: true,
      material: {
        id: newMaterial.id,
        materialName: newMaterial.material_name,
        materialType: newMaterial.material_type,
        currentStock: newMaterial.current_stock,
        minimumStock: newMaterial.minimum_stock,
        maximumStock: newMaterial.maximum_stock,
        unit: newMaterial.unit,
        locationBuilding: newMaterial.location_building,
        locationSection: newMaterial.location_section,
        locationShelf: newMaterial.location_shelf,
        supplier: newMaterial.supplier,
        costPerUnit: parseFloat(newMaterial.cost_per_unit || 0),
        notes: newMaterial.notes,
        isActive: newMaterial.is_active,
        createdAt: newMaterial.created_at
      }
    });
  } catch (error) {
    console.error('❌ MATERIALS: Error adding material:', error);
    res.status(500).json({ 
      error: 'Failed to add material',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// RECORD MATERIAL RECEIPT
// ============================================================================
const receiptSchema = z.object({
  materialId: z.number().positive(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
  totalCost: z.number().min(0),
  supplier: z.string().optional(),
  purchaseOrder: z.string().optional(),
  receivedBy: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/material-receipts', async (req, res) => {
  try {
    console.log('📦 MATERIALS: Recording material receipt...');
    
    const receiptData = receiptSchema.parse(req.body);
    
    // Start transaction
    await db.query('BEGIN');
    
    try {
      // Record the receipt
      const receiptResult = await db.query(`
        INSERT INTO material_receipts (
          material_id, quantity_received, unit_cost, total_cost,
          supplier, purchase_order, received_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        receiptData.materialId,
        receiptData.quantity,
        receiptData.unitCost,
        receiptData.totalCost,
        receiptData.supplier || null,
        receiptData.purchaseOrder || null,
        receiptData.receivedBy || null,
        receiptData.notes || null
      ]);
      
      // Update inventory stock
      await db.query(`
        UPDATE material_inventory 
        SET current_stock = current_stock + $1,
            last_received = NOW(),
            last_updated = NOW()
        WHERE id = $2
      `, [receiptData.quantity, receiptData.materialId]);
      
      await db.query('COMMIT');
      
      console.log(`📦 MATERIALS: Receipt recorded for material ID ${receiptData.materialId}`);
      
      const receipt = receiptResult.rows[0];
      res.json({
        success: true,
        receipt: {
          id: receipt.id,
          materialId: receipt.material_id,
          quantityReceived: receipt.quantity_received,
          unitCost: parseFloat(receipt.unit_cost),
          totalCost: parseFloat(receipt.total_cost),
          supplier: receipt.supplier,
          purchaseOrder: receipt.purchase_order,
          receivedBy: receipt.received_by,
          notes: receipt.notes,
          receivedDate: receipt.received_date
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ MATERIALS: Error recording receipt:', error);
    res.status(500).json({ 
      error: 'Failed to record material receipt',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;