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
  customerAddress?: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  modelId?: string;
  handedness?: string;
  features?: Record<string, any>;
  notes?: string;
  shipping?: number;
  subtotal?: number;
  total?: number;
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

export async function generateSalesOrderPDF(
  orderData: OrderData,
  includeSignatureBox: boolean = true
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let yPosition = height - 50;

  // Embed and draw company logo
  const logo = await embedCompanyLogo(pdfDoc);
  if (logo) {
    const logoWidth = 120;
    const logoHeight = 60;
    page.drawImage(logo, {
      x: 50,
      y: yPosition - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // Company information
  page.drawText('AG Composites', {
    x: width - 200,
    y: yPosition,
    size: 14,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  yPosition -= 20;
  page.drawText('Phone: (XXX) XXX-XXXX', {
    x: width - 200,
    y: yPosition,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  yPosition -= 15;
  page.drawText('Email: info@agcomposites.com', {
    x: width - 200,
    y: yPosition,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  yPosition -= 40;

  // Title
  page.drawText('SALES ORDER', {
    x: 50,
    y: yPosition,
    size: 20,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  yPosition -= 30;

  // Order Information
  page.drawText(`Order ID: ${orderData.orderId}`, {
    x: 50,
    y: yPosition,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  page.drawText(
    `Order Date: ${orderData.orderDate.toLocaleDateString()}`,
    {
      x: width - 250,
      y: yPosition,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    }
  );

  yPosition -= 18;

  if (orderData.customerPO) {
    page.drawText(`Customer PO: ${orderData.customerPO}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
  }

  page.drawText(`Due Date: ${orderData.dueDate.toLocaleDateString()}`, {
    x: width - 250,
    y: yPosition,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  yPosition -= 30;

  // Customer Information Section
  page.drawText('BILL TO:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  yPosition -= 18;

  page.drawText(orderData.customerName, {
    x: 50,
    y: yPosition,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  if (orderData.customerEmail) {
    yPosition -= 15;
    page.drawText(orderData.customerEmail, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
  }

  if (orderData.customerPhone) {
    yPosition -= 15;
    page.drawText(orderData.customerPhone, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
  }

  if (orderData.customerAddress) {
    yPosition -= 15;
    page.drawText(orderData.customerAddress.street, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    if (orderData.customerAddress.street2) {
      yPosition -= 15;
      page.drawText(orderData.customerAddress.street2, {
        x: 50,
        y: yPosition,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
    }

    yPosition -= 15;
    page.drawText(
      `${orderData.customerAddress.city}, ${orderData.customerAddress.state} ${orderData.customerAddress.zipCode}`,
      {
        x: 50,
        y: yPosition,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      }
    );
  }

  yPosition -= 30;

  // Order Details Section
  page.drawText('ORDER DETAILS:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  yPosition -= 20;

  // Draw table header
  const tableStartY = yPosition;
  page.drawRectangle({
    x: 50,
    y: tableStartY - 20,
    width: width - 100,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
  });

  page.drawText('Description', {
    x: 60,
    y: tableStartY - 15,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  page.drawText('Details', {
    x: 300,
    y: tableStartY - 15,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  yPosition = tableStartY - 40;

  // Add order items
  if (orderData.modelId) {
    page.drawText('Model:', {
      x: 60,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(orderData.modelId, {
      x: 300,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    yPosition -= 18;
  }

  if (orderData.handedness) {
    page.drawText('Handedness:', {
      x: 60,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(orderData.handedness, {
      x: 300,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    yPosition -= 18;
  }

  // Features
  if (orderData.features) {
    for (const [key, value] of Object.entries(orderData.features)) {
      if (value && yPosition > 150) {
        page.drawText(`${key}:`, {
          x: 60,
          y: yPosition,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });

        const valueStr = Array.isArray(value) ? value.join(', ') : String(value);
        page.drawText(valueStr.substring(0, 50), {
          x: 300,
          y: yPosition,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });

        yPosition -= 18;
      }
    }
  }

  yPosition -= 20;

  // Pricing section
  if (orderData.subtotal !== undefined) {
    page.drawText('Subtotal:', {
      x: width - 250,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(`$${orderData.subtotal.toFixed(2)}`, {
      x: width - 150,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    yPosition -= 18;
  }

  if (orderData.shipping !== undefined && orderData.shipping > 0) {
    page.drawText('Shipping:', {
      x: width - 250,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(`$${orderData.shipping.toFixed(2)}`, {
      x: width - 150,
      y: yPosition,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });

    yPosition -= 18;
  }

  if (orderData.total !== undefined) {
    page.drawText('TOTAL:', {
      x: width - 250,
      y: yPosition,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(`$${orderData.total.toFixed(2)}`, {
      x: width - 150,
      y: yPosition,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    yPosition -= 25;
  }

  // Notes section
  if (orderData.notes) {
    yPosition -= 10;
    page.drawText('Special Instructions:', {
      x: 50,
      y: yPosition,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    yPosition -= 15;
    const notesLines = orderData.notes.match(/.{1,80}/g) || [];
    for (const line of notesLines.slice(0, 3)) {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 9,
        font,
        color: rgb(0, 0, 0),
      });
      yPosition -= 12;
    }
  }

  // Signature box
  if (includeSignatureBox) {
    yPosition = 150; // Fixed position for signature

    // Draw signature box
    page.drawRectangle({
      x: 50,
      y: yPosition - 60,
      width: 250,
      height: 60,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    page.drawText('Customer Signature:', {
      x: 50,
      y: yPosition - 75,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText('Date:', {
      x: 320,
      y: yPosition - 75,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: 355, y: yPosition - 75 },
      end: { x: 500, y: yPosition - 75 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    // Add signature instruction text
    page.drawText('Please sign above to approve this order', {
      x: 50,
      y: yPosition - 90,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Footer
  page.drawText('Thank you for your business!', {
    x: 50,
    y: 30,
    size: 10,
    font,
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
  const firstPage = pages[0];

  // Extract base64 signature data
  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const signatureBytes = Buffer.from(base64Data, 'base64');

  try {
    // Try to embed as PNG
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    
    // Draw signature in the signature box (adjusted position to match box)
    const signatureWidth = 200;
    const signatureHeight = 50;
    
    firstPage.drawImage(signatureImage, {
      x: 60,
      y: 95, // Position inside the signature box
      width: signatureWidth,
      height: signatureHeight,
    });
  } catch (error) {
    console.error('Error embedding signature as PNG, trying JPEG:', error);
    try {
      const signatureImage = await pdfDoc.embedJpg(signatureBytes);
      
      firstPage.drawImage(signatureImage, {
        x: 60,
        y: 95,
        width: 200,
        height: 50,
      });
    } catch (jpegError) {
      console.error('Error embedding signature as JPEG:', jpegError);
      throw new Error('Failed to embed signature image');
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
