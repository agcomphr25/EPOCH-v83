import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fetch from 'node-fetch';

const router = Router();

// UPS API Configuration
const UPS_API_BASE_URL = 'https://wwwcie.ups.com/ship/v1/shipments'; // Sandbox URL
// const UPS_API_BASE_URL = 'https://onlinetools.ups.com/ship/v1/shipments'; // Production URL

// UPS API Helper Functions
async function getUPSAccessToken() {
  const credentials = {
    username: process.env.UPS_USER_ID,
    password: process.env.UPS_PASSWORD,
    accessKey: process.env.UPS_ACCESS_KEY
  };

  // Validate credentials exist
  if (!credentials.username || !credentials.password || !credentials.accessKey) {
    throw new Error('UPS credentials missing: username, password, or access key not provided');
  }

  console.log('UPS OAuth Request Details:', {
    url: 'https://wwwcie.ups.com/security/v1/oauth/token',
    username: credentials.username ? 'PROVIDED' : 'MISSING',
    password: credentials.password ? 'PROVIDED' : 'MISSING',
    accessKey: credentials.accessKey ? 'PROVIDED' : 'MISSING'
  });

  const response = await fetch('https://wwwcie.ups.com/security/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-merchant-id': credentials.username,
      'Authorization': `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('UPS OAuth Error Details:', {
      status: response.status,
      statusText: response.statusText,
      response: errorText,
      headers: Object.fromEntries(response.headers.entries())
    });
    throw new Error(`UPS OAuth failed: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.access_token;
}

async function createUPSShipment(shipmentData: any) {
  const accessToken = await getUPSAccessToken();
  
  const transId = Math.random().toString(36).substring(7);
  
  const response = await fetch(UPS_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'transId': transId,
      'transactionSrc': 'AG_Composites_ERP',
      'x-merchant-id': process.env.UPS_USER_ID || ''
    },
    body: JSON.stringify(shipmentData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('UPS Shipment Error Response:', errorText);
    throw new Error(`UPS Shipment creation failed: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log('UPS Shipment Success:', JSON.stringify(result, null, 2));
  return result;
}

function buildUPSShipmentRequest(orderData: any, shippingAddress: any, packageDetails: any) {
  return {
    ShipmentRequest: {
      Request: {
        RequestOption: "validate",
        TransactionReference: {
          CustomerContext: `Order-${orderData.orderId}`
        }
      },
      Shipment: {
        Description: `AG Composites Order ${orderData.orderId}`,
        Shipper: {
          Name: "AG Composites",
          AttentionName: "Shipping Department",
          Phone: {
            Number: "5551234567"
          },
          ShipperNumber: process.env.UPS_SHIPPER_NUMBER,
          Address: {
            AddressLine: ["123 Manufacturing Way"],
            City: "Industrial City",
            StateProvinceCode: "CA",
            PostalCode: "90210",
            CountryCode: "US"
          }
        },
        ShipTo: {
          Name: shippingAddress.name,
          AttentionName: shippingAddress.name,
          Phone: {
            Number: "5550000000"
          },
          Address: {
            AddressLine: [shippingAddress.street],
            City: shippingAddress.city,
            StateProvinceCode: shippingAddress.state,
            PostalCode: shippingAddress.zip,
            CountryCode: "US"
          }
        },
        ShipFrom: {
          Name: "AG Composites",
          AttentionName: "Shipping Department",
          Phone: {
            Number: "5551234567"
          },
          Address: {
            AddressLine: ["123 Manufacturing Way"],
            City: "Industrial City",
            StateProvinceCode: "CA",
            PostalCode: "90210",
            CountryCode: "US"
          }
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01",
            BillShipper: {
              AccountNumber: process.env.UPS_ACCOUNT_NUMBER
            }
          }
        },
        Service: {
          Code: "03"
        },
        Package: {
          Description: `Composite Parts - Order ${orderData.orderId}`,
          Packaging: {
            Code: "02"
          },
          Dimensions: {
            UnitOfMeasurement: {
              Code: "IN"
            },
            Length: packageDetails.length || "12",
            Width: packageDetails.width || "12",
            Height: packageDetails.height || "12"
          },
          PackageWeight: {
            UnitOfMeasurement: {
              Code: "LBS"
            },
            Weight: packageDetails.weight || "10"
          }
        },
        LabelSpecification: {
          LabelImageFormat: {
            Code: "GIF"
          },
          HTTPUserAgent: "Mozilla/4.5"
        }
      }
    }
  };
}

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
    page.drawText('AG COMPOSITES', {
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
      
      // Section items - clean layout with word wrapping
      section.items.forEach((item, itemIndex) => {
        const itemNumber = itemIndex + 1;
        
        // Calculate text wrapping for long items
        const maxTextWidth = printableWidth - 200; // Leave space for checkboxes
        const words = item.split(' ');
        const lines = [];
        let currentLine = '';
        
        words.forEach(word => {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          // Approximate text width calculation (simple estimate)
          if (testLine.length * 6 > maxTextWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });
        if (currentLine) lines.push(currentLine);
        
        // Calculate row height based on number of lines
        const lineHeight = 15;
        const rowHeight = Math.max(30, lines.length * lineHeight + 10);
        
        // Create a clean row with borders for each item
        page.drawRectangle({
          x: margin,
          y: currentY - rowHeight,
          width: printableWidth,
          height: rowHeight,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.5,
        });
        
        // Item number - positioned properly within the row
        page.drawText(`${itemNumber}.`, {
          x: margin + 8,
          y: currentY - 15,
          size: 11,
          font: boldFont,
        });
        
        // Checklist item text - with word wrapping
        lines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: margin + 30,
            y: currentY - 15 - (lineIndex * lineHeight),
            size: 10,
            font: font,
          });
        });
        
        // Pass/Fail checkboxes - centered in row
        const checkboxY = currentY - (rowHeight / 2) - 6;
        const passX = width - margin - 140;
        const failX = width - margin - 70;
        
        // Pass checkbox
        page.drawRectangle({
          x: passX,
          y: checkboxY,
          width: 12,
          height: 12,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });
        page.drawText('Pass', {
          x: passX + 18,
          y: checkboxY + 3,
          size: 9,
          font: font,
        });
        
        // Fail checkbox  
        page.drawRectangle({
          x: failX,
          y: checkboxY,
          width: 12,
          height: 12,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });
        page.drawText('Fail', {
          x: failX + 18,
          y: checkboxY + 3,
          size: 9,
          font: font,
        });
        
        currentY -= rowHeight + 5;
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
    page.drawText('AG.QC.INSPECTOR', {
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
    const customer = customers.find(c => c.id?.toString() === order.customerId?.toString());
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
    page.drawText('AG COMPOSITES', {
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
    
    const basePrice = model?.price || 0;
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
          // Find feature details for pricing and display name
          const featureDetail = features.find(f => f.id === featureKey);
          const featureName = featureDetail ? (featureDetail.displayName || featureDetail.name) : featureKey;
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

// Generate UPS Shipping Label with real UPS API integration
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

    // Validate required fields
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
      return res.status(400).json({ error: 'Complete shipping address is required' });
    }

    if (!packageDetails || !packageDetails.weight) {
      return res.status(400).json({ error: 'Package weight is required' });
    }

    try {
      // Create UPS shipment using real API
      const shipmentRequest = buildUPSShipmentRequest(order, shippingAddress, packageDetails);
      const upsResponse = await createUPSShipment(shipmentRequest);
      
      // Extract tracking number and label from UPS response
      const upsData = upsResponse as any;
      const trackingNumber = upsData.ShipmentResponse?.ShipmentResults?.PackageResults?.TrackingNumber;
      const labelImage = upsData.ShipmentResponse?.ShipmentResults?.PackageResults?.ShippingLabel?.GraphicImage;
      
      if (!trackingNumber || !labelImage) {
        throw new Error('UPS API response missing tracking number or label image');
      }

      // Save tracking information to database
      const { updateTrackingInfo, sendCustomerNotification } = await import('../../utils/notifications');
      await updateTrackingInfo(orderId, {
        trackingNumber,
        carrier: 'UPS',
        shippedDate: new Date(),
        estimatedDelivery: undefined // UPS response may include this
      });

      // Send customer notification
      try {
        await sendCustomerNotification({
          orderId,
          trackingNumber,
          carrier: 'UPS'
        });
        console.log(`Customer notification sent for order ${orderId}`);
      } catch (notificationError) {
        console.error('Failed to send customer notification:', notificationError);
        // Don't fail the entire request if notification fails
      }

      // Convert base64 label image to PDF
      const labelBuffer = Buffer.from(labelImage, 'base64');
      
      // Create PDF document with the UPS label
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([432, 648]); // 6x9 inch shipping label
      
      // Embed the UPS label image
      const labelImageObj = await pdfDoc.embedPng(labelBuffer);
      const { width, height } = page.getSize();
      
      // Scale image to fit page
      const imgDims = labelImageObj.scale(1);
      const scaleFactor = Math.min(width / imgDims.width, height / imgDims.height);
      
      page.drawImage(labelImageObj, {
        x: (width - imgDims.width * scaleFactor) / 2,
        y: (height - imgDims.height * scaleFactor) / 2,
        width: imgDims.width * scaleFactor,
        height: imgDims.height * scaleFactor,
      });

      // Generate PDF bytes
      const pdfBytes = await pdfDoc.save();
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="UPS-Label-${orderId}-${trackingNumber}.pdf"`);
      res.setHeader('Content-Length', pdfBytes.length);
      
      // Send PDF
      res.send(Buffer.from(pdfBytes));
      
    } catch (upsError) {
      console.error('UPS API Error:', upsError);
      
      // Fallback to placeholder label if UPS API fails
      console.log('Falling back to placeholder label due to UPS API error');
      
      // Create a placeholder shipping label PDF with error information
      const placeholderPdfDoc = await PDFDocument.create();
      const placeholderPage = placeholderPdfDoc.addPage([432, 648]); // 6x9 inch shipping label
      const { width: placeholderWidth, height: placeholderHeight } = placeholderPage.getSize();
      
      // Load fonts
      const placeholderFont = await placeholderPdfDoc.embedFont(StandardFonts.Helvetica);
      const placeholderBoldFont = await placeholderPdfDoc.embedFont(StandardFonts.HelveticaBold);
    
      // Header
      let currentY = placeholderHeight - 40;
      placeholderPage.drawText('UPS SHIPPING LABEL (FALLBACK)', {
        x: 50,
        y: currentY,
        size: 16,
        font: placeholderBoldFont,
        color: rgb(0, 0, 0),
      });
      
      // UPS API Error message
      currentY -= 30;
      placeholderPage.drawText('UPS API Error - Using Placeholder Label', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderBoldFont,
        color: rgb(0.8, 0, 0),
      });
      
      // Generate placeholder tracking number
      const placeholderTrackingNumber = `PH${orderId}-${Date.now().toString().slice(-6)}`;
      
      // Save placeholder tracking information to database
      const { updateTrackingInfo } = await import('../../utils/notifications');
      await updateTrackingInfo(orderId, {
        trackingNumber: placeholderTrackingNumber,
        carrier: 'UPS (Placeholder)',
        shippedDate: new Date(),
        estimatedDelivery: undefined
      });

      // Tracking number placeholder
      currentY -= 30;
      placeholderPage.drawText(`Tracking #: ${placeholderTrackingNumber}`, {
        x: 50,
        y: currentY,
        size: 12,
        font: placeholderBoldFont,
      });
      
      // From address
      currentY -= 40;
      placeholderPage.drawText('FROM:', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderBoldFont,
      });
      
      currentY -= 20;
      placeholderPage.drawText('AG Composites', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderFont,
      });
      
      currentY -= 15;
      placeholderPage.drawText('123 Manufacturing Way', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderFont,
      });
      
      currentY -= 15;
      placeholderPage.drawText('Industrial City, ST 12345', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderFont,
      });
      
      // To address
      currentY -= 40;
      placeholderPage.drawText('TO:', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderBoldFont,
      });
      
      if (shippingAddress) {
        currentY -= 20;
        placeholderPage.drawText(shippingAddress.name || 'Customer Name', {
          x: 50,
          y: currentY,
          size: 10,
          font: placeholderFont,
        });
        
        currentY -= 15;
        placeholderPage.drawText(shippingAddress.street || 'Customer Address', {
          x: 50,
          y: currentY,
          size: 10,
          font: placeholderFont,
        });
        
        currentY -= 15;
        placeholderPage.drawText(`${shippingAddress.city || 'City'}, ${shippingAddress.state || 'ST'} ${shippingAddress.zip || '12345'}`, {
          x: 50,
          y: currentY,
          size: 10,
          font: placeholderFont,
        });
      } else {
        currentY -= 20;
        placeholderPage.drawText('Customer Address Required', {
          x: 50,
          y: currentY,
          size: 10,
          font: placeholderFont,
        });
      }
      
      // Service info
      currentY -= 40;
      placeholderPage.drawText('Service: UPS Ground', {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderFont,
      });
      
      currentY -= 15;
      placeholderPage.drawText(`Order: ${orderId}`, {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderFont,
      });
      
      if (packageDetails) {
        currentY -= 15;
        placeholderPage.drawText(`Weight: ${packageDetails.weight || 'N/A'} lbs`, {
          x: 50,
          y: currentY,
          size: 10,
          font: placeholderFont,
        });
        
        currentY -= 15;
        placeholderPage.drawText(`Dimensions: ${packageDetails.length || 'N/A'}" x ${packageDetails.width || 'N/A'}" x ${packageDetails.height || 'N/A'}"`, {
          x: 50,
          y: currentY,
          size: 10,
          font: placeholderFont,
        });
      }
      
      // Note about UPS API integration
      currentY -= 40;
      placeholderPage.drawText('Note: UPS API credentials may need verification.', {
        x: 50,
        y: currentY,
        size: 8,
        font: placeholderFont,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      currentY -= 12;
      placeholderPage.drawText('Contact administrator to configure UPS integration.', {
        x: 50,
        y: currentY,
        size: 8,
        font: placeholderFont,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      // Generate PDF bytes
      const fallbackPdfBytes = await placeholderPdfDoc.save();
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Shipping-Label-Fallback-${orderId}.pdf"`);
      res.setHeader('Content-Length', fallbackPdfBytes.length);
      
      // Send PDF
      res.send(Buffer.from(fallbackPdfBytes));
    }
    
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

// Diagnostic endpoint to test UPS credentials
router.get('/test-ups-credentials', async (req: Request, res: Response) => {
  try {
    console.log('Testing UPS credentials...');
    const accessToken = await getUPSAccessToken();
    
    res.json({
      success: true,
      message: 'UPS credentials are valid',
      hasAccessToken: !!accessToken
    });
  } catch (error) {
    console.error('UPS credential test failed:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Check UPS developer portal to verify credentials are activated'
    });
  }
});

// API route to update tracking information manually
router.post('/update-tracking/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { trackingNumber, carrier, estimatedDelivery, sendNotification } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Update tracking information
    const { updateTrackingInfo, sendCustomerNotification } = await import('../../utils/notifications');
    await updateTrackingInfo(orderId, {
      trackingNumber,
      carrier: carrier || 'UPS',
      shippedDate: new Date(),
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : undefined
    });

    // Send customer notification if requested
    let notificationResult = null;
    if (sendNotification) {
      try {
        notificationResult = await sendCustomerNotification({
          orderId,
          trackingNumber,
          carrier: carrier || 'UPS',
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : undefined
        });
      } catch (error) {
        console.error('Notification error:', error);
      }
    }

    res.json({
      success: true,
      message: 'Tracking information updated successfully',
      notification: notificationResult
    });

  } catch (error) {
    console.error('Error updating tracking:', error);
    res.status(500).json({ error: 'Failed to update tracking information' });
  }
});

// API route to get tracking information for an order
router.get('/tracking/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    const { storage } = await import('../../storage');
    const orders = await storage.getAllOrderDrafts();
    const order = orders.find(o => o.orderId === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      orderId: order.orderId,
      trackingNumber: order.trackingNumber,
      shippingCarrier: order.shippingCarrier,
      shippingMethod: order.shippingMethod,
      shippedDate: order.shippedDate,
      estimatedDelivery: order.estimatedDelivery,
      customerNotified: order.customerNotified,
      notificationMethod: order.notificationMethod,
      notificationSentAt: order.notificationSentAt,
      deliveryConfirmed: order.deliveryConfirmed,
      deliveryConfirmedAt: order.deliveryConfirmedAt
    });

  } catch (error) {
    console.error('Error getting tracking info:', error);
    res.status(500).json({ error: 'Failed to get tracking information' });
  }
});

export default router;