
import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { storage } from '../../storage';

const router = Router();

// Generate Commercial Invoice for international shipping
router.post('/commercial-invoice/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { 
      shipToCountry, 
      customsValue,
      customsDescription = "Composite Manufacturing Parts",
      harmonizedCode = "9506.62.4000", // Default for archery equipment
      originCountry = "US"
    } = req.body;

    if (!shipToCountry || shipToCountry === 'US') {
      return res.status(400).json({ error: 'Commercial invoice only needed for international shipments' });
    }

    // Get order data
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter
    const { width, height } = page.getSize();

    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let currentY = height - 50;

    // Header
    page.drawText('COMMERCIAL INVOICE', {
      x: 50,
      y: currentY,
      size: 18,
      font: boldFont,
    });

    currentY -= 40;

    // Company information
    page.drawText('SHIPPER/EXPORTER:', {
      x: 50,
      y: currentY,
      size: 12,
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
    page.drawText('230 Hamer Rd', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });

    currentY -= 15;
    page.drawText('Owens Crossroads, AL 35763, USA', {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });

    // Invoice details box
    const invoiceBoxX = width - 200;
    page.drawRectangle({
      x: invoiceBoxX,
      y: currentY - 10,
      width: 180,
      height: 100,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    page.drawText('Invoice No:', {
      x: invoiceBoxX + 5,
      y: currentY + 65,
      size: 10,
      font: boldFont,
    });

    page.drawText(`CI-${orderId}`, {
      x: invoiceBoxX + 5,
      y: currentY + 50,
      size: 10,
      font: font,
    });

    page.drawText('Date:', {
      x: invoiceBoxX + 5,
      y: currentY + 35,
      size: 10,
      font: boldFont,
    });

    page.drawText(new Date().toLocaleDateString(), {
      x: invoiceBoxX + 5,
      y: currentY + 20,
      size: 10,
      font: font,
    });

    page.drawText('Terms: EXW', {
      x: invoiceBoxX + 5,
      y: currentY + 5,
      size: 10,
      font: font,
    });

    currentY -= 80;

    // Consignee information
    page.drawText('CONSIGNEE:', {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });

    currentY -= 20;
    if (order.customer_name) {
      page.drawText(order.customer_name, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
      });
      currentY -= 15;
    }

    page.drawText(`Destination: ${shipToCountry}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: font,
    });

    currentY -= 40;

    // Items table
    page.drawText('DESCRIPTION OF GOODS:', {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });

    currentY -= 30;

    // Table headers
    page.drawRectangle({
      x: 50,
      y: currentY - 25,
      width: width - 100,
      height: 25,
      color: rgb(0.9, 0.9, 0.9),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    page.drawText('Description', {
      x: 55,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });

    page.drawText('Origin', {
      x: 250,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });

    page.drawText('HTS Code', {
      x: 320,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });

    page.drawText('Qty', {
      x: 420,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });

    page.drawText('Unit Value', {
      x: 460,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });

    page.drawText('Total Value', {
      x: 520,
      y: currentY - 15,
      size: 10,
      font: boldFont,
    });

    // Item row
    currentY -= 45;
    page.drawRectangle({
      x: 50,
      y: currentY - 20,
      width: width - 100,
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    page.drawText(customsDescription, {
      x: 55,
      y: currentY - 10,
      size: 9,
      font: font,
    });

    page.drawText(originCountry, {
      x: 250,
      y: currentY - 10,
      size: 9,
      font: font,
    });

    page.drawText(harmonizedCode, {
      x: 320,
      y: currentY - 10,
      size: 9,
      font: font,
    });

    page.drawText('1', {
      x: 420,
      y: currentY - 10,
      size: 9,
      font: font,
    });

    const unitValue = customsValue || order.priceOverride || 0;
    page.drawText(`$${unitValue.toFixed(2)}`, {
      x: 460,
      y: currentY - 10,
      size: 9,
      font: font,
    });

    page.drawText(`$${unitValue.toFixed(2)}`, {
      x: 520,
      y: currentY - 10,
      size: 9,
      font: font,
    });

    // Total
    currentY -= 40;
    page.drawText('TOTAL DECLARED VALUE:', {
      x: 400,
      y: currentY,
      size: 12,
      font: boldFont,
    });

    page.drawText(`USD $${unitValue.toFixed(2)}`, {
      x: 520,
      y: currentY,
      size: 12,
      font: boldFont,
    });

    // Certification
    currentY -= 60;
    page.drawText('CERTIFICATION:', {
      x: 50,
      y: currentY,
      size: 12,
      font: boldFont,
    });

    currentY -= 20;
    const certText = `I hereby certify that the information on this invoice is true and correct and that the contents and value of this shipment are as stated above.`;
    
    // Word wrap certification text
    const words = certText.split(' ');
    let line = '';
    words.forEach(word => {
      const testLine = line + (line ? ' ' : '') + word;
      if (testLine.length > 80) {
        page.drawText(line, {
          x: 50,
          y: currentY,
          size: 9,
          font: font,
        });
        currentY -= 15;
        line = word;
      } else {
        line = testLine;
      }
    });
    
    if (line) {
      page.drawText(line, {
        x: 50,
        y: currentY,
        size: 9,
        font: font,
      });
    }

    currentY -= 40;
    
    // Signature line
    page.drawText('Signature:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
    });

    page.drawLine({
      start: { x: 120, y: currentY - 5 },
      end: { x: 300, y: currentY - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    page.drawText('Date:', {
      x: 320,
      y: currentY,
      size: 10,
      font: boldFont,
    });

    page.drawLine({
      start: { x: 350, y: currentY - 5 },
      end: { x: 450, y: currentY - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    // Generate PDF
    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Commercial-Invoice-${orderId}.pdf"`);
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Error generating commercial invoice:', error);
    res.status(500).json({ error: 'Failed to generate commercial invoice' });
  }
});

export default router;
