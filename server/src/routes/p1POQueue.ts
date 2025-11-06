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

    // Process each PO item: create/update orders and set to Barcode department
    const progressedOrders: string[] = [];
    const errors: Array<{ poProductId: number; error: string }> = [];

    for (const selection of selectionsToProgress) {
      try {
        const poProductId = selection.poProductId;
        const quantity = selection.quantity || 1;

        // Get the PO product details
        const poProduct = await pool.query`
          SELECT * FROM po_products WHERE id = ${poProductId}
        `;

        if (!poProduct || poProduct.length === 0) {
          errors.push({ poProductId, error: 'PO product not found' });
          continue;
        }

        const product = poProduct[0];

        // Check if this PO product already has an associated order
        if (product.order_id) {
          // Update existing order to Barcode department
          await pool.query`
            UPDATE "allOrders"
            SET current_department = 'Barcode',
                updated_at = NOW()
            WHERE order_id = ${product.order_id}
          `;
          
          // Update PO product status to prevent re-queueing
          await pool.query`
            UPDATE po_products
            SET status = 'scheduled',
                updated_at = NOW()
            WHERE id = ${poProductId}
          `;
          
          progressedOrders.push(product.order_id);
        } else {
          // Create new order(s) for this PO product
          // For now, we'll create one order per PO item
          // This matches the quantity in the PO product
          const orderId = `P1-${product.po_number}-${product.id}`;
          
          await pool.query`
            INSERT INTO "allOrders" (
              order_id,
              customer_id,
              customer_name,
              model_id,
              stock_model_id,
              current_department,
              status,
              order_date,
              created_at,
              updated_at
            ) VALUES (
              ${orderId},
              ${product.customer_id || null},
              ${product.customer_name},
              ${product.stock_model || 'unknown'},
              ${product.stock_model || 'unknown'},
              'Barcode',
              'in_production',
              NOW(),
              NOW(),
              NOW()
            )
            ON CONFLICT (order_id) DO UPDATE
            SET current_department = 'Barcode',
                updated_at = NOW()
          `;

          // Link the order back to the PO product
          await pool.query`
            UPDATE po_products
            SET order_id = ${orderId},
                status = 'scheduled',
                updated_at = NOW()
            WHERE id = ${poProductId}
          `;

          progressedOrders.push(orderId);
        }
      } catch (error) {
        console.error(`Error progressing PO product ${selection.poProductId}:`, error);
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
