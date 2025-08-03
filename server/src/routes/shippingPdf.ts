import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const router = Router();

// Generate QC Checklist PDF
router.get('/qc-checklist/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // Get order data from storage
    const { storage } = await import('../../storage');
    const orders = await storage.getAllOrderDrafts();
    const order = orders.find(o => o.orderId === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { width, height } = page.getSize();
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header
    let currentY = height - 60;
    page.drawText('QC CHECKLIST', {
      x: 50,
      y: currentY,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Company info
    currentY -= 40;
    page.drawText('AG Composites', {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    currentY -= 15;
    page.drawText('Quality Control Department', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // Order information
    currentY -= 40;
    page.drawText(`Order ID: ${orderId}`, {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    currentY -= 20;
    page.drawText(`Customer: ${order.customerId || 'N/A'}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText(`Product: ${order.modelId || 'N/A'}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // QC Checklist items
    currentY -= 40;
    page.drawText('QUALITY CONTROL CHECKLIST', {
      x: 50,
      y: currentY,
      size: 14,
      font: boldFont,
    });
    
    const checklistItems = [
      'Visual inspection completed',
      'Dimensional accuracy verified',
      'Surface finish quality approved',
      'Hardware installation checked',
      'Functionality testing passed',
      'Packaging requirements met',
      'Documentation complete',
      'Customer specifications verified',
      'Final quality approval'
    ];
    
    currentY -= 30;
    checklistItems.forEach((item, index) => {
      // Draw checkbox
      page.drawRectangle({
        x: 50,
        y: currentY - 12,
        width: 12,
        height: 12,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
      
      // Draw checklist item text
      page.drawText(item, {
        x: 70,
        y: currentY - 8,
        size: 10,
        font: font,
      });
      
      currentY -= 25;
    });
    
    // Signature sections
    currentY -= 30;
    page.drawText('QC Inspector Signature: ________________________', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 20;
    page.drawText('Date: _______________', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 30;
    page.drawText('Supervisor Approval: ________________________', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 20;
    page.drawText('Date: _______________', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="QC-Checklist-${orderId}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    
    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Error generating QC checklist PDF:', error);
    res.status(500).json({ error: 'Failed to generate QC checklist PDF' });
  }
});

// Generate Sales Order PDF
router.get('/sales-order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // Get order data from storage
    const { storage } = await import('../../storage');
    const orders = await storage.getAllOrderDrafts();
    const stockModels = await storage.getAllStockModels();
    const order = orders.find(o => o.orderId === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Get model info
    const model = stockModels.find(m => m.id === order.modelId);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { width, height } = page.getSize();
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header
    let currentY = height - 60;
    page.drawText('SALES ORDER', {
      x: 50,
      y: currentY,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Company info
    currentY -= 40;
    page.drawText('AG Composites', {
      x: 50,
      y: currentY,
      size: 14,
      font: boldFont,
    });
    
    currentY -= 20;
    page.drawText('123 Manufacturing Way', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText('Industrial City, ST 12345', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // Order information
    currentY -= 40;
    page.drawText(`Sales Order #: ${orderId}`, {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 400,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 25;
    page.drawText(`Customer: ${order.customerId || 'N/A'}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText(`Order Date: ${order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    if (order.dueDate) {
      currentY -= 15;
      page.drawText(`Due Date: ${new Date(order.dueDate).toLocaleDateString()}`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
    }
    
    // Order details table header
    currentY -= 40;
    page.drawText('ORDER DETAILS', {
      x: 50,
      y: currentY,
      size: 14,
      font: boldFont,
    });
    
    currentY -= 25;
    // Table headers
    page.drawText('Description', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Model', {
      x: 200,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Qty', {
      x: 350,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Price', {
      x: 450,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    // Draw line under headers
    currentY -= 5;
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: 550, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    // Order item
    currentY -= 20;
    page.drawText(model?.displayName || model?.name || order.modelId || 'Custom Product', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(order.modelId || 'N/A', {
      x: 200,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText('1', {
      x: 350,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(model?.price ? `$${model.price.toFixed(2)}` : 'Quote', {
      x: 450,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // Features/specifications
    if (order.features && Object.keys(order.features).length > 0) {
      currentY -= 30;
      page.drawText('SPECIFICATIONS', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
      });
      
      currentY -= 20;
      Object.entries(order.features).forEach(([key, value]) => {
        if (value) {
          page.drawText(`${key}: ${value}`, {
            x: 50,
            y: currentY,
            size: 9,
            font: font,
          });
          currentY -= 15;
        }
      });
    }
    
    // Total section
    currentY -= 30;
    page.drawLine({
      start: { x: 350, y: currentY },
      end: { x: 550, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    currentY -= 20;
    page.drawText('Total:', {
      x: 400,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    page.drawText(model?.price ? `$${model.price.toFixed(2)}` : 'Quote', {
      x: 450,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    // Footer
    currentY -= 60;
    page.drawText('Terms and Conditions:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    currentY -= 15;
    page.drawText('Payment due upon completion. Custom manufacturing items are non-returnable.', {
      x: 50,
      y: currentY,
      size: 9,
      font: font,
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Sales-Order-${orderId}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    
    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Error generating sales order PDF:', error);
    res.status(500).json({ error: 'Failed to generate sales order PDF' });
  }
});

// Generate UPS Shipping Label (placeholder for UPS API integration)
router.post('/ups-shipping-label/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { shippingAddress, packageDetails } = req.body;
    
    // Get order data from storage
    const { storage } = await import('../../storage');
    const orders = await storage.getAllOrderDrafts();
    const order = orders.find(o => o.orderId === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // TODO: Integrate with UPS API
    // For now, create a placeholder shipping label PDF
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([432, 648]); // 6x9 inch shipping label
    const { width, height } = page.getSize();
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header
    let currentY = height - 40;
    page.drawText('UPS SHIPPING LABEL', {
      x: 50,
      y: currentY,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Tracking number placeholder
    currentY -= 40;
    page.drawText('Tracking #: 1Z999AA1234567890', {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    // From address
    currentY -= 40;
    page.drawText('FROM:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    currentY -= 20;
    page.drawText('AG Composites', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText('123 Manufacturing Way', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText('Industrial City, ST 12345', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // To address
    currentY -= 40;
    page.drawText('TO:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    if (shippingAddress) {
      currentY -= 20;
      page.drawText(shippingAddress.name || 'Customer Name', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      page.drawText(shippingAddress.street || 'Customer Address', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      page.drawText(`${shippingAddress.city || 'City'}, ${shippingAddress.state || 'ST'} ${shippingAddress.zip || '12345'}`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
    } else {
      currentY -= 20;
      page.drawText('Customer Address Required', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
    }
    
    // Service info
    currentY -= 40;
    page.drawText('Service: UPS Ground', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText(`Order: ${orderId}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    if (packageDetails) {
      currentY -= 15;
      page.drawText(`Weight: ${packageDetails.weight || 'N/A'} lbs`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      page.drawText(`Dimensions: ${packageDetails.length || 'N/A'}" x ${packageDetails.width || 'N/A'}" x ${packageDetails.height || 'N/A'}"`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
    }
    
    // Placeholder barcode area
    currentY -= 60;
    page.drawRectangle({
      x: 50,
      y: currentY - 40,
      width: 300,
      height: 40,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('BARCODE PLACEHOLDER', {
      x: 150,
      y: currentY - 25,
      size: 10,
      font: font,
    });
    
    // Note about UPS API integration
    currentY -= 80;
    page.drawText('Note: This is a placeholder label.', {
      x: 50,
      y: currentY,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    currentY -= 12;
    page.drawText('UPS API integration required for live labels.', {
      x: 50,
      y: currentY,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Shipping-Label-${orderId}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    
    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Error generating shipping label PDF:', error);
    res.status(500).json({ error: 'Failed to generate shipping label PDF' });
  }
});

// Generate Bulk UPS Shipping Label
router.post('/ups-shipping-label/bulk', async (req: Request, res: Response) => {
  try {
    const { orderIds, shippingAddress, packageDetails, trackingNumber } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Order IDs array is required' });
    }
    
    // Get order data from storage
    const { storage } = await import('../../storage');
    const orders = await storage.getAllOrderDrafts();
    const selectedOrders = orders.filter(o => orderIds.includes(o.orderId));
    
    if (selectedOrders.length === 0) {
      return res.status(404).json({ error: 'No matching orders found' });
    }
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([432, 648]); // 6x9 inch shipping label
    const { width, height } = page.getSize();
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header
    let currentY = height - 40;
    page.drawText('UPS BULK SHIPPING LABEL', {
      x: 50,
      y: currentY,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Tracking number
    currentY -= 40;
    page.drawText(`Tracking #: ${trackingNumber || '1Z999AA1234567890'}`, {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    // From address
    currentY -= 40;
    page.drawText('FROM:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    currentY -= 20;
    page.drawText('AG Composites', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText('123 Manufacturing Way', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText('Industrial City, ST 12345', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // To address
    currentY -= 40;
    page.drawText('TO:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    if (shippingAddress) {
      currentY -= 20;
      page.drawText(shippingAddress.name || 'Customer Name', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      page.drawText(shippingAddress.street || 'Customer Address', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      page.drawText(`${shippingAddress.city || 'City'}, ${shippingAddress.state || 'ST'} ${shippingAddress.zip || '12345'}`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
    }
    
    // Service info
    currentY -= 40;
    page.drawText('Service: UPS Ground', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 15;
    page.drawText(`Orders (${orderIds.length}): ${orderIds.join(', ')}`, {
      x: 50,
      y: currentY,
      size: 9,
      font: font,
    });
    
    if (packageDetails) {
      currentY -= 15;
      page.drawText(`Weight: ${packageDetails.weight || 'N/A'} lbs`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      page.drawText(`Dimensions: ${packageDetails.length || 'N/A'}" x ${packageDetails.width || 'N/A'}" x ${packageDetails.height || 'N/A'}"`, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
    }
    
    // Order details section
    currentY -= 30;
    page.drawText('CONTENTS:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    currentY -= 15;
    selectedOrders.forEach((order, index) => {
      if (currentY > 100) { // Only show if there's space
        page.drawText(`${order.orderId} - ${order.customerId || 'Customer'}`, {
          x: 50,
          y: currentY,
          size: 8,
          font: font,
        });
        currentY -= 12;
      }
    });
    
    // Placeholder barcode area
    currentY -= 20;
    page.drawRectangle({
      x: 50,
      y: currentY - 40,
      width: 300,
      height: 40,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('BARCODE PLACEHOLDER', {
      x: 150,
      y: currentY - 25,
      size: 10,
      font: font,
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Bulk-Shipping-Label-${trackingNumber || 'BULK'}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    
    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Error generating bulk shipping label PDF:', error);
    res.status(500).json({ error: 'Failed to generate bulk shipping label PDF' });
  }
});

export default router;