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

// Avery 8160: 2.625" x 1", 3 columns x 10 rows = 30 per sheet
const LABEL_WIDTH = 2.625 * POINTS_PER_INCH;  // 189pt
const LABEL_HEIGHT = 1.0 * POINTS_PER_INCH;   // 72pt

const COLUMNS = 3;
const ROWS = 10;
const LABELS_PER_PAGE = COLUMNS * ROWS;        // 30

const LEFT_MARGIN = 0.1875 * POINTS_PER_INCH;  // 13.5pt
const TOP_MARGIN = 0.5 * POINTS_PER_INCH;      // 36pt
const H_GAP = 0.125 * POINTS_PER_INCH;         // 9pt
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

        // Avery 8160: 189pt wide x 72pt tall
        // Layout (from top): code text → barcode image → description
        const padding = 6;
        const labelInnerWidth = LABEL_WIDTH - padding * 2;  // ~177pt usable width
        const centerX = x + LABEL_WIDTH / 2;

        // Code value text at top (size 9 bold)
        const codeText = item.barcodeValue;
        const codeFontSize = 9;
        const codeWidth = boldFont.widthOfTextAtSize(codeText, codeFontSize);
        page.drawText(codeText, {
          x: centerX - codeWidth / 2,
          y: y + 59,   // ~4pt from top of 72pt label
          size: codeFontSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        });

        // Barcode image in middle
        if (item.barcodeValue) {
          try {
            const pngBuffer = await generateBarcodePng(item.barcodeValue);
            const barcodeImage = await pdfDoc.embedPng(pngBuffer);

            const barcodeDisplayWidth = Math.min(labelInnerWidth - 8, 170);
            const barcodeDisplayHeight = 22;
            const barcodeX = centerX - barcodeDisplayWidth / 2;
            const barcodeY = y + 28;   // barcode spans y+28 to y+50

            page.drawImage(barcodeImage, {
              x: barcodeX,
              y: barcodeY,
              width: barcodeDisplayWidth,
              height: barcodeDisplayHeight,
            });
          } catch (barcodeError) {
            console.error('Barcode generation error:', barcodeError);
            page.drawText('[BARCODE ERROR]', {
              x: centerX - 40,
              y: y + LABEL_HEIGHT / 2,
              size: 7,
              font: font,
              color: rgb(1, 0, 0),
            });
          }
        }

        // Description text at bottom (size 7, up to 2 lines)
        const descFontSize = 7;
        const maxDescLines = 2;
        const descLines = wrapText(item.description, font, descFontSize, labelInnerWidth - 8).slice(0, maxDescLines);
        const descStartY = y + 20;   // bottom text area

        descLines.forEach((line, lineIndex) => {
          const lineWidth = font.widthOfTextAtSize(line, descFontSize);
          page.drawText(line, {
            x: centerX - lineWidth / 2,
            y: descStartY - lineIndex * 9,
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
