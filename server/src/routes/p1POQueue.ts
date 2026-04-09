import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { pool } from '../../db';
import { insertPOProductSelectionSchema } from '@shared/schema';
import { nanoid } from 'nanoid';
import { authorizeApiRoute } from '../../middleware/routeAuthorization';
import { idempotencyMiddleware, logIdempotencyEvent } from '../../middleware/idempotency';
import { resolveItemDisplayName } from '../utils/resolveItemDisplayName';

const router = Router();

const METAL_ACCESSORY_PREFIXES = ['AGBM', 'AGBDL', 'AGM5', 'AGPIC', 'AGARCA'];

function normalizeSkuForMatch(sku: string): string {
  return sku.toUpperCase().replace(/[-_]/g, '');
}

function matchesMetal(value: string): boolean {
  const norm = normalizeSkuForMatch(value);
  return METAL_ACCESSORY_PREFIXES.some((p) => norm.startsWith(p));
}

function isMetalAccessorySku(itemName: string, itemId: string, itemType?: string): boolean {
  if (itemType && itemType.toLowerCase() !== 'stock_model') return true;
  if (itemName && matchesMetal(itemName)) return true;
  if (itemId && matchesMetal(itemId)) return true;
  return false;
}

router.use(authorizeApiRoute());

// Get all open P1 Purchase Orders grouped by customer
router.get('/purchase-orders/open', async (req: Request, res: Response) => {
  try {
    console.log('📦 P1 PO Queue: Fetching open purchase orders...');
    const openPOs = await storage.getOpenP1PurchaseOrders();
    const totalItems = openPOs.reduce((sum, c) => 
      sum + c.purchaseOrders.reduce((poSum, po) => 
        poSum + po.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0), 0);
    console.log(`📦 P1 PO Queue: Returning ${openPOs.length} customers with ${totalItems} total items`);
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

// Get all P1 PO production orders (items that have been scheduled into production)
router.get('/production-orders', async (req: Request, res: Response) => {
  try {
    console.log('📦 P1 PO Queue: Fetching production orders...');
    const result = await pool.query(`
      SELECT 
        po.id as order_id,
        po.order_id as display_order_id,
        po.po_id,
        po.po_item_id,
        po.customer_id,
        po.customer_name,
        po.po_number,
        po.item_type,
        po.item_id,
        po.item_name,
        po.specifications,
        po.order_date,
        po.due_date,
        po.production_status,
        po.current_department,
        po.is_fulfilled,
        po.fulfilled_date,
        po.laid_up_at,
        po.shipped_at,
        po.created_at,
        po.layup_completed_at,
        po.cnc_completed_at,
        po.finish_completed_at,
        po.gunsmith_completed_at,
        po.paint_completed_at,
        po.qc_completed_at,
        po.shipping_completed_at
      FROM production_orders po
      WHERE po.is_fulfilled = false
      ORDER BY po.customer_name, po.po_number, po.order_id
    `);
    
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    console.log(`📦 P1 PO Queue: Returning ${rows.length} production orders`);
    
    // Group by customer and PO number for better display
    const grouped: Record<string, { 
      customerId: string; 
      customerName: string; 
      purchaseOrders: Record<string, { 
        poNumber: string; 
        items: any[] 
      }> 
    }> = {};
    
    for (const row of rows) {
      const custKey = row.customer_id?.toString() || row.customer_name || 'Unknown';
      if (!grouped[custKey]) {
        grouped[custKey] = {
          customerId: custKey,
          customerName: row.customer_name || `Customer ${custKey}`,
          purchaseOrders: {}
        };
      }
      
      const poKey = row.po_number || 'No PO';
      if (!grouped[custKey].purchaseOrders[poKey]) {
        grouped[custKey].purchaseOrders[poKey] = {
          poNumber: poKey,
          items: []
        };
      }
      
      grouped[custKey].purchaseOrders[poKey].items.push({
        id: row.order_id,
        orderId: row.display_order_id,
        poId: row.po_id,
        poItemId: row.po_item_id,
        itemType: row.item_type,
        itemId: row.item_id,
        itemName: row.item_name,
        specifications: row.specifications,
        orderDate: row.order_date,
        dueDate: row.due_date,
        productionStatus: row.production_status,
        currentDepartment: row.current_department,
        isFulfilled: row.is_fulfilled,
        layupCompletedAt: row.layup_completed_at,
        cncCompletedAt: row.cnc_completed_at,
        finishCompletedAt: row.finish_completed_at,
        gunsmithCompletedAt: row.gunsmith_completed_at,
        paintCompletedAt: row.paint_completed_at,
        qcCompletedAt: row.qc_completed_at,
        shippingCompletedAt: row.shipping_completed_at
      });
    }
    
    // Convert to array format
    const result_array = Object.values(grouped).map(customer => ({
      customerId: customer.customerId,
      customerName: customer.customerName,
      purchaseOrders: Object.values(customer.purchaseOrders)
    }));
    
    res.json(result_array);
  } catch (error) {
    console.error('Error retrieving P1 PO production orders:', error);
    res.status(500).json({
      error: 'Failed to fetch P1 PO production orders',
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
// Uses idempotency middleware to prevent duplicate order creation on retries
router.post('/schedule', idempotencyMiddleware(), async (req: Request, res: Response) => {
  try {
    // Check if this is a replay of a previously completed request
    if (req.idempotency?.isReplay && req.idempotency.existingResponse) {
      logIdempotencyEvent('REPLAY_RETURNED', {
        endpoint: '/api/p1-po-queue/schedule',
        idempotencyKey: req.idempotency.idempotencyKey,
        existingOrderId: req.idempotency.existingOrderId
      });
      return res.status(req.idempotency.existingResponse.status).json(req.idempotency.existingResponse.body);
    }

    const { batchId, targetWeek } = req.body;

    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    // Get selections for this batch
    const selections = await storage.getPOProductSelections(batchId);

    if (selections.length === 0) {
      return res.status(404).json({ error: 'No selections found for this batch' });
    }

    const scheduledOrders: string[] = [];
    const metalDemandOrderIds: string[] = [];
    const metalDemandSkus: string[] = [];
    const warnings: Array<{ poProductId: number; warning: string }> = [];
    const errors: Array<{ poProductId: number; error: string }> = [];

    for (const selection of selections) {
      try {
        const poItemId = selection.poProductId;
        const quantity = selection.quantity || 1;

        // Get the purchase order item details
        const poItemQuery = `
          SELECT poi.*, po.id as po_id, po.po_number, po.customer_name, po.customer_id
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.id = $1
        `;
        const poItem = await pool.query(poItemQuery, [poItemId]);

        if (!poItem || poItem.length === 0) {
          errors.push({ poProductId: poItemId, error: 'Purchase order item not found' });
          continue;
        }

        const item = poItem[0];

        // Route custom_model (machined metal) items to bottom_metal_demands instead of production queue
        if (item.item_type === 'custom_model') {
          const orderId = `PO-${item.po_number}-${poItemId}`;
          const bottomMetalSku = item.item_name || '';

          const metalClient = await pool.connect();
          try {
            await metalClient.query('BEGIN');

            // Atomic upsert into bottom_metal_demands keyed on order_id.
            // If status is 'cancelled', re-open the record.
            await metalClient.query(
              `INSERT INTO bottom_metal_demands (order_id, bottom_metal_sku, quantity, status, created_at, updated_at)
               VALUES ($1, $2, $3, 'open', NOW(), NOW())
               ON CONFLICT (order_id) DO UPDATE
               SET bottom_metal_sku = EXCLUDED.bottom_metal_sku,
                   quantity = EXCLUDED.quantity,
                   status = 'open',
                   updated_at = NOW()`,
              [orderId, bottomMetalSku, quantity]
            );

            // Audit log entry for metal demand routing
            await metalClient.query(
              `INSERT INTO admin_audit_log
                 (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
              [
                orderId,
                'METAL_DEMAND_CREATED',
                'Metal Demand Created',
                JSON.stringify(null),
                JSON.stringify({
                  order_id: orderId,
                  bottom_metal_sku: bottomMetalSku,
                  quantity,
                  source_po_id: item.po_id,
                  source_po_item_id: poItemId,
                  po_number: item.po_number,
                }),
                (req as any).user?.username || 'SYSTEM',
                (req as any).user?.role || 'SYSTEM',
                'METAL_DEMAND_CREATED',
                `Metal demand created from PO release: PO #${item.po_number}`,
                req.ip ?? null,
                req.headers['user-agent'] ?? null,
              ]
            );

            // Atomically increment order_count so the item no longer appears as unscheduled
            await metalClient.query(
              `UPDATE purchase_order_items
               SET order_count = $1, updated_at = NOW()
               WHERE id = $2`,
              [quantity, poItemId]
            );

            await metalClient.query('COMMIT');

            metalDemandOrderIds.push(orderId);
            if (!metalDemandSkus.includes(bottomMetalSku)) {
              metalDemandSkus.push(bottomMetalSku);
            }
          } catch (metalTxError) {
            await metalClient.query('ROLLBACK');
            throw metalTxError;
          } finally {
            metalClient.release();
          }

          continue;
        }

        // Pre-release guard: use real-time count from production_orders (not cached order_count)
        // to avoid duplicates even when order_count has drifted due to partial failures.
        const realCountRows = await pool.query(
          `SELECT COUNT(*) AS cnt
           FROM production_orders
           WHERE po_item_id = $1
             AND production_status != 'CANCELLED'`,
          [poItemId]
        );
        const realOrderCount = parseInt(realCountRows[0]?.cnt ?? '0', 10);
        if (realOrderCount >= quantity) {
          console.warn(`⚠️  P1 PO Schedule: PO item ${poItemId} already fully released (${realOrderCount} active production orders >= quantity=${quantity}), skipping`);
          warnings.push({
            poProductId: poItemId,
            warning: `Already fully released (${realOrderCount} of ${quantity} orders exist)`,
          });
          continue;
        }

        const specs = item.specifications || {};
        const dueDate = item.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Wrap all inserts and the order_count update for this item in a transaction
        // so the count cannot drift if something fails mid-loop.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          let insertedCount = 0;

          // Only create the orders that are still missing (quantity minus what already exists).
          // Start the sequence after the already-existing orders so IDs are deterministic.
          const remainingToCreate = quantity - realOrderCount;

          // Detect metal accessories by item_name/item_id/item_type before inserting
          // Metal accessories must route to Shipping QC, not P1 Production Queue
          const itemIsMetalAccessory = isMetalAccessorySku(
            item.item_name || '',
            item.item_id || '',
            item.item_type || undefined
          );
          const targetDepartment = itemIsMetalAccessory ? 'Shipping QC' : 'P1 Production Queue';

          // Create orders in all_orders table with appropriate department
          for (let i = 0; i < remainingToCreate; i++) {
            // Use PO-format order ID for consistency with other PO releases
            // Format: PO-{po_number}-{po_item_id}-{sequence}
            // Sequence starts after existing orders so we never collide.
            const seqNum = realOrderCount + i + 1;
            const orderId = `PO-${item.po_number}-${poItemId}-${seqNum}`;
            const notes = `PO Item: ${item.item_name || ''} - PO #${item.po_number} (Unit ${i + 1} of ${quantity})`;
            const features = JSON.stringify({
              po_item_id: poItemId,
              po_number: item.po_number,
              po_id: item.po_id,
              specifications: specs,
              action_length: specs.action_length || '',
            });

            // Insert into all_orders table with the correct department.
            // ON CONFLICT DO NOTHING ensures idempotency now that a unique index exists on order_id.
            const insertOrderQuery = `
              INSERT INTO all_orders (
                order_id,
                order_date,
                due_date,
                customer_id,
                model_id,
                current_department,
                status,
                notes,
                features,
                order_source,
                source_po_id,
                source_po_item_id,
                department_history,
                created_at,
                updated_at
              ) VALUES (
                $1, NOW(), $2, $3, $4, $9, 'IN_PROGRESS', $5, $6::jsonb,
                'PO_RELEASE', $7, $8, '[]'::jsonb, NOW(), NOW()
              )
              ON CONFLICT (order_id) DO NOTHING
              RETURNING id
            `;
            const allOrderResult = await client.query(insertOrderQuery, [
              orderId,
              dueDate,
              item.customer_id || item.customer_name,
              item.item_id || '',
              notes,
              features,
              item.po_id,
              poItemId,
              targetDepartment,
            ]);

            // Only proceed with downstream inserts/audit for rows that were actually inserted
            if (!allOrderResult.rows || allOrderResult.rows.length === 0) {
              console.warn(`⚠️  P1 PO Schedule: order ${orderId} already exists in all_orders, skipping`);
              continue;
            }

            insertedCount++;

            await client.query(
              `INSERT INTO admin_audit_log
                 (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
              [
                orderId,
                'ORDER_CREATED',
                'Order Created',
                JSON.stringify(null),
                JSON.stringify({
                  order_id: orderId,
                  current_department: targetDepartment,
                  status: 'IN_PROGRESS',
                  order_source: 'PO_RELEASE',
                  source_po_id: item.po_id,
                  source_po_item_id: poItemId,
                }),
                (req as any).user?.username || 'SYSTEM',
                (req as any).user?.role || 'SYSTEM',
                'ORDER_CREATE',
                `Order created from PO release: PO #${item.po_number}`,
                req.ip ?? null,
                req.headers['user-agent'] ?? null,
              ]
            );

            // Also create a production_orders record for queue visibility
            const insertProductionOrderQuery = `
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
                department_history,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), $11,
                'PENDING', $12, '[]'::jsonb, NOW(), NOW()
              )
              ON CONFLICT (order_id) DO UPDATE
              SET current_department = $12,
                  production_status = 'PENDING',
                  updated_at = NOW()
            `;
            await client.query(insertProductionOrderQuery, [
              orderId,
              item.po_id,
              poItemId,
              item.customer_id || '',
              item.customer_name || '',
              item.po_number || '',
              specs.item_type || 'Stock',
              item.item_id || '',
              resolveItemDisplayName(item.item_name || ''),
              JSON.stringify(specs),
              dueDate,
              targetDepartment,
            ]);

            // Also add to layup_schedule table for scheduler visibility
            const scheduledDate = targetWeek
              ? new Date(targetWeek)
              : new Date(dueDate);

            const insertScheduleQuery = `
              INSERT INTO layup_schedule (
                order_id,
                scheduled_date,
                priority_score,
                is_locked,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, 1500, false, NOW(), NOW()
              )
              ON CONFLICT (order_id) DO UPDATE
              SET scheduled_date = $2,
                  updated_at = NOW()
            `;
            await client.query(insertScheduleQuery, [orderId, scheduledDate.toISOString()]);

            scheduledOrders.push(orderId);
          }

          // Atomically update order_count by only the number of rows actually inserted
          if (insertedCount > 0) {
            const updatePOQuery = `
              UPDATE purchase_order_items
              SET order_count = COALESCE(order_count, 0) + $1, updated_at = NOW()
              WHERE id = $2
            `;
            await client.query(updatePOQuery, [insertedCount, poItemId]);
          }

          await client.query('COMMIT');
        } catch (txError) {
          await client.query('ROLLBACK');
          throw txError;
        } finally {
          client.release();
        }

      } catch (error) {
        console.error(`Error scheduling PO item ${selection.poProductId}:`, error);
        errors.push({
          poProductId: selection.poProductId,
          error: (error as Error).message,
        });
      }
    }

    console.log(`📅 P1 PO Schedule: Created ${scheduledOrders.length} Production-Only Orders in P1 Production Queue`);
    if (metalDemandOrderIds.length > 0) {
      console.log(`🔩 P1 PO Schedule: Routed ${metalDemandOrderIds.length} custom_model item(s) to metal tracker (SKUs: ${metalDemandSkus.join(', ')})`);
    }

    const responseBody = {
      success: true,
      batchId,
      targetWeek: targetWeek || 'Current Week',
      selectionCount: selections.length,
      scheduledCount: scheduledOrders.length,
      metalDemandCount: metalDemandOrderIds.length,
      metalDemandSkus: metalDemandSkus.length > 0 ? metalDemandSkus : undefined,
      metalDemandOrderIds: metalDemandOrderIds.length > 0 ? metalDemandOrderIds : undefined,
      targetDepartment: 'P1 Production Queue',
      orderSource: 'PO_RELEASE',
      orderIds: scheduledOrders,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully created ${scheduledOrders.length} Production-Only Orders in P1 Production Queue${metalDemandOrderIds.length > 0 ? ` and routed ${metalDemandOrderIds.length} item(s) to metal tracker` : ''}`,
    };

    // Record idempotency for successful request (if idempotency key was provided).
    // Cover both production-queue releases and metal-only releases.
    const anyItemsProcessed = scheduledOrders.length > 0 || metalDemandOrderIds.length > 0;
    if (req.idempotency?.idempotencyKey && anyItemsProcessed) {
      const { storeIdempotencyKey } = await import('../../middleware/idempotency');
      const representativeId = scheduledOrders[0] ?? metalDemandOrderIds[0];
      await storeIdempotencyKey(
        req.idempotency.idempotencyKey,
        '/api/p1-po-queue/schedule',
        representativeId,
        200,
        responseBody
      );
    }

    res.json(responseBody);
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
        const poItemQuery = `
          SELECT poi.*, po.id as po_id, po.po_number, po.customer_name, po.customer_id
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.po_id = po.id
          WHERE poi.id = $1
        `;
        const poItem = await pool.query(poItemQuery, [poItemId]);

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
          // CENTRALIZED: Use atomic order ID generator instead of inline pattern
          const orderId = await storage.generateNextOrderId();
          
          const insertProdQuery = `
            INSERT INTO production_orders (
              order_id, po_id, po_item_id, customer_id, customer_name,
              po_number, item_type, item_id, item_name, specifications,
              order_date, due_date, production_status, current_department,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, 'stock', $7, $8, $9,
              NOW(), $10, 'LAID_UP', 'Barcode', NOW(), NOW()
            )
            ON CONFLICT (order_id) DO UPDATE
            SET current_department = 'Barcode',
                production_status = 'LAID_UP',
                updated_at = NOW()
          `;
          await pool.query(insertProdQuery, [
            orderId,
            item.po_id,
            poItemId,
            item.customer_id || '',
            item.customer_name,
            item.po_number,
            item.item_id || '',
            resolveItemDisplayName(item.item_name || ''),
            JSON.stringify(specs),
            dueDate,
          ]);

          progressedOrders.push(orderId);
        }

        // Update the orderCount in purchase_order_items to reflect scheduled quantity
        const newOrderCount = (item.order_count || 0) + quantity;
        const updatePoQuery = `
          UPDATE purchase_order_items
          SET order_count = $1, updated_at = NOW()
          WHERE id = $2
        `;
        await pool.query(updatePoQuery, [newOrderCount, poItemId]);
        
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

// Get stuck selection counts for all POs at once.
// Returns a map of { [poNumber]: stuckCount } for all POs that have any stuck selections.
// Used by the UI to conditionally show "Retry Failed Items" buttons.
router.get('/stuck-counts', async (req: Request, res: Response) => {
  try {
    const stuckQuery = `
      SELECT po.po_number, COUNT(*) as stuck_count
      FROM po_product_selections pps
      JOIN purchase_order_items poi ON poi.id = pps.po_product_id
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE (
        SELECT COUNT(*) FROM production_orders prod
        WHERE prod.po_item_id = poi.id
      ) < pps.quantity_selected
      GROUP BY po.po_number
    `;
    const result = await pool.query(stuckQuery);
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.po_number] = parseInt(row.stuck_count, 10);
    }
    res.json(counts);
  } catch (error) {
    console.error('Error getting stuck counts:', error);
    res.status(500).json({
      error: 'Failed to get stuck counts',
      details: (error as any).message,
    });
  }
});

// Get count of stuck selections for a given PO (by PO number).
// A "stuck" selection is one in po_product_selections where no corresponding
// production_orders record exists for the selected po_item_id.
// Used by the UI to decide whether to show the "Retry Failed Items" button.
router.get('/stuck-count/:poNumber', async (req: Request, res: Response) => {
  try {
    const poNum = decodeURIComponent(req.params.poNumber);

    // Find po_product_selections whose poProductId (treated as purchase_order_items.id)
    // belongs to this PO AND has no matching production_orders record
    const stuckQuery = `
      SELECT COUNT(*) as stuck_count
      FROM po_product_selections pps
      JOIN purchase_order_items poi ON poi.id = pps.po_product_id
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.po_number = $1
        AND (
          SELECT COUNT(*) FROM production_orders prod
          WHERE prod.po_item_id = poi.id
        ) < pps.quantity_selected
    `;
    const result = await pool.query(stuckQuery, [poNum]);
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    const stuckCount = parseInt(rows[0]?.stuck_count || '0', 10);

    res.json({ poNumber: poNum, stuckCount });
  } catch (error) {
    console.error('Error getting stuck count:', error);
    res.status(500).json({
      error: 'Failed to get stuck count',
      details: (error as any).message,
    });
  }
});

// Retry stuck selections for a given PO (by PO number).
//
// A "stuck" selection is one in po_product_selections where fewer production_orders
// records exist than quantity_selected (accounting for partial failure).
//
// The retry re-runs the exact same scheduling logic as /schedule for each
// individual order_id that is missing from production_orders. Per-table
// idempotency is used (each table is checked independently), so a partial
// failure in the original batch (e.g., all_orders inserted but production_orders
// failed) is correctly repaired without re-inserting rows that already exist.
//
// Order IDs are generated identically to /schedule: PO-{po_number}-{poItemId}-{i+1}
// where i is the 0-based unit index within the selection's quantity.
router.post('/retry-stuck/:poNumber', async (req: Request, res: Response) => {
  try {
    const poNum = decodeURIComponent(req.params.poNumber);
    const { targetWeek } = req.body;

    console.log(`🔄 P1 PO Retry: Starting retry for PO #${poNum}`);

    // Find selections from po_product_selections for this PO where the number of
    // existing production_orders < quantity_selected (partial or complete failure).
    // This correctly handles both fully-missing and partially-missing cases.
    const stuckSelectionsQuery = `
      SELECT
        pps.id as selection_id,
        pps.po_product_id as po_item_id,
        pps.quantity_selected as quantity,
        pps.selection_batch_id,
        poi.id as poi_id,
        poi.item_id,
        poi.item_name,
        poi.specifications,
        poi.due_date,
        poi.order_count,
        po.id as purchase_order_id,
        po.po_number,
        po.customer_id,
        po.customer_name,
        (
          SELECT COUNT(*) FROM production_orders prod
          WHERE prod.po_item_id = poi.id
        ) as existing_prod_order_count
      FROM po_product_selections pps
      JOIN purchase_order_items poi ON poi.id = pps.po_product_id
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.po_number = $1
        AND (
          SELECT COUNT(*) FROM production_orders prod
          WHERE prod.po_item_id = poi.id
        ) < pps.quantity_selected
    `;
    const stuckResult = await pool.query(stuckSelectionsQuery, [poNum]);
    const stuckSelections = Array.isArray(stuckResult) ? stuckResult : (stuckResult as any).rows || [];

    console.log(`🔄 P1 PO Retry: Found ${stuckSelections.length} stuck selections for PO #${poNum}`);

    if (stuckSelections.length === 0) {
      return res.json({
        success: true,
        message: `No stuck selections found for PO #${poNum}. All selected items already have production orders.`,
        stuckSelectionsFound: 0,
        recovered: 0,
        failed: 0,
      });
    }

    const scheduledOrders: string[] = [];
    const errors: Array<{ selectionId: number; poItemId: number; error: string }> = [];

    for (const sel of stuckSelections) {
      try {
        const poItemId = sel.po_item_id;
        // Use the quantity from the selection record (identical to /schedule)
        const quantity = sel.quantity || 1;

        const specs = sel.specifications || {};
        const dueDate = sel.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const scheduledDate = targetWeek ? new Date(targetWeek) : new Date(dueDate);

        // Generate the same order IDs as /schedule (i+1, not currentOrderCount+i+1)
        for (let i = 0; i < quantity; i++) {
          const orderId = `PO-${sel.po_number}-${poItemId}-${i + 1}`;
          const notes = `PO Item: ${sel.item_name || ''} - PO #${sel.po_number} (Unit ${i + 1} of ${quantity}) [RETRIED]`;
          const features = JSON.stringify({
            po_item_id: poItemId,
            po_number: sel.po_number,
            po_id: sel.purchase_order_id,
            specifications: specs,
            action_length: specs.action_length || '',
          });

          // Check each table independently for per-table idempotency.
          // A partial failure (e.g., all_orders OK, production_orders failed) is
          // repaired by inserting only the missing rows.

          // all_orders — insert only if missing
          const allOrdersExists = await pool.query(
            `SELECT id FROM all_orders WHERE order_id = $1 LIMIT 1`,
            [orderId]
          );
          const allOrdersExistsRows = Array.isArray(allOrdersExists) ? allOrdersExists : (allOrdersExists as any).rows || [];
          if (allOrdersExistsRows.length === 0) {
            await pool.query(`
              INSERT INTO all_orders (
                order_id, order_date, due_date, customer_id, model_id,
                current_department, status, notes, features, order_source,
                source_po_id, source_po_item_id, department_history, created_at, updated_at
              ) VALUES (
                $1, NOW(), $2, $3, $4, 'P1 Production Queue', 'IN_PROGRESS', $5, $6::jsonb,
                'PO_RELEASE', $7, $8, '[]'::jsonb, NOW(), NOW()
              )
            `, [
              orderId,
              dueDate,
              sel.customer_id || sel.customer_name,
              sel.item_id || '',
              notes,
              features,
              sel.purchase_order_id,
              poItemId,
            ]);

            await pool.query(
              `INSERT INTO admin_audit_log
                 (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
              [
                orderId,
                'ORDER_CREATED',
                'Order Created',
                JSON.stringify(null),
                JSON.stringify({
                  order_id: orderId,
                  current_department: 'P1 Production Queue',
                  status: 'IN_PROGRESS',
                  order_source: 'PO_RELEASE',
                  source_po_id: sel.purchase_order_id,
                  source_po_item_id: poItemId,
                  retry: true,
                  selection_id: sel.selection_id,
                }),
                (req as any).user?.username || 'SYSTEM',
                (req as any).user?.role || 'SYSTEM',
                'ORDER_CREATE',
                `Order created via retry for stuck batch selection (PO #${sel.po_number})`,
                req.ip ?? null,
                req.headers['user-agent'] ?? null,
              ]
            );
          } else {
            console.log(`🔄 Retry: all_orders already has ${orderId}, skipping insert`);
          }

          // production_orders — insert only if missing (DO NOTHING avoids resetting
          // progress for orders that have already advanced through departments)
          const prodInsertResult = await pool.query(`
            INSERT INTO production_orders (
              order_id, po_id, po_item_id, customer_id, customer_name,
              po_number, item_type, item_id, item_name, specifications,
              order_date, due_date, production_status, current_department,
              department_history, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), $11,
              'PENDING', 'P1 Production Queue', '[]'::jsonb, NOW(), NOW()
            )
            ON CONFLICT (order_id) DO NOTHING
            RETURNING order_id
          `, [
            orderId,
            sel.purchase_order_id,
            poItemId,
            sel.customer_id || '',
            sel.customer_name || '',
            sel.po_number || '',
            specs.item_type || 'Stock',
            sel.item_id || '',
            resolveItemDisplayName(sel.item_name || ''),
            JSON.stringify(specs),
            dueDate,
          ]);
          const prodInsertRows = Array.isArray(prodInsertResult) ? prodInsertResult : (prodInsertResult as any).rows || [];
          const prodOrderCreated = prodInsertRows.length > 0;

          // layup_schedule — insert only if missing (DO NOTHING to preserve any
          // existing schedule date for orders already in flight)
          await pool.query(`
            INSERT INTO layup_schedule (
              order_id, scheduled_date, priority_score, is_locked, created_at, updated_at
            ) VALUES ($1, $2, 1500, false, NOW(), NOW())
            ON CONFLICT (order_id) DO NOTHING
          `, [orderId, scheduledDate.toISOString()]);

          // Count as recovered only if the production_orders row was newly created
          if (prodOrderCreated) {
            scheduledOrders.push(orderId);
          } else {
            console.log(`🔄 Retry: production_orders already has ${orderId}, skipping (order already progressed)`);
          }
        }

        // Update order_count if we created new production orders.
        // Set to max(existing_count, quantity) to avoid double-counting.
        const targetOrderCount = Math.max(sel.order_count || 0, quantity);
        if (targetOrderCount !== (sel.order_count || 0)) {
          await pool.query(
            `UPDATE purchase_order_items SET order_count = $1, updated_at = NOW() WHERE id = $2`,
            [targetOrderCount, poItemId]
          );
        }

      } catch (err) {
        console.error(`🔄 Retry error for selection ${sel.selection_id} (po_item ${sel.po_item_id}):`, err);
        errors.push({
          selectionId: sel.selection_id,
          poItemId: sel.po_item_id,
          error: (err as Error).message,
        });
      }
    }

    console.log(`🔄 P1 PO Retry complete: ${scheduledOrders.length} orders processed, ${errors.length} selection(s) failed`);

    res.json({
      success: true,
      poNumber: poNum,
      stuckSelectionsFound: stuckSelections.length,
      recovered: scheduledOrders.length,
      failed: errors.length,
      orderIds: scheduledOrders,
      errors: errors.length > 0 ? errors : undefined,
      message: `Retry complete: processed ${scheduledOrders.length} order(s) for PO #${poNum}${errors.length > 0 ? `, ${errors.length} selection(s) still failing` : ''}`,
    });
  } catch (error) {
    console.error('Error retrying stuck selections:', error);
    res.status(500).json({
      error: 'Failed to retry stuck selections',
      details: (error as any).message,
    });
  }
});

// Backfill missing layup_schedule orders to production_orders
router.post('/backfill-production-orders', async (req: Request, res: Response) => {
  try {
    console.log('📦 P1 PO Queue: Starting backfill of missing production orders...');
    
    // Find layup_schedule entries that don't have corresponding production_orders
    const missingResult = await pool.query(`
      SELECT 
        ls.order_id,
        ls.mold_id,
        ls.scheduled_date,
        SPLIT_PART(ls.mold_id, '-', 1) as stock_model_name
      FROM layup_schedule ls
      WHERE ls.order_id LIKE 'PO-%'
        AND ls.order_id NOT IN (SELECT order_id FROM production_orders WHERE order_id IS NOT NULL)
    `);
    
    const missing = Array.isArray(missingResult) ? missingResult : (missingResult as any).rows || [];
    console.log(`📦 Found ${missing.length} missing production orders to backfill`);
    
    if (missing.length === 0) {
      return res.json({ message: 'No missing orders to backfill', backfilled: 0 });
    }
    
    // Customer mapping based on PO number patterns
    const getCustomerInfo = (orderId: string): { customerId: number; customerName: string; poNumber: string } => {
      if (orderId.includes('RFPO-002612')) return { customerId: 154, customerName: 'Pure Precision', poNumber: 'RFPO-002612' };
      if (orderId.includes('P18380')) return { customerId: 698, customerName: 'Red Hawk Rifles LLC', poNumber: 'P18380' };
      if (orderId.includes('P18432')) return { customerId: 698, customerName: 'Red Hawk Rifles LLC', poNumber: 'P18432' };
      if (orderId.includes('P18526')) return { customerId: 698, customerName: 'Red Hawk Rifles LLC', poNumber: 'P18526' };
      if (orderId.includes('SWS2504')) return { customerId: 23, customerName: 'Suppressed Weapons Systems', poNumber: 'SWS2504' };
      if (orderId.includes('58625276')) return { customerId: 1476, customerName: 'MidwayUSA Inc', poNumber: '58625276' };
      return { customerId: 0, customerName: 'Unknown', poNumber: 'UNKNOWN' };
    };
    
    let backfilled = 0;
    const errors: string[] = [];
    
    for (const row of missing) {
      try {
        const { customerId, customerName, poNumber } = getCustomerInfo(row.order_id);
        const stockModelName = row.stock_model_name || row.mold_id?.split('-')[0] || 'Unknown';

        const parts = row.order_id.split('-');
        const poItemId = parts.length >= 4 ? parseInt(parts[parts.length - 2], 10) : null;

        let itemType = 'stock';
        let specs: any = null;
        let poId: number | null = null;

        let itemId = '';
        let itemName = stockModelName;

        if (poItemId && !isNaN(poItemId)) {
          const poItemResult = await pool.query(
            `SELECT poi.item_type, poi.item_id, poi.item_name, poi.specifications, poi.po_id
             FROM purchase_order_items poi
             WHERE poi.id = $1`,
            [poItemId]
          );
          if (poItemResult.length > 0) {
            const poItem = poItemResult[0];
            itemType = poItem.item_type || 'stock';
            itemId = poItem.item_id || '';
            itemName = poItem.item_name || stockModelName;
            specs = poItem.specifications || null;
            poId = poItem.po_id || null;
            if (!specs) {
              console.warn(`Backfill warning: purchase_order_items id=${poItemId} has null specifications for order ${row.order_id}`);
            }
          } else {
            console.warn(`Backfill warning: purchase_order_items id=${poItemId} not found for order ${row.order_id}`);
          }
        } else {
          console.warn(`Backfill warning: Could not parse po_item_id from order_id ${row.order_id}`);
        }

        await pool.query(`
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
            current_department,
            production_status,
            order_date,
            due_date,
            is_fulfilled,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'Layup/Plugging', 'PENDING', $11, $11, false, NOW(), NOW())
        `, [
          row.order_id,
          poId,
          poItemId,
          customerId,
          customerName,
          poNumber,
          itemType,
          itemId,
          itemName,
          specs ? JSON.stringify(specs) : '{}',
          row.scheduled_date,
        ]);
        
        backfilled++;
      } catch (err: any) {
        errors.push(`${row.order_id}: ${err.message}`);
      }
    }
    
    console.log(`📦 Backfill complete: ${backfilled} orders added, ${errors.length} errors`);
    
    res.json({
      message: `Backfilled ${backfilled} production orders`,
      backfilled,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error backfilling production orders:', error);
    res.status(500).json({
      error: 'Failed to backfill production orders',
      details: (error as any).message,
    });
  }
});

export default router;
