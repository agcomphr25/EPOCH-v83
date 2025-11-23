import { Router, Request, Response } from 'express';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { storage } from '../../storage';
import {
  PAGE_SIZES,
  DEFAULT_MARGIN,
  getPrintableArea,
  FONT_SIZES,
  SPACING,
  COLORS,
  COMPANY_INFO,
  drawStandardHeader,
  drawInfoBox,
  wrapText,
} from '../../utils/pdf/pdfConfig';

const router = Router();

// Generate Commercial Invoice for international shipping
router.post(
  '/commercial-invoice/:orderId',
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const {
        shipToCountry,
        customsValue,
        customsDescription = 'Composite Manufacturing Parts',
        harmonizedCode = '9506.62.4000', // Default for archery equipment
        originCountry = 'US',
      } = req.body;

      if (!shipToCountry || shipToCountry === 'US') {
        return res
          .status(400)
          .json({
            error: 'Commercial invoice only needed for international shipments',
          });
      }

      // Get order data
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Create PDF document with standard page size
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage(PAGE_SIZES.LETTER_PORTRAIT);
      const { width, height } = page.getSize();
      const { margin } = getPrintableArea(width, height);

      // Load fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Draw standard header with logo
      let currentY = await drawStandardHeader(
        page,
        pdfDoc,
        font,
        boldFont,
        height - margin,
        margin
      );

      currentY -= SPACING.SECTION_GAP_MEDIUM;

      // Document title
      page.drawText('COMMERCIAL INVOICE', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.TITLE_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      currentY -= SPACING.SECTION_GAP_MEDIUM;

      // Company information
      page.drawText('SHIPPER/EXPORTER:', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      currentY -= SPACING.LINE_SPACING_LARGE;
      page.drawText(COMPANY_INFO.NAME, {
        x: margin,
        y: currentY,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      currentY -= SPACING.LINE_SPACING_MEDIUM;
      page.drawText(COMPANY_INFO.ADDRESS, {
        x: margin,
        y: currentY,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      currentY -= SPACING.LINE_SPACING_MEDIUM;
      page.drawText('USA', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      // Invoice details box
      const invoiceBoxWidth = 200;
      const invoiceBoxHeight = 100;
      const invoiceBoxX = width - margin - invoiceBoxWidth;
      
      drawInfoBox(page, invoiceBoxX, currentY - 10, invoiceBoxWidth, invoiceBoxHeight);

      page.drawText('Invoice No:', {
        x: invoiceBoxX + SPACING.BOX_PADDING_SMALL,
        y: currentY + 65,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText(`CI-${orderId}`, {
        x: invoiceBoxX + SPACING.BOX_PADDING_SMALL,
        y: currentY + 50,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      page.drawText('Date:', {
        x: invoiceBoxX + SPACING.BOX_PADDING_SMALL,
        y: currentY + 35,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText(new Date().toLocaleDateString(), {
        x: invoiceBoxX + SPACING.BOX_PADDING_SMALL,
        y: currentY + 20,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      page.drawText('Terms: EXW', {
        x: invoiceBoxX + SPACING.BOX_PADDING_SMALL,
        y: currentY + 5,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      currentY -= invoiceBoxHeight + SPACING.SECTION_GAP_SMALL;

      // Consignee information
      page.drawText('CONSIGNEE:', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      currentY -= SPACING.LINE_SPACING_LARGE;
      if (order.customer_name) {
        page.drawText(order.customer_name, {
          x: margin,
          y: currentY,
          size: FONT_SIZES.BODY_LARGE,
          font: font,
          color: COLORS.TEXT_SECONDARY,
        });
        currentY -= SPACING.LINE_SPACING_MEDIUM;
      }

      page.drawText(`Destination: ${shipToCountry}`, {
        x: margin,
        y: currentY,
        size: FONT_SIZES.BODY_LARGE,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      currentY -= SPACING.SECTION_GAP_MEDIUM;

      // Items table
      page.drawText('DESCRIPTION OF GOODS:', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      currentY -= SPACING.SECTION_GAP_SMALL;

      const tableWidth = width - margin * 2;
      const headerHeight = 25;

      // Table headers
      page.drawRectangle({
        x: margin,
        y: currentY - headerHeight,
        width: tableWidth,
        height: headerHeight,
        color: COLORS.BG_TABLE_HEADER,
        borderColor: COLORS.BORDER_BLACK,
        borderWidth: 1,
      });

      const headerY = currentY - SPACING.LINE_SPACING_MEDIUM;
      page.drawText('Description', {
        x: margin + SPACING.BOX_PADDING_SMALL,
        y: headerY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText('Origin', {
        x: margin + 200,
        y: headerY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText('HTS Code', {
        x: margin + 270,
        y: headerY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText('Qty', {
        x: margin + 370,
        y: headerY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText('Unit Value', {
        x: margin + 410,
        y: headerY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText('Total Value', {
        x: margin + 470,
        y: headerY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      // Item row
      currentY -= headerHeight + SPACING.LINE_SPACING_LARGE;
      const itemRowHeight = 20;
      
      page.drawRectangle({
        x: margin,
        y: currentY - itemRowHeight,
        width: tableWidth,
        height: itemRowHeight,
        borderColor: COLORS.BORDER_BLACK,
        borderWidth: 1,
      });

      const rowY = currentY - SPACING.BOX_PADDING;
      page.drawText(customsDescription, {
        x: margin + SPACING.BOX_PADDING_SMALL,
        y: rowY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      page.drawText(originCountry, {
        x: margin + 200,
        y: rowY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      page.drawText(harmonizedCode, {
        x: margin + 270,
        y: rowY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      page.drawText('1', {
        x: margin + 370,
        y: rowY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      const unitValue = customsValue || order.priceOverride || 0;
      page.drawText(`$${unitValue.toFixed(2)}`, {
        x: margin + 410,
        y: rowY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      page.drawText(`$${unitValue.toFixed(2)}`, {
        x: margin + 470,
        y: rowY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: font,
        color: COLORS.TEXT_SECONDARY,
      });

      // Total
      currentY -= itemRowHeight + SPACING.SECTION_GAP_MEDIUM;
      page.drawText('TOTAL DECLARED VALUE:', {
        x: margin + 350,
        y: currentY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawText(`USD $${unitValue.toFixed(2)}`, {
        x: margin + 470,
        y: currentY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      // Certification
      currentY -= SPACING.SECTION_GAP_LARGE + SPACING.SECTION_GAP_SMALL;
      page.drawText('CERTIFICATION:', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      currentY -= SPACING.LINE_SPACING_LARGE;
      const certText = `I hereby certify that the information on this invoice is true and correct and that the contents and value of this shipment are as stated above.`;

      // Word wrap certification text using helper function
      const { width: printableWidth } = getPrintableArea(width, height);
      const wrappedLines = wrapText(certText, printableWidth, FONT_SIZES.BODY_MEDIUM, font);
      
      wrappedLines.forEach(line => {
        page.drawText(line, {
          x: margin,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: font,
          color: COLORS.TEXT_SECONDARY,
        });
        currentY -= SPACING.LINE_SPACING_MEDIUM;
      });

      currentY -= SPACING.SECTION_GAP_SMALL;

      // Signature line
      page.drawText('Signature:', {
        x: margin,
        y: currentY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawLine({
        start: { x: margin + 70, y: currentY - 5 },
        end: { x: margin + 250, y: currentY - 5 },
        thickness: 1,
        color: COLORS.BORDER_BLACK,
      });

      page.drawText('Date:', {
        x: margin + 270,
        y: currentY,
        size: FONT_SIZES.BODY_LARGE,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });

      page.drawLine({
        start: { x: margin + 300, y: currentY - 5 },
        end: { x: margin + 400, y: currentY - 5 },
        thickness: 1,
        color: COLORS.BORDER_BLACK,
      });

      // Generate PDF
      const pdfBytes = await pdfDoc.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Commercial-Invoice-${orderId}.pdf"`
      );
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Error generating commercial invoice:', error);
      res.status(500).json({ error: 'Failed to generate commercial invoice' });
    }
  }
);

export default router;
