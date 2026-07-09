import { Router, Request, Response } from 'express';
import { PDFDocument, PDFImage, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import { authenticateToken } from '../../middleware/auth';
import bwipjs from 'bwip-js';
import { pool } from '../../db';
import { z } from 'zod';
import { formatP2CustomerSerialNumber } from '../utils/p2CustomerSerialDisplay';

const router = Router();

const POINTS_PER_INCH = 72;
const PAGE_WIDTH = 8.5 * POINTS_PER_INCH;
const PAGE_HEIGHT = 11 * POINTS_PER_INCH;

type TemplateKey = '8160' | '8162';

type LabelTemplate = {
  key: TemplateKey;
  label: string;
  columns: number;
  rows: number;
  labelWidth: number;
  labelHeight: number;
  leftMargin: number;
  topMargin: number;
  horizontalGap: number;
  verticalGap: number;
};

type LabelItem = {
  mode: 'P1' | 'P2';
  barcodeValue?: string;
  description?: string;
  sku?: string;
  serialNumber?: string;
  lotNumber?: string;
};

type EmbeddedLogo = {
  image: PDFImage;
  width: number;
  height: number;
} | null;

const LABEL_TEMPLATES: Record<TemplateKey, LabelTemplate> = {
  '8162': {
    key: '8162',
    label: 'Avery 8162 - 14 labels',
    columns: 2,
    rows: 7,
    labelWidth: 4 * POINTS_PER_INCH,
    labelHeight: (4 / 3) * POINTS_PER_INCH,
    leftMargin: 0.156 * POINTS_PER_INCH,
    topMargin: 0.83 * POINTS_PER_INCH,
    horizontalGap: 0.1875 * POINTS_PER_INCH,
    verticalGap: 0,
  },
  '8160': {
    key: '8160',
    label: 'Avery 8160 - 30 labels',
    columns: 3,
    rows: 10,
    labelWidth: 2.625 * POINTS_PER_INCH,
    labelHeight: 1 * POINTS_PER_INCH,
    leftMargin: 0.1875 * POINTS_PER_INCH,
    topMargin: 0.5 * POINTS_PER_INCH,
    horizontalGap: 0.125 * POINTS_PER_INCH,
    verticalGap: 0,
  },
};

function labelsPerPage(template: LabelTemplate): number {
  return template.columns * template.rows;
}

function getLabelPosition(template: LabelTemplate, index: number): { x: number; y: number } {
  const col = index % template.columns;
  const row = Math.floor(index / template.columns);
  const x = template.leftMargin + col * (template.labelWidth + template.horizontalGap);
  const y = PAGE_HEIGHT - template.topMargin - (row + 1) * template.labelHeight - row * template.verticalGap;
  return { x, y };
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean);
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

function drawCenteredText(
  page: any,
  text: string,
  font: PDFFont,
  size: number,
  centerX: number,
  y: number
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: centerX - width / 2,
    y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function fitText(text: string, font: PDFFont, preferredSize: number, maxWidth: number, minSize = 5): number {
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

async function generateBarcodePng(value: string, template: LabelTemplate): Promise<Buffer> {
  const pngBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: template.key === '8160' ? 4 : 5,
    height: template.key === '8160' ? 10 : 15,
    includetext: false,
    paddingleft: 8,
    paddingright: 8,
    paddingtop: 2,
    paddingbottom: 2,
  });
  return pngBuffer as Buffer;
}

async function embedLogo(pdfDoc: PDFDocument, logoBase64?: string | null): Promise<EmbeddedLogo> {
  if (!logoBase64) return null;

  const match = logoBase64.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/);
  if (!match) {
    throw new Error('Logo must be a PNG or JPEG image');
  }

  const mimeType = match[1];
  const imageBytes = Buffer.from(match[2], 'base64');
  const image = mimeType === 'image/png'
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

  return { image, width: image.width, height: image.height };
}

function drawLogo(
  page: any,
  logo: EmbeddedLogo,
  fallbackText: string,
  boldFont: PDFFont,
  centerX: number,
  topY: number,
  maxWidth: number,
  maxHeight: number
): void {
  if (!logo) {
    const fontSize = fitText(fallbackText, boldFont, 9, maxWidth, 5);
    drawCenteredText(page, fallbackText, boldFont, fontSize, centerX, topY - fontSize);
    return;
  }

  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * scale;
  const height = logo.height * scale;
  page.drawImage(logo.image, {
    x: centerX - width / 2,
    y: topY - height,
    width,
    height,
  });
}

async function drawP1Label(
  pdfDoc: PDFDocument,
  page: any,
  item: LabelItem,
  template: LabelTemplate,
  x: number,
  y: number,
  font: PDFFont,
  boldFont: PDFFont,
  logo: EmbeddedLogo
): Promise<void> {
  if (template.key === '8162' && !logo) {
    const padding = 8;
    const labelInnerWidth = template.labelWidth - padding * 2;
    const centerX = x + template.labelWidth / 2;

    const codeTopOffset = 8;
    const barcodeTopOffset = 22;
    const barcodeHeight = 42;
    const descTopOffset = 68;

    const codeText = item.barcodeValue || '';
    const codeFontSize = fitText(codeText, boldFont, 11, labelInnerWidth);
    drawCenteredText(
      page,
      codeText,
      boldFont,
      codeFontSize,
      centerX,
      y + template.labelHeight - codeTopOffset - codeFontSize
    );

    if (item.barcodeValue) {
      try {
        const pngBuffer = await generateBarcodePng(item.barcodeValue, template);
        const barcodeImage = await pdfDoc.embedPng(pngBuffer);
        const barcodeDisplayWidth = Math.min(labelInnerWidth - 16, 250);

        page.drawImage(barcodeImage, {
          x: centerX - barcodeDisplayWidth / 2,
          y: y + template.labelHeight - barcodeTopOffset - barcodeHeight,
          width: barcodeDisplayWidth,
          height: barcodeHeight,
        });
      } catch (barcodeError) {
        console.error('Barcode generation error:', barcodeError);
        drawCenteredText(page, '[BARCODE ERROR]', boldFont, 7, centerX, y + template.labelHeight / 2);
      }
    }

    const descFontSize = 9;
    const lineSpacing = template.labelHeight * 0.115;
    const descLines = wrapText(item.description || '', font, descFontSize, labelInnerWidth - 8).slice(0, 2);
    const descBaseY = y + template.labelHeight - descTopOffset - descFontSize;

    descLines.forEach((line, lineIndex) => {
      drawCenteredText(page, line, font, descFontSize, centerX, descBaseY - lineIndex * lineSpacing);
    });
    return;
  }

  const padding = template.key === '8160' ? 5 : 8;
  const innerWidth = template.labelWidth - padding * 2;
  const centerX = x + template.labelWidth / 2;
  const topY = y + template.labelHeight - padding;

  let cursorY = topY;

  if (logo) {
    const logoHeight = template.key === '8160' ? 13 : 18;
    drawLogo(page, logo, '', boldFont, centerX, cursorY, innerWidth * 0.75, logoHeight);
    cursorY -= logoHeight + 2;
  }

  const codeText = item.barcodeValue || '';
  const codeFontSize = fitText(codeText, boldFont, template.key === '8160' ? 8 : 11, innerWidth);
  drawCenteredText(page, codeText, boldFont, codeFontSize, centerX, cursorY - codeFontSize);
  cursorY -= codeFontSize + (template.key === '8160' ? 3 : 5);

  if (item.barcodeValue) {
    try {
      const pngBuffer = await generateBarcodePng(item.barcodeValue, template);
      const barcodeImage = await pdfDoc.embedPng(pngBuffer);
      const barcodeHeight = template.key === '8160' ? 22 : 42;
      const barcodeWidth = Math.min(innerWidth - 8, template.key === '8160' ? 155 : 250);
      page.drawImage(barcodeImage, {
        x: centerX - barcodeWidth / 2,
        y: cursorY - barcodeHeight,
        width: barcodeWidth,
        height: barcodeHeight,
      });
      cursorY -= barcodeHeight + (template.key === '8160' ? 2 : 4);
    } catch (barcodeError) {
      console.error('Barcode generation error:', barcodeError);
      drawCenteredText(page, '[BARCODE ERROR]', boldFont, 7, centerX, cursorY - 8);
      cursorY -= 12;
    }
  }

  const descFontSize = template.key === '8160' ? 6.5 : 9;
  const maxDescLines = template.key === '8160' ? 2 : 2;
  const descLines = wrapText(item.description || '', font, descFontSize, innerWidth - 6).slice(0, maxDescLines);
  descLines.forEach((line, lineIndex) => {
    const textY = cursorY - descFontSize - lineIndex * (descFontSize + 1.5);
    drawCenteredText(page, line, font, descFontSize, centerX, textY);
  });
}

function drawP2Label(
  page: any,
  item: LabelItem,
  template: LabelTemplate,
  x: number,
  y: number,
  font: PDFFont,
  boldFont: PDFFont,
  logo: EmbeddedLogo
): void {
  const padding = template.key === '8160' ? 5 : 8;
  const innerWidth = template.labelWidth - padding * 2;
  const centerX = x + template.labelWidth / 2;
  const topY = y + template.labelHeight - padding;
  const logoHeight = template.key === '8160' ? 18 : 28;

  drawLogo(page, logo, 'AG Composites', boldFont, centerX, topY, innerWidth * 0.78, logoHeight);

  const sku = item.sku || '';
  const skuFontSize = fitText(sku, boldFont, template.key === '8160' ? 10 : 14, innerWidth);
  drawCenteredText(page, sku, boldFont, skuFontSize, centerX, topY - logoHeight - 8 - skuFontSize);

  const serialLot = `SN: ${item.serialNumber || ''}  Lot: ${item.lotNumber || ''}`;
  const serialFontSize = fitText(serialLot, font, template.key === '8160' ? 7 : 10, innerWidth, 5);
  drawCenteredText(page, serialLot, font, serialFontSize, centerX, y + padding + 4);
}

function normalizeSkipIndexes(raw: number[] | undefined, template: LabelTemplate): Set<number> {
  const max = labelsPerPage(template);
  return new Set((raw || []).filter((n) => Number.isInteger(n) && n >= 0 && n < max));
}

async function drawLabels(
  pdfDoc: PDFDocument,
  items: LabelItem[],
  template: LabelTemplate,
  logoBase64?: string | null,
  skipIndexes?: number[]
): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(pdfDoc, logoBase64);
  const firstPageSkips = normalizeSkipIndexes(skipIndexes, template);

  let itemIndex = 0;
  let pageIndex = 0;

  while (itemIndex < items.length) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const skips = pageIndex === 0 ? firstPageSkips : new Set<number>();

    for (let slot = 0; slot < labelsPerPage(template) && itemIndex < items.length; slot++) {
      if (skips.has(slot)) continue;

      const { x, y } = getLabelPosition(template, slot);
      const item = items[itemIndex];

      if (item.mode === 'P2') {
        drawP2Label(page, item, template, x, y, font, boldFont, logo);
      } else {
        await drawP1Label(pdfDoc, page, item, template, x, y, font, boldFont, logo);
      }

      itemIndex++;
    }

    pageIndex++;
  }
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

router.get('/customers', authenticateToken, async (_req: Request, res: Response) => {
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

router.get('/p2-projects', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const rows = await pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(po.project_name), ''), 'Unassigned Project') AS project_name,
        COUNT(DISTINCT l.id)::int AS lot_count,
        MAX(l.created_at) AS latest_lot_at
      FROM p2_lot_numbers l
      LEFT JOIN p2_purchase_orders po ON po.id = l.po_id
      WHERE l.lot_type = 'SHIPPING'
         OR l.packing_slip_id IS NOT NULL
      GROUP BY COALESCE(NULLIF(TRIM(po.project_name), ''), 'Unassigned Project')
      ORDER BY latest_lot_at DESC NULLS LAST, project_name
    `);
    res.json(rows.map((row: any) => ({
      projectName: row.project_name,
      lotCount: row.lot_count,
    })));
  } catch (error: any) {
    console.error('Error fetching P2 label projects:', error);
    res.status(500).json({ error: 'Failed to fetch P2 projects', details: error.message });
  }
});

router.get('/p2-lots', authenticateToken, async (req: Request, res: Response) => {
  try {
    const projectName = String(req.query.projectName || '');
    if (!projectName) {
      return res.status(400).json({ error: 'projectName is required' });
    }

    const rows = await pool.query(`
      SELECT
        l.id,
        l.lot_number,
        l.po_number,
        l.po_id,
        l.customer_name,
        l.part_number,
        l.part_name,
        l.quantity,
        l.created_at,
        COALESCE(NULLIF(TRIM(po.project_name), ''), 'Unassigned Project') AS project_name,
        ps.packing_slip_number,
        sku_summary.sku,
        sku_summary.sku_count
      FROM p2_lot_numbers l
      LEFT JOIN p2_purchase_orders po ON po.id = l.po_id
      LEFT JOIN p2_packing_slips ps ON ps.id = l.packing_slip_id
      LEFT JOIN LATERAL (
        SELECT
          MIN(NULLIF(TRIM(si.sku), '')) AS sku,
          COUNT(DISTINCT NULLIF(TRIM(si.sku), ''))::int AS sku_count
        FROM p2_serialized_items si
        WHERE si.id::text IN (
          SELECT jsonb_array_elements_text(COALESCE(l.serialized_item_ids, '[]'::jsonb))
        )
      ) sku_summary ON true
      WHERE (l.lot_type = 'SHIPPING' OR l.packing_slip_id IS NOT NULL)
        AND COALESCE(NULLIF(TRIM(po.project_name), ''), 'Unassigned Project') = $1
      ORDER BY l.created_at DESC
    `, [projectName]);

    res.json(rows.map((row: any) => ({
      id: row.id,
      lotNumber: row.lot_number,
      poNumber: row.po_number,
      poId: row.po_id,
      customerName: row.customer_name,
      partNumber: row.part_number,
      partName: row.part_name,
      sku: row.sku,
      skuCount: row.sku_count,
      quantity: row.quantity,
      projectName: row.project_name,
      packingSlipNumber: row.packing_slip_number,
      createdAt: row.created_at,
    })));
  } catch (error: any) {
    console.error('Error fetching P2 label lots:', error);
    res.status(500).json({ error: 'Failed to fetch P2 lots', details: error.message });
  }
});

const productSchema = z.object({
  barcodeValue: z.string().min(1).max(100).optional(),
  barcode: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  product_name: z.string().max(500).optional(),
  copies: z.number().int().min(1).max(200).optional(),
  fillPage: z.boolean().optional(),
});

const generateSchema = z.object({
  mode: z.enum(['P1', 'P2']).optional().default('P1'),
  template: z.enum(['8160', '8162']).optional().default('8162'),
  products: z.array(productSchema).min(1).max(500).optional(),
  copies: z.number().int().min(1).max(200).optional(),
  lotId: z.string().uuid().optional(),
  logoBase64: z.string().max(2_000_000).nullable().optional(),
  skipIndexes: z.array(z.number().int().min(0).max(29)).max(30).optional(),
});

async function buildP2LabelItems(lotId: string): Promise<LabelItem[]> {
  const lotRows = await pool.query<{
    id: string;
    lot_number: string;
    part_number: string | null;
    serialized_item_ids: any;
  }>(
    `SELECT id, lot_number, part_number, serialized_item_ids
       FROM p2_lot_numbers
      WHERE id = $1`,
    [lotId]
  );

  if (lotRows.length === 0) {
    throw new Error('P2 lot not found');
  }

  const lot = lotRows[0];
  const itemIds = Array.isArray(lot.serialized_item_ids) ? lot.serialized_item_ids : [];
  if (itemIds.length === 0) {
    throw new Error('P2 lot has no serialized items');
  }

  const placeholders = itemIds.map((_: string, index: number) => `$${index + 1}`).join(', ');
  const serialRows = await pool.query<{
    serial_number: string;
    sku: string | null;
    part_number: string | null;
  }>(
    `SELECT serial_number, sku, part_number
       FROM p2_serialized_items
      WHERE id IN (${placeholders})
      ORDER BY serial_number`,
    itemIds
  );

  const finalizedSku = serialRows.find((row) => row.sku)?.sku || '';

  return serialRows.map((row) => ({
    mode: 'P2',
    sku: row.sku || finalizedSku,
    serialNumber: formatP2CustomerSerialNumber(row.serial_number),
    lotNumber: lot.lot_number,
  }));
}

router.post('/generate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { mode, template: templateKey, products, copies = 1, lotId, logoBase64, skipIndexes } = parsed.data;
    const template = LABEL_TEMPLATES[templateKey];
    const labelItems: LabelItem[] = [];

    if (mode === 'P2') {
      if (!lotId) {
        return res.status(400).json({ error: 'lotId is required for P2 labels' });
      }
      labelItems.push(...await buildP2LabelItems(lotId));
    } else {
      if (!products?.length) {
        return res.status(400).json({ error: 'At least one product is required for P1 labels' });
      }

      for (const product of products) {
        const barcodeVal = product.barcodeValue || product.barcode || '';
        const desc = (product.description || product.product_name || '').slice(0, 200);
        const qty = product.fillPage ? labelsPerPage(template) : product.copies || copies || 1;

        for (let i = 0; i < qty; i++) {
          labelItems.push({
            mode: 'P1',
            barcodeValue: barcodeVal,
            description: desc,
          });
        }
      }
    }

    if (labelItems.length === 0) {
      return res.status(400).json({ error: 'No valid label items to generate' });
    }

    const pdfDoc = await PDFDocument.create();
    await drawLabels(pdfDoc, labelItems, template, logoBase64, skipIndexes);

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
