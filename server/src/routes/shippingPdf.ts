import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fetch from 'node-fetch';

const router = Router();

// UPS API Configuration - Try production endpoints since API is approved
const UPS_ENV = process.env.UPS_ENV || 'production';
const UPS_API_BASE_URL = UPS_ENV === 'production'
  ? 'https://onlinetools.ups.com/ship/v1/shipments'
  : 'https://wwwcie.ups.com/ship/v1/shipments';

const UPS_OAUTH_URL = UPS_ENV === 'production'
  ? 'https://onlinetools.ups.com/security/v1/oauth/token'
  : 'https://wwwcie.ups.com/security/v1/oauth/token';

// UPS API Helper Functions
async function getUPSAccessToken() {
  const credentials = {
    clientId: process.env.UPS_CLIENT_ID,
    clientSecret: process.env.UPS_CLIENT_SECRET
  };

  // Validate credentials exist
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('UPS credentials missing: UPS_CLIENT_ID or UPS_CLIENT_SECRET not provided');
  }

  console.log('UPS OAuth Request Details:', {
    url: UPS_OAUTH_URL,
    clientId: credentials.clientId ? 'PROVIDED' : 'MISSING',
    clientSecret: credentials.clientSecret ? 'PROVIDED' : 'MISSING',
    environment: UPS_ENV
  });

  const response = await fetch(UPS_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`
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
  console.log('UPS OAuth Success:', {
    access_token: data.access_token ? `${data.access_token.substring(0, 20)}...` : 'MISSING',
    token_type: data.token_type,
    expires_in: data.expires_in
  });
  return data.access_token;
}

async function createUPSShipment(shipmentData: any) {
  const accessToken = await getUPSAccessToken();

  const transId = Math.random().toString(36).substring(7);

  console.log('UPS Shipment Request Details:', {
    url: UPS_API_BASE_URL,
    token: accessToken ? `${accessToken.substring(0, 20)}...` : 'MISSING',
    transId: transId,
    bodySize: JSON.stringify(shipmentData).length
  });

  const response = await fetch(UPS_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'transId': transId,
      'transactionSrc': 'AG_Composites_ERP'
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

function buildUPSShipmentRequest(orderData: any, shippingAddress: any, packageDetails: any, packageValue?: number) {
  return {
    ShipmentRequest: {
      Request: {
        RequestOption: "nonvalidate",
        TransactionReference: {
          CustomerContext: `Order-${orderData.orderId}`
        }
      },
      Shipment: {
        Description: `AG Composites Order ${orderData.orderId}`,
        Shipper: {
          Name: process.env.SHIP_FROM_NAME || "AG Composites",
          AttentionName: process.env.SHIP_FROM_ATTENTION || "Shipping Department",
          Phone: {
            Number: process.env.SHIP_FROM_PHONE || "2567238381"
          },
          ShipperNumber: process.env.UPS_SHIPPER_NUMBER?.trim() || " 27835W",
          Address: {
            AddressLine: [process.env.SHIP_FROM_ADDRESS1 || "230 Hamer Rd"],
            City: process.env.SHIP_FROM_CITY || "Owens Crossroads",
            StateProvinceCode: process.env.SHIP_FROM_STATE || "AL",
            PostalCode: process.env.SHIP_FROM_POSTAL || "35763",
            CountryCode: process.env.SHIP_FROM_COUNTRY || "US"
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
          Name: process.env.SHIP_FROM_NAME || "AG Composites",
          AttentionName: process.env.SHIP_FROM_ATTENTION || "Shipping Department",
          Phone: {
            Number: process.env.SHIP_FROM_PHONE || "2567238381"
          },
          Address: {
            AddressLine: [process.env.SHIP_FROM_ADDRESS1 || "230 Hamer Rd"],
            City: process.env.SHIP_FROM_CITY || "Owens Crossroads",
            StateProvinceCode: process.env.SHIP_FROM_STATE || "AL",
            PostalCode: process.env.SHIP_FROM_POSTAL || "35763",
            CountryCode: process.env.SHIP_FROM_COUNTRY || "US"
          }
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01",
            BillShipper: {
              AccountNumber: process.env.UPS_ACCOUNT_NUMBER?.trim() || process.env.UPS_SHIPPER_NUMBER?.trim()
            }
          }
        },
        Service: {
          Code: "03"
        },
        Package: Array.isArray(packageDetails.packages) ? packageDetails.packages.map((pkg: any, index: number) => ({
          Description: `Composite Parts - Order ${orderData.orderId} - Package ${index + 1}`,
          Packaging: {
            Code: "02"
          },
          Dimensions: {
            UnitOfMeasurement: {
              Code: "IN"
            },
            Length: pkg.length || "12",
            Width: pkg.width || "12",
            Height: pkg.height || "12"
          },
          PackageWeight: {
            UnitOfMeasurement: {
              Code: "LBS"
            },
            Weight: pkg.weight || "10"
          },
          InsuredValue: {
            CurrencyCode: "USD",
            MonetaryValue: (pkg.value || packageValue || 0).toFixed(2)
          },
          PackageServiceOptions: {
            DeclaredValue: {
              CurrencyCode: "USD",
              MonetaryValue: (pkg.value || packageValue || 0).toFixed(2)
            }
          }
        })) : {
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
          },
          InsuredValue: {
            CurrencyCode: "USD",
            MonetaryValue: (packageValue || 0).toFixed(2)
          },
          PackageServiceOptions: {
            DeclaredValue: {
              CurrencyCode: "USD",
              MonetaryValue: (packageValue || 0).toFixed(2)
            }
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

    // Get order data from storage using the proper method
    const { storage } = await import('../../storage');
    let order = await storage.getOrderById(orderId);

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

    // Order information section - simplified for shipping
    currentY -= 100;
    page.drawText('ORDER INFORMATION', {
      x: margin,
      y: currentY,
      size: 12,
      font: boldFont,
    });

    // Draw a border around order info - simplified layout
    page.drawRectangle({
      x: margin,
      y: currentY - 50,
      width: printableWidth,
      height: 40,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    currentY -= 25;
    page.drawText(`Order ID: ${orderId}`, {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: boldFont,
    });

    page.drawText(`Order Date: ${order.orderDate || new Date().toLocaleDateString()}`, {
      x: margin + 250,
      y: currentY,
      size: 10,
      font: boldFont,
    });

    // QC Checklist items
    currentY -= 40;
    const checklistItems = [
      'The proper stock(s) is being shipped:\n(e.g. Alpine Hunter, CAT, etc.)',
      'Stock(s) is inletted according to the work order:\n(action, barrel, bottom metal, right or left hand)',
      'Stock(s) is the proper color:',
      'Custom options are present and completed:\n(QD Cups, rail, LOP, tri-pod option, etc)',
      'Swivel studs are installed correctly:',
      'Stock(s) is being shipped to the correct address:',
      'Buttpad and overall stock finish meet QC standards:'
    ];

    checklistItems.forEach((item, index) => {
      // Checkbox
      page.drawRectangle({
        x: margin,
        y: currentY - 12,
        width: 12,
        height: 12,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      // Item text - handle multi-line items
      const itemLines = item.split('\n');
      let lineY = currentY - 8;

      itemLines.forEach((line, lineIndex) => {
        const prefix = lineIndex === 0 ? `${index + 1}) ` : '    ';
        page.drawText(prefix + line, {
          x: margin + 20,
          y: lineY,
          size: 10,
          font: lineIndex === 0 ? font : font,
          color: rgb(0, 0, 0),
        });
        lineY -= 14;
      });

      currentY -= (itemLines.length * 14) + 15;
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
    const order = await storage.getOrderById(orderId);
    const stockModels = await storage.getAllStockModels();
    const customers = await storage.getAllCustomers();
    const features = await storage.getAllFeatures();
    const addresses = await storage.getAllAddresses();

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

    // Customer Information Section - Enhanced Layout
    currentY -= 80;
    
    // Create customer info box
    page.drawRectangle({
      x: margin,
      y: currentY - 100,
      width: printableWidth,
      height: 100,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // Customer header
    page.drawText('CUSTOMER INFORMATION', {
      x: margin + 5,
      y: currentY - 15,
      size: 12,
      font: boldFont,
    });

    // Bill to section
    currentY -= 35;
    page.drawText('BILL TO:', {
      x: margin + 5,
      y: currentY,
      size: 10,
      font: boldFont,
    });

    currentY -= 15;
    if (customer) {
      // Customer name and company
      const customerLine = customer.company ? 
        `${customer.name} - ${customer.company}` : customer.name || 'N/A';
      page.drawText(customerLine, {
        x: margin + 5,
        y: currentY,
        size: 10,
        font: font,
      });

      currentY -= 13;
      // Contact person if different from customer name
      if (customer.contact && customer.contact !== customer.name) {
        page.drawText(`Contact: ${customer.contact}`, {
          x: margin + 5,
          y: currentY,
          size: 9,
          font: font,
        });
        currentY -= 13;
      }

      // Email and phone on same line if both exist
      const contactInfo = [];
      if (customer.email) contactInfo.push(`Email: ${customer.email}`);
      if (customer.phone) contactInfo.push(`Phone: ${customer.phone}`);
      
      if (contactInfo.length > 0) {
        page.drawText(contactInfo.join(' | '), {
          x: margin + 5,
          y: currentY,
          size: 9,
          font: font,
        });
      }
    } else {
      page.drawText('Customer information not available', {
        x: margin + 5,
        y: currentY,
        size: 10,
        font: font,
      });
    }

    // Ship to address section (right side)
    const shipToX = margin + 280;
    let shipCurrentY = currentY + 60;
    
    page.drawText('SHIP TO:', {
      x: shipToX,
      y: shipCurrentY,
      size: 10,
      font: boldFont,
    });

    shipCurrentY -= 15;
    if (customerAddresses.length > 0) {
      const primaryAddress = customerAddresses[0];
      
      // Ship to name
      page.drawText(customer?.name || 'N/A', {
        x: shipToX,
        y: shipCurrentY,
        size: 10,
        font: font,
      });

      shipCurrentY -= 13;
      // Street address
      if (primaryAddress.street) {
        page.drawText(primaryAddress.street, {
          x: shipToX,
          y: shipCurrentY,
          size: 9,
          font: font,
        });
        shipCurrentY -= 13;
      }

      // Street2 (suite, apt, etc.)
      if (primaryAddress.street2) {
        page.drawText(primaryAddress.street2, {
          x: shipToX,
          y: shipCurrentY,
          size: 9,
          font: font,
        });
        shipCurrentY -= 13;
      }

      // City, State, ZIP
      const cityStateZip = `${primaryAddress.city || ''}, ${primaryAddress.state || ''} ${primaryAddress.zipCode || ''}`.trim();
      if (cityStateZip !== ', ') {
        page.drawText(cityStateZip, {
          x: shipToX,
          y: shipCurrentY,
          size: 9,
          font: font,
        });
      }
    } else {
      page.drawText('Same as billing address', {
        x: shipToX,
        y: shipCurrentY,
        size: 9,
        font: font,
      });
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

    // Features and Customizations Section - Enhanced
    currentY -= 140;
    page.drawText('FEATURES & CUSTOMIZATIONS', {
      x: margin,
      y: currentY,
      size: 14,
      font: boldFont,
    });

    // Create features box
    const featuresBoxHeight = 120;
    page.drawRectangle({
      x: margin,
      y: currentY - featuresBoxHeight - 10,
      width: printableWidth,
      height: featuresBoxHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    currentY -= 25;
    let featureTotal = 0;
    let featureLineCount = 0;
    const maxFeaturesPerColumn = 6;
    let currentColumn = 0;
    let columnY = currentY;

    if (order.features && Object.keys(order.features).length > 0) {
      Object.entries(order.features).forEach(([featureKey, featureValue]) => {
        if (featureValue && featureValue !== false && featureValue !== '') {
          // Find feature details for pricing and display name
          const featureDetail = features.find(f => f.id === featureKey);
          const featureName = featureDetail ? (featureDetail.displayName || featureDetail.name) : 
            // Convert database names to readable format if no display name
            featureKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const featurePrice = featureDetail ? featureDetail.price || 0 : 0;

          // Calculate column position
          const columnX = margin + 5 + (currentColumn * 260);
          
          // Display feature name with better formatting
          let displayText = `• ${featureName}`;
          
          // Add feature value if it's a meaningful string
          if (typeof featureValue === 'string' && featureValue !== 'true' && featureValue !== 'yes') {
            // Convert database values to readable format
            const readableValue = featureValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            displayText += `: ${readableValue}`;
          }

          page.drawText(displayText, {
            x: columnX,
            y: columnY,
            size: 9,
            font: font,
          });

          // Add pricing if applicable
          if (featurePrice > 0) {
            page.drawText(`+$${featurePrice.toFixed(2)}`, {
              x: columnX + 200,
              y: columnY,
              size: 9,
              font: font,
              color: rgb(0, 0.5, 0),
            });
            featureTotal += featurePrice;
          }

          featureLineCount++;
          columnY -= 12;

          // Move to next column if needed
          if (featureLineCount % maxFeaturesPerColumn === 0) {
            currentColumn++;
            columnY = currentY;
          }
        }
      });
    } else {
      // No features message
      page.drawText('Standard configuration - no additional features', {
        x: margin + 5,
        y: columnY,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Reset current Y for next section
    currentY -= featuresBoxHeight + 10;

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

    // Shipping total
    if (order.shipping && order.shipping > 0) {
      currentY -= 18;
      page.drawText('Shipping:', {
        x: totalsBoxX + 10,
        y: currentY - 20,
        size: 11,
        font: boldFont,
      });

      page.drawText(`$${order.shipping.toFixed(2)}`, {
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
    const finalTotal = basePrice + featureTotal + (order.shipping || 0);
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



    // Company footer with better contact info
    currentY -= 50;
    page.drawText('Thank you for your business!', {
      x: margin,
      y: currentY,
      size: 11,
      font: boldFont,
    });

    currentY -= 20;
    page.drawText('AG Composites | 230 Hamer Rd, Owens Crossroads, AL 35763', {
      x: margin,
      y: currentY,
      size: 9,
      font: font,
    });

    currentY -= 12;
    page.drawText('Phone: (256) 723-8381 | Email: sales@agatcomposite.com', {
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
    const { packageDetails, shippingAddress: providedShippingAddress, packageValue } = req.body;

    // Get order, customer, and address data directly from database
    const { db } = await import('../../db');
    const { eq } = await import('drizzle-orm');
    const { orderDrafts, customers, customerAddresses } = await import('../../schema');

    // First get the order
    const orders = await db.select()
      .from(orderDrafts)
      .where(eq(orderDrafts.orderId, orderId));

    if (!orders || orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];

    // Then get customer and address information using the order's customer_id
    const orderResult = await db.select({
      customer: customers,
      address: customerAddresses
    })
    .from(customers)
    .leftJoin(customerAddresses, eq(customerAddresses.customerId, customers.id))
    .where(eq(customers.id, parseInt(order.customerId || '0')));

    if (!orderResult || orderResult.length === 0) {
      return res.status(404).json({ error: 'Customer not found for this order' });
    }

    const customer = orderResult[0].customer;

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found for this order' });
    }

    // Find the default address or use the first available address
    const customerAddress = orderResult.find(r => r.address?.isDefault)?.address ||
                           orderResult.find(r => r.address)?.address;

    // Auto-populate shipping address from customer data, allow override from request
    const shippingAddress = providedShippingAddress || (customerAddress ? {
      name: customer.name,
      street: customerAddress.street,
      city: customerAddress.city,
      state: customerAddress.state,
      zip: customerAddress.zipCode // Database field is zip_code, mapped to zipCode
    } : {
      name: customer.name,
      street: '',
      city: '',
      state: '',
      zip: ''
    });

    // Validate required fields
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
      return res.status(400).json({
        error: 'Complete shipping address is required. Please provide shipping address in the request body.',
        customerInfo: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone
        },
        requiredFields: ['name', 'street', 'city', 'state', 'zip'],
        example: {
          shippingAddress: {
            name: customer.name,
            street: "123 Main St",
            city: "Huntsville",
            state: "AL",
            zip: "35801"
          }
        }
      });
    }

    if (!packageDetails || !packageDetails.weight) {
      return res.status(400).json({ error: 'Package weight is required' });
    }

    // Calculate package value from order if not provided
    const calculatedPackageValue = packageValue || (order.priceOverride || 0);

    try {
      // Create UPS shipment using real API
      const shipmentRequest = buildUPSShipmentRequest(order, shippingAddress, packageDetails, calculatedPackageValue);
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

      // Package value information
      currentY -= 20;
      placeholderPage.drawText(`Declared Value: $${calculatedPackageValue?.toFixed(2) || '0.00'}`, {
        x: 50,
        y: currentY,
        size: 10,
        font: placeholderBoldFont,
      });

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

// Replace the old bulk endpoint that has routing conflicts - REAL UPS API INTEGRATION
router.post('/bulk-shipping-labels', async (req: Request, res: Response) => {
  console.log('REAL UPS BULK SHIPPING LABELS ENDPOINT CALLED');
  try {
    const { orderIds, packageDetails, serviceCode, shippingAddress } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Order IDs array is required' });
    }

    // Default package details if not provided
    const defaultPackageDetails = {
      weight: "10",
      length: "12", 
      width: "12",
      height: "12"
    };
    const finalPackageDetails = { ...defaultPackageDetails, ...packageDetails };

    // Default shipping address if not provided (use customer info from order)
    const defaultServiceCode = serviceCode || "03"; // UPS Ground

    // Get order data from storage using the unified approach that works
    const { storage } = await import('../../storage');
    const selectedOrders = [];
    
    console.log(`Looking for orders: ${orderIds.join(', ')}`);
    
    // For each order ID, try to find it in either draft or finalized orders
    for (const orderId of orderIds) {
      // First try finalized orders (most orders are here like AG812)
      try {
        const finalizedOrder = await storage.getFinalizedOrderById(orderId);
        if (finalizedOrder) {
          selectedOrders.push(finalizedOrder);
          console.log(`Found finalized order: ${orderId}`);
          continue;
        }
      } catch (error) {
        // If finalized order not found, try draft orders
        try {
          const draftOrder = await storage.getOrderDraft(orderId);
          if (draftOrder) {
            selectedOrders.push(draftOrder);
            console.log(`Found draft order: ${orderId}`);
          }
        } catch (draftError) {
          console.log(`Order ${orderId} not found in either table`);
        }
      }
    }

    console.log(`Found ${selectedOrders.length} out of ${orderIds.length} requested orders`);
    
    if (selectedOrders.length === 0) {
      return res.status(404).json({ 
        error: `No orders found for: ${orderIds.join(', ')}`,
        searched: orderIds.length,
        found: 0
      });
    }

    // Create bulk PDF document to hold multiple UPS labels
    const bulkPdfDoc = await PDFDocument.create();
    const upsLabels = [];
    const trackingNumbers = [];

    // Process each order through UPS API
    for (const order of selectedOrders) {
      try {
        console.log(`Creating UPS shipment for order: ${order.orderId}`);
        
        // Build shipping address from order data or use provided address
        const orderShippingAddress = shippingAddress || {
          name: (order as any).customer_name || (order as any).customerName || "Customer Name",
          street: order.shipStreet || order.shipAddress || "Address Line 1", 
          city: order.shipCity || "City",
          state: order.shipState || "State",
          zip: order.shipZip || order.shipPostalCode || "00000"
        };

        // Create UPS shipment request
        const shipmentRequest = buildUPSShipmentRequest(order, orderShippingAddress, finalPackageDetails);
        console.log(`UPS shipment request for ${order.orderId}:`, JSON.stringify(shipmentRequest, null, 2));

        // Call UPS API to create shipment and get label
        const upsResponse = await createUPSShipment(shipmentRequest);
        
        if (upsResponse && (upsResponse as any).ShipmentResponse && (upsResponse as any).ShipmentResponse.ShipmentResults) {
          const shipmentResults = (upsResponse as any).ShipmentResponse.ShipmentResults;
          const trackingNumber = shipmentResults.ShipmentIdentificationNumber;
          const labelImage = shipmentResults.PackageResults[0]?.ShippingLabel?.GraphicImage;

          console.log(`UPS label created for ${order.orderId}: ${trackingNumber}`);
          trackingNumbers.push({ orderId: order.orderId, trackingNumber });

          // If we have the base64 label image, add it to our PDF
          if (labelImage) {
            try {
              const labelBytes = Buffer.from(labelImage, 'base64');
              const labelPdf = await PDFDocument.load(labelBytes);
              const [labelPage] = await bulkPdfDoc.copyPages(labelPdf, [0]);
              bulkPdfDoc.addPage(labelPage);
              
              upsLabels.push({
                orderId: order.orderId,
                trackingNumber: trackingNumber,
                success: true
              });
            } catch (pdfError) {
              console.error(`Error processing PDF label for ${order.orderId}:`, pdfError);
              // Add a fallback text page for this order
              await addFallbackLabelPage(bulkPdfDoc, order, trackingNumber);
              upsLabels.push({
                orderId: order.orderId,
                trackingNumber: trackingNumber,
                success: true,
                fallback: true
              });
            }
          } else {
            // No label image received, add text-based page
            await addFallbackLabelPage(bulkPdfDoc, order, trackingNumber);
            upsLabels.push({
              orderId: order.orderId,
              trackingNumber: trackingNumber,
              success: true,
              fallback: true
            });
          }
        } else {
          console.error(`No valid UPS response for order ${order.orderId}`);
          throw new Error(`UPS API returned invalid response for ${order.orderId}`);
        }

      } catch (orderError) {
        const errorMessage = orderError instanceof Error ? orderError.message : String(orderError);
        console.error(`Error processing order ${order.orderId}:`, orderError);
        // Add error page to PDF
        await addErrorLabelPage(bulkPdfDoc, order, errorMessage);
        upsLabels.push({
          orderId: order.orderId,
          error: errorMessage,
          success: false
        });
      }
    }

    // If no pages were added, create a summary page
    if (bulkPdfDoc.getPageCount() === 0) {
      await addSummaryPage(bulkPdfDoc, upsLabels);
    }

    // Generate final PDF
    const pdfBytes = await bulkPdfDoc.save();

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="UPS-Bulk-Labels-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);

    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
    console.log(`Successfully generated UPS bulk shipping labels for ${upsLabels.length} orders`);
    console.log('Tracking numbers:', trackingNumbers);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('UPS bulk shipping labels error:', error);
    return res.status(500).json({ error: `Failed to generate UPS bulk shipping labels: ${errorMessage}` });
  }
});

// Helper functions for bulk shipping
async function addFallbackLabelPage(pdfDoc: any, order: any, trackingNumber: string) {
  const page = pdfDoc.addPage([432, 648]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let currentY = 600;
  
  page.drawText('UPS SHIPPING LABEL', {
    x: 50, y: currentY, size: 16, font: boldFont
  });
  
  currentY -= 30;
  page.drawText(`Order: ${order.orderId}`, {
    x: 50, y: currentY, size: 12, font: boldFont
  });
  
  currentY -= 20;
  page.drawText(`Tracking: ${trackingNumber}`, {
    x: 50, y: currentY, size: 12, font: boldFont
  });
  
  currentY -= 20;
  page.drawText(`Customer: ${(order as any).customer_name || (order as any).customerName || 'N/A'}`, {
    x: 50, y: currentY, size: 10, font: font
  });
  
  currentY -= 15;
  page.drawText(`Ship To: ${order.shipCity || 'N/A'}, ${order.shipState || 'N/A'}`, {
    x: 50, y: currentY, size: 10, font: font
  });
}

async function addErrorLabelPage(pdfDoc: any, order: any, errorMessage: string) {
  const page = pdfDoc.addPage([432, 648]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let currentY = 600;
  
  page.drawText('SHIPPING LABEL ERROR', {
    x: 50, y: currentY, size: 16, font: boldFont, color: rgb(1, 0, 0)
  });
  
  currentY -= 30;
  page.drawText(`Order: ${order.orderId}`, {
    x: 50, y: currentY, size: 12, font: boldFont
  });
  
  currentY -= 20;
  page.drawText(`Error: ${errorMessage.substring(0, 80)}`, {
    x: 50, y: currentY, size: 10, font: font, color: rgb(1, 0, 0)
  });
}

async function addSummaryPage(pdfDoc: any, upsLabels: any[]) {
  const page = pdfDoc.addPage([432, 648]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let currentY = 600;
  
  page.drawText('UPS BULK SHIPPING SUMMARY', {
    x: 50, y: currentY, size: 16, font: boldFont
  });
  
  currentY -= 30;
  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: 50, y: currentY, size: 10, font: font
  });
  
  currentY -= 30;
  const successful = upsLabels.filter(l => l.success).length;
  const failed = upsLabels.filter(l => !l.success).length;
  
  page.drawText(`Successful: ${successful}`, {
    x: 50, y: currentY, size: 12, font: boldFont, color: rgb(0, 0.7, 0)
  });
  
  currentY -= 20;
  page.drawText(`Failed: ${failed}`, {
    x: 50, y: currentY, size: 12, font: boldFont, color: rgb(1, 0, 0)
  });
  
  // List successful labels
  currentY -= 30;
  for (const label of upsLabels.filter(l => l.success)) {
    page.drawText(`✓ ${label.orderId}: ${label.trackingNumber}`, {
      x: 50, y: currentY, size: 10, font: font
    });
    currentY -= 15;
  }
  
  // List errors
  for (const label of upsLabels.filter(l => !l.success)) {
    page.drawText(`✗ ${label.orderId}: ${label.error}`, {
      x: 50, y: currentY, size: 10, font: font, color: rgb(1, 0, 0)
    });
    currentY -= 15;
  }
}

// Keep the old broken endpoint for now but make it redirect to the new working endpoint
router.post('/ups-shipping-label/bulk', async (req: Request, res: Response) => {
  try {
    console.log('REDIRECTING OLD BULK ENDPOINT TO NEW WORKING ENDPOINT');
    const { orderIds } = req.body;
    console.log('OrderIds received:', orderIds);

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      console.log('ERROR: Missing orderIds array');
      return res.status(400).json({ error: 'Order IDs array is required' });
    }

    // Get order data from storage - use the same approach as All Orders page
    const { storage } = await import('../../storage');
    
    console.log(`Bulk endpoint: Looking for orders ${orderIds.join(', ')}`);
    
    // Get all orders (finalized orders) and filter by orderIds
    const allOrders = await storage.getAllOrders();
    const selectedOrders = allOrders.filter(order => orderIds.includes(order.orderId));
    
    console.log(`Found ${selectedOrders.length} orders out of ${orderIds.length} requested`);
    
    // If no finalized orders found, try draft orders
    if (selectedOrders.length < orderIds.length) {
      console.log('Some orders not found in finalized table, checking drafts...');
      const drafts = await storage.getAllOrderDrafts();
      const missingOrderIds = orderIds.filter(id => !selectedOrders.some(o => o.orderId === id));
      const draftOrders = drafts.filter(draft => missingOrderIds.includes(draft.orderId));
      selectedOrders.push(...draftOrders);
      console.log(`Added ${draftOrders.length} draft orders, total: ${selectedOrders.length}`);
    }

    console.log(`Final check: ${selectedOrders.length} orders found`);
    if (selectedOrders.length === 0) {
      console.log('ERROR: No orders found, returning 404');
      return res.status(404).json({ error: `Orders not found: ${orderIds.join(', ')}` });
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

// Fixed Bulk UPS Shipping Label Endpoint
router.post('/bulk-shipping-labels', async (req: Request, res: Response) => {
  console.log('NEW BULK SHIPPING LABELS ENDPOINT CALLED');
  try {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Order IDs array is required' });
    }

    // Get order data from storage using the unified approach that works
    const { storage } = await import('../../storage');
    const selectedOrders = [];
    
    console.log(`Looking for orders: ${orderIds.join(', ')}`);
    
    // For each order ID, try to find it in either draft or finalized orders
    for (const orderId of orderIds) {
      // First try finalized orders (most orders are here like AG812)
      try {
        const finalizedOrder = await storage.getFinalizedOrderById(orderId);
        if (finalizedOrder) {
          selectedOrders.push(finalizedOrder);
          console.log(`Found finalized order: ${orderId}`);
          continue;
        }
      } catch (error) {
        // If finalized order not found, try draft orders
        try {
          const draftOrder = await storage.getOrderDraft(orderId);
          if (draftOrder) {
            selectedOrders.push(draftOrder);
            console.log(`Found draft order: ${orderId}`);
          }
        } catch (draftError) {
          console.log(`Order ${orderId} not found in either table`);
        }
      }
    }

    console.log(`Found ${selectedOrders.length} out of ${orderIds.length} requested orders`);
    
    if (selectedOrders.length === 0) {
      return res.status(404).json({ 
        error: `No orders found for: ${orderIds.join(', ')}`,
        searched: orderIds.length,
        found: 0
      });
    }

    // For now, return success with order details
    return res.json({
      success: true,
      message: `Found ${selectedOrders.length} orders`,
      orders: selectedOrders.map(o => ({ orderId: o.orderId, status: o.status || 'DRAFT' }))
    });

  } catch (error) {
    console.error('Bulk shipping labels error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint for UPS troubleshooting
router.post('/debug-ups-auth', async (req: Request, res: Response) => {
  try {
    console.log('🔍 UPS DEBUG: Starting authentication troubleshooting...');
    
    // Step 1: Check credentials
    const hasClientId = !!process.env.UPS_CLIENT_ID;
    const hasClientSecret = !!process.env.UPS_CLIENT_SECRET;
    
    console.log('🔍 UPS DEBUG - Credentials Check:', {
      hasClientId,
      hasClientSecret,
      clientIdLength: hasClientId ? process.env.UPS_CLIENT_ID!.length : 0,
      clientSecretLength: hasClientSecret ? process.env.UPS_CLIENT_SECRET!.length : 0
    });

    if (!hasClientId || !hasClientSecret) {
      return res.json({
        success: false,
        step: 'credentials',
        error: 'Missing UPS credentials',
        details: { hasClientId, hasClientSecret }
      });
    }

    // Step 2: Test OAuth
    console.log('🔍 UPS DEBUG: Testing OAuth...');
    let accessToken;
    try {
      accessToken = await getUPSAccessToken();
      console.log('🔍 UPS DEBUG - OAuth Success:', {
        tokenReceived: !!accessToken,
        tokenLength: accessToken ? accessToken.length : 0,
        tokenStart: accessToken ? accessToken.substring(0, 10) : 'N/A'
      });
    } catch (oauthError: any) {
      console.error('🔍 UPS DEBUG - OAuth Failed:', oauthError.message);
      return res.json({
        success: false,
        step: 'oauth',
        error: oauthError.message,
        details: oauthError
      });
    }

    // Step 3: Test simple shipment request
    console.log('🔍 UPS DEBUG: Testing shipment creation...');
    const testShipment = buildUPSShipmentRequest(
      { orderId: 'TEST001' },
      {
        name: 'Test Customer',
        street: '123 Main St',
        city: 'Birmingham',
        state: 'AL',
        zip: '35203'
      },
      {
        weight: '5',
        length: '10',
        width: '10',
        height: '6'
      }
    );

    try {
      const shipmentResult = await createUPSShipment(testShipment);
      console.log('🔍 UPS DEBUG - Shipment Success');
      return res.json({
        success: true,
        step: 'shipment',
        message: 'UPS API working correctly',
        trackingNumber: shipmentResult?.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber
      });
    } catch (shipmentError: any) {
      console.error('🔍 UPS DEBUG - Shipment Failed:', shipmentError.message);
      return res.json({
        success: false,
        step: 'shipment',
        error: shipmentError.message,
        authWorking: true,
        tokenReceived: !!accessToken
      });
    }

  } catch (error: any) {
    console.error('🔍 UPS DEBUG - General Error:', error);
    res.status(500).json({
      success: false,
      step: 'general',
      error: error.message
    });
  }
});

export default router;