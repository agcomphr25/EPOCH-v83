import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { resolveAssetPath } from '../../src/utils/assetPaths';
import { getTermsContent, type TermsType } from './pdfConfig';

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
  discountDisplayName?: string;
  discountAppliesTo?: 'stock_model' | 'total_order';
  customDiscountType?: string;
  customDiscountValue?: number;
  showCustomDiscount?: boolean;
  // Promo code discount fields
  discountType?: string; // 'none' | 'percent' | 'dollar'
  discountValue?: number;
  // NEW: Resolved pricing summary for consistent UI/PDF display
  pricingSummary?: {
    basePrice: number;
    basePriceSource: 'override' | 'standard';
    featuresTotal: number;
    featureBreakdown: Array<{ featureId: string; featureName: string; optionValue: string; price: number }>;
    miscItemsTotal: number;
    miscItems: Array<{ description: string; quantity: number; price: number; total: number }>;
    subtotal: number;
    discounts: Array<{ source: string; type: 'percent' | 'fixed'; value: number; amount: number; appliesTo: string }>;
    discountTotal: number;
    shipping: number;
    finalTotal: number;
  };
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
  includeSignatureBox: boolean = true,
  termsType: TermsType = 'initial'
): Promise<Buffer> {
  console.log('📄 [PDF] Starting sales order PDF generation...');
  console.log(`📄 [PDF] Order ID: ${orderData.orderId}`);
  console.log(`📄 [PDF] Environment: ${process.env.NODE_ENV}`);
  console.log(`📄 [PDF] Include signature box: ${includeSignatureBox}`);
  console.log(`📄 [PDF] Terms type: ${termsType}`);
  console.log('📄 [PDF] Order Data Summary:', {
    modelPrice: orderData.modelPrice,
    shipping: orderData.shipping,
    subtotal: orderData.subtotal,
    total: orderData.total,
    discountCode: orderData.discountCode,
    customDiscountType: orderData.customDiscountType,
    customDiscountValue: orderData.customDiscountValue,
    showCustomDiscount: orderData.showCustomDiscount,
    paintOptions: {
      paint_options: orderData.features?.paint_options,
      metallic_finishes: orderData.features?.metallic_finishes,
      paint_options_combined: orderData.features?.paint_options_combined,
    },
    featureCount: orderData.features ? Object.keys(orderData.features).length : 0,
  });
  
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
    y: customerBoxY + customerBoxHeight - 16,
    size: 12,
    font: boldFont,
  });

  // SHIP TO - reduced top spacing from -45 to -35
  const shipToX = margin + 8;
  let shipCurrentY = customerBoxY + customerBoxHeight - 35;

  page.drawText('SHIP TO:', {
    x: shipToX,
    y: shipCurrentY,
    size: 10,
    font: boldFont,
  });

  // Render company name if present (above the attention/name line)
  if (orderData.customerCompany) {
    shipCurrentY -= 15;
    page.drawText(orderData.customerCompany, {
      x: shipToX,
      y: shipCurrentY,
      size: 10,
      font: font,
    });
  }

  // Render name with "Attn:" prefix if company is present, otherwise just name
  // Normalize: strip any existing "Attn:" prefix (case-insensitive) to prevent duplicate "Attn: Attn:"
  const normalizedName = orderData.customerName
    ? orderData.customerName.replace(/^attn:\s*/i, '').trim()
    : '';
  
  if (normalizedName) {
    shipCurrentY -= 15;
    const nameDisplay = orderData.customerCompany 
      ? `Attn: ${normalizedName}` 
      : normalizedName;
    page.drawText(nameDisplay, {
      x: shipToX,
      y: shipCurrentY,
      size: 10,
      font: font,
    });
  }

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
    'paint_options',
    'metallic_finishes',
    'paint_options_combined'
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
  
  // Add customer notes to count if present (will be rendered as feature row with possible wrapped text)
  const hasCustomerNotes = orderData.notes && orderData.notes.trim();
  let customerNotesLineCount = 0;
  if (hasCustomerNotes) {
    const maxNotesWidth = printableWidth - 160; // Width for selection column
    const tempNotesLines = wrapText(orderData.notes!.trim(), maxNotesWidth, 8, font);
    customerNotesLineCount = Math.max(1, tempNotesLines.length);
    featureCount += customerNotesLineCount; // Each wrapped line takes a row
  }
  
  // Calculate height: header (18) + model line (14) + features (14 each) + separator (15) + subtotal (20) + [discount (20)] + shipping (20) + total (25) + padding (15)
  // Check for discount: pricing summary discounts OR custom discount OR promo code discount
  const hasCustomDiscount = orderData.showCustomDiscount && orderData.customDiscountValue;
  const hasPromoDiscount = orderData.discountType && orderData.discountType !== 'none' && orderData.discountValue && orderData.discountValue > 0;
  const hasPricingSummaryDiscount = orderData.pricingSummary && orderData.pricingSummary.discounts.length > 0;
  const hasDiscount = hasPricingSummaryDiscount || hasCustomDiscount || hasPromoDiscount;
  const discountLineHeight = hasDiscount ? 20 : 0;
  const featuresTableHeight = 18 + (featureCount * 14) + 15 + 20 + discountLineHeight + 20 + 25 + 15;
  
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
    y: currentY - 18,
    width: printableWidth,
    height: 18,
    color: rgb(0.9, 0.9, 0.9),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  page.drawText('Feature', {
    x: margin + 8,
    y: currentY - 11,
    size: 8,
    font: boldFont,
  });

  page.drawText('Selection', {
    x: margin + 140,
    y: currentY - 11,
    size: 8,
    font: boldFont,
  });

  page.drawText('Price', {
    x: margin + printableWidth - 70,
    y: currentY - 11,
    size: 8,
    font: boldFont,
  });

  let summaryLineY = currentY - 30;

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

  summaryLineY -= 14;

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
      'paint_options',
      'metallic_finishes',
      'paint_options_combined'
    ];

    for (const featureKey of featureOrder) {
      const featureValue = orderData.features[featureKey];
      if (featureValue) {
        console.log(`📄 [PDF] Processing feature: ${featureKey}`, {
          value: featureValue,
          displayName: orderData.featureDisplayNames?.[featureKey],
          price: orderData.featurePrices?.[featureKey],
          selectionDisplayName: typeof featureValue === 'string' ? orderData.featureSelectionDisplayNames?.[featureValue] : 'array',
          selectionPrice: typeof featureValue === 'string' ? orderData.featureSelectionPrices?.[featureValue] : 'array',
        });
        
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
          summaryLineY -= 14;

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

            summaryLineY -= 14;
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

          summaryLineY -= 14;
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
    summaryLineY -= 14;

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

      summaryLineY -= 14;
    }
  }

  // Add Customer Notes as a feature row (if present)
  if (hasCustomerNotes) {
    page.drawText('Customer Notes:', {
      x: margin + 8,
      y: summaryLineY,
      size: 8,
      font: font,
    });

    // Wrap notes text for the selection column
    const maxNotesWidth = printableWidth - 160;
    const notesLines = wrapText(orderData.notes!.trim(), maxNotesWidth, 8, font);
    
    // Draw each line of the wrapped notes text
    let notesY = summaryLineY;
    for (let i = 0; i < notesLines.length; i++) {
      page.drawText(notesLines[i], {
        x: margin + 140,
        y: notesY,
        size: 8,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
      });
      notesY -= 14;
    }
    
    // Draw dash for price column on first line
    page.drawText('—', {
      x: margin + printableWidth - 70,
      y: summaryLineY,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    summaryLineY = notesY;
  }

  // Separator line before totals
  summaryLineY -= 5;
  page.drawLine({
    start: { x: margin + 10, y: summaryLineY },
    end: { x: margin + printableWidth - 10, y: summaryLineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  summaryLineY -= 15;

  // Subtotal - Use pricing summary when available for UI consistency
  const displaySubtotal = orderData.pricingSummary 
    ? orderData.pricingSummary.subtotal 
    : calculatedSubtotal;
  
  page.drawText('Subtotal:', {
    x: margin + 8,
    y: summaryLineY,
    size: 10,
    font: boldFont,
  });

  page.drawText(`$${displaySubtotal.toFixed(2)}`, {
    x: margin + printableWidth - 70,
    y: summaryLineY,
    size: 10,
    font: boldFont,
  });

  summaryLineY -= 20;

  // Discount (if applicable) - supports both custom discounts and promo code discounts
  // NEW: Use pricing summary when available for consistent UI/PDF display
  let discountAmount = 0;
  let discountLabel = '';
  const discountItems: Array<{ label: string; amount: number }> = [];
  
  if (orderData.pricingSummary && orderData.pricingSummary.discounts.length > 0) {
    // USE PRICING SUMMARY - single source of truth matching UI
    console.log(`💰 [PDF] Using pricing summary for discounts: ${orderData.pricingSummary.discounts.length} discount(s)`);
    
    for (const discount of orderData.pricingSummary.discounts) {
      const label = discount.type === 'percent'
        ? `${discount.source} (${discount.value}%):`
        : `${discount.source}:`;
      discountItems.push({ label, amount: discount.amount });
    }
    discountAmount = orderData.pricingSummary.discountTotal;
    discountLabel = discountItems.length === 1 ? discountItems[0].label : 'Total Discounts:';
  } else if (hasCustomDiscount) {
    // LEGACY: Custom discount logic (fallback when pricing summary not available)
    console.log(`⚠️ [PDF] Using legacy custom discount calculation`);
    const baseAmountForDiscount = orderData.discountAppliesTo === 'stock_model' 
      ? basePrice  // Apply only to stock model price
      : calculatedSubtotal;  // Apply to full subtotal
    
    if (orderData.customDiscountType === 'percent') {
      discountAmount = baseAmountForDiscount * (orderData.customDiscountValue! / 100);
    } else {
      discountAmount = orderData.customDiscountValue!;
    }

    // Use friendly display name if available, otherwise fall back to code or generic label
    // Human-readable labels only - never show internal enum values
    discountLabel = orderData.discountDisplayName 
      ? `Discount (${orderData.discountDisplayName}):`
      : orderData.discountCode 
        ? `Discount (${orderData.discountCode}):`
        : orderData.customDiscountType === 'percent'
          ? `Discount (${orderData.customDiscountValue}%):`
          : 'Discount:';
  } else if (hasPromoDiscount) {
    // LEGACY: Promo code discount logic (fallback when pricing summary not available)
    console.log(`⚠️ [PDF] Using legacy promo discount calculation`);
    const baseAmountForDiscount = orderData.discountAppliesTo === 'stock_model' 
      ? basePrice  // Apply only to stock model price
      : calculatedSubtotal;  // Apply to full subtotal
    
    if (orderData.discountType === 'percent') {
      discountAmount = baseAmountForDiscount * (orderData.discountValue! / 100);
    } else {
      // 'dollar' or any other type - use value directly
      discountAmount = orderData.discountValue!;
    }

    // Human-readable labels only - never show internal enum values like 'percent' or 'dollar'
    discountLabel = orderData.discountDisplayName 
      ? `Discount (${orderData.discountDisplayName}):`
      : orderData.discountCode 
        ? `Discount (${orderData.discountCode}):`
        : orderData.discountType === 'percent'
          ? `Discount (${orderData.discountValue}%):`
          : 'Discount:';
  }
  
  if (discountAmount > 0) {
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

    summaryLineY -= 20;
  }

  // Shipping - Use pricing summary when available for UI consistency
  const shippingAmount = orderData.pricingSummary 
    ? orderData.pricingSummary.shipping 
    : (orderData.shipping || 0);
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

  summaryLineY -= 25;

  // TOTAL - Use pricing summary when available for UI consistency
  let totalAmount: number;
  
  if (orderData.pricingSummary) {
    // USE PRICING SUMMARY - guaranteed to match UI calculation
    totalAmount = orderData.pricingSummary.finalTotal;
    console.log('📄 [PDF] Total from pricing summary (UI-consistent):', {
      orderId: orderData.orderId,
      pricingSummarySubtotal: orderData.pricingSummary.subtotal.toFixed(2),
      pricingSummaryDiscountTotal: orderData.pricingSummary.discountTotal.toFixed(2),
      pricingSummaryShipping: orderData.pricingSummary.shipping.toFixed(2),
      pricingSummaryFinalTotal: orderData.pricingSummary.finalTotal.toFixed(2),
    });
  } else {
    // LEGACY: Calculate from PDF values (fallback)
    totalAmount = calculatedSubtotal - discountAmount + shippingAmount;
    console.log('⚠️ [PDF] Total from legacy calculation:', {
      orderId: orderData.orderId,
      calculatedSubtotal: calculatedSubtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      shippingAmount: shippingAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      formula: `${calculatedSubtotal.toFixed(2)} - ${discountAmount.toFixed(2)} + ${shippingAmount.toFixed(2)} = ${totalAmount.toFixed(2)}`,
    });
  }
  
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

  summaryLineY -= 35;

  // Payment Status - added more vertical spacing above
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

  // Customer notes are now displayed on page 1 in the Features table
  // Start Terms section below the order info box to avoid collision
  page2Y = page2OrderBoxY - 25;

  // Terms and Conditions Section - positioned to avoid order box overlap
  // Get terms content based on termsType (initial or warranty)
  const termsContent = getTermsContent(termsType);
  
  // Use smaller font and tighter line spacing for warranty terms (more content)
  const termsFontSize = termsType === 'warranty' ? 7 : 8;
  const termsLineHeight = termsType === 'warranty' ? 10 : 13;
  const termsEmptyLineHeight = termsType === 'warranty' ? 6 : 8;
  
  // Calculate max width for text wrapping (page width minus margins)
  const maxTermsWidth = width - (margin * 2);
  
  page2.drawText(termsContent.title, {
    x: margin,
    y: page2Y,
    size: 12,
    font: boldFont,
  });
  
  page2Y -= 15;
  
  // Only show the subtitle for initial terms (signature request context)
  if (termsType === 'initial') {
    page2.drawText('Please sign and return a copy of this form, or reply to the email that you are in agreement', {
      x: margin,
      y: page2Y,
      size: 8,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
    });
    page2Y -= 20;
  } else {
    page2Y -= 5;
  }

  for (const line of termsContent.lines) {
    // Skip empty lines but preserve spacing
    if (line === '') {
      page2Y -= termsEmptyLineHeight;
      continue;
    }
    
    // Use text wrapping for longer lines
    const wrappedLines = wrapText(line, maxTermsWidth, termsFontSize, font);
    for (const wrappedLine of wrappedLines) {
      page2.drawText(wrappedLine, {
        x: margin,
        y: page2Y,
        size: termsFontSize,
        font: font,
        color: rgb(0.15, 0.15, 0.15),
      });
      page2Y -= termsLineHeight;
    }
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

  // Footer - darkened text for better readability
  page2.drawText('Thank you for your business!', {
    x: margin,
    y: page2Y,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });

  page2Y -= 15;
  page2.drawText('AG Composites | 230 Hamer Rd, Owens Cross Roads, AL 35763', {
    x: margin,
    y: page2Y,
    size: 8,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });

  page2Y -= 12;
  page2.drawText('Phone: (256) 723-8381 | Email: sales@agcomposites.com', {
    x: margin,
    y: page2Y,
    size: 8,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
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
  // Verify the PDF file exists
  if (!fs.existsSync(originalPdfPath)) {
    console.error(`PDF file not found at path: ${originalPdfPath}`);
    throw new Error(`Original PDF file not found: ${originalPdfPath}`);
  }

  // Load the original PDF
  const existingPdfBytes = fs.readFileSync(originalPdfPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  
  const pages = pdfDoc.getPages();
  
  // Use page 2 if it exists, otherwise use the last page
  const targetPage = pages.length > 1 ? pages[1] : pages[pages.length - 1];
  
  if (!targetPage) {
    throw new Error('PDF has no pages to embed signature');
  }

  // Extract base64 signature data
  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const signatureBytes = Buffer.from(base64Data, 'base64');

  // Calculate signature position based on page size
  const signatureWidth = 150;
  const signatureHeight = 50;
  const signatureX = 160;
  // Adjust Y position based on whether it's page 2 or a single-page PDF
  const signatureY = pages.length > 1 ? 335 : 100;
  const dateX = 390;
  const dateY = signatureY + 15;

  try {
    // Try to embed as PNG
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    
    targetPage.drawImage(signatureImage, {
      x: signatureX,
      y: signatureY,
      width: signatureWidth,
      height: signatureHeight,
    });

    // Add signed date
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    targetPage.drawText(new Date().toLocaleDateString(), {
      x: dateX,
      y: dateY,
      size: 10,
      font: font,
    });
  } catch (error) {
    console.error('Error embedding signature as PNG, trying JPEG:', error);
    try {
      const signatureImage = await pdfDoc.embedJpg(signatureBytes);
      
      targetPage.drawImage(signatureImage, {
        x: signatureX,
        y: signatureY,
        width: signatureWidth,
        height: signatureHeight,
      });

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      targetPage.drawText(new Date().toLocaleDateString(), {
        x: dateX,
        y: dateY,
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
