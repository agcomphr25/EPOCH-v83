const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../.local/EPOCH_SYSTEM_AUDIT_2026-04-15.md');
const OUTPUT_PATH = path.join(__dirname, '../_audit_exports/EPOCH_SYSTEM_AUDIT_2026-04-15.pdf');

const MARGIN = 50;
const PAGE_WIDTH = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  h1: '#1a1a2e',
  h2: '#16213e',
  h3: '#0f3460',
  h4: '#1a1a2e',
  body: '#1a1a1a',
  tableHeader: '#2c3e50',
  tableHeaderBg: '#ecf0f1',
  tableRowAlt: '#f9f9f9',
  tableBorder: '#bdc3c7',
  hr: '#bdc3c7',
};

const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
};

function stripInline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function isTableRow(line) {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

function isSeparatorRow(line) {
  return /^\|[\s\-:|]+\|/.test(line.trim());
}

function parseTableRow(line) {
  return line.trim().slice(1, -1).split('|').map(cell => cell.trim());
}

function parseMarkdown(content) {
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed === '---') {
      if (trimmed === '---') {
        blocks.push({ type: 'hr' });
      }
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2) });
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3) });
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4) });
      i++;
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h4', text: trimmed.slice(5) });
      i++;
      continue;
    }

    if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.includes('|')) {
      blocks.push({ type: 'bold-para', text: trimmed.slice(2, -2) });
      i++;
      continue;
    }

    if (isTableRow(trimmed)) {
      const rows = [];
      let header = null;
      if (!isSeparatorRow(trimmed)) {
        header = parseTableRow(trimmed);
        i++;
      }
      if (i < lines.length && isSeparatorRow(lines[i].trim())) {
        i++;
      }
      while (i < lines.length && isTableRow(lines[i].trim()) && !isSeparatorRow(lines[i].trim())) {
        rows.push(parseTableRow(lines[i].trim()));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.match(/^\d+\. /)) {
      const items = [];
      const ordered = trimmed.match(/^\d+\. /) !== null;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l.startsWith('- ') || l.match(/^\d+\. /)) {
          items.push(l.replace(/^- /, '').replace(/^\d+\. /, ''));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (trimmed) {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
    i++;
  }

  return blocks;
}

function drawTable(doc, block) {
  const { header, rows } = block;
  if (!header) return;

  const colCount = header.length;
  const colWidths = new Array(colCount).fill(0);

  const allRows = [header, ...rows];
  for (const row of allRows) {
    for (let c = 0; c < colCount; c++) {
      const cellText = stripInline(row[c] || '');
      const approxWidth = cellText.length * 5.5;
      if (approxWidth > colWidths[c]) colWidths[c] = approxWidth;
    }
  }

  const totalRaw = colWidths.reduce((a, b) => a + b, 0);
  const scale = Math.min(1, (CONTENT_WIDTH - colCount * 8) / totalRaw);
  const finalWidths = colWidths.map(w => Math.max(w * scale, 40));
  const totalWidth = finalWidths.reduce((a, b) => a + b, 0) + colCount * 8;
  const tableX = MARGIN + Math.max(0, (CONTENT_WIDTH - totalWidth) / 2);

  const CELL_PAD_H = 4;
  const CELL_PAD_V = 4;
  const FONT_SIZE = 7.5;
  const LINE_HEIGHT = FONT_SIZE + 4;

  function getRowHeight(row) {
    let maxLines = 1;
    for (let c = 0; c < colCount; c++) {
      const text = stripInline(row[c] || '');
      const cw = finalWidths[c];
      const charsPerLine = Math.max(1, (cw - CELL_PAD_H * 2) / (FONT_SIZE * 0.55));
      const lines = Math.ceil(text.length / charsPerLine) || 1;
      if (lines > maxLines) maxLines = lines;
    }
    return maxLines * LINE_HEIGHT + CELL_PAD_V * 2;
  }

  function ensurePageSpace(neededHeight) {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + neededHeight > bottom) {
      doc.addPage();
    }
  }

  function drawRow(row, isHeader) {
    const rowHeight = getRowHeight(row);
    ensurePageSpace(rowHeight);
    const actualY = doc.y;

    if (isHeader) {
      doc.rect(tableX, actualY, totalWidth, rowHeight).fill(COLORS.tableHeaderBg);
    }

    doc.rect(tableX, actualY, totalWidth, rowHeight).stroke(COLORS.tableBorder);

    let cx = tableX;
    for (let c = 0; c < colCount; c++) {
      const cw = finalWidths[c] + CELL_PAD_H * 2;
      const cellText = stripInline(row[c] || '');
      doc
        .font(isHeader ? FONTS.bold : FONTS.regular)
        .fontSize(FONT_SIZE)
        .fillColor(isHeader ? COLORS.tableHeader : COLORS.body)
        .text(cellText, cx + CELL_PAD_H, actualY + CELL_PAD_V, {
          width: finalWidths[c],
          height: rowHeight - CELL_PAD_V * 2,
          lineGap: 1,
          ellipsis: false,
        });
      cx += cw;
    }

    doc.y = actualY + rowHeight;
  }

  ensurePageSpace(getRowHeight(header) + 5);
  drawRow(header, true);
  for (let r = 0; r < rows.length; r++) {
    if (r % 2 === 1) {
      const rh = getRowHeight(rows[r]);
      doc.rect(tableX, doc.y, totalWidth, rh).fill(COLORS.tableRowAlt);
    }
    drawRow(rows[r], false);
  }

  doc.moveDown(0.5);
}

function generatePDF(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath, 'utf8');
  const blocks = parseMarkdown(content);

  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'landscape',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: 'EPOCH ERP System Audit Report',
      Author: 'EPOCH Planning Agent',
      Subject: 'EPOCH vs. Deltek Costpoint Audit Report',
      CreationDate: new Date('2026-04-15'),
    },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  let firstBlock = true;

  for (const block of blocks) {
    const bottom = doc.page.height - doc.page.margins.bottom;

    switch (block.type) {
      case 'h1': {
        if (!firstBlock) doc.addPage();
        doc
          .font(FONTS.bold)
          .fontSize(20)
          .fillColor(COLORS.h1)
          .text(stripInline(block.text), MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.4);
        doc
          .moveTo(MARGIN, doc.y)
          .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
          .strokeColor(COLORS.h1)
          .lineWidth(1.5)
          .stroke();
        doc.moveDown(0.6);
        break;
      }

      case 'h2': {
        if (doc.y > bottom - 60) doc.addPage();
        doc.moveDown(0.5);
        doc
          .font(FONTS.bold)
          .fontSize(14)
          .fillColor(COLORS.h2)
          .text(stripInline(block.text), MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.25);
        doc
          .moveTo(MARGIN, doc.y)
          .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
          .strokeColor(COLORS.h2)
          .lineWidth(0.75)
          .stroke();
        doc.moveDown(0.4);
        break;
      }

      case 'h3': {
        if (doc.y > bottom - 50) doc.addPage();
        doc.moveDown(0.4);
        doc
          .font(FONTS.bold)
          .fontSize(11)
          .fillColor(COLORS.h3)
          .text(stripInline(block.text), MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.3);
        break;
      }

      case 'h4': {
        if (doc.y > bottom - 40) doc.addPage();
        doc.moveDown(0.3);
        doc
          .font(FONTS.bold)
          .fontSize(10)
          .fillColor(COLORS.h4)
          .text(stripInline(block.text), MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.25);
        break;
      }

      case 'bold-para': {
        doc
          .font(FONTS.bold)
          .fontSize(9)
          .fillColor(COLORS.body)
          .text(block.text, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
        doc.moveDown(0.3);
        break;
      }

      case 'paragraph': {
        doc
          .font(FONTS.regular)
          .fontSize(9)
          .fillColor(COLORS.body)
          .text(stripInline(block.text), MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
        doc.moveDown(0.3);
        break;
      }

      case 'list': {
        for (let idx = 0; idx < block.items.length; idx++) {
          if (doc.y > bottom - 20) doc.addPage();
          const prefix = block.ordered ? `${idx + 1}.` : '•';
          doc
            .font(FONTS.regular)
            .fontSize(9)
            .fillColor(COLORS.body)
            .text(`${prefix}  ${stripInline(block.items[idx])}`, MARGIN + 10, doc.y, {
              width: CONTENT_WIDTH - 10,
              lineGap: 2,
            });
          doc.moveDown(0.15);
        }
        doc.moveDown(0.3);
        break;
      }

      case 'table': {
        if (doc.y > bottom - 80) doc.addPage();
        drawTable(doc, block);
        break;
      }

      case 'hr': {
        doc.moveDown(0.3);
        doc
          .moveTo(MARGIN, doc.y)
          .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
          .strokeColor(COLORS.hr)
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.5);
        break;
      }
    }

    firstBlock = false;
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

generatePDF(INPUT_PATH, OUTPUT_PATH)
  .then(() => {
    const stats = fs.statSync(OUTPUT_PATH);
    console.log(`PDF generated successfully: ${OUTPUT_PATH}`);
    console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
  })
  .catch(err => {
    console.error('Error generating PDF:', err);
    process.exit(1);
  });
