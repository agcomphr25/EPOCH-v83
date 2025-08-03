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
    
    // Create a new PDF document optimized for printing
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard US Letter size (8.5" x 11")
    const { width, height } = page.getSize();
    
    // Define print-friendly margins
    const margin = 50;
    const printableWidth = width - (margin * 2);
    const printableHeight = height - (margin * 2);
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header with company branding - optimized for printing
    let currentY = height - margin;
    page.drawText('AGAT COMPOSITE PARTS', {
      x: margin,
      y: currentY,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    currentY -= 25;
    page.drawText('Quality Control Inspection Report', {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Document control box - positioned for better printing
    const docBoxX = width - margin - 200;
    page.drawRectangle({
      x: docBoxX,
      y: currentY - 10,
      width: 200,
      height: 80,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('Document No:', {
      x: docBoxX + 5,
      y: currentY + 50,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`QC-${orderId}`, {
      x: docBoxX + 80,
      y: currentY + 50,
      size: 10,
      font: font,
    });
    
    page.drawText('Revision:', {
      x: docBoxX + 5,
      y: currentY + 35,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Rev. A', {
      x: docBoxX + 80,
      y: currentY + 35,
      size: 10,
      font: font,
    });
    
    page.drawText('Date:', {
      x: docBoxX + 5,
      y: currentY + 20,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(new Date().toLocaleDateString(), {
      x: docBoxX + 80,
      y: currentY + 20,
      size: 10,
      font: font,
    });
    
    page.drawText('Page 1 of 1', {
      x: docBoxX + 5,
      y: currentY + 5,
      size: 9,
      font: font,
    });
    
    // Part information section
    currentY -= 100;
    page.drawText('PART INFORMATION', {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    // Draw a border around part info - full width for printing
    page.drawRectangle({
      x: margin,
      y: currentY - 90,
      width: printableWidth,
      height: 80,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    currentY -= 25;
    page.drawText(`Work Order No:`, {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`${orderId}`, {
      x: margin + 100,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(`Customer:`, {
      x: margin + 250,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`${order.customerId || 'N/A'}`, {
      x: margin + 310,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 20;
    page.drawText(`Part Number:`, {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`${order.modelId || 'N/A'}`, {
      x: margin + 100,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(`Quantity:`, {
      x: margin + 250,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`1`, {
      x: margin + 310,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 20;
    page.drawText(`Drawing No:`, {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`DWG-${orderId}`, {
      x: margin + 100,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(`Order Date:`, {
      x: margin + 250,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(`${order.orderDate || new Date().toLocaleDateString()}`, {
      x: margin + 310,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // QC Checklist items
    currentY -= 50;
    page.drawText('QUALITY CONTROL CHECKLIST', {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
    });
    
    const checklistSections = [
      {
        title: 'SHIPPING QUALITY CONTROL CHECKLIST',
        items: [
          'The proper stock(s) is being shipped: (e.g. Alpine Hunter, CAT, etc.)',
          'Stock(s) is inletted according to the work order: (action, barrel, bottom metal, right or left hand)',
          'Stock(s) is the proper color:',
          'Custom options are present and completed: (QD Cups, rail, LOP, tri-pod option, etc)',
          'Swivel studs are installed correctly:',
          'Stock(s) is being shipped to the correct address:',
          'Buttpad and overall stock finish meet QC standards:'
        ]
      }
    ];
    
    currentY -= 30;
    
    checklistSections.forEach((section, sectionIndex) => {
      currentY -= 20;
      
      // Section items - clean layout
      section.items.forEach((item, itemIndex) => {
        const itemNumber = itemIndex + 1;
        
        // Create a clean row with borders for each item
        page.drawRectangle({
          x: margin,
          y: currentY - 25,
          width: printableWidth,
          height: 25,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.5,
        });
        
        // Item number
        page.drawText(`${itemNumber}.`, {
          x: margin + 5,
          y: currentY - 8,
          size: 11,
          font: boldFont,
        });
        
        // Checklist item text - clean and readable
        page.drawText(item, {
          x: margin + 25,
          y: currentY - 8,
          size: 10,
          font: font,
        });
        
        // Pass/Fail checkboxes - clean alignment
        const checkboxY = currentY - 12;
        const passX = width - margin - 120;
        const failX = width - margin - 60;
        
        // Pass checkbox
        page.drawText('☐ Pass', {
          x: passX,
          y: currentY - 8,
          size: 10,
          font: font,
        });
        
        // Fail checkbox  
        page.drawText('☐ Fail', {
          x: failX,
          y: currentY - 8,
          size: 10,
          font: font,
        });
        
        currentY -= 30;
      });
    });
    
    // Clean spacing before signature section
    currentY -= 50;
    
    // Simple clean signature section
    currentY -= 70;
    
    // Single signature and date section - clean and simple
    page.drawText('INSPECTOR SIGNATURE:', {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    // Signature line
    page.drawLine({
      start: { x: margin + 150, y: currentY - 5 },
      end: { x: margin + 350, y: currentY - 5 },
      thickness: 1.5,
      color: rgb(0, 0, 0),
    });
    
    // Date field
    page.drawText('DATE:', {
      x: margin + 380,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    page.drawLine({
      start: { x: margin + 420, y: currentY - 5 },
      end: { x: width - margin, y: currentY - 5 },
      thickness: 1.5,
      color: rgb(0, 0, 0),
    });
    
    // Digital signature section - print optimized
    currentY -= 60;
    page.drawText('DIGITAL CERTIFICATION', {
      x: margin,
      y: currentY,
      size: 11,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    currentY -= 25;
    page.drawRectangle({
      x: margin,
      y: currentY - 45,
      width: printableWidth,
      height: 40,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 1,
    });
    
    currentY -= 15;
    page.drawText('This document has been digitally certified by:', {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: font,
    });
    
    currentY -= 18;
    page.drawText('AGAT.QC.INSPECTOR', {
      x: margin + 5,
      y: currentY,
      size: 11,
      font: boldFont,
    });
    
    page.drawText(`Date: ${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString()}`, {
      x: margin + 250,
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
    
    // Get comprehensive order data from storage
    const { storage } = await import('../../storage');
    const orders = await storage.getAllOrderDrafts();
    const stockModels = await storage.getAllStockModels();
    const customers = await storage.getAllCustomers();
    const features = await storage.getAllFeatures();
    const addresses = await storage.getAllAddresses();
    
    const order = orders.find(o => o.orderId === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Get related data
    const model = stockModels.find(m => m.id === order.modelId);
    const customer = customers.find(c => c.id === order.customerId);
    const customerAddresses = addresses.filter(a => a.customerId === order.customerId);
    
    // Create a new PDF document optimized for sales orders
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard US Letter size
    const { width, height } = page.getSize();
    
    // Define margins and layout
    const margin = 50;
    const printableWidth = width - (margin * 2);
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header section with company branding
    let currentY = height - margin;
    page.drawText('AGAT COMPOSITE PARTS', {
      x: margin,
      y: currentY,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Sales Order title
    currentY -= 30;
    page.drawText('SALES ORDER', {
      x: margin,
      y: currentY,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Order number and date box
    const orderBoxX = width - margin - 200;
    page.drawRectangle({
      x: orderBoxX,
      y: currentY - 5,
      width: 200,
      height: 60,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('Order Number:', {
      x: orderBoxX + 5,
      y: currentY + 30,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(orderId, {
      x: orderBoxX + 90,
      y: currentY + 30,
      size: 10,
      font: font,
    });
    
    page.drawText('Date:', {
      x: orderBoxX + 5,
      y: currentY + 15,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(new Date().toLocaleDateString(), {
      x: orderBoxX + 90,
      y: currentY + 15,
      size: 10,
      font: font,
    });
    
    page.drawText('Due Date:', {
      x: orderBoxX + 5,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawText(order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'TBD', {
      x: orderBoxX + 90,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // Customer Information Section
    currentY -= 80;
    page.drawText('BILL TO:', {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    // Bill to address
    currentY -= 20;
    if (customer) {
      page.drawText(customer.name || 'N/A', {
        x: margin,
        y: currentY,
        size: 10,
        font: font,
      });
      
      currentY -= 15;
      if (customer.email) {
        page.drawText(customer.email, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });
        currentY -= 15;
      }
      
      if (customer.phone) {
        page.drawText(customer.phone, {
          x: margin,
          y: currentY,
          size: 10,
          font: font,
        });
        currentY -= 15;
      }
    }
    
    // Ship to address (if different)
    const shipToY = currentY + 75;
    page.drawText('SHIP TO:', {
      x: margin + 250,
      y: shipToY,
      size: 12,
      font: boldFont,
    });
    
    let shipCurrentY = shipToY - 20;
    if (customerAddresses.length > 0) {
      const primaryAddress = customerAddresses[0];
      page.drawText(customer?.name || 'N/A', {
        x: margin + 250,
        y: shipCurrentY,
        size: 10,
        font: font,
      });
      
      shipCurrentY -= 15;
      page.drawText(primaryAddress.street || '', {
        x: margin + 250,
        y: shipCurrentY,
        size: 10,
        font: font,
      });
      
      shipCurrentY -= 15;
      const cityStateZip = `${primaryAddress.city || ''}, ${primaryAddress.state || ''} ${primaryAddress.zipCode || ''}`.trim();
      if (cityStateZip !== ', ') {
        page.drawText(cityStateZip, {
          x: margin + 250,
          y: shipCurrentY,
          size: 10,
          font: font,
        });
      }
    }
    
    // Order Details Section
    currentY -= 70;
    page.drawText('ORDER DETAILS', {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
    });
    
    // Create order details table
    currentY -= 30;
    
    // Table border
    page.drawRectangle({
      x: margin,
      y: currentY - 120,
      width: printableWidth,
      height: 120,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    // Table headers
    page.drawRectangle({
      x: margin,
      y: currentY - 25,
      width: printableWidth,
      height: 25,
      color: rgb(0.9, 0.9, 0.9),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('Item Description', {
      x: margin + 5,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Model/SKU', {
      x: margin + 200,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Qty', {
      x: margin + 320,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Unit Price', {
      x: margin + 380,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });
    
    page.drawText('Total', {
      x: margin + 460,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });
    
    // Main product line
    currentY -= 45;
    const productName = model?.displayName || model?.name || 'Custom Stock';
    page.drawText(productName, {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(order.modelId || 'CUSTOM', {
      x: margin + 200,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText('1', {
      x: margin + 320,
      y: currentY,
      size: 10,
      font: font,
    });
    
    const basePrice = model?.price || order.totalPrice || 0;
    page.drawText(`$${basePrice.toFixed(2)}`, {
      x: margin + 380,
      y: currentY,
      size: 10,
      font: font,
    });
    
    page.drawText(`$${basePrice.toFixed(2)}`, {
      x: margin + 460,
      y: currentY,
      size: 10,
      font: font,
    });
    
    // Features and Customizations Section
    currentY -= 140;
    page.drawText('FEATURES & CUSTOMIZATIONS', {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
    });
    
    currentY -= 25;
    let featureTotal = 0;
    let featureLineCount = 0;
    
    if (order.features && Object.keys(order.features).length > 0) {
      Object.entries(order.features).forEach(([featureKey, featureValue]) => {
        if (featureValue && featureValue !== false && featureValue !== '') {
          // Find feature details for pricing
          const featureDetail = features.find(f => f.id === featureKey);
          const featureName = featureDetail ? featureDetail.name : featureKey;
          const featurePrice = featureDetail ? featureDetail.price || 0 : 0;
          
          // Display feature line
          page.drawText(`• ${featureName}`, {
            x: margin + 5,
            y: currentY,
            size: 10,
            font: font,
          });
          
          if (typeof featureValue === 'string' && featureValue !== 'true') {
            page.drawText(`(${featureValue})`, {
              x: margin + 200,
              y: currentY,
              size: 9,
              font: font,
            });
          }
          
          if (featurePrice > 0) {
            page.drawText(`+$${featurePrice.toFixed(2)}`, {
              x: margin + 400,
              y: currentY,
              size: 10,
              font: font,
            });
            featureTotal += featurePrice;
          }
          
          currentY -= 18;
          featureLineCount++;
        }
      });
    }
    
    if (featureLineCount === 0) {
      page.drawText('Standard configuration - no additional features', {
        x: margin + 5,
        y: currentY,
        size: 10,
        font: font,
      });
      currentY -= 18;
    }
    
    // Order Notes/Special Instructions
    if (order.notes) {
      currentY -= 15;
      page.drawText('SPECIAL INSTRUCTIONS:', {
        x: margin,
        y: currentY,
        size: 12,
        font: boldFont,
      });
      
      currentY -= 20;
      // Word wrap the notes
      const noteWords = order.notes.split(' ');
      let currentLine = '';
      const maxLineLength = 70;
      
      noteWords.forEach(word => {
        if ((currentLine + ' ' + word).length > maxLineLength) {
          page.drawText(currentLine, {
            x: margin + 5,
            y: currentY,
            size: 10,
            font: font,
          });
          currentY -= 15;
          currentLine = word;
        } else {
          currentLine += (currentLine ? ' ' : '') + word;
        }
      });
      
      if (currentLine) {
        page.drawText(currentLine, {
          x: margin + 5,
          y: currentY,
          size: 10,
          font: font,
        });
        currentY -= 15;
      }
    }
    
    // Totals Section
    currentY -= 40;
    
    // Create totals box
    const totalsBoxX = width - margin - 200;
    page.drawRectangle({
      x: totalsBoxX,
      y: currentY - 80,
      width: 200,
      height: 80,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    // Subtotal
    page.drawText('Subtotal:', {
      x: totalsBoxX + 10,
      y: currentY - 20,
      size: 11,
      font: boldFont,
    });
    
    page.drawText(`$${basePrice.toFixed(2)}`, {
      x: totalsBoxX + 120,
      y: currentY - 20,
      size: 11,
      font: font,
    });
    
    // Features total
    if (featureTotal > 0) {
      currentY -= 18;
      page.drawText('Features:', {
        x: totalsBoxX + 10,
        y: currentY - 20,
        size: 11,
        font: boldFont,
      });
      
      page.drawText(`$${featureTotal.toFixed(2)}`, {
        x: totalsBoxX + 120,
        y: currentY - 20,
        size: 11,
        font: font,
      });
    }
    
    // Separator line
    page.drawLine({
      start: { x: totalsBoxX + 10, y: currentY - 30 },
      end: { x: totalsBoxX + 190, y: currentY - 30 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    // Total
    const finalTotal = basePrice + featureTotal;
    page.drawText('TOTAL:', {
      x: totalsBoxX + 10,
      y: currentY - 50,
      size: 12,
      font: boldFont,
    });
    
    page.drawText(`$${finalTotal.toFixed(2)}`, {
      x: totalsBoxX + 120,
      y: currentY - 50,
      size: 12,
      font: boldFont,
    });
    
    // Terms and Conditions Section
    currentY -= 120;
    page.drawText('TERMS AND CONDITIONS', {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    currentY -= 20;
    const terms = [
      '• Payment: 50% deposit required to begin production, balance due upon completion',
      '• Lead Time: Custom manufacturing typically 4-6 weeks from deposit',
      '• Custom items are non-returnable unless defective',
      '• Shipping costs additional - calculated at time of shipment',
      '• Prices valid for 30 days from quote date'
    ];
    
    terms.forEach(term => {
      page.drawText(term, {
        x: margin,
        y: currentY,
        size: 9,
        font: font,
      });
      currentY -= 15;
    });
    
    // Acceptance signature area
    currentY -= 30;
    page.drawText('CUSTOMER APPROVAL', {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    });
    
    currentY -= 25;
    page.drawText('Customer Signature:', {
      x: margin,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawLine({
      start: { x: margin + 120, y: currentY - 5 },
      end: { x: margin + 300, y: currentY - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('Date:', {
      x: margin + 320,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    
    page.drawLine({
      start: { x: margin + 350, y: currentY - 5 },
      end: { x: margin + 450, y: currentY - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    // Company footer
    currentY -= 40;
    page.drawText('Thank you for your business!', {
      x: margin,
      y: currentY,
      size: 11,
      font: boldFont,
    });
    
    currentY -= 20;
    page.drawText('Questions? Contact us at sales@agatcomposite.com or (XXX) XXX-XXXX', {
      x: margin,
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