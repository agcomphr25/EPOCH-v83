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
// Comprehensive shipment processing: validates items, generates 1 UPS label + multiple packing slips, updates status, persists shipment
router.post('/process-shipment', authenticateToken, async (req, res) => {
  try {
    // Handle both legacy (orderIds) and new (items) payload formats
    const {
      orderIds,
      items,
      serviceCode = '03',
      weightPerItemLbs = 5,
      billingOption = 'sender',
      thirdPartyAccountNumber,
      thirdPartyPostalCode,
      thirdPartyCountryCode,
    } = req.body;

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

    // 1. VALIDATE: Fetch all orders and ensure they exist + are in Shipping QC
    const orderDetails = await Promise.all(
      normalizedItems.map(async (item) => {
        const order = await storage.getProductionOrderByOrderId(item.orderId);
        if (!order) {
          throw new Error(`Order ${item.orderId} not found`);
        }
        if (order.currentDepartment !== 'Shipping QC') {
          throw new Error(`Order ${item.orderId} is in ${order.currentDepartment}, not Shipping QC`);
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
        const customer = await storage.getCustomer(parseInt(order.customerId));
        if (!customer) {
          throw new Error(`Customer ${order.customerId} not found`);
        }

        return { order, poItem, po, customer, quantity: item.quantity };
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

    // 4. CALCULATE TOTAL WEIGHT (multiply by quantity)
    let totalWeight = 0;
    for (const detail of orderDetails) {
      const itemWeight = detail.poItem.weightLb || weightPerItemLbs;
      totalWeight += itemWeight * detail.quantity;
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

    // 8. PERSIST SHIPMENT TO DATABASE
    let shipmentId: string;
    const shippedAt = new Date();
    try {
      const crypto = await import('crypto');
      shipmentId = crypto.randomUUID();

      const shipmentRecord = {
        id: shipmentId,
        customerId: orderDetails[0].order.customerId,
        poNumbers: poNumbers.join(', '),
        shippedAt,
        carrier: 'UPS',
        serviceLevel: serviceCode,
        trackingNumber,
        trackingUrl: `https://www.ups.com/track?tracknum=${trackingNumber}`,
        billingType: billingOption,
        thirdPartyAccountNumber: thirdPartyAccountNumber || null,
        shipFromAddress: {
          name: process.env.SHIP_FROM_NAME || 'AG Composites',
          street: process.env.SHIP_FROM_ADDRESS1 || '',
          city: process.env.SHIP_FROM_CITY || '',
          state: process.env.SHIP_FROM_STATE || '',
          postalCode: process.env.SHIP_FROM_POSTAL || '',
          country: process.env.SHIP_FROM_COUNTRY || 'US',
        },
        shipToAddress: {
          name: shipTo.name,
          street: shipTo.address1,
          street2: shipTo.address2 || null,
          city: shipTo.city,
          state: shipTo.state,
          postalCode: shipTo.postalCode,
          country: shipTo.country || 'US',
        },
        totalWeightLbs: totalWeight,
        documents: {
          label: labelBase64 ? { type: 'label', fileName: `Label-${trackingNumber}.gif`, data: labelBase64 } : null,
          packingSlips: [], // Will be populated after packing slip generation
        },
        notificationSent: false,
        notificationEmail: null,
        notificationSms: null,
      };

      const shipmentItemsData = orderDetails.map((detail) => ({
        poItemId: detail.order.poItemId!,
        orderId: detail.order.orderId,
        quantity: detail.quantity,
        weightLbs: (detail.poItem.weightLb || weightPerItemLbs) * detail.quantity,
      }));

      await storage.createShipment({
        shipment: shipmentRecord,
        items: shipmentItemsData,
      });

      console.log(`✅ Shipment persisted to database: ${shipmentId}`);

      // Update production order statuses to SHIPPED
      for (const detail of orderDetails) {
        try {
          await storage.updateProductionOrder(detail.order.id, {
            currentDepartment: 'Shipping',
            productionStatus: 'SHIPPED',
            shippedAt,
            trackingNumber,
          });
          console.log(`✅ Order ${detail.order.orderId} marked as SHIPPED`);
        } catch (updateError: any) {
          console.error(`⚠️ Failed to update order ${detail.order.orderId}:`, updateError.message);
        }
      }
    } catch (persistError: any) {
      console.error('❌ Shipment persistence failed:', persistError.message);
      return res.status(500).json({
        _error: 'Shipment created but failed to save to database',
        details: persistError.message,
        suggestion: 'UPS label was generated successfully. IMPORTANT: The tracking number below must be manually recorded or the UPS label should be voided to prevent orphaned shipments.',
        trackingNumber,
        shipmentId: null,
        requiresManualAction: true,
        upsLabelGenerated: true,
      });
    }

    // 8. GENERATE PACKING SLIPS (one per PO) - Using updated format with addresses and invoice numbers
    const packingSlips: Array<{ poNumber: string; filename: string; data: string }> = [];

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
