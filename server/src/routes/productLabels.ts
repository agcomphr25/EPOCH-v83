import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { authenticateToken } from '../../middleware/auth';
import bwipjs from 'bwip-js';
import { pool } from '../../db';
import { z } from 'zod';

const router = Router();

const POINTS_PER_INCH = 72;
const PAGE_WIDTH = 8.5 * POINTS_PER_INCH;    // 612pt
const PAGE_HEIGHT = 11 * POINTS_PER_INCH;    // 792pt

// Avery 8162: 4" x 1.333", 2 columns x 7 rows = 14 per sheet
const LABEL_WIDTH = 4.0 * POINTS_PER_INCH;        // 288pt
const LABEL_HEIGHT = 1.333 * POINTS_PER_INCH;     // ~96pt

const COLUMNS = 2;
const ROWS = 7;
const LABELS_PER_PAGE = COLUMNS * ROWS;            // 14

const LEFT_MARGIN = 0.156 * POINTS_PER_INCH;      // ~11.2pt
const TOP_MARGIN = 0.5 * POINTS_PER_INCH;         // 36pt (Avery 8162 spec)
const H_GAP = 0.1875 * POINTS_PER_INCH;           // 13.5pt
const V_GAP = 0;

function getLabelPosition(index: number): { x: number; y: number } {
  const col = index % COLUMNS;
  const row = Math.floor(index % (COLUMNS * ROWS) / COLUMNS);
  const x = LEFT_MARGIN + col * (LABEL_WIDTH + H_GAP);
  const y = PAGE_HEIGHT - TOP_MARGIN - (row + 1) * LABEL_HEIGHT - row * V_GAP;
  return { x, y };
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function generateBarcodePng(value: string): Promise<Buffer> {
  const pngBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: 5,
    height: 15,
    includetext: false,
    paddingleft: 10,
    paddingright: 10,
    paddingtop: 2,
    paddingbottom: 2,
  });
  return pngBuffer as Buffer;
}

router.get('/products', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { customerName } = req.query;
    let query = `SELECT id, customer_name, product_name, product_type, barcode, customer_product_number, material, handedness, action_length, action_inlet, bottom_metal, barrel_inlet, notes FROM po_products WHERE customer_name IS NOT NULL AND customer_name != ''`;

    const params: string[] = [];
    
    if (customerName) {
      params.push(String(customerName));
      query += ` AND customer_name = $${params.length}`;
    }
    
    query += ' ORDER BY customer_name, product_name';
    
    const rows = await pool.query(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching label products:', error);
    res.status(500).json({ error: 'Failed to fetch products', details: error.message });
  }
});

router.get('/customers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rows = await pool.query(
      `SELECT DISTINCT customer_name FROM po_products WHERE customer_name IS NOT NULL AND customer_name != '' ORDER BY customer_name`
    );
    res.json(rows.map((r: any) => r.customer_name));
  } catch (error: any) {
    console.error('Error fetching label customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

const generateSchema = z.object({
  products: z.array(z.object({
    barcodeValue: z.string().min(1).max(100).optional(),
    barcode: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    product_name: z.string().max(500).optional(),
    copies: z.number().int().min(1).max(200).optional(),
    fillPage: z.boolean().optional(),
  })).min(1).max(500),
  copies: z.number().int().min(1).max(200).optional(),
});

router.post('/generate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { products, copies = 1 } = parsed.data;

    const labelItems: Array<{ barcodeValue: string; description: string }> = [];

    for (const product of products) {
      const barcodeVal = product.barcodeValue || product.barcode || '';
      const desc = (product.description || product.product_name || '').slice(0, 200);

      if (product.fillPage) {
        for (let i = 0; i < LABELS_PER_PAGE; i++) {
          labelItems.push({ barcodeValue: barcodeVal, description: desc });
        }
      } else {
        const qty = product.copies || copies || 1;
        for (let i = 0; i < qty; i++) {
          labelItems.push({ barcodeValue: barcodeVal, description: desc });
        }
      }
    }

    if (labelItems.length === 0) {
      return res.status(400).json({ error: 'No valid label items to generate' });
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const totalPages = Math.ceil(labelItems.length / LABELS_PER_PAGE);

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

      const startIndex = pageIndex * LABELS_PER_PAGE;
      const endIndex = Math.min(startIndex + LABELS_PER_PAGE, labelItems.length);

      for (let i = startIndex; i < endIndex; i++) {
        const labelIndex = i - startIndex;
        const { x, y } = getLabelPosition(labelIndex);
        const item = labelItems[i];

        // Avery 8162: 288pt wide x ~96pt tall
        // Layout (from top): code text → barcode image → description
        // All offsets are proportional to LABEL_HEIGHT to avoid hardcoded pixel misalignment
        const padding = 8;
        const labelInnerWidth = LABEL_WIDTH - padding * 2;  // ~272pt usable width
        const centerX = x + LABEL_WIDTH / 2;

        // Vertical zones (proportional within LABEL_HEIGHT ~96pt):
        //   Code text baseline: top 15% of label height from top edge
        //   Barcode: 20%–65% of label height (centered in upper-middle band)
        //   Description: bottom 20% of label height

        const codeTopOffset = LABEL_HEIGHT * 0.15;      // ~14.4pt from top of label
        const barcodeTopOffset = LABEL_HEIGHT * 0.20;   // ~19.2pt from top
        const barcodeHeight = LABEL_HEIGHT * 0.40;      // ~38.4pt tall
        const descTopOffset = LABEL_HEIGHT * 0.72;      // ~69.1pt from top (leaves ~27pt for desc)

        // Code value text at top (size 12 bold)
        const codeText = item.barcodeValue;
        const codeFontSize = 12;
        const codeWidth = boldFont.widthOfTextAtSize(codeText, codeFontSize);
        // y is the bottom-left of the label cell; pdf-lib draws text from baseline up
        page.drawText(codeText, {
          x: centerX - codeWidth / 2,
          y: y + LABEL_HEIGHT - codeTopOffset - codeFontSize,
          size: codeFontSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });

        // Barcode image in middle
        if (item.barcodeValue) {
          try {
            const pngBuffer = await generateBarcodePng(item.barcodeValue);
            const barcodeImage = await pdfDoc.embedPng(pngBuffer);

            const barcodeDisplayWidth = Math.min(labelInnerWidth - 16, 250);
            const barcodeX = centerX - barcodeDisplayWidth / 2;
            // y-coordinate: label bottom + (label height minus offset from top minus barcode height)
            const barcodeY = y + LABEL_HEIGHT - barcodeTopOffset - barcodeHeight;

            page.drawImage(barcodeImage, {
              x: barcodeX,
              y: barcodeY,
              width: barcodeDisplayWidth,
              height: barcodeHeight,
            });
          } catch (barcodeError) {
            console.error('Barcode generation error:', barcodeError);
            page.drawText('[BARCODE ERROR]', {
              x: centerX - 40,
              y: y + LABEL_HEIGHT / 2,
              size: 9,
              font: font,
              color: rgb(1, 0, 0),
            });
          }
        }

        // Description text at bottom (size 9, up to 2 lines)
        const descFontSize = 9;
        const lineSpacing = LABEL_HEIGHT * 0.115;  // ~11pt, proportional to label height
        const maxDescLines = 2;
        const descLines = wrapText(item.description, font, descFontSize, labelInnerWidth - 8).slice(0, maxDescLines);
        // First description line baseline from label bottom
        const descBaseY = y + LABEL_HEIGHT - descTopOffset - descFontSize;

        descLines.forEach((line, lineIndex) => {
          const lineWidth = font.widthOfTextAtSize(line, descFontSize);
          page.drawText(line, {
            x: centerX - lineWidth / 2,
            y: descBaseY - lineIndex * lineSpacing,
            size: descFontSize,
            font: font,
            color: rgb(0, 0, 0),
          });
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="product-labels.pdf"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error generating product labels:', error);
    res.status(500).json({ error: 'Failed to generate labels', details: error.message });
  }
});

export default router;
