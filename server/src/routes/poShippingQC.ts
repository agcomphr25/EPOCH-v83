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
          
          // For PO items without orderIds, create a minimal order object for packing slip generation
          // The production_orders table doesn't track individual unit numbers
          order = {
            poItemId,
            unitNumber,
            orderId: `Unit ${unitNumber}`,
            item_id: poItem.stockModelId,
            item_name: poItem.stockModelName,
            specifications: poItem.specifications,
            customer_id: poItem.customerId,
            customer_name: poItem.customerName || '',
            po_number: poItem.poNumber || '',
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

      let currentY = height - margin;

      // Header
      currentPage.drawText('AG COMPOSITES', {
        x: margin,
        y: currentY,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 30;
      currentPage.drawText('PACKING SLIP', {
        x: margin,
        y: currentY,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // PO Information
      currentY -= 40;
      currentPage.drawText(`Purchase Order: ${poNumber}`, {
        x: margin,
        y: currentY,
        size: 12,
        font: boldFont,
      });

      currentY -= 20;
      currentPage.drawText(`Customer: ${items[0].order.customerName}`, {
        x: margin,
        y: currentY,
        size: 12,
        font: font,
      });

      currentY -= 20;
      currentPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
        x: margin,
        y: currentY,
        size: 12,
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
        x: margin + 320,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText('Action Length', {
        x: margin + 380,
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

        const unitMatch = item.order.orderId.match(/-(\d+)$/);
        const unitNumber = unitMatch ? parseInt(unitMatch[1]) : 1;

        currentPage.drawText(`${idx + 1}`, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });

        const description = item.poItem.description || 'N/A';
        const truncatedDesc = description.length > 25 ? description.substring(0, 25) + '...' : description;
        
        currentPage.drawText(truncatedDesc, {
          x: margin + 80,
          y: currentY,
          size: 10,
          font: font,
        });

        currentPage.drawText(`${unitNumber}`, {
          x: margin + 320,
          y: currentY,
          size: 10,
          font: font,
        });

        currentPage.drawText(item.poItem.actionLength?.toString() || 'N/A', {
          x: margin + 380,
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

// GET /api/po-orders/oem-shipments
// Get shipped PO orders grouped as OEM shipments by customer
router.get('/oem-shipments', async (req, res) => {
  try {
    console.log('📦 Fetching OEM shipments (shipped PO orders)...');

    // Query shipped production orders grouped by customer
    const query = `
      SELECT 
        p.customer_id as customerId,
        p.customer_name as customerName,
        COUNT(DISTINCT p.po_number) as poCount,
        COUNT(p.id) as itemCount,
        MIN(p.shipped_at) as firstShipDate,
        MAX(p.shipped_at) as lastShipDate,
        json_agg(
          json_build_object(
            'orderId', p.order_id,
            'poNumber', p.po_number,
            'itemId', p.item_id,
            'itemName', p.item_name,
            'shippedAt', p.shipped_at,
            'specifications', p.specifications
          ) ORDER BY p.shipped_at DESC
        ) as items
      FROM production_orders p
      WHERE p.current_department = 'Shipping'
        AND p.production_status = 'SHIPPED'
      GROUP BY p.customer_id, p.customer_name
      ORDER BY MAX(p.shipped_at) DESC
    `;

    const result = await pool.query(query);
    const shipments = Array.isArray(result) ? result : result.rows || [];

    console.log(`📊 Found ${shipments.length} OEM shipments`);

    res.json(shipments);
  } catch (error: any) {
    console.error('❌ Error fetching OEM shipments:', error);
    res.status(500).json({ _error: 'Failed to fetch OEM shipments', details: error.message });
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
// Comprehensive shipment processing: validates items, generates 1 UPS label + multiple packing slips, updates status
router.post('/process-shipment', authenticateToken, async (req, res) => {
  try {
    const { orderIds, serviceCode = '03', weightPerItemLbs = 5 } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(`📦 Processing shipment for ${orderIds.length} items...`);
    const { storage } = await import('../../storage');

    // 1. VALIDATE: Fetch all orders and ensure they exist + are in Shipping QC
    const orderDetails = await Promise.all(
      orderIds.map(async (orderId) => {
        const order = await storage.getProductionOrderByOrderId(orderId);
        if (!order) {
          throw new Error(`Order ${orderId} not found`);
        }
        if (order.currentDepartment !== 'Shipping QC') {
          throw new Error(`Order ${orderId} is in ${order.currentDepartment}, not Shipping QC`);
        }

        // Get PO item details
        if (!order.poItemId) {
          throw new Error(`Order ${orderId} has no PO item ID`);
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
        const customer = await storage.getCustomer(parseInt(order.customerId));
        if (!customer) {
          throw new Error(`Customer ${order.customerId} not found`);
        }

        return { order, poItem, po, customer };
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

    // 4. CALCULATE TOTAL WEIGHT
    let totalWeight = 0;
    for (const detail of orderDetails) {
      const itemWeight = detail.poItem.weightLb || weightPerItemLbs;
      totalWeight += itemWeight;
    }
    console.log(`⚖️  Total weight: ${totalWeight} lbs (${orderDetails.length} items)`);

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
    try {
      const shipmentResult = await createShipment({
        shipTo,
        serviceCode,
        weightLbs: Math.max(totalWeight, 1),
        referenceNumber,
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

    // 8. GENERATE PACKING SLIPS (one per PO)
    const packingSlips: Array<{ poNumber: string; filename: string; data: string }> = [];

    for (const [poNumber, items] of poGroups.entries()) {
      const pdfDoc = await PDFDocument.create();
      let currentPage = pdfDoc.addPage([612, 792]); // US Letter
      const { width, height } = currentPage.getSize();

      const margin = 50;
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let currentY = height - margin;

      // Header
      currentPage.drawText('AG COMPOSITES', {
        x: margin,
        y: currentY,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 30;
      currentPage.drawText('PACKING SLIP', {
        x: margin,
        y: currentY,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // PO Information
      currentY -= 40;
      currentPage.drawText(`Purchase Order: ${poNumber}`, {
        x: margin,
        y: currentY,
        size: 12,
        font: boldFont,
      });

      currentY -= 20;
      currentPage.drawText(`Customer: ${firstCustomer.name}`, {
        x: margin,
        y: currentY,
        size: 12,
        font: font,
      });

      currentY -= 20;
      currentPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
        x: margin,
        y: currentY,
        size: 12,
        font: font,
      });

      currentY -= 20;
      currentPage.drawText(`Tracking #: ${trackingNumber}`, {
        x: margin,
        y: currentY,
        size: 12,
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
        x: margin + 320,
        y: currentY,
        size: 11,
        font: boldFont,
      });

      currentPage.drawText('Action Length', {
        x: margin + 380,
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

        const unitMatch = item.order.orderId.match(/-(\d+)$/);
        const unitNumber = unitMatch ? parseInt(unitMatch[1]) : 1;

        currentPage.drawText(`${idx + 1}`, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });

        const description = item.poItem.description || 'N/A';
        const truncatedDesc = description.length > 25 ? description.substring(0, 25) + '...' : description;
        
        currentPage.drawText(truncatedDesc, {
          x: margin + 80,
          y: currentY,
          size: 10,
          font: font,
        });

        currentPage.drawText(`${unitNumber}`, {
          x: margin + 320,
          y: currentY,
          size: 10,
          font: font,
        });

        currentPage.drawText(item.poItem.actionLength?.toString() || 'N/A', {
          x: margin + 380,
          y: currentY,
          size: 10,
          font: font,
        });

        currentY -= 20;
      });

      // Footer
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

    console.log(`📄 Generated ${packingSlips.length} packing slip(s)`);

    // 9. UPDATE ALL ORDERS TO SHIPPED STATUS (Transaction-safe approach)
    const updateResults = {
      success: [] as string[],
      failed: [] as { orderId: string; reason: string }[],
    };

    const shippedAt = new Date().toISOString();
    const username = (req as any).user?.username || 'system';

    for (const detail of orderDetails) {
      try {
        await storage.updateProductionOrder(detail.order.id, {
          currentDepartment: 'Shipping',
          productionStatus: 'SHIPPED',
          shippedAt,
          trackingNumber,
        });
        updateResults.success.push(detail.order.orderId);
        console.log(`✅ ${detail.order.orderId} marked as SHIPPED`);
      } catch (error: any) {
        console.error(`❌ Failed to update ${detail.order.orderId}:`, error.message);
        updateResults.failed.push({ orderId: detail.order.orderId, reason: error.message });
      }
    }

    console.log(`✅ Shipment processed successfully`);
    console.log(`   - Tracking: ${trackingNumber}`);
    console.log(`   - Updated: ${updateResults.success.length}/${orderIds.length} items`);

    // Return comprehensive response
    res.json({
      success: true,
      trackingNumber,
      shippingLabel: {
        format: 'GIF',
        data: labelBase64,
      },
      packingSlips,
      itemsShipped: updateResults.success.length,
      itemsFailed: updateResults.failed.length,
      poNumbers: Array.from(poGroups.keys()),
      totalWeight: totalWeight,
      updateResults,
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
