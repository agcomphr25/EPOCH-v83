import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, pool } from '../../db';
import {
  p2SerializedItems,
  p2Customers,
  p2LotNumbers,
  p2PackingSlips,
  p2CertificatesOfConformance,
} from '../../schema';
import { eq, inArray } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  COMPANY_INFO,
} from '../../utils/pdf/pdfConfig';

const router = Router();

async function generateSequentialId(
  _prefix: string,
  table: string,
  column: string
): Promise<string> {
  const today = new Date();
  // Format: YYMMDD-XX  (e.g. 260318-01)
  const iso = today.toISOString(); // 2026-03-18T...
  const dateStr = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10); // YYMMDD
  const pattern = `${dateStr}-%`;
  const rows = await pool.query(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${column} LIKE $1`,
    [pattern]
  );
  const seq = (parseInt(rows[0].count) + 1).toString().padStart(2, '0');
  return `${dateStr}-${seq}`;
}

// ============================================================
// POST /api/p2/lots — Create lot from selected finalized serials
// ============================================================
const createLotSchema = z.object({
  serialIds: z.array(z.string().uuid()).min(1, 'At least one serial required'),
  createdBy: z.string().min(1).default('system'),
});

router.post('/lots', async (req: Request, res: Response) => {
  try {
    const input = createLotSchema.parse(req.body);

    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, input.serialIds));

    if (serials.length !== input.serialIds.length) {
      return res.status(400).json({ error: 'Some serial IDs not found' });
    }

    // Guard: all serials must be COMPLETED and finalized
    const notReady = serials.filter((s) => s.status !== 'COMPLETED' || !s.finalizedAt);
    if (notReady.length > 0) {
      return res.status(400).json({
        error: 'All selected serials must be completed and finalized before shipment',
        items: notReady.map((s) => s.serialNumber),
      });
    }

    const poNumbers = [...new Set(serials.map((s) => s.poNumber))];
    if (poNumbers.length > 1) {
      return res.status(400).json({
        error: 'All serials must belong to the same PO',
        found: poNumbers,
      });
    }

    // Guard: serial reuse — reject if any serial already exists in another lot
    const existingLots = await pool.query<{ id: string; lot_number: string }>(
      `SELECT id, lot_number FROM p2_lot_numbers WHERE serialized_item_ids ?| $1::text[]`,
      [input.serialIds]
    );
    if (existingLots.length > 0) {
      return res.status(409).json({
        error: 'One or more serial numbers already assigned to an existing shipment lot',
        lots: existingLots.map((r) => r.lot_number),
      });
    }

    const first = serials[0];
    const lotNumber = await generateSequentialId('LOT', 'p2_lot_numbers', 'lot_number');

    const manufacturingDate =
      (serials.map((s) => s.completedAt).filter(Boolean).sort().pop() as Date | null) ||
      new Date();

    const [lot] = await db
      .insert(p2LotNumbers)
      .values({
        lotNumber,
        lotType: 'SHIPPING',
        partNumber: first.partNumber,
        partName: first.partName,
        customerId: first.customerId,
        customerName: first.customerName,
        poNumber: first.poNumber,
        quantity: serials.length,
        serializedItemIds: input.serialIds,
        barcodes: serials.map((s) => s.barcode),
        manufacturingDate,
        status: 'OPEN',
        createdBy: input.createdBy,
      })
      .returning();

    return res.status(201).json(lot);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create lot error:', err);
    return res.status(500).json({ error: 'Failed to create lot' });
  }
});

// ============================================================
// GET /api/p2/lots/:id
// ============================================================
router.get('/lots/:id', async (req: Request, res: Response) => {
  try {
    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, req.params.id));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    return res.json(lot);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch lot' });
  }
});

// ============================================================
// POST /api/p2/packing-slips — Create packing slip from lot
// ============================================================
const createPackingSlipSchema = z.object({
  lotId: z.string().uuid(),
  createdBy: z.string().min(1).default('system'),
});

router.post('/packing-slips', async (req: Request, res: Response) => {
  try {
    const input = createPackingSlipSchema.parse(req.body);

    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, input.lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Guard: one packing slip per lot
    if (lot.packingSlipId) {
      return res.status(409).json({ error: 'Packing slip already exists for this lot' });
    }

    const serialIds = (lot.serializedItemIds as string[]) || [];
    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, serialIds));

    const byPart: Record<string, typeof serials> = {};
    for (const s of serials) {
      if (!byPart[s.partNumber]) byPart[s.partNumber] = [];
      byPart[s.partNumber].push(s);
    }

    const lineItems = Object.values(byPart).map((group) => ({
      partNumber: group[0].partNumber,
      partName: group[0].partName,
      quantity: group.length,
      serialNumbers: group.map((s) => s.serialNumber),
      lotNumber: lot.lotNumber,
    }));

    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, lot.customerId || ''));

    let customerAddress = '';
    if (customer) {
      customerAddress = [
        customer.shippingCompanyName || customer.customerName,
        customer.shippingContactName,
        customer.shippingAddress,
        customer.shippingAddress2,
        [customer.shippingCity, customer.shippingState, customer.shippingZip]
          .filter(Boolean)
          .join(', '),
      ]
        .filter(Boolean)
        .join('\n');
    }

    const packingSlipNumber = await generateSequentialId(
      'PS',
      'p2_packing_slips',
      'packing_slip_number'
    );

    const [slip] = await db
      .insert(p2PackingSlips)
      .values({
        packingSlipNumber,
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        customerAddress,
        poNumber: lot.poNumber,
        lineItems,
        totalQuantity: serials.length,
        status: 'DRAFT',
        createdBy: input.createdBy,
      })
      .returning();

    await db
      .update(p2LotNumbers)
      .set({ packingSlipId: slip.id })
      .where(eq(p2LotNumbers.id, lot.id));

    return res.status(201).json(slip);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create packing slip error:', err);
    return res.status(500).json({ error: 'Failed to create packing slip' });
  }
});

// ============================================================
// GET /api/p2/packing-slips/:id
// ============================================================
router.get('/packing-slips/:id', async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });
    return res.json(slip);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch packing slip' });
  }
});

// ============================================================
// GET /api/p2/packing-slips/:id/pdf — Generate Packing Slip PDF
// ============================================================
router.get('/packing-slips/:id/pdf', async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const margin = 50;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.45, 0.45, 0.45);
    const lightGray = rgb(0.82, 0.82, 0.82);
    const darkGray = rgb(0.2, 0.2, 0.2);
    const tableHeaderBg = rgb(0.88, 0.88, 0.88);
    const rowBg = rgb(0.96, 0.96, 0.96);

    let y = height - margin;
    const usableWidth = width - margin * 2;

    // ── Header left ──
    page.drawText(COMPANY_INFO.NAME, { x: margin, y, size: 13, font: boldFont, color: black });
    y -= 14;
    page.drawText(COMPANY_INFO.ADDRESS, { x: margin, y, size: 8.5, font, color: gray });
    y -= 11;
    page.drawText(`${COMPANY_INFO.PHONE}  |  ${COMPANY_INFO.EMAIL}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: gray,
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 22;

    // ── Header right ──
    const rightX = width - margin - 150;
    const headerTopY = height - margin;
    page.drawText('PACKING SLIP', {
      x: rightX,
      y: headerTopY,
      size: 16,
      font: boldFont,
      color: black,
    });
    page.drawText(slip.packingSlipNumber, {
      x: rightX,
      y: headerTopY - 18,
      size: 10,
      font,
      color: gray,
    });
    const slipDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    page.drawText(`Date: ${slipDate}`, {
      x: rightX,
      y: headerTopY - 30,
      size: 8.5,
      font,
      color: gray,
    });

    // ── Ship To ──
    page.drawText('SHIP TO:', { x: margin, y, size: 8.5, font: boldFont, color: gray });
    y -= 13;
    page.drawText(slip.customerName, { x: margin, y, size: 10.5, font: boldFont, color: black });
    y -= 13;
    const addressLines = (slip.customerAddress || '').split('\n').filter(
      (l) => l && l !== slip.customerName
    );
    for (const line of addressLines) {
      page.drawText(line, { x: margin, y, size: 9.5, font, color: darkGray });
      y -= 12;
    }

    y -= 4;
    if (slip.poNumber) {
      page.drawText(`PO #: ${slip.poNumber}`, { x: margin, y, size: 9.5, font, color: darkGray });
      y -= 12;
    }
    if (slip.lotNumber) {
      page.drawText(`Lot #: ${slip.lotNumber}`, { x: margin, y, size: 9.5, font, color: darkGray });
      y -= 12;
    }

    y -= 10;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 16;

    // ── Table ──
    const colWidths = [90, 150, 40, 100, usableWidth - 90 - 150 - 40 - 100];
    const colX: number[] = [margin];
    for (let i = 0; i < colWidths.length - 1; i++) {
      colX.push(colX[i] + colWidths[i]);
    }
    const hdrHeight = 16;
    const headers = ['Part Number', 'Part Name', 'Qty', 'Lot Number', 'Serial Numbers'];

    page.drawRectangle({
      x: margin,
      y: y - hdrHeight,
      width: usableWidth,
      height: hdrHeight,
      color: tableHeaderBg,
    });
    headers.forEach((h, i) => {
      page.drawText(h, {
        x: colX[i] + 3,
        y: y - hdrHeight + 4,
        size: 8,
        font: boldFont,
        color: darkGray,
      });
    });
    y -= hdrHeight;

    const lineItems = (slip.lineItems as any[]) || [];
    let rowAlt = false;
    for (const item of lineItems) {
      const serialsArr: string[] = Array.isArray(item.serialNumbers) ? item.serialNumbers : [];
      const serialsPerRow = 2;
      const serialRows = Math.max(1, Math.ceil(serialsArr.length / serialsPerRow));
      const rowHeight = Math.max(16, serialRows * 11 + 6);

      if (y - rowHeight < margin + 70) {
        const np = pdfDoc.addPage([612, 792]);
        y = 792 - margin;
        rowAlt = false;
        if (rowAlt) {
          np.drawRectangle({ x: margin, y: y - rowHeight, width: usableWidth, height: rowHeight, color: rowBg });
        }
      }

      if (rowAlt) {
        page.drawRectangle({ x: margin, y: y - rowHeight, width: usableWidth, height: rowHeight, color: rowBg });
      }
      rowAlt = !rowAlt;

      const cellY = y - 11;
      page.drawText(item.partNumber || '', { x: colX[0] + 3, y: cellY, size: 8, font, color: darkGray });
      const partNameTrunc = (item.partName || '').slice(0, 26);
      page.drawText(partNameTrunc, { x: colX[1] + 3, y: cellY, size: 8, font, color: darkGray });
      page.drawText(String(item.quantity ?? serialsArr.length), {
        x: colX[2] + 3,
        y: cellY,
        size: 8,
        font,
        color: darkGray,
      });
      page.drawText(item.lotNumber || slip.lotNumber || '', {
        x: colX[3] + 3,
        y: cellY,
        size: 8,
        font,
        color: darkGray,
      });

      let sy = cellY;
      for (let r = 0; r < serialRows; r++) {
        const chunk = serialsArr
          .slice(r * serialsPerRow, (r + 1) * serialsPerRow)
          .join('   ');
        page.drawText(chunk, { x: colX[4] + 3, y: sy, size: 7.5, font, color: darkGray });
        sy -= 11;
      }

      page.drawLine({
        start: { x: margin, y: y - rowHeight },
        end: { x: width - margin, y: y - rowHeight },
        thickness: 0.25,
        color: lightGray,
      });
      y -= rowHeight;
    }

    // ── Totals ──
    y -= 10;
    page.drawText(`Total Quantity: ${slip.totalQuantity}`, {
      x: width - margin - 130,
      y,
      size: 9.5,
      font: boldFont,
      color: black,
    });

    // ── Footer ──
    const footerY = margin + 40;
    page.drawLine({
      start: { x: margin, y: footerY + 20 },
      end: { x: width - margin, y: footerY + 20 },
      thickness: 0.5,
      color: lightGray,
    });
    page.drawText('Packed By: _______________________________', {
      x: margin,
      y: footerY,
      size: 8.5,
      font,
      color: darkGray,
    });
    page.drawText(
      `Tracking #: ${slip.trackingNumber || '_____________________________'}`,
      { x: margin + 260, y: footerY, size: 8.5, font, color: darkGray }
    );
    page.drawText('Verified By: _______________________________', {
      x: margin,
      y: footerY - 16,
      size: 8.5,
      font,
      color: darkGray,
    });

    const bytes = await pdfDoc.save();
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="packing-slip-${slip.packingSlipNumber}.pdf"`
    );
    return res.send(Buffer.from(bytes));
  } catch (err: any) {
    console.error('Packing slip PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate packing slip PDF' });
  }
});

// ============================================================
// POST /api/p2/certificates — Create CoC from lot
// ============================================================
const createCertificateSchema = z.object({
  lotId: z.string().uuid(),
  createdBy: z.string().min(1).default('system'),
  certificationText: z.string().optional(),
});

router.post('/certificates', async (req: Request, res: Response) => {
  try {
    const input = createCertificateSchema.parse(req.body);

    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, input.lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Guard: one certificate per lot
    if (lot.certificateId) {
      return res.status(409).json({ error: 'Certificate already exists for this lot' });
    }

    const serialIds = (lot.serializedItemIds as string[]) || [];
    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, serialIds));

    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, lot.customerId || ''));

    let customerAddress = '';
    if (customer) {
      customerAddress = [
        customer.shippingCompanyName || customer.customerName,
        customer.shippingAddress,
        [customer.shippingCity, customer.shippingState, customer.shippingZip]
          .filter(Boolean)
          .join(', '),
      ]
        .filter(Boolean)
        .join('\n');
    }

    const manufacturingDate =
      (serials.map((s) => s.completedAt).filter(Boolean).sort().pop() as Date | null) ||
      lot.manufacturingDate ||
      new Date();

    const certNumber = await generateSequentialId(
      'COC',
      'p2_certificates_of_conformance',
      'certificate_number'
    );

    const defaultText =
      'AG Composites certifies that the items listed herein have been manufactured, inspected, and tested in accordance with the applicable drawings, specifications, and purchase order requirements. All materials used in manufacture conform to applicable specifications. Records are on file and available for review.';

    const [cert] = await db
      .insert(p2CertificatesOfConformance)
      .values({
        certificateNumber: certNumber,
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        customerAddress,
        poNumber: lot.poNumber,
        partNumber: lot.partNumber,
        partName: lot.partName,
        quantity: serials.length,
        serialNumbers: serials.map((s) => s.serialNumber),
        manufacturingDate: manufacturingDate as Date,
        shipDate: new Date(),
        certificationText: input.certificationText || defaultText,
        status: 'DRAFT',
        createdBy: input.createdBy,
      })
      .returning();

    await db
      .update(p2LotNumbers)
      .set({ certificateId: cert.id })
      .where(eq(p2LotNumbers.id, lot.id));

    return res.status(201).json(cert);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create certificate error:', err);
    return res.status(500).json({ error: 'Failed to create certificate' });
  }
});

// ============================================================
// GET /api/p2/certificates/:id
// ============================================================
router.get('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const [cert] = await db
      .select()
      .from(p2CertificatesOfConformance)
      .where(eq(p2CertificatesOfConformance.id, req.params.id));
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    return res.json(cert);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

// ============================================================
// GET /api/p2/certificates/:id/pdf — Generate CoC PDF
// ============================================================
router.get('/certificates/:id/pdf', async (req: Request, res: Response) => {
  try {
    const [cert] = await db
      .select()
      .from(p2CertificatesOfConformance)
      .where(eq(p2CertificatesOfConformance.id, req.params.id));
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const margin = 50;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.45, 0.45, 0.45);
    const lightGray = rgb(0.82, 0.82, 0.82);
    const darkGray = rgb(0.2, 0.2, 0.2);

    let y = height - margin;
    const usableWidth = width - margin * 2;

    // ── Header ──
    page.drawText(COMPANY_INFO.NAME, { x: margin, y, size: 13, font: boldFont, color: black });
    y -= 14;
    page.drawText(COMPANY_INFO.ADDRESS, { x: margin, y, size: 8.5, font, color: gray });
    y -= 11;
    page.drawText(`${COMPANY_INFO.PHONE}  |  ${COMPANY_INFO.EMAIL}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: gray,
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 26;

    // Date top-right (cert number is used for association only, not displayed)
    const certDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    page.drawText(`Date: ${certDate}`, {
      x: width - margin - 160,
      y: height - margin,
      size: 8.5,
      font,
      color: gray,
    });

    // ── Title ──
    const titleText = 'CERTIFICATE OF CONFORMANCE';
    const titleW = boldFont.widthOfTextAtSize(titleText, 15);
    page.drawText(titleText, {
      x: (width - titleW) / 2,
      y,
      size: 15,
      font: boldFont,
      color: black,
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: black,
    });
    y -= 24;

    // ── Info rows ──
    const labelX = margin;
    const valueX = margin + 130;
    const rowGap = 16;

    const infoRows: [string, string][] = [
      ['Customer:', cert.customerName],
      ['Ship-To Address:', (cert.customerAddress || '').replace(/\n/g, ', ')],
      ['Purchase Order #:', cert.poNumber || '—'],
      ['Part Number:', cert.partNumber || '—'],
      ['Part Description:', cert.partName || '—'],
      ['Lot Number:', cert.lotNumber || '—'],
      ['Quantity:', String(cert.quantity)],
    ];

    if (cert.manufacturingDate) {
      infoRows.push([
        'Date Manufactured:',
        new Date(cert.manufacturingDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ]);
    }
    if (cert.shipDate) {
      infoRows.push([
        'Date Shipped:',
        new Date(cert.shipDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ]);
    }

    for (const [label, value] of infoRows) {
      page.drawText(label, { x: labelX, y, size: 9, font: boldFont, color: darkGray });
      page.drawText(value, { x: valueX, y, size: 9, font, color: black });
      y -= rowGap;
    }

    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.3,
      color: lightGray,
    });
    y -= 16;

    // ── Serial Numbers ──
    page.drawText('Serial Numbers:', { x: margin, y, size: 9, font: boldFont, color: darkGray });
    y -= 14;

    const serialNums = (cert.serialNumbers as string[]) || [];
    const serialsPerRow = 4;
    const serialColW = usableWidth / serialsPerRow;
    for (let i = 0; i < serialNums.length; i += serialsPerRow) {
      const chunk = serialNums.slice(i, i + serialsPerRow);
      chunk.forEach((s, j) => {
        page.drawText(s, { x: margin + j * serialColW, y, size: 8.5, font, color: black });
      });
      y -= 13;
    }

    y -= 12;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.3,
      color: lightGray,
    });
    y -= 20;

    // ── Certification Statement ──
    page.drawText('CERTIFICATION STATEMENT', {
      x: margin,
      y,
      size: 9.5,
      font: boldFont,
      color: black,
    });
    y -= 14;

    const certText = cert.certificationText || '';
    const words = certText.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, 9) > usableWidth && line) {
        page.drawText(line, { x: margin, y, size: 9, font, color: darkGray });
        y -= 13;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: 9, font, color: darkGray });
      y -= 13;
    }

    // ── Signature Block ──
    const sigY = Math.min(y - 30, margin + 80);
    page.drawLine({
      start: { x: margin, y: sigY + 20 },
      end: { x: width - margin, y: sigY + 20 },
      thickness: 0.5,
      color: lightGray,
    });
    page.drawText('Quality Assurance Authorization', {
      x: margin,
      y: sigY + 4,
      size: 8.5,
      font: boldFont,
      color: darkGray,
    });
    page.drawLine({
      start: { x: margin, y: sigY - 20 },
      end: { x: margin + 210, y: sigY - 20 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawLine({
      start: { x: margin + 260, y: sigY - 20 },
      end: { x: margin + 360, y: sigY - 20 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawText('Signature', { x: margin, y: sigY - 32, size: 8, font, color: gray });
    page.drawText('Date', { x: margin + 260, y: sigY - 32, size: 8, font, color: gray });

    const bytes = await pdfDoc.save();
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="coc-${cert.certificateNumber}.pdf"`
    );
    return res.send(Buffer.from(bytes));
  } catch (err: any) {
    console.error('CoC PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate CoC PDF' });
  }
});

export default router;
