import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { pool } from '../../db';
import { insertPOProductSelectionSchema } from '@shared/schema';
import { nanoid } from 'nanoid';

const router = Router();

// Get all open P1 Purchase Orders grouped by customer
router.get('/purchase-orders/open', async (req: Request, res: Response) => {
  try {
    const openPOs = await storage.getOpenP1PurchaseOrders();
    res.json(openPOs);
  } catch (error) {
    console.error('Error retrieving open P1 purchase orders:', error);
    res.status(500).json({
      error: 'Failed to fetch open P1 purchase orders',
      details: (error as any).message,
    });
  }
});

// Get all P1 PO queue items grouped by customer and PO number
router.get('/', async (req: Request, res: Response) => {
  try {
    const groupedItems = await storage.getP1POQueueGrouped();
    res.json(groupedItems);
  } catch (error) {
    console.error('Error retrieving P1 PO queue:', error);
    res.status(500).json({
      error: 'Failed to fetch P1 PO queue',
      details: (error as any).message,
    });
  }
});

// Get mold availability
router.get('/mold-availability', async (req: Request, res: Response) => {
  try {
    const availability = await storage.getMoldAvailability();
    res.json(availability);
  } catch (error) {
    console.error('Error retrieving mold availability:', error);
    res.status(500).json({
      error: 'Failed to fetch mold availability',
      details: (error as any).message,
    });
  }
});

// Create selection batch (select PO items for scheduling)
router.post('/select', async (req: Request, res: Response) => {
  try {
    const { selections } = req.body;
    
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    // Generate a unique batch ID
    const batchId = `batch_${nanoid()}`;

    // Create selection records for each selected item
    const createdSelections = await Promise.all(
      selections.map((selection: any) => {
        const validatedData = insertPOProductSelectionSchema.parse({
          ...selection,
          selectionBatchId: batchId,
        });
        return storage.createPOProductSelection(validatedData);
      })
    );

    res.status(201).json({
      batchId,
      selections: createdSelections,
      count: createdSelections.length,
    });
  } catch (error) {
    console.error('Error creating selection batch:', error);
    res.status(500).json({
      error: 'Failed to create selection batch',
      details: (error as any).message,
    });
  }
});

// Get selections for a specific batch
router.get('/selections/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const selections = await storage.getPOProductSelections(batchId);
    res.json(selections);
  } catch (error) {
    console.error('Error retrieving selections:', error);
    res.status(500).json({
      error: 'Failed to fetch selections',
      details: (error as any).message,
    });
  }
});

// Generate weekly layup schedule from selections
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { batchId, targetWeek } = req.body;

    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    // Get selections for this batch
    const selections = await storage.getPOProductSelections(batchId);

    if (selections.length === 0) {
      return res.status(404).json({ error: 'No selections found for this batch' });
    }

    // TODO: Implement layup schedule generation using existing LayupScheduler service
    // This will integrate with the shared/services/LayupSchedulerService.ts
    // For now, return a placeholder response
    res.json({
      batchId,
      targetWeek: targetWeek || 'Current Week',
      selectionCount: selections.length,
      message: 'Schedule generation will be implemented in next phase',
      selections,
    });
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({
      error: 'Failed to generate schedule',
      details: (error as any).message,
    });
  }
});

// Progress selected items to Barcode department
router.post('/progress', async (req: Request, res: Response) => {
  try {
    const { batchId, selections } = req.body;

    if (!batchId && (!selections || selections.length === 0)) {
      return res.status(400).json({ 
        error: 'Either batchId or selections array is required' 
      });
    }

    let selectionsToProgress;
    
    if (batchId) {
      // Get selections from batch
      selectionsToProgress = await storage.getPOProductSelections(batchId);
    } else {
      selectionsToProgress = selections;
    }

    if (selectionsToProgress.length === 0) {
      return res.status(404).json({ error: 'No selections to progress' });
    }

    // Process each purchase order item: update orderCount and create production orders
    const progressedOrders: string[] = [];
    const errors: Array<{ poProductId: number; error: string }> = [];

    for (const selection of selectionsToProgress) {
      try {
        const poItemId = selection.poProductId; // Actually purchase_order_items.id
        const quantity = selection.quantity || 1;

        // Get the purchase order item details
        const poItem = await pool.query`
          SELECT poi.*, po.id as po_id, po.po_number, po.customer_name, po.customer_id
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.id = ${poItemId}
        `;

        if (!poItem || poItem.length === 0) {
          errors.push({ poProductId: poItemId, error: 'Purchase order item not found' });
          continue;
        }

        const item = poItem[0];
        const specs = item.specifications || {};
        
        // Use a default due date if none is provided (30 days from now)
        const dueDate = item.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        // Create production orders for the selected quantity
        for (let i = 0; i < quantity; i++) {
          const currentOrderCount = (item.order_count || 0) + i + 1;
          const orderId = `P1-${item.po_number}-${poItemId}-${currentOrderCount}`;
          
          await pool.query`
            INSERT INTO production_orders (
              order_id,
              po_id,
              po_item_id,
              customer_id,
              customer_name,
              po_number,
              item_type,
              item_id,
              item_name,
              specifications,
              order_date,
              due_date,
              production_status,
              current_department,
              created_at,
              updated_at
            ) VALUES (
              ${orderId},
              ${item.po_id},
              ${poItemId},
              ${item.customer_id || ''},
              ${item.customer_name},
              ${item.po_number},
              'stock',
              ${item.item_id || ''},
              ${item.item_name || ''},
              ${JSON.stringify(specs)},
              NOW(),
              ${dueDate},
              'LAID_UP',
              'Barcode',
              NOW(),
              NOW()
            )
            ON CONFLICT (order_id) DO UPDATE
            SET current_department = 'Barcode',
                production_status = 'LAID_UP',
                updated_at = NOW()
          `;

          progressedOrders.push(orderId);
        }

        // Update the orderCount in purchase_order_items to reflect scheduled quantity
        const newOrderCount = (item.order_count || 0) + quantity;
        await pool.query`
          UPDATE purchase_order_items
          SET order_count = ${newOrderCount},
              updated_at = NOW()
          WHERE id = ${poItemId}
        `;
        
      } catch (error) {
        console.error(`Error progressing PO item ${selection.poProductId}:`, error);
        errors.push({
          poProductId: selection.poProductId,
          error: (error as Error).message,
        });
      }
    }

    res.json({
      success: true,
      message: `Progressed ${progressedOrders.length} items to Barcode`,
      itemsProgressed: progressedOrders.length,
      targetDepartment: 'Barcode',
      orderIds: progressedOrders,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error progressing orders:', error);
    res.status(500).json({
      error: 'Failed to progress orders',
      details: (error as any).message,
    });
  }
});

export default router;
