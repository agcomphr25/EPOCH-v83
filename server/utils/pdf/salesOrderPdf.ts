import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { resolveAssetPath } from '../../src/utils/assetPaths';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MiscItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

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
  featureQuantities?: Record<string, number>;
  miscItems?: MiscItem[];
  notes?: string;
  shipping?: number;
  subtotal?: number;
  total?: number;
  paymentStatus?: 'PAID' | 'PENDING';
  discountCode?: string;
  customDiscountType?: string;
  customDiscountValue?: number;
  showCustomDiscount?: boolean;
}

async function embedCompanyLogo(pdfDoc: PDFDocument) {
  try {
    console.log('🖼️ [PDF] Attempting to embed company logo...');
    const logoPath = resolveAssetPath('logo_updated.png');
    console.log(`🖼️ [PDF] Logo path resolved to: ${logoPath}`);
    
    if (fs.existsSync(logoPath)) {
      console.log('✅ [PDF] Logo file exists, reading...');
      const logoImageBytes = fs.readFileSync(logoPath);
      console.log(`✅ [PDF] Logo loaded (${logoImageBytes.length} bytes), embedding in PDF...`);
      const embeddedLogo = await pdfDoc.embedPng(logoImageBytes);
      console.log('✅ [PDF] Logo successfully embedded');
      return embeddedLogo;
    } else {
      console.warn('⚠️ [PDF] Logo file not found at:', logoPath);
      console.warn('⚠️ [PDF] Checking if file exists elsewhere...');
      
      // List directory contents for debugging
      const dirname = path.dirname(logoPath);
      try {
        const files = fs.readdirSync(dirname);
        console.warn(`⚠️ [PDF] Files in ${dirname}:`, files);
      } catch (dirError) {
        console.warn(`⚠️ [PDF] Could not read directory ${dirname}:`, dirError);
      }
    }
  } catch (error) {
    console.error('❌ [PDF] Error loading company logo:', error);
    console.error('❌ [PDF] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  console.log('⚠️ [PDF] Continuing without logo');
  return null;
}

// Helper function to wrap text
function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
  // First, split by newlines to preserve intentional line breaks
  const paragraphs = text.split(/\r?\n/);
  const allLines: string[] = [];

  for (const paragraph of paragraphs) {
    // Skip empty paragraphs but preserve them as blank lines
    if (!paragraph.trim()) {
      allLines.push('');
      continue;
    }

    // Wrap each paragraph
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (testWidth > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      allLines.push(currentLine);
    }
  }
  
  return allLines;
}

export async function generateSalesOrderPDF(
  orderData: OrderData,
  includeSignatureBox: boolean = true
): Promise<Buffer> {
  console.log('📄 [PDF] Starting sales order PDF generation...');
  console.log(`📄 [PDF] Order ID: ${orderData.orderId}`);
  console.log(`📄 [PDF] Environment: ${process.env.NODE_ENV}`);
  console.log(`📄 [PDF] Include signature box: ${includeSignatureBox}`);
  
  let pdfDoc: PDFDocument;
  let page: any;
  let width: number;
  let height: number;
  
  try {
    pdfDoc = await PDFDocument.create();
    page = pdfDoc.addPage([612, 792]); // Letter size
    const size = page.getSize();
    width = size.width;
    height = size.height;
    
    console.log(`📄 [PDF] PDF document created (${width}x${height})`);
  } catch (createError) {
    console.error('❌ [PDF] Failed to create PDF document:', createError);
    throw createError;
  }

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

  // SHIP TO
  const shipToX = margin + 8;
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

  // Add email and phone
  if (orderData.customerEmail || orderData.customerPhone) {
    shipCurrentY -= 13;
    const contactInfo = [];
    if (orderData.customerEmail) contactInfo.push(`Email: ${orderData.customerEmail}`);
    if (orderData.customerPhone) contactInfo.push(`Phone: ${orderData.customerPhone}`);
    
    page.drawText(contactInfo.join(' | '), {
      x: shipToX,
      y: shipCurrentY,
      size: 8,
      font: font,
    });
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
        // Special handling for other_options - need to count header line + each individual item
        if (featureKey === 'other_options' && Array.isArray(orderData.features[featureKey])) {
          featureCount += 1 + orderData.features[featureKey].length; // Header line + each option on its own line
        } else {
          featureCount++;
        }
      }
    }
  }
  
  // Add miscellaneous items to count
  const miscItemsCount = orderData.miscItems?.length || 0;
  if (miscItemsCount > 0) {
    featureCount += miscItemsCount + 1; // +1 for "Miscellaneous Items" header
  }
  
  // Calculate height: header (20) + model line (15) + features (15 each) + separator (20) + subtotal (25) + [discount (25)] + shipping (25) + total (30) + padding (20)
  const hasDiscount = orderData.showCustomDiscount && orderData.customDiscountValue;
  const discountLineHeight = hasDiscount ? 25 : 0;
  const featuresTableHeight = 20 + (featureCount * 15) + 20 + 25 + discountLineHeight + 25 + 30 + 20;
  
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
        // Special handling for other_options with quantities
        if (featureKey === 'other_options' && Array.isArray(featureValue)) {
          // Display "Other Options:" header
          const displayName = orderData.featureDisplayNames?.[featureKey] || featureKey;
          page.drawText(displayName + ':', {
            x: margin + 8,
            y: summaryLineY,
            size: 8,
            font: boldFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          summaryLineY -= 15;

          // Display each option separately with its quantity
          for (const optionValue of featureValue) {
            const optionDisplayName = orderData.featureSelectionDisplayNames?.[optionValue] || optionValue;
            const optionBasePrice = orderData.featureSelectionPrices?.[optionValue] || 0;
            const quantity = orderData.featureQuantities?.[optionValue] || 1;
            const optionTotalPrice = optionBasePrice * quantity;
            
            calculatedSubtotal += optionTotalPrice;

            // Show quantity in the label if > 1
            const itemLabel = quantity > 1 
              ? `${optionDisplayName} (${quantity} @ $${optionBasePrice.toFixed(2)})`
              : optionDisplayName;

            page.drawText(itemLabel, {
              x: margin + 8,
              y: summaryLineY,
              size: 8,
              font: font,
            });

            page.drawText(`$${optionTotalPrice.toFixed(2)}`, {
              x: margin + printableWidth - 70,
              y: summaryLineY,
              size: 8,
              font: font,
            });

            summaryLineY -= 15;
          }
        } else {
          // Standard feature rendering - check for quantities in featureQuantities
          const displayName = orderData.featureDisplayNames?.[featureKey] || featureKey;
          let featurePrice = orderData.featurePrices?.[featureKey] || 0;
          
          // Check if there's a quantity for this feature (for single-value features)
          let quantity = 1;
          let displayWithQuantity = false;
          if (!Array.isArray(featureValue) && orderData.featureQuantities?.[featureValue]) {
            quantity = orderData.featureQuantities[featureValue];
            featurePrice = featurePrice * quantity;
            displayWithQuantity = true;
          }
          
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
            // For single values, look up the display name and optionally add quantity
            const baseDisplayName = orderData.featureSelectionDisplayNames?.[featureValue] || String(featureValue);
            if (displayWithQuantity && quantity > 1) {
              const unitPrice = (orderData.featurePrices?.[featureKey] || 0);
              selectionDisplayName = `${baseDisplayName} (${quantity} @ $${unitPrice.toFixed(2)})`;
            } else {
              selectionDisplayName = baseDisplayName;
            }
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
  }

  // Add miscellaneous items section
  if (orderData.miscItems && orderData.miscItems.length > 0) {
    // Add "Miscellaneous Items" header
    page.drawText('Miscellaneous Items:', {
      x: margin + 8,
      y: summaryLineY,
      size: 8,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    summaryLineY -= 15;

    // Add each misc item
    for (const item of orderData.miscItems) {
      calculatedSubtotal += item.total;

      const itemLabel = item.quantity > 1 
        ? `${item.description} (${item.quantity} @ $${item.unitPrice.toFixed(2)})`
        : item.description;

      page.drawText(itemLabel, {
        x: margin + 8,
        y: summaryLineY,
        size: 8,
        font: font,
      });

      page.drawText(`$${item.total.toFixed(2)}`, {
        x: margin + printableWidth - 70,
        y: summaryLineY,
        size: 8,
        font: font,
      });

      summaryLineY -= 15;
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

  // Discount (if applicable)
  let discountAmount = 0;
  if (orderData.showCustomDiscount && orderData.customDiscountValue) {
    if (orderData.customDiscountType === 'percent') {
      discountAmount = calculatedSubtotal * (orderData.customDiscountValue / 100);
    } else {
      discountAmount = orderData.customDiscountValue;
    }

    const discountLabel = orderData.discountCode 
      ? `Discount (${orderData.discountCode}):`
      : orderData.customDiscountType === 'percent'
        ? `Discount (${orderData.customDiscountValue}%):`
        : 'Discount:';

    page.drawText(discountLabel, {
      x: margin + 8,
      y: summaryLineY,
      size: 10,
      font: boldFont,
      color: rgb(0.8, 0, 0),
    });

    page.drawText(`-$${discountAmount.toFixed(2)}`, {
      x: margin + printableWidth - 70,
      y: summaryLineY,
      size: 10,
      font: boldFont,
      color: rgb(0.8, 0, 0),
    });

    summaryLineY -= 25;
  }

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
  const totalAmount = calculatedSubtotal - discountAmount + shippingAmount;
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

  // Notes Section (if present)
  page2Y -= 100;
  if (orderData.notes && orderData.notes.trim()) {
    page2.drawText('CUSTOMER NOTES / SPECIAL INSTRUCTIONS', {
      x: margin,
      y: page2Y,
      size: 12,
      font: boldFont,
    });

    page2Y -= 20;

    // Wrap notes text to fit within page width
    const maxNotesWidth = printableWidth - 20;
    const notesLines = wrapText(orderData.notes.trim(), maxNotesWidth, 9, font);

    // Draw notes with a light background box
    const notesBoxHeight = (notesLines.length * 12) + 20;
    page2.drawRectangle({
      x: margin,
      y: page2Y - notesBoxHeight + 10,
      width: printableWidth,
      height: notesBoxHeight,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });

    let notesY = page2Y - 5;
    for (const line of notesLines) {
      page2.drawText(line, {
        x: margin + 10,
        y: notesY,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });
      notesY -= 12;
    }

    page2Y -= notesBoxHeight + 20;
  }

  // Terms and Conditions Section
  page2.drawText('Initial Terms and Conditions', {
    x: margin,
    y: page2Y,
    size: 12,
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
    '   specs of your order. We make every effort to ship stocks by the Estimated Completion Date',
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

  // Customer Approval Section - only show if signature is required
  if (includeSignatureBox) {
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

    page2Y -= 50;
  }

  // Footer
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

  try {
    console.log('📄 [PDF] Saving PDF document...');
    const pdfBytes = await pdfDoc.save();
    console.log(`✅ [PDF] PDF saved successfully (${pdfBytes.length} bytes)`);
    return Buffer.from(pdfBytes);
  } catch (saveError) {
    console.error('❌ [PDF] Failed to save PDF:', saveError);
    throw saveError;
  }
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
