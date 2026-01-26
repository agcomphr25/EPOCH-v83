import { Router } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { createShipment, ShipTo } from '../utils/upsShipping';

const router = Router();

// GET /api/po-orders/shipping-qc
// Returns PO orders in Shipping QC department, grouped by customer → PO → items
router.get('/shipping-qc', authenticateToken, async (req, res) => {
  try {
    console.log('📦 Fetching PO orders in Shipping QC...');
    const { storage } = await import('../../storage');

    const customers = await storage.getPOOrdersInShippingQC();
    
    const totalItems = customers.reduce(
      (total, customer) =>
        total +
        customer.pos.reduce((sum, po) => sum + po.items.length, 0),
      0
    );
    
    console.log(`📊 Found ${totalItems} PO items in Shipping QC across ${customers.length} customers`);

    res.json(customers);
  } catch (error: any) {
    console.error('❌ Error fetching PO orders in Shipping QC:', error);
    res
      .status(500)
      .json({ _error: 'Failed to fetch PO orders', details: error.message });
  }
});

// GET /api/po-orders/all-p1-with-status
// Returns ALL P1 PO orders with full item status tracking across all departments
router.get('/all-p1-with-status', authenticateToken, async (req, res) => {
  try {
    console.log('📦 Fetching all P1 PO orders with department statuses...');
    const { storage } = await import('../../storage');

    const customers = await storage.getAllP1POOrdersWithStatus();
    
    const totalPOs = customers.reduce((sum, customer) => sum + customer.pos.length, 0);
    const totalItems = customers.reduce(
      (sum, customer) =>
        sum + customer.pos.reduce((poSum, po) => poSum + po.items.length, 0),
      0
    );
    
    console.log(`📊 Found ${totalItems} PO items across ${totalPOs} POs from ${customers.length} customers`);

    res.json(customers);
  } catch (error: any) {
    console.error('❌ Error fetching all P1 PO orders:', error);
    res
      .status(500)
      .json({ _error: 'Failed to fetch P1 PO orders', details: error.message });
  }
});

// POST /api/po-orders/packing-slips
// Generate packing slips for selected PO items (one PDF per PO)
router.post('/packing-slips', authenticateToken, async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(`📄 Generating packing slips for ${orderIds.length} PO items...`);
    const { storage } = await import('../../storage');

    // Fetch order details - handle both Order IDs and poItemId-unitNumber format
    const orderDetails = await Promise.all(
      orderIds.map(async (itemKey) => {
        let order: any = null;
        let poItem: any = null;
        
        // Check if this is in poItemId-unitNumber format (e.g., "92-1")
        const match = itemKey.match(/^(\d+)-(\d+)$/);
        
        if (match) {
          // Format: poItemId-unitNumber
          const poItemId = parseInt(match[1]);
          const unitNumber = parseInt(match[2]);
          console.log(`🔍 Looking up by PO item ID ${poItemId}, unit ${unitNumber}`);
          
          // Get PO item directly
          poItem = await storage.getPurchaseOrderItem(poItemId);
          if (!poItem) {
            console.warn(`⚠️ PO item ${poItemId} not found`);
            return null;
          }
          
          // Get PO to access customer information
          const tempPo = await storage.getPurchaseOrder(poItem.poId);
          if (!tempPo) {
            console.warn(`⚠️ PO ${poItem.poId} not found`);
            return null;
          }
          
          // For PO items without orderIds, create a minimal order object for packing slip generation
          // Customer info comes from the PO, not the PO item
          order = {
            poItemId,
            unitNumber,
            orderId: `Unit ${unitNumber}`,
            item_id: poItem.stockModelId,
            item_name: poItem.stockModelName,
            specifications: poItem.specifications,
            customer_id: tempPo.customerId,
            customer_name: tempPo.customerName || '',
            po_number: tempPo.poNumber || '',
            due_date: poItem.dueDate,
          };
        } else {
          // Standard Order ID format (e.g., "AG123", "EH456")
          order = await storage.getProductionOrderByOrderId(itemKey);
          if (!order) {
            console.warn(`⚠️ Order ${itemKey} not found`);
            return null;
          }

          // Get PO item details
          if (!order.poItemId) {
            console.warn(`⚠️ Order ${itemKey} has no PO item ID`);
            return null;
          }

          poItem = await storage.getPurchaseOrderItem(order.poItemId);
          if (!poItem) {
            console.warn(`⚠️ PO item ${order.poItemId} not found`);
            return null;
          }
        }

        // Get PO details
        const po = await storage.getPurchaseOrder(poItem.poId);
        if (!po) {
          console.warn(`⚠️ PO ${poItem.poId} not found`);
          return null;
        }

        return {
          order,
          poItem,
          po,
        };
      })
    );

    // Filter out nulls and group by PO number
    const validOrders = orderDetails.filter((d) => d !== null);
    const poGroups = new Map<string, typeof validOrders>();

    validOrders.forEach((detail) => {
      const poNumber = detail.po.poNumber;
      if (!poGroups.has(poNumber)) {
        poGroups.set(poNumber, []);
      }
      poGroups.get(poNumber)!.push(detail);
    });

    console.log(`📦 Grouped into ${poGroups.size} PO(s)`);

    // Generate one PDF per PO
    const pdfs: Array<{ poNumber: string; pdf: Buffer }> = [];

    for (const [poNumber, items] of poGroups.entries()) {
      const pdfDoc = await PDFDocument.create();
      let currentPage = pdfDoc.addPage([612, 792]); // US Letter
      const { width, height } = currentPage.getSize();

      const margin = 50;
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Get customer ID and name from PO (Purchase Order has the customer info)
      const customerId = items[0].po.customerId;
      const customerName = items[0].po.customerName || 'Unknown Customer';
      
      const customerAddress = customerId ? await storage.getCustomerDefaultAddress(String(customerId)) : null;
      
      // Generate invoice number
      const invoiceNumber = await storage.getNextInvoiceNumber(String(customerId || '0'), customerName);

      let currentY = height - margin;

      // ========== HEADER ==========
      currentPage.drawText('AG COMPOSITES', {
        x: margin,
        y: currentY,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // AG Composites Address (Ship From) - Right aligned
      const agAddress = [
        '230 Hamer Rd',
        'Owens Cross Roads, AL 35763',
        'Phone: (256) 723-8381'
      ];
      let agAddressY = currentY;
      agAddress.forEach((line) => {
        const textWidth = font.widthOfTextAtSize(line, 9);
        currentPage.drawText(line, {
          x: width - margin - textWidth,
          y: agAddressY,
          size: 9,
          font: font,
        });
        agAddressY -= 12;
      });

      currentY -= 35;
      currentPage.drawText('PACKING SLIP', {
        x: margin,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // ========== INVOICE & DATE INFO ==========
      currentY -= 30;
      currentPage.drawText(`Invoice #: ${invoiceNumber}`, {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
        x: width - margin - 150,
        y: currentY,
        size: 11,
        font: font,
      });

      currentY -= 20;
      currentPage.drawText(`PO Number: ${poNumber}`, {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      // ========== SHIP TO ADDRESS ==========
      currentY -= 30;
      currentPage.drawText('SHIP TO:', {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentY -= 15;
      currentPage.drawText(customerName, {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
      });

      if (customerAddress) {
        currentY -= 15;
        currentPage.drawText(customerAddress.street, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });

        if (customerAddress.street2) {
          currentY -= 15;
          currentPage.drawText(customerAddress.street2, {
            x: margin,
            y: currentY,
            size: 10,
            font: font,
          });
        }

        currentY -= 15;
        currentPage.drawText(`${customerAddress.city}, ${customerAddress.state} ${customerAddress.zipCode}`, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });
      }

      // ========== TRACKING NUMBER (placeholder) ==========
      currentY -= 25;
      currentPage.drawText('Tracking #: _________________________', {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
      });

      // Items table header
      currentY -= 40;
      currentPage.drawText('Item', {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText('Description', {
        x: margin + 80,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText('Unit #', {
        x: margin + 350,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      // Draw line under header
      currentY -= 5;
      currentPage.drawLine({
        start: { x: margin, y: currentY },
        end: { x: width - margin, y: currentY },
        thickness: 1,
        color: rgb(0, 0, 0),
      });

      // Items
      currentY -= 20;
      items.forEach((item, idx) => {
        // Add new page if needed
        if (currentY < margin + 50) {
          currentPage = pdfDoc.addPage([612, 792]);
          currentY = height - margin;
        }

        // Use explicit unitNumber from order object if available, otherwise try regex extraction
        const unitNumber = item.order.unitNumber || 
          (() => {
            const unitMatch = item.order.orderId.match(/-(\d+)$/);
            return unitMatch ? parseInt(unitMatch[1]) : 1;
          })();

        currentPage.drawText(`${idx + 1}`, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });

        // Use itemName for the product identifier (e.g., AG-CRB-AHV205-ER)
        const itemName = item.poItem.itemName || item.poItem.stockModelName || 'N/A';
        const truncatedName = itemName.length > 30 ? itemName.substring(0, 30) + '...' : itemName;
        
        currentPage.drawText(truncatedName, {
          x: margin + 80,
          y: currentY,
          size: 9,
          font: font,
        });

        currentPage.drawText(`${unitNumber}`, {
          x: margin + 350,
          y: currentY,
          size: 10,
          font: font,
        });

        currentY -= 20;
      });

      // Footer on last page
      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const footerY = margin + 20;
      lastPage.drawText(`Total Items: ${items.length}`, {
        x: margin,
        y: footerY,
        size: 11,
        font: boldFont,
      });

      const pdfBytes = await pdfDoc.save();
      pdfs.push({
        poNumber,
        pdf: Buffer.from(pdfBytes),
      });
    }

    // Always return JSON with base64 PDFs (consistent format)
    res.json({
      pdfs: pdfs.map((p) => ({
        poNumber: p.poNumber,
        filename: `Packing-Slip-PO-${p.poNumber}.pdf`,
        data: p.pdf.toString('base64'),
      })),
    });
  } catch (error: any) {
    console.error('❌ Error generating packing slips:', error);
    res.status(500).json({ _error: 'Failed to generate packing slips', details: error.message });
  }
});

// POST /api/po-orders/progress-to-shipping
// Move selected PO items from Shipping QC to Shipping department
router.post('/progress-to-shipping', async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(`📦 Progressing ${orderIds.length} PO items to Shipping...`);
    const { storage } = await import('../../storage');

    const results = {
      success: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    // Process each order with validation
    for (const orderId of orderIds) {
      try {
        const order = await storage.getProductionOrderByOrderId(orderId);
        
        // Validate order exists
        if (!order) {
          results.failed.push({ orderId, reason: 'Order not found' });
          console.warn(`⚠️ ${orderId}: Order not found`);
          continue;
        }

        // Validate order is in Shipping QC
        if (order.currentDepartment !== 'Shipping QC') {
          results.failed.push({
            orderId,
            reason: `Order is in ${order.currentDepartment}, not Shipping QC`,
          });
          console.warn(`⚠️ ${orderId}: Wrong department (${order.currentDepartment})`);
          continue;
        }

        // Update to Shipping department
        await storage.updateProductionOrder(order.id, {
          currentDepartment: 'Shipping',
        });

        results.success.push(orderId);
        console.log(`✅ ${orderId} progressed to Shipping`);
      } catch (error: any) {
        console.error(`❌ Failed to progress ${orderId}:`, error);
        results.failed.push({ orderId, reason: error.message });
      }
    }

    console.log(`✅ Successfully progressed ${results.success.length} items`);
    if (results.failed.length > 0) {
      console.warn(`⚠️ Failed to progress ${results.failed.length} items:`, results.failed);
    }

    // Always return 200 with success/failed arrays (never throw)
    res.json({
      success: results.success,
      failed: results.failed,
      message: `Progressed ${results.success.length}/${orderIds.length} items to Shipping`,
    });
  } catch (error: any) {
    console.error('❌ Error progressing PO orders:', error);
    res.status(500).json({ _error: 'Failed to progress orders', details: error.message });
  }
});

// POST /api/po-orders/smart-progress
// Smart progression for PO items from Barcode department
// Routes 'no stock' items directly to Shipping QC, others to CNC/Finish
router.post('/smart-progress', async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(`🔄 Smart progressing ${orderIds.length} PO items from Barcode...`);
    const { storage } = await import('../../storage');

    const results = {
      toShippingQC: [] as string[],
      toCNC: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    for (const orderId of orderIds) {
      try {
        const order = await storage.getProductionOrderByOrderId(orderId);

        // Validate order exists
        if (!order) {
          results.failed.push({ orderId, reason: 'Order not found' });
          console.warn(`⚠️ ${orderId}: Order not found`);
          continue;
        }

        // Validate order is in Barcode department
        if (order.currentDepartment !== 'Barcode') {
          results.failed.push({
            orderId,
            reason: `Order is in ${order.currentDepartment}, not Barcode`,
          });
          console.warn(`⚠️ ${orderId}: Wrong department (${order.currentDepartment})`);
          continue;
        }

        // Check if item has 'no stock' or empty stock model
        const itemId = (order.itemId || '').trim().toLowerCase();
        const isNoStock =
          !itemId ||
          itemId === '' ||
          itemId === 'none' ||
          itemId === 'no stock' ||
          itemId === 'no_stock';

        if (isNoStock) {
          // Route directly to Shipping QC (skip CNC/Finish)
          await storage.updateProductionOrder(order.id, {
            currentDepartment: 'Shipping QC',
          });
          results.toShippingQC.push(orderId);
          console.log(`✅ ${orderId} → Shipping QC (no stock item)`);
        } else {
          // Route to CNC department (normal flow)
          await storage.updateProductionOrder(order.id, {
            currentDepartment: 'CNC',
          });
          results.toCNC.push(orderId);
          console.log(`✅ ${orderId} → CNC (stock item: ${order.itemId})`);
        }
      } catch (error: any) {
        console.error(`❌ Failed to progress ${orderId}:`, error);
        results.failed.push({ orderId, reason: error.message });
      }
    }

    console.log(
      `✅ Smart progression complete: ${results.toShippingQC.length} to Shipping QC, ${results.toCNC.length} to CNC`
    );
    if (results.failed.length > 0) {
      console.warn(`⚠️ Failed to progress ${results.failed.length} items:`, results.failed);
    }

    // Always return 200 with success/failed arrays
    res.json({
      toShippingQC: results.toShippingQC,
      toCNC: results.toCNC,
      failed: results.failed,
      message: `Progressed ${results.toShippingQC.length + results.toCNC.length}/${orderIds.length} items`,
    });
  } catch (error: any) {
    console.error('❌ Error in smart progression:', error);
    res.status(500).json({ _error: 'Failed to progress orders', details: error.message });
  }
});

// POST /api/po-orders/progress-to-department
// Progress PO items to a specific department (e.g., Finish for flattops)
router.post('/progress-to-department', async (req, res) => {
  try {
    const { orderIds, toDepartment } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    if (!toDepartment) {
      return res.status(400).json({ _error: 'toDepartment is required' });
    }

    console.log(`🔄 Progressing ${orderIds.length} PO items to ${toDepartment}...`);
    const { storage } = await import('../../storage');

    const results = {
      success: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    for (const orderId of orderIds) {
      try {
        const order = await storage.getProductionOrderByOrderId(orderId);

        // Validate order exists
        if (!order) {
          results.failed.push({ orderId, reason: 'Order not found' });
          console.warn(`⚠️ ${orderId}: Order not found`);
          continue;
        }

        // Validate order is in Barcode department (prevent accidental cross-department jumps)
        if (order.currentDepartment !== 'Barcode') {
          results.failed.push({
            orderId,
            reason: `Order is in ${order.currentDepartment}, not Barcode`,
          });
          console.warn(`⚠️ ${orderId}: Wrong department (${order.currentDepartment})`);
          continue;
        }

        // Progress to specified department
        await storage.updateProductionOrder(order.id, {
          currentDepartment: toDepartment,
        });
        results.success.push(orderId);
        console.log(`✅ ${orderId} → ${toDepartment}`);
      } catch (error: any) {
        console.error(`❌ Failed to progress ${orderId}:`, error);
        results.failed.push({ orderId, reason: error.message });
      }
    }

    console.log(
      `✅ Progression complete: ${results.success.length} to ${toDepartment}`
    );
    if (results.failed.length > 0) {
      console.warn(`⚠️ Failed to progress ${results.failed.length} items:`, results.failed);
    }

    // Always return 200 with success/failed arrays
    res.json({
      success: results.success,
      failed: results.failed,
      message: `Progressed ${results.success.length}/${orderIds.length} items to ${toDepartment}`,
    });
  } catch (error: any) {
    console.error('❌ Error progressing PO orders:', error);
    res.status(500).json({ _error: 'Failed to progress orders', details: error.message });
  }
});

// GET /api/po-orders/oem-shipments
// Get all shipments with tracking info, filters, and pagination (no base64 blobs)
router.get('/oem-shipments', async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      startDate,
      endDate,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    console.log('📦 Fetching OEM shipments with filters:', {
      customerId,
      customerName,
      startDate,
      endDate,
      search,
      limit,
      offset,
    });

    // Build WHERE conditions
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let paramIndex = 1;

    if (customerId) {
      conditions.push(`sr.customer_id = $${paramIndex}`);
      params.push(customerId);
      paramIndex++;
    }

    if (customerName) {
      conditions.push(`sr.customer_name ILIKE $${paramIndex}`);
      params.push(`%${customerName}%`);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`sr.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`sr.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        sr.customer_name ILIKE $${paramIndex} OR
        sr.master_tracking_number ILIKE $${paramIndex} OR
        sr.reference ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Main query - lightweight, no base64 blobs
    const query = `
      WITH shipment_aggregates AS (
        SELECT 
          sr.id,
          sr.customer_id,
          sr.customer_name,
          sr.customer_address,
          sr.customer_city,
          sr.customer_state,
          sr.customer_zip,
          sr.master_tracking_number,
          sr.service_code,
          sr.total_weight_lbs,
          sr.package_count,
          sr.bill_type,
          sr.reference,
          sr.created_at,
          sr.created_by,
          sr.shipping_label_base64 IS NOT NULL as has_shipping_label,
          COUNT(si.id) as item_count,
          COUNT(DISTINCT si.po_number) as po_count,
          json_agg(
            json_build_object(
              'id', si.id,
              'poItemId', si.po_item_id,
              'orderId', si.order_id,
              'quantity', si.quantity,
              'description', si.description,
              'poNumber', si.po_number,
              'hasPackingSlip', si.packing_slip_base64 IS NOT NULL
            ) ORDER BY si.po_number, si.order_id
          ) as items
        FROM shipment_records sr
        LEFT JOIN shipment_items si ON sr.id = si.shipment_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY sr.id
        ORDER BY sr.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      )
      SELECT * FROM shipment_aggregates
    `;

    params.push(parseInt(limit as string, 10));
    params.push(parseInt(offset as string, 10));

    const result = await pool.query(query, params);
    const shipments = Array.isArray(result) ? result : result.rows || [];

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT sr.id) as total
      FROM shipment_records sr
      WHERE ${conditions.join(' AND ')}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt((countResult.rows || countResult)[0]?.total || '0', 10);

    console.log(`📊 Found ${shipments.length} shipments (total: ${total})`);

    res.json({
      shipments,
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        hasMore: parseInt(offset as string, 10) + shipments.length < total,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching OEM shipments:', error);
    res.status(500).json({ _error: 'Failed to fetch OEM shipments', details: error.message });
  }
});

// GET /api/po-orders/oem-shipments/:id/label
// Download shipping label for a specific shipment
router.get('/oem-shipments/:id/label', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📄 Downloading shipping label for shipment ${id}...`);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ _error: 'Invalid shipment ID format' });
    }

    const query = `
      SELECT 
        shipping_label_base64,
        master_tracking_number,
        customer_name
      FROM shipment_records
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    const shipment = (result.rows || result)[0];

    if (!shipment) {
      return res.status(404).json({ _error: 'Shipment not found' });
    }

    if (!shipment.shipping_label_base64) {
      return res.status(404).json({ _error: 'Shipping label not available' });
    }

    // Decode base64 and send as GIF
    const labelBuffer = Buffer.from(shipment.shipping_label_base64, 'base64');
    const filename = `shipping-label-${shipment.master_tracking_number}.gif`;

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(labelBuffer);

    console.log(`✅ Shipping label downloaded: ${filename}`);
  } catch (error: any) {
    console.error('❌ Error downloading shipping label:', error);
    res.status(500).json({ _error: 'Failed to download shipping label', details: error.message });
  }
});

// GET /api/po-orders/oem-shipments/packing-slip/:itemId
// Download packing slip for a specific shipment item
router.get('/oem-shipments/packing-slip/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    console.log(`📄 Downloading packing slip for shipment item ${itemId}...`);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
      return res.status(400).json({ _error: 'Invalid item ID format' });
    }

    const query = `
      SELECT 
        packing_slip_base64,
        po_number,
        order_id
      FROM shipment_items
      WHERE id = $1
    `;

    const result = await pool.query(query, [itemId]);
    const item = (result.rows || result)[0];

    if (!item) {
      return res.status(404).json({ _error: 'Shipment item not found' });
    }

    if (!item.packing_slip_base64) {
      return res.status(404).json({ _error: 'Packing slip not available' });
    }

    // Decode base64 and send as PDF
    const slipBuffer = Buffer.from(item.packing_slip_base64, 'base64');
    const filename = `packing-slip-PO${item.po_number}-${item.order_id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(slipBuffer);

    console.log(`✅ Packing slip downloaded: ${filename}`);
  } catch (error: any) {
    console.error('❌ Error downloading packing slip:', error);
    res.status(500).json({ _error: 'Failed to download packing slip', details: error.message });
  }
});

// POST /api/po-orders/toggle-fulfilled
// Mark PO item as fulfilled (shipped through another system) or unfulfilled
router.post('/toggle-fulfilled', authenticateToken, async (req, res) => {
  try {
    const { orderId, isFulfilled } = req.body;

    if (!orderId) {
      return res.status(400).json({ _error: 'orderId is required' });
    }

    if (typeof isFulfilled !== 'boolean') {
      return res.status(400).json({ _error: 'isFulfilled must be a boolean' });
    }

    console.log(`📦 ${isFulfilled ? 'Marking' : 'Unmarking'} ${orderId} as fulfilled...`);

    const { storage } = await import('../../storage');
    const order = await storage.getProductionOrderByOrderId(orderId);

    if (!order) {
      return res.status(404).json({ _error: 'Order not found' });
    }

    // Get username from session
    const username = (req as any).user?.username || 'system';

    // Update fulfillment status
    await storage.updateProductionOrder(order.id, {
      isFulfilled,
      fulfilledDate: isFulfilled ? new Date().toISOString() : null,
      fulfilledBy: isFulfilled ? username : null,
    });

    console.log(`✅ ${orderId} fulfillment status updated: ${isFulfilled}`);

    res.json({
      success: true,
      orderId,
      isFulfilled,
      fulfilledDate: isFulfilled ? new Date().toISOString() : null,
      fulfilledBy: isFulfilled ? username : null,
    });
  } catch (error: any) {
    console.error('❌ Error toggling fulfilled status:', error);
    res.status(500).json({ _error: 'Failed to update fulfilled status', details: error.message });
  }
});

// POST /api/po-orders/process-shipment
// Comprehensive shipment processing: validates items, generates 1 UPS label + multiple packing slips, updates status, persists shipment
router.post('/process-shipment', authenticateToken, async (req, res) => {
  try {
    // Handle both legacy (orderIds) and new (items) payload formats
    const {
      orderIds,
      items,
      serviceCode = '03',
      weightPerItemLbs = 5,
      weightLbs,
      boxSize = 'medium',
      billingOption = 'sender',
      thirdPartyAccountNumber,
      thirdPartyPostalCode,
      thirdPartyCountryCode,
    } = req.body;
    
    // Use weightLbs from frontend if provided, otherwise fall back to weightPerItemLbs
    const totalPackageWeight = weightLbs ? parseFloat(weightLbs) : weightPerItemLbs;

    // Validate billing third-party requirements
    if (billingOption === 'third-party') {
      if (!thirdPartyAccountNumber || !thirdPartyPostalCode || !thirdPartyCountryCode) {
        return res.status(400).json({
          _error: 'Third-party billing requires accountNumber, postalCode, and countryCode',
        });
      }
    }

    // Normalize payload to items format
    let normalizedItems: Array<{ poItemId: number; orderId: string; quantity: number }>;
    
    if (items && Array.isArray(items)) {
      // New format from ShipmentDialog
      normalizedItems = items;
    } else if (orderIds && Array.isArray(orderIds)) {
      // Legacy format - fetch order details to get real poItemId and quantity
      const legacyOrders = await Promise.all(
        orderIds.map(async (orderId: string) => {
          const order = await storage.getProductionOrderByOrderId(orderId);
          if (!order || !order.poItemId) {
            throw new Error(`Order ${orderId} not found or missing PO item ID`);
          }
          return {
            poItemId: order.poItemId,
            orderId,
            quantity: 1, // Legacy assumes 1 unit per order
          };
        })
      );
      normalizedItems = legacyOrders;
    } else {
      return res.status(400).json({ _error: 'Either items array or orderIds array is required' });
    }

    if (normalizedItems.length === 0) {
      return res.status(400).json({ _error: 'No items to ship' });
    }

    console.log(`📦 Processing shipment for ${normalizedItems.length} items...`);
    const { storage } = await import('../../storage');

    // 1. VALIDATE: Fetch all orders and ensure they exist + are ready to ship
    // Handle both items with production orders (orderId) and non-stock items (poItemId only)
    const orderDetails = await Promise.all(
      normalizedItems.map(async (item) => {
        // Check if this is a synthetic orderId (format: PO-{poItemId}-{unitNumber})
        // These are non-stock items that bypass production
        const syntheticMatch = item.orderId.match(/^PO-(\d+)-(\d+)$/);
        
        if (syntheticMatch) {
          // Non-stock item: lookup directly by poItemId
          const poItemId = parseInt(syntheticMatch[1]);
          const unitNumber = parseInt(syntheticMatch[2]);
          
          console.log(`📦 Processing non-stock item: poItemId=${poItemId}, unit=${unitNumber}`);
          
          const poItem = await storage.getPurchaseOrderItem(poItemId);
          if (!poItem) {
            throw new Error(`PO item ${poItemId} not found`);
          }
          
          // Check if already shipped
          if (poItem.stockStatus === 'SHIPPED' || poItem.stockStatus === 'FULFILLED') {
            throw new Error(`PO item ${poItemId} has already been shipped`);
          }
          
          const po = await storage.getPurchaseOrder(poItem.poId);
          if (!po) {
            throw new Error(`PO ${poItem.poId} not found`);
          }
          
          const customerId = parseInt(po.customerId);
          if (isNaN(customerId)) {
            throw new Error(`Invalid customer ID: ${po.customerId}`);
          }
          let customer;
          try {
            customer = await storage.getCustomer(customerId);
          } catch (dbError: any) {
            console.error(`Database error fetching customer ${customerId}:`, dbError.message);
            throw new Error(`Failed to fetch customer ${po.customerId}: ${dbError.message}`);
          }
          if (!customer) {
            throw new Error(`Customer ${po.customerId} not found`);
          }
          
          // Create a synthetic order object for non-stock items
          const syntheticOrder = {
            id: null, // No production order
            orderId: item.orderId,
            poItemId: poItemId,
            customerId: String(po.customerId),
            unitNumber,
            itemId: poItem.stockModelId || null,
            itemName: poItem.itemName || poItem.stockModelName,
            productionStatus: 'PENDING',
            isNonStock: true, // Flag to identify non-stock items
          };
          
          return { order: syntheticOrder, poItem, po, customer, quantity: item.quantity };
        } else {
          // Regular production order
          const order = await storage.getProductionOrderByOrderId(item.orderId);
          if (!order) {
            throw new Error(`Order ${item.orderId} not found`);
          }
          // P1 PO orders use productionStatus (PENDING, LAID_UP, SHIPPED) not currentDepartment
          if (order.productionStatus === 'SHIPPED') {
            throw new Error(`Order ${item.orderId} has already been shipped`);
          }

          // Get PO item details
          if (!order.poItemId) {
            throw new Error(`Order ${item.orderId} has no PO item ID`);
          }
          const poItem = await storage.getPurchaseOrderItem(order.poItemId);
          if (!poItem) {
            throw new Error(`PO item ${order.poItemId} not found`);
          }

          // Get PO details
          const po = await storage.getPurchaseOrder(poItem.poId);
          if (!po) {
            throw new Error(`PO ${poItem.poId} not found`);
          }

          // Get customer details
          const customerId = parseInt(order.customerId);
          if (isNaN(customerId)) {
            throw new Error(`Invalid customer ID: ${order.customerId}`);
          }
          let customer;
          try {
            customer = await storage.getCustomer(customerId);
          } catch (dbError: any) {
            console.error(`Database error fetching customer ${customerId}:`, dbError.message);
            throw new Error(`Failed to fetch customer ${order.customerId}: ${dbError.message}`);
          }
          if (!customer) {
            throw new Error(`Customer ${order.customerId} not found`);
          }

          return { order: { ...order, isNonStock: false }, poItem, po, customer, quantity: item.quantity };
        }
      })
    );

    // 2. VALIDATE: Ensure all orders from same customer
    const uniqueCustomerIds = new Set(orderDetails.map(d => d.order.customerId));
    if (uniqueCustomerIds.size > 1) {
      return res.status(400).json({
        _error: 'All items must be from the same customer',
        customers: Array.from(uniqueCustomerIds),
      });
    }

    // 3. GROUP BY PO NUMBER
    const poGroups = new Map<string, typeof orderDetails>();
    orderDetails.forEach((detail) => {
      const poNumber = detail.po.poNumber;
      if (!poGroups.has(poNumber)) {
        poGroups.set(poNumber, []);
      }
      poGroups.get(poNumber)!.push(detail);
    });

    console.log(`📊 Grouped ${orderDetails.length} items into ${poGroups.size} PO(s)`);
    console.log(`📋 PO Numbers: ${Array.from(poGroups.keys()).join(', ')}`);

    // 4. USE TOTAL WEIGHT FROM FRONTEND (or calculate from default)
    // If frontend provides totalPackageWeight, use that; otherwise calculate from default per-item weight
    let totalWeight = totalPackageWeight;
    if (!weightLbs) {
      // Legacy fallback: calculate from per-item weight
      totalWeight = 0;
      for (const detail of orderDetails) {
        totalWeight += weightPerItemLbs * detail.quantity;
      }
    }
    console.log(`⚖️  Total weight: ${totalWeight} lbs (box size: ${boxSize})`);

    // 5. GET CUSTOMER SHIPPING ADDRESS
    const firstCustomer = orderDetails[0].customer;
    const addresses = await storage.getCustomerAddresses(orderDetails[0].order.customerId);
    const primaryAddress = addresses[0];

    if (!primaryAddress) {
      return res.status(400).json({
        _error: `No shipping address found for customer ${firstCustomer.name}`,
      });
    }

    const shipTo: ShipTo = {
      name: firstCustomer.name || '',
      attention: firstCustomer.name || '',
      phone: firstCustomer.phone || '0000000000',
      address1: primaryAddress.street || '',
      address2: primaryAddress.street2 || undefined,
      city: primaryAddress.city || '',
      state: primaryAddress.state || '',
      postalCode: primaryAddress.zipCode || '',
      country: primaryAddress.country || 'United States',
    };

    // 6. BUILD REFERENCE NUMBER (truncated to 35 chars for UPS)
    const poNumbers = Array.from(poGroups.keys());
    const referenceNumber = poNumbers.join(',').substring(0, 35);
    console.log(`📝 Reference number: ${referenceNumber}`);

    // 7. GENERATE UPS SHIPPING LABEL
    let trackingNumber: string;
    let labelBase64: string;
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      // In development, generate a test tracking number and skip UPS API
      const crypto = await import('crypto');
      trackingNumber = `TEST-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
      labelBase64 = '';
      console.log(`🧪 DEV MODE: Generated test tracking number: ${trackingNumber}`);
    } else {
      // In production, use real UPS API
      try {
        const shipmentResult = await createShipment({
          shipTo,
          serviceCode,
          weightLbs: Math.max(totalWeight, 1),
          referenceNumber,
          billingOption,
          thirdPartyAccountNumber,
          thirdPartyPostalCode,
          thirdPartyCountryCode,
        });

        trackingNumber = shipmentResult.trackingNumber;
        labelBase64 = shipmentResult.labelBase64 || '';

        if (!trackingNumber) {
          throw new Error('UPS did not return a tracking number');
        }

        console.log(`✅ UPS Label generated: ${trackingNumber}`);
      } catch (upsError: any) {
        console.error('❌ UPS API Error:', upsError.message);
        return res.status(502).json({
          _error: 'UPS shipping label generation failed',
          details: upsError.message,
          suggestion: 'Check UPS credentials and try again, or process manually',
        });
      }
    }

    // 8. PERSIST SHIPMENT TO DATABASE (skip in development mode)
    let shipmentId: string;
    const shippedAt = new Date();
    const crypto = await import('crypto');
    shipmentId = crypto.randomUUID();
    
    if (isDevelopment) {
      console.log(`🧪 DEV MODE: Skipping shipment record persistence (shipmentId: ${shipmentId})`);
    } else {
      try {
        // Map billingOption to billType enum
        const billType: 'SENDER' | 'RECEIVER' | 'THIRD_PARTY' = 
          billingOption === 'prepaid' ? 'SENDER' :
          billingOption === 'collect' ? 'RECEIVER' :
          'THIRD_PARTY';

        const shipmentRecord = {
          id: shipmentId,
          createdBy: req.user?.username || 'system',
          reference: referenceNumber,
          poNumbers: poNumbers.join(', '),
          shippedAt,
          carrier: 'UPS',
          serviceLevel: serviceCode,
          billType,
          masterTrackingNumber: trackingNumber,
          packageCount: 1,
          thirdPartyAccount: thirdPartyAccountNumber || null,
          shipFromSnapshot: {
            name: process.env.SHIP_FROM_NAME || 'AG Composites',
            street: process.env.SHIP_FROM_ADDRESS1 || '',
            city: process.env.SHIP_FROM_CITY || '',
            state: process.env.SHIP_FROM_STATE || '',
            postalCode: process.env.SHIP_FROM_POSTAL || '',
            country: process.env.SHIP_FROM_COUNTRY || 'US',
          },
          shipToSnapshot: {
            name: shipTo.name,
            street: shipTo.address1,
            street2: shipTo.address2 || null,
            city: shipTo.city,
            state: shipTo.state,
            postalCode: shipTo.postalCode,
            country: shipTo.country || 'US',
          },
          totalWeightLbs: String(totalWeight),
          documents: [
            labelBase64 ? { type: 'label', fileName: `Label-${trackingNumber}.gif`, mime: 'image/gif', storagePath: '', bytes: labelBase64.length } : null,
          ].filter(Boolean),
          notificationMetadata: {},
        };

        const shipmentItemsData = orderDetails.map((detail) => ({
          poItemId: detail.order.poItemId!,
          orderId: detail.order.orderId,
          quantity: detail.quantity,
          weightLbs: weightPerItemLbs * detail.quantity,
        }));

        await storage.createShipment({
          shipment: shipmentRecord,
          items: shipmentItemsData,
        });

        console.log(`✅ Shipment persisted to database: ${shipmentId}`);
      } catch (dbError: any) {
        console.error(`❌ Shipment persistence failed: ${dbError.message}`);
        return res.status(500).json({
          _error: 'Shipment created but failed to save to database',
          details: dbError.message,
          suggestion: 'UPS label was generated successfully. IMPORTANT: The tracking number below must be manually recorded or the UPS label should be voided to prevent orphaned shipments.',
          trackingNumber,
          shipmentId: null,
          requiresManualAction: true,
          upsLabelGenerated: true,
        });
      }
    }

    // 9. UPDATE ORDER/ITEM STATUSES TO SHIPPED
    for (const detail of orderDetails) {
      try {
        if (detail.order.isNonStock) {
          await storage.updatePurchaseOrderItem(detail.order.poItemId, {
            stockStatus: 'SHIPPED',
          });
          console.log(`✅ PO Item ${detail.order.poItemId} marked as SHIPPED (non-stock)`);
        } else if (detail.order.id) {
          await storage.updateProductionOrder(detail.order.id, {
            productionStatus: 'SHIPPED',
            shippedAt,
          });
          console.log(`✅ Order ${detail.order.orderId} marked as SHIPPED`);
        }
      } catch (updateError: any) {
        console.error(`⚠️ Failed to update order ${detail.order.orderId}:`, updateError.message);
      }
    }

    // 10. GENERATE PACKING SLIPS (one per PO) - Using updated format with addresses and invoice numbers
    const packingSlips: Array<{ poNumber: string; filename: string; data: string }> = [];

    // In development mode, skip packing slip generation due to missing tables
    if (isDevelopment) {
      console.log(`🧪 DEV MODE: Skipping packing slip generation`);
    } else {
    for (const [poNumber, items] of poGroups.entries()) {
      const pdfDoc = await PDFDocument.create();
      let currentPage = pdfDoc.addPage([612, 792]); // US Letter
      const { width, height } = currentPage.getSize();

      const margin = 50;
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Get customer ID and name from first item's PO
      const customerId = items[0].po.customerId;
      const customerName = items[0].po.customerName || 'Unknown Customer';
      
      // Get customer address
      const customerAddress = customerId ? await storage.getCustomerDefaultAddress(String(customerId)) : null;
      
      // Generate invoice number
      const invoiceNumber = await storage.getNextInvoiceNumber(String(customerId || '0'), customerName);

      let currentY = height - margin;

      // ========== HEADER ==========
      currentPage.drawText('AG COMPOSITES', {
        x: margin,
        y: currentY,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // AG Composites Address (Ship From) - Right aligned
      const agAddress = [
        '230 Hamer Rd',
        'Owens Cross Roads, AL 35763',
        'Phone: (256) 723-8381'
      ];
      let agAddressY = currentY;
      agAddress.forEach((line) => {
        const textWidth = font.widthOfTextAtSize(line, 9);
        currentPage.drawText(line, {
          x: width - margin - textWidth,
          y: agAddressY,
          size: 9,
          font: font,
        });
        agAddressY -= 15;
      });

      currentY -= 30;
      currentPage.drawText('PACKING SLIP', {
        x: margin,
        y: currentY,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // ========== CUSTOMER SHIPPING ADDRESS (SHIP TO) ==========
      currentY -= 30;
      currentPage.drawText('SHIP TO:', {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentY -= 18;
      currentPage.drawText(customerName, {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
      });

      if (customerAddress) {
        currentY -= 15;
        currentPage.drawText(customerAddress.street, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });

        if (customerAddress.street2) {
          currentY -= 15;
          currentPage.drawText(customerAddress.street2, {
            x: margin,
            y: currentY,
            size: 10,
            font: font,
          });
        }

        currentY -= 15;
        currentPage.drawText(`${customerAddress.city}, ${customerAddress.state} ${customerAddress.zipCode}`, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });
      } else {
        currentY -= 15;
        currentPage.drawText('(No address on file)', {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      // ========== PO INFORMATION ==========
      currentY -= 30;
      currentPage.drawText(`Invoice #: ${invoiceNumber}`, {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentY -= 18;
      currentPage.drawText(`PO Number: ${poNumber}`, {
        x: margin,
        y: currentY,
        size: 11,
        font: font,
      });

      currentY -= 18;
      currentPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
        x: margin,
        y: currentY,
        size: 11,
        font: font,
      });

      currentY -= 18;
      currentPage.drawText(`Tracking #: ${trackingNumber}`, {
        x: margin,
        y: currentY,
        size: 11,
        font: font,
      });

      // ========== ITEMS TABLE ==========
      currentY -= 30;
      currentPage.drawText('Item', {
        x: margin,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText('Description', {
        x: margin + 60,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText('Unit #', {
        x: margin + 350,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      // Draw line under header
      currentY -= 5;
      currentPage.drawLine({
        start: { x: margin, y: currentY },
        end: { x: width - margin, y: currentY },
        thickness: 1,
        color: rgb(0, 0, 0),
      });

      // Items
      currentY -= 20;
      items.forEach((item, idx) => {
        // Add new page if needed
        if (currentY < margin + 50) {
          currentPage = pdfDoc.addPage([612, 792]);
          currentY = height - margin;
        }

        // Extract unit number from order ID
        const unitNumber = item.order.unitNumber || 1;

        currentPage.drawText(`${idx + 1}`, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });

        // Use itemName for the product identifier (e.g., AG-CRB-AHV205-ER)
        const itemName = item.poItem.itemName || item.poItem.stockModelName || 'N/A';
        const truncatedName = itemName.length > 35 ? itemName.substring(0, 35) + '...' : itemName;
        
        currentPage.drawText(truncatedName, {
          x: margin + 60,
          y: currentY,
          size: 9,
          font: font,
        });

        currentPage.drawText(`${unitNumber}`, {
          x: margin + 350,
          y: currentY,
          size: 10,
          font: font,
        });

        currentY -= 20;
      });

      // Footer on last page
      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const footerY = margin + 20;
      lastPage.drawText(`Total Items: ${items.length}`, {
        x: margin,
        y: footerY,
        size: 11,
        font: boldFont,
      });

      const pdfBytes = await pdfDoc.save();
      packingSlips.push({
        poNumber,
        filename: `Packing-Slip-PO-${poNumber}.pdf`,
        data: Buffer.from(pdfBytes).toString('base64'),
      });
    }
    } // end else (production mode packing slip generation)

    console.log(`📄 Generated ${packingSlips.length} packing slip(s)`);

    // Return comprehensive response (production orders already updated in persistence block)
    res.json({
      success: true,
      shipmentId,
      trackingNumber,
      shippedAt: shippedAt.toISOString(),
      shippingLabel: {
        format: 'GIF',
        data: labelBase64,
      },
      packingSlips,
      itemsShipped: orderDetails.length,
      poNumbers: Array.from(poGroups.keys()),
      totalWeight: totalWeight,
    });
  } catch (error: any) {
    console.error('❌ Error processing shipment:', error);
    res.status(500).json({
      _error: 'Failed to process shipment',
      details: error.message,
    });
  }
});

export default router;
