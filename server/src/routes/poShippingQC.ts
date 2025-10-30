import { Router } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const router = Router();

// GET /api/po-orders/shipping-qc
// Returns PO orders in Shipping QC department, grouped by customer → PO → items
router.get('/shipping-qc', async (req, res) => {
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

// POST /api/po-orders/packing-slips
// Generate packing slips for selected PO items (one PDF per PO)
router.post('/packing-slips', async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ _error: 'orderIds array is required' });
    }

    console.log(`📄 Generating packing slips for ${orderIds.length} PO items...`);
    const { storage } = await import('../../storage');

    // Fetch order details
    const orderDetails = await Promise.all(
      orderIds.map(async (orderId) => {
        const order = await storage.getProductionOrderByOrderId(orderId);
        if (!order) {
          console.warn(`⚠️ Order ${orderId} not found`);
          return null;
        }

        // Get PO item details
        if (!order.poItemId) {
          console.warn(`⚠️ Order ${orderId} has no PO item ID`);
          return null;
        }

        const poItem = await storage.getPurchaseOrderItem(order.poItemId);
        if (!poItem) {
          console.warn(`⚠️ PO item ${order.poItemId} not found`);
          return null;
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

export default router;
