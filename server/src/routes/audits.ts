import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { sendEmailViaSendGrid } from '../../utils/sendgrid';
import { requireAdminAccess } from '../../middleware/routeAuthorization';

const router = Router();

const AUDITS_DIR = path.join(process.cwd(), 'server', 'audits');

interface AuditMeta {
  slug: string;
  title: string;
  date: string;
  summary: string;
}

interface InlineSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

function extractMeta(slug: string, content: string): AuditMeta {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  let title = '';
  let date = '';
  let summary = '';

  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '');
    }
    const dateMatch =
      line.match(/\*\*Date[:\s]+\*\*\s*(.+)/i) ||
      line.match(/\*\*Date:\*\*\s*(.+)/i) ||
      line.match(/\*\*Date\*\*:\s*(.+)/i) ||
      line.match(/^\*\*Date:\s*(.+)\*\*/i);
    if (dateMatch && !date) {
      date = dateMatch[1].replace(/\*+/g, '').trim();
    }
  }

  if (!title) title = slug;

  for (const line of lines) {
    if (!line.startsWith('#') && !line.startsWith('**') && line.length > 30) {
      summary = line.slice(0, 160) + (line.length > 160 ? '…' : '');
      break;
    }
  }

  return { slug, title, date, summary };
}

function parseInline(raw: string): InlineSegment[] {
  const cleaned = raw
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const segments: InlineSegment[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(cleaned)) !== null) {
    if (m.index > last) {
      segments.push({ text: cleaned.slice(last, m.index), bold: false, italic: false });
    }
    if (m[2]) {
      segments.push({ text: m[2], bold: true, italic: true });
    } else if (m[3]) {
      segments.push({ text: m[3], bold: true, italic: false });
    } else if (m[4]) {
      segments.push({ text: m[4], bold: false, italic: true });
    }
    last = m.index + m[0].length;
  }

  if (last < cleaned.length) {
    segments.push({ text: cleaned.slice(last), bold: false, italic: false });
  }

  return segments.filter((s) => s.text.length > 0);
}

function fontFor(seg: InlineSegment): string {
  if (seg.bold && seg.italic) return 'Helvetica-BoldOblique';
  if (seg.bold) return 'Helvetica-Bold';
  if (seg.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function plainText(raw: string): string {
  return parseInline(raw)
    .map((s) => s.text)
    .join('');
}

/**
 * Break any token in `text` whose rendered width exceeds `maxWidth` by
 * inserting a space character at the last safe position. This guarantees
 * PDFKit can word-wrap even fully unbreakable strings (UUIDs, URLs, etc.).
 *
 * IMPORTANT: The caller must set `doc.font(font)` and `doc.fontSize(fontSize)`
 * *before* calling this function. `breakLongWords` does NOT mutate document
 * font/size state — it uses whatever is currently set for width measurement
 * and leaves the state unchanged.
 *
 * Ultra-narrow fallback: when even a single glyph exceeds `maxWidth`, the
 * character is emitted as-is so the loop always terminates. PDFKit will then
 * wrap that character onto its own line, which is the best available outcome
 * for a column that is narrower than one character (a degenerate but theoretically
 * possible case after proportional scaling).
 */
function breakLongWords(
  text: string,
  maxWidth: number,
  doc: DocType
): string {
  if (!text || maxWidth <= 0) return text;
  // Split on whitespace, keeping the delimiters so we can rejoin faithfully.
  const tokens = text.split(/(\s+)/);
  return tokens
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      if (doc.widthOfString(token) <= maxWidth) return token;
      // Character-by-character accumulation: flush a chunk when the next
      // character would push it over the limit.
      let result = '';
      let chunk = '';
      for (const char of token) {
        const candidate = chunk + char;
        if (doc.widthOfString(candidate) > maxWidth && chunk.length > 0) {
          // Flush the safe chunk and start a new one.
          result += chunk + ' ';
          chunk = char;
        } else {
          // Either we're still within budget, or this is the very first
          // character of the chunk and it already exceeds maxWidth
          // (ultra-narrow column). Accept it unconditionally so we always
          // make forward progress.
          chunk = candidate;
        }
      }
      return result + chunk;
    })
    .join('');
}

type DocType = InstanceType<typeof PDFDocument>;

interface InlineOpts {
  width?: number;
  lineGap?: number;
  lineBreak?: boolean;
  indent?: number;
}

function renderInline(
  doc: DocType,
  raw: string,
  baseFont: string,
  fontSize: number,
  color: string,
  flowOpts: InlineOpts = {},
  anchorX?: number,
  anchorY?: number
): void {
  const segs = parseInline(raw);
  if (segs.length === 0) return;

  segs.forEach((seg, idx) => {
    const isLast = idx === segs.length - 1;
    const isFirst = idx === 0;
    doc.font(fontFor({ ...seg, bold: seg.bold || baseFont === 'Helvetica-Bold' }));
    doc.fontSize(fontSize).fillColor(color);
    const textOpts = { ...flowOpts, continued: !isLast };
    if (isFirst && anchorX !== undefined && anchorY !== undefined) {
      doc.text(seg.text, anchorX, anchorY, textOpts);
    } else {
      doc.text(seg.text, textOpts);
    }
  });
}

const LANDSCAPE_COL_THRESHOLD = 8;

function renderMarkdownToPdf(doc: DocType, content: string): void {
  const lines = content.split('\n');
  let inTable = false;
  let tableRows: string[][] = [];
  let onLandscapePage = false;

  function getPageDims() {
    const leftMargin = doc.page.margins.left;
    const rightMargin = doc.page.margins.right;
    const pageWidth = doc.page.width - leftMargin - rightMargin;
    return { leftMargin, rightMargin, pageWidth };
  }

  function ensurePortraitPage() {
    if (onLandscapePage) {
      doc.addPage({ layout: 'portrait', size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      onLandscapePage = false;
    }
  }

  function flushTable(): void {
    if (tableRows.length === 0) return;

    const colCount = Math.max(...tableRows.map((r) => r.length));

    if (colCount >= LANDSCAPE_COL_THRESHOLD && !onLandscapePage) {
      doc.addPage({ layout: 'landscape', size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      onLandscapePage = true;
    } else if (colCount < LANDSCAPE_COL_THRESHOLD && onLandscapePage) {
      doc.addPage({ layout: 'portrait', size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      onLandscapePage = false;
    }

    const { leftMargin, pageWidth } = getPageDims();

    const cellPadX = 4;
    const cellPadY = 4;
    const fontSize = 9;
    const minColWidth = 30;

    doc.fontSize(fontSize).font('Helvetica');

    const naturalWidths: number[] = Array.from({ length: colCount }, (_, ci) => {
      let maxW = minColWidth;
      for (const row of tableRows) {
        const cell = row[ci] ?? '';
        const textW = doc.widthOfString(plainText(cell)) + cellPadX * 2;
        if (textW > maxW) maxW = textW;
      }
      return maxW;
    });

    const totalNatural = naturalWidths.reduce((a, b) => a + b, 0);
    // When scaling down, use pure proportional allocation so sum(colWidths) === pageWidth exactly.
    // Never apply a minimum floor in the scaling branch — that would let the total exceed the budget.
    const colWidths: number[] =
      totalNatural <= pageWidth
        ? naturalWidths
        : naturalWidths.map((w) => (w / totalNatural) * pageWidth);

    const minRowHeight = fontSize + cellPadY * 2;

    tableRows.forEach((row, rowIdx) => {
      const isHeader = rowIdx === 0;

      const rowHeight = Math.max(
        minRowHeight,
        ...row.map((cell, ci) => {
          const cw = colWidths[ci] ?? minColWidth;
          const innerW = Math.max(1, cw - cellPadX * 2);
          doc.fontSize(fontSize).font('Helvetica');
          const broken = breakLongWords(plainText(cell), innerW, doc);
          const h = doc.heightOfString(broken, { width: innerW });
          return h + cellPadY * 2;
        })
      );

      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage({ layout: onLandscapePage ? 'landscape' : 'portrait', size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      }

      const rowY = doc.y;
      let xCursor = leftMargin;

      row.forEach((cell, colIdx) => {
        const cw = colWidths[colIdx] ?? minColWidth;
        const x = xCursor;
        xCursor += cw;

        const innerWidth = Math.max(1, cw - cellPadX * 2);

        if (isHeader) {
          doc.rect(x, rowY, cw, rowHeight).fillAndStroke('#E5E7EB', '#D1D5DB');
          doc.fillColor('#111827').font('Helvetica-Bold').fontSize(fontSize);
          const headerText = breakLongWords(plainText(cell), innerWidth, doc);
          doc.text(headerText, x + cellPadX, rowY + cellPadY, {
            width: innerWidth,
            lineBreak: true,
          });
        } else {
          doc.rect(x, rowY, cw, rowHeight).stroke('#E5E7EB');
          doc.fillColor('#374151').fontSize(fontSize);
          // Apply character-level word breaking per inline segment so that
          // unbreakable tokens (UUIDs, URLs, etc.) never bleed past the column.
          const segs = parseInline(cell);
          if (segs.length === 0) {
            // nothing to render
          } else {
            segs.forEach((seg, idx) => {
              const isLast = idx === segs.length - 1;
              const isFirst = idx === 0;
              doc.font(fontFor({ ...seg, bold: seg.bold || false }));
              doc.fontSize(fontSize).fillColor('#374151');
              const brokenText = breakLongWords(seg.text, innerWidth, doc);
              const textOpts = { width: innerWidth, lineBreak: true, continued: !isLast };
              if (isFirst) {
                doc.text(brokenText, x + cellPadX, rowY + cellPadY, textOpts);
              } else {
                doc.text(brokenText, textOpts);
              }
            });
          }
        }
      });

      doc.y = rowY + rowHeight;
    });

    doc.moveDown(0.5);
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.startsWith('|')) {
      if (/^\|[\s\-:|]+\|/.test(line)) {
        continue;
      }
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      tableRows.push(cells);
      inTable = true;
      continue;
    }

    if (inTable) {
      flushTable();
    }

    if (line === '') {
      doc.moveDown(0.4);
      continue;
    }

    ensurePortraitPage();

    if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
      const { leftMargin: lm, rightMargin: rm } = getPageDims();
      doc.moveDown(0.3);
      doc
        .moveTo(lm, doc.y)
        .lineTo(doc.page.width - rm, doc.y)
        .strokeColor('#D1D5DB')
        .stroke();
      doc.strokeColor('#000000');
      doc.moveDown(0.5);
      continue;
    }

    if (line.startsWith('### ')) {
      doc.moveDown(0.3);
      renderInline(doc, line.replace(/^###\s+/, ''), 'Helvetica-Bold', 12, '#1F2937');
      doc.moveDown(0.2);
      continue;
    }

    if (line.startsWith('## ')) {
      doc.moveDown(0.5);
      renderInline(doc, line.replace(/^##\s+/, ''), 'Helvetica-Bold', 14, '#111827');
      doc.moveDown(0.3);
      continue;
    }

    if (line.startsWith('# ')) {
      doc.moveDown(0.5);
      renderInline(doc, line.replace(/^#\s+/, ''), 'Helvetica-Bold', 18, '#111827');
      doc.moveDown(0.4);
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const text = line.replace(/^[-*]\s/, '');
      doc.fontSize(10).fillColor('#374151');
      doc.text('• ', { continued: true, indent: 16 });
      renderInline(doc, text, 'Helvetica', 10, '#374151', { lineGap: 2 });
      doc.moveDown(0.1);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1] ?? '1';
      const text = line.replace(/^\d+\.\s/, '');
      doc.fontSize(10).fillColor('#374151');
      doc.text(`${num}. `, { continued: true, indent: 16 });
      renderInline(doc, text, 'Helvetica', 10, '#374151', { lineGap: 2 });
      doc.moveDown(0.1);
      continue;
    }

    if (line.startsWith('> ')) {
      const text = line.replace(/^>\s/, '');
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#6B7280');
      doc.text(plainText(text), { indent: 20, lineGap: 2 });
      doc.moveDown(0.2);
      continue;
    }

    doc.fontSize(10).fillColor('#374151');
    renderInline(doc, line, 'Helvetica', 10, '#374151', { lineGap: 2 });
    doc.moveDown(0.2);
  }

  if (inTable) {
    flushTable();
  }
}

router.get('/', (_req, res) => {
  try {
    if (!fs.existsSync(AUDITS_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(AUDITS_DIR).filter((f) => f.endsWith('.md'));
    const audits = files.map((file) => {
      const slug = file.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(AUDITS_DIR, file), 'utf-8');
      return extractMeta(slug, content);
    });

    audits.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return a.slug.localeCompare(b.slug);
    });

    res.json(audits);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to list audits' });
  }
});

router.get('/:slug/pdf', (req, res) => {
  try {
    const { slug } = req.params;
    const safe = path.basename(slug);
    const filePath = path.join(AUDITS_DIR, `${safe}.md`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const meta = extractMeta(slug, content);
    const filename = `${safe}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      margin: 50,
      size: 'LETTER',
      info: {
        Title: meta.title,
        Author: 'EPOCH System',
        Subject: 'System Audit Report',
        CreationDate: new Date(),
      },
    });

    doc.pipe(res);
    renderMarkdownToPdf(doc, content);
    doc.end();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Failed to generate PDF' });
    }
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 20;

router.post('/:slug/email', requireAdminAccess, async (req, res) => {
  try {
    const { slug } = req.params;
    const safe = path.basename(slug);
    const filePath = path.join(AUDITS_DIR, `${safe}.md`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    const { recipients } = req.body;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients must be a non-empty array of email addresses' });
    }

    if (recipients.length > MAX_RECIPIENTS) {
      return res.status(400).json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` });
    }

    const invalid = recipients.filter((r: unknown) => typeof r !== 'string' || !EMAIL_RE.test(r.trim()));
    if (invalid.length > 0) {
      return res.status(400).json({ error: 'One or more recipient email addresses are invalid', invalid });
    }

    const cleanRecipients: string[] = [...new Set(recipients.map((r: string) => r.trim()))];

    const content = fs.readFileSync(filePath, 'utf-8');
    const meta = extractMeta(slug, content);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
        size: 'LETTER',
        info: {
          Title: meta.title,
          Author: 'EPOCH System',
          Subject: 'System Audit Report',
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      renderMarkdownToPdf(doc, content);
      doc.end();
    });

    const pdfBase64 = pdfBuffer.toString('base64');
    const filename = `${safe}.pdf`;

    const results = await Promise.all(
      cleanRecipients.map((to: string) =>
        sendEmailViaSendGrid({
          to,
          subject: `Audit Report: ${meta.title}`,
          text: `Please find the attached audit report: ${meta.title}${meta.date ? ` (${meta.date})` : ''}.`,
          html: `<p>Please find the attached audit report: <strong>${meta.title}</strong>${meta.date ? ` (${meta.date})` : ''}.</p>`,
          attachments: [
            {
              content: pdfBase64,
              filename,
              type: 'application/pdf',
              disposition: 'attachment',
            },
          ],
        })
      )
    );

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      return res.status(502).json({ error: 'Failed to send to one or more recipients', details: failed });
    }

    res.json({ success: true, sent: cleanRecipients.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    res.status(500).json({ error: message });
  }
});

router.get('/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const safe = path.basename(slug);
    const filePath = path.join(AUDITS_DIR, `${safe}.md`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audit not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const meta = extractMeta(slug, content);
    res.json({ ...meta, content });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to read audit' });
  }
});

export default router;
