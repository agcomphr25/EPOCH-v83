import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OrderData {
  orderId: string;
  orderDate: Date;
  dueDate: Date;
  customerId: string;
  customerPO?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerCompany?: string;
  customerAddress?: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  modelId?: string;
  modelName?: string;
  modelDisplayName?: string;
  modelPrice?: number;
  handedness?: string;
  features?: Record<string, any>;
  featurePrices?: Record<string, number>;
  featureDisplayNames?: Record<string, string>;
  featureSelectionDisplayNames?: Record<string, string>;
  featureSelectionPrices?: Record<string, number>;
  notes?: string;
  shipping?: number;
  subtotal?: number;
  total?: number;
  paymentStatus?: 'PAID' | 'PENDING';
}

async function embedCompanyLogo(pdfDoc: PDFDocument) {
  try {
    const logoPath = path.join(__dirname, '../../src/assets/logo_updated.png');
    if (fs.existsSync(logoPath)) {
      const logoImageBytes = fs.readFileSync(logoPath);
      return await pdfDoc.embedPng(logoImageBytes);
    }
  } catch (error) {
    console.warn('Could not load company logo:', error);
  }
  return null;
}

// Helper function to wrap text
function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

export async function generateSalesOrderPDF(
  orderData: OrderData,
  includeSignatureBox: boolean = true
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const printableWidth = width - margin * 2;

  // PAGE 1
  let currentY = height - margin - 10;

  // Header: Company logo and contact info on LEFT
  const logo = await embedCompanyLogo(pdfDoc);
  if (logo) {
    const logoWidth = 150;
    const logoHeight = logoWidth * (logo.height / logo.width);

    page.drawImage(logo, {
      x: margin,
      y: currentY - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });

    currentY -= logoHeight + 15;

    page.drawText('230 Hamer Rd, Owens Cross Roads, AL 35763', {
      x: margin,
      y: currentY,
      size: 8,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    currentY -= 12;
    page.drawText('Phone: (256) 723-8381 | Email: sales@agcomposites.com', {
      x: margin,
      y: currentY,
      size: 8,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    currentY -= 20;
  }

  // Order info box on RIGHT
  const orderBoxX = width - margin - 220;
  const orderBoxY = height - margin - 95;
  const orderBoxWidth = 220;
  const orderBoxHeight = 75;

  // "SALES ORDER" title above the box
  page.drawText('SALES ORDER', {
    x: orderBoxX,
    y: orderBoxY + orderBoxHeight + 15,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  page.drawRectangle({
    x: orderBoxX,
    y: orderBoxY,
    width: orderBoxWidth,
    height: orderBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let boxTextY = orderBoxY + orderBoxHeight - 18;
  const col1X = orderBoxX + 8;
  const col2X = orderBoxX + 95;

  // Row 1: Order Number and Customer PO
  page.drawText('Order Number:', {
    x: col1X,
    y: boxTextY,
    size: 8,
    font: boldFont,
  });
  page.drawText(orderData.orderId, {
    x: col1X,
    y: boxTextY - 12,
    size: 8,
    font: font,
  });

  page.drawText('Customer PO:', {
    x: col2X,
    y: boxTextY,
    size: 8,
    font: boldFont,
  });
  page.drawText(orderData.customerPO || 'N/A', {
    x: col2X,
    y: boxTextY - 12,
    size: 8,
    font: font,
  });

  boxTextY -= 32;

  // Row 2: Order Date and Estimated Completion Date
  page.drawText('Order Date:', {
    x: col1X,
    y: boxTextY,
    size: 8,
    font: boldFont,
  });
  page.drawText(orderData.orderDate.toLocaleDateString(), {
    x: col1X,
    y: boxTextY - 12,
    size: 8,
    font: font,
  });

  page.drawText('Estimated Completion Date:', {
    x: col2X,
    y: boxTextY,
    size: 8,
    font: boldFont,
  });
  page.drawText(orderData.dueDate.toLocaleDateString(), {
    x: col2X,
    y: boxTextY - 12,
    size: 8,
    font: font,
  });

  // Customer Information Section
  currentY -= 130;
  const customerBoxY = currentY;
  const customerBoxHeight = 100;

  page.drawRectangle({
    x: margin,
    y: customerBoxY,
    width: printableWidth,
    height: customerBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('CUSTOMER INFORMATION', {
    x: margin + 8,
    y: customerBoxY + customerBoxHeight - 20,
    size: 12,
    font: boldFont,
  });

  // BILL TO (left side)
  let customerTextY = customerBoxY + customerBoxHeight - 45;
  page.drawText('BILL TO:', {
    x: margin + 8,
    y: customerTextY,
    size: 10,
    font: boldFont,
  });

  customerTextY -= 15;
  page.drawText(orderData.customerName, {
    x: margin + 8,
    y: customerTextY,
    size: 10,
    font: font,
  });

  if (orderData.customerEmail || orderData.customerPhone) {
    customerTextY -= 13;
    const contactInfo = [];
    if (orderData.customerEmail) contactInfo.push(`Email: ${orderData.customerEmail}`);
    if (orderData.customerPhone) contactInfo.push(`Phone: ${orderData.customerPhone}`);
    
    page.drawText(contactInfo.join(' | '), {
      x: margin + 8,
      y: customerTextY,
      size: 8,
      font: font,
    });
  }

  // SHIP TO (right side)
  const shipToX = margin + 280;
  let shipCurrentY = customerBoxY + customerBoxHeight - 45;

  page.drawText('SHIP TO:', {
    x: shipToX,
    y: shipCurrentY,
    size: 10,
    font: boldFont,
  });

  shipCurrentY -= 15;
  page.drawText(orderData.customerName, {
    x: shipToX,
    y: shipCurrentY,
    size: 10,
    font: font,
  });

  if (orderData.customerAddress) {
    shipCurrentY -= 13;
    page.drawText(orderData.customerAddress.street, {
      x: shipToX,
      y: shipCurrentY,
      size: 8,
      font: font,
    });

    if (orderData.customerAddress.street2) {
      shipCurrentY -= 11;
      page.drawText(orderData.customerAddress.street2, {
        x: shipToX,
        y: shipCurrentY,
        size: 8,
        font: font,
      });
    }

    shipCurrentY -= 11;
    page.drawText(
      `${orderData.customerAddress.city}, ${orderData.customerAddress.state} ${orderData.customerAddress.zipCode}`,
      {
        x: shipToX,
        y: shipCurrentY,
        size: 8,
        font: font,
      }
    );
  }

  // FEATURES & CUSTOMIZATIONS Section
  currentY = customerBoxY - 15;
  page.drawText('FEATURES & CUSTOMIZATIONS', {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
  });

  currentY -= 15;

  // Calculate dynamic table height based on number of features
  const featureOrder = [
    'handedness',
    'action_length',
    'shank_length',
    'action_inlet',
    'bottom_metal',
    'barrel_inlet',
    'qd_accessory',
    'length_of_pull',
    'rail_accessory',
    'texture_options',
    'swivel_studs',
    'other_options',
    'paint_options'
  ];
  
  let featureCount = 1; // Start with 1 for Stock Model
  if (orderData.features) {
    for (const featureKey of featureOrder) {
      if (orderData.features[featureKey]) {
        featureCount++;
      }
    }
  }
  
  // Calculate height: header (20) + model line (15) + features (15 each) + separator (20) + subtotal (25) + shipping (25) + total (30) + padding (20)
  const featuresTableHeight = 20 + (featureCount * 15) + 20 + 25 + 25 + 30 + 20;
  
  page.drawRectangle({
    x: margin,
    y: currentY - featuresTableHeight,
    width: printableWidth,
    height: featuresTableHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  // Table header
  page.drawRectangle({
    x: margin,
    y: currentY - 20,
    width: printableWidth,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('Feature', {
    x: margin + 8,
    y: currentY - 12,
    size: 8,
    font: boldFont,
  });

  page.drawText('Selection', {
    x: margin + 140,
    y: currentY - 12,
    size: 8,
    font: boldFont,
  });

  page.drawText('Price', {
    x: margin + printableWidth - 70,
    y: currentY - 12,
    size: 8,
    font: boldFont,
  });

  let summaryLineY = currentY - 35;

  // Stock Model
  page.drawText('Stock Model:', {
    x: margin + 8,
    y: summaryLineY,
    size: 8,
    font: font,
  });

  const modelDisplayName = orderData.modelDisplayName || orderData.modelName || 'Custom';
  page.drawText(modelDisplayName, {
    x: margin + 140,
    y: summaryLineY,
    size: 8,
    font: font,
  });

  const basePrice = orderData.modelPrice || 0;
  page.drawText(`$${basePrice.toFixed(2)}`, {
    x: margin + printableWidth - 70,
    y: summaryLineY,
    size: 8,
    font: font,
  });

  summaryLineY -= 15;

  // Add all features
  let calculatedSubtotal = basePrice;

  if (orderData.features) {
    const featureOrder = [
      'handedness',
      'action_length',
      'shank_length',
      'action_inlet',
      'bottom_metal',
      'barrel_inlet',
      'qd_accessory',
      'length_of_pull',
      'rail_accessory',
      'texture_options',
      'swivel_studs',
      'other_options',
      'paint_options'
    ];

    for (const featureKey of featureOrder) {
      const featureValue = orderData.features[featureKey];
      if (featureValue) {
        // Get feature display name
        const displayName = orderData.featureDisplayNames?.[featureKey] || featureKey;
        const featurePrice = orderData.featurePrices?.[featureKey] || 0;
        calculatedSubtotal += featurePrice;

        page.drawText(displayName + ':', {
          x: margin + 8,
          y: summaryLineY,
          size: 8,
          font: font,
        });

        // Get selection display name(s)
        let selectionDisplayName: string;
        if (Array.isArray(featureValue)) {
          // For array values (like rails), map each value to its display name
          selectionDisplayName = featureValue
            .map(val => orderData.featureSelectionDisplayNames?.[val] || val)
            .join(', ');
        } else {
          // For single values, look up the display name
          selectionDisplayName = orderData.featureSelectionDisplayNames?.[featureValue] || String(featureValue);
        }

        page.drawText(selectionDisplayName, {
          x: margin + 140,
          y: summaryLineY,
          size: 8,
          font: font,
        });

        page.drawText(`$${featurePrice.toFixed(2)}`, {
          x: margin + printableWidth - 70,
          y: summaryLineY,
          size: 8,
          font: font,
        });

        summaryLineY -= 15;
      }
    }
  }

  // Separator line before totals
  summaryLineY -= 5;
  page.drawLine({
    start: { x: margin + 10, y: summaryLineY },
    end: { x: margin + printableWidth - 10, y: summaryLineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  summaryLineY -= 18;

  // Subtotal
  page.drawText('Subtotal:', {
    x: margin + 8,
    y: summaryLineY,
    size: 10,
    font: boldFont,
  });

  page.drawText(`$${calculatedSubtotal.toFixed(2)}`, {
    x: margin + printableWidth - 70,
    y: summaryLineY,
    size: 10,
    font: boldFont,
  });

  summaryLineY -= 25;

  // Shipping
  const shippingAmount = orderData.shipping || 0;
  page.drawText('Shipping:', {
    x: margin + 8,
    y: summaryLineY,
    size: 10,
    font: boldFont,
  });

  page.drawText(`$${shippingAmount.toFixed(2)}`, {
    x: margin + printableWidth - 70,
    y: summaryLineY,
    size: 10,
    font: boldFont,
  });

  summaryLineY -= 30;

  // TOTAL
  const totalAmount = calculatedSubtotal + shippingAmount;
  page.drawText('TOTAL:', {
    x: margin + 8,
    y: summaryLineY,
    size: 12,
    font: boldFont,
  });

  page.drawText(`$${totalAmount.toFixed(2)}`, {
    x: margin + printableWidth - 70,
    y: summaryLineY,
    size: 12,
    font: boldFont,
  });

  summaryLineY -= 25;

  // Payment Status
  const paymentStatus = orderData.paymentStatus || 'PENDING';
  const paymentColor = paymentStatus === 'PAID' ? rgb(0, 0.6, 0) : rgb(0.8, 0.4, 0);

  page.drawText(`Payment Status: ${paymentStatus}`, {
    x: margin + printableWidth - 160,
    y: summaryLineY,
    size: 10,
    font: boldFont,
    color: paymentColor,
  });

  // PAGE 2 - Terms and Conditions
  const page2 = pdfDoc.addPage([612, 792]);
  let page2Y = height - margin - 10;

  // Repeat order info box at top right of page 2
  const page2OrderBoxX = width - margin - 220;
  const page2OrderBoxY = page2Y - 85;

  page2.drawRectangle({
    x: page2OrderBoxX,
    y: page2OrderBoxY,
    width: orderBoxWidth,
    height: orderBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let page2BoxTextY = page2OrderBoxY + orderBoxHeight - 18;

  // Row 1: Order Number and Customer PO
  page2.drawText('Order Number:', {
    x: page2OrderBoxX + 8,
    y: page2BoxTextY,
    size: 8,
    font: boldFont,
  });
  page2.drawText(orderData.orderId, {
    x: page2OrderBoxX + 8,
    y: page2BoxTextY - 12,
    size: 8,
    font: font,
  });

  page2.drawText('Customer PO:', {
    x: page2OrderBoxX + 95,
    y: page2BoxTextY,
    size: 8,
    font: boldFont,
  });
  page2.drawText(orderData.customerPO || 'N/A', {
    x: page2OrderBoxX + 95,
    y: page2BoxTextY - 12,
    size: 8,
    font: font,
  });

  page2BoxTextY -= 32;

  // Row 2: Order Date and Estimated Completion Date
  page2.drawText('Order Date:', {
    x: page2OrderBoxX + 8,
    y: page2BoxTextY,
    size: 8,
    font: boldFont,
  });
  page2.drawText(orderData.orderDate.toLocaleDateString(), {
    x: page2OrderBoxX + 8,
    y: page2BoxTextY - 12,
    size: 8,
    font: font,
  });

  page2.drawText('Estimated Completion Date:', {
    x: page2OrderBoxX + 95,
    y: page2BoxTextY,
    size: 8,
    font: boldFont,
  });
  page2.drawText(orderData.dueDate.toLocaleDateString(), {
    x: page2OrderBoxX + 95,
    y: page2BoxTextY - 12,
    size: 8,
    font: font,
  });

  // Terms and Conditions Section
  page2Y -= 120;
  page2.drawText('TERMS AND CONDITIONS - STANDARD', {
    x: margin,
    y: page2Y,
    size: 12,
    font: boldFont,
  });

  page2Y -= 20;
  page2.drawText('Initial Terms and Conditions', {
    x: margin,
    y: page2Y,
    size: 10,
    font: boldFont,
  });
  
  page2Y -= 15;
  page2.drawText('Please sign and return a copy of this form, or reply to the email that you are in agreement', {
    x: margin,
    y: page2Y,
    size: 8,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });

  page2Y -= 20;
  const terms = [
    '1. Please review the specs indicated and make sure they match your intent.',
    '2. Any changes to specs requested after 30 days from Order Date may result in additional',
    '   charges.',
    '3. Remington "clones" are not made by Remington and may not fit as exactly as Remington',
    '   models do.',
    '4. The Estimated Completion Date is an estimation based on our current capacity and the',
    '   specs of your order. We make every effort to ship stocks by the Estimated Completion Date.',
    '5. Please sign and return a copy of this form, or reply to the email that you are in agreement',
    '   with the specs of your order and these terms and conditions. We are not able to place any',
    '   order into production without a confirmation.',
  ];

  for (const term of terms) {
    page2.drawText(term, {
      x: margin,
      y: page2Y,
      size: 8,
      font: font,
    });
    page2Y -= 13;
  }

  // Customer Approval Section
  page2Y -= 40;
  page2.drawText('CUSTOMER APPROVAL', {
    x: margin,
    y: page2Y,
    size: 12,
    font: boldFont,
  });

  page2Y -= 30;
  page2.drawText('Customer Signature:', {
    x: margin,
    y: page2Y,
    size: 10,
    font: boldFont,
  });

  // Signature line
  page2.drawLine({
    start: { x: margin + 120, y: page2Y - 5 },
    end: { x: margin + 300, y: page2Y - 5 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page2.drawText('Date:', {
    x: margin + 320,
    y: page2Y,
    size: 10,
    font: boldFont,
  });

  // Date line
  page2.drawLine({
    start: { x: margin + 350, y: page2Y - 5 },
    end: { x: margin + 450, y: page2Y - 5 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // Footer
  page2Y -= 50;
  page2.drawText('Thank you for your business!', {
    x: margin,
    y: page2Y,
    size: 10,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page2Y -= 15;
  page2.drawText('AG Composites | 230 Hamer Rd, Owens Cross Roads, AL 35763', {
    x: margin,
    y: page2Y,
    size: 8,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page2Y -= 12;
  page2.drawText('Phone: (256) 723-8381 | Email: sales@agcomposites.com', {
    x: margin,
    y: page2Y,
    size: 8,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function embedSignatureInPDF(
  originalPdfPath: string,
  signatureDataUrl: string
): Promise<Buffer> {
  // Load the original PDF
  const existingPdfBytes = fs.readFileSync(originalPdfPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  
  const pages = pdfDoc.getPages();
  const page2 = pages[1]; // Signature is on page 2

  // Extract base64 signature data
  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const signatureBytes = Buffer.from(base64Data, 'base64');

  try {
    // Try to embed as PNG
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    
    // Draw signature above the signature line on page 2
    const signatureWidth = 150;
    const signatureHeight = 50;
    
    page2.drawImage(signatureImage, {
      x: 160, // Position above the signature line
      y: 335, // Adjusted for page 2
      width: signatureWidth,
      height: signatureHeight,
    });

    // Add signed date
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page2.drawText(new Date().toLocaleDateString(), {
      x: 390,
      y: 350,
      size: 10,
      font: font,
    });
  } catch (error) {
    console.error('Error embedding signature as PNG, trying JPEG:', error);
    try {
      const signatureImage = await pdfDoc.embedJpg(signatureBytes);
      
      page2.drawImage(signatureImage, {
        x: 160,
        y: 335,
        width: 150,
        height: 50,
      });

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page2.drawText(new Date().toLocaleDateString(), {
        x: 390,
        y: 350,
        size: 10,
        font: font,
      });
    } catch (jpegError) {
      console.error('Error embedding signature as JPEG:', jpegError);
      throw new Error('Failed to embed signature image');
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
