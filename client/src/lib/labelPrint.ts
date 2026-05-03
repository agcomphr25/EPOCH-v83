import { jsPDF } from 'jspdf';

export function openLabelPrintWindow(
  labelBase64: string,
  title: string,
  labelFormat: string = 'GIF'
): void {
  if (labelFormat === 'ZPL') {
    const printWindow = window.open('', '_blank', 'width=520,height=720');
    if (!printWindow) {
      alert('Please allow popups for this site to print');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: monospace; padding: 20px; white-space: pre-wrap; font-size: 10px; background: white; }
          .print-btn {
            position: fixed;
            top: 12px;
            right: 12px;
            padding: 8px 18px;
            background: #007cba;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 15px;
            z-index: 999;
          }
          .print-btn:hover { background: #005f8e; }
          @media print {
            .print-btn { display: none; }
            body { padding: 0; margin: 0; }
          }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">Print</button>
        <pre>${atob(labelBase64)}</pre>
        <script>window.focus(); window.print();<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    return;
  }

  // UPS GIF labels are delivered in landscape orientation (6" wide × 4" tall).
  // jsPDF's `format` array is [height, width] when orientation is 'landscape',
  // so [4, 6] here sets a 4"-tall × 6"-wide page — matching the physical stock.
  // The image is placed at origin (0, 0) spanning the full 6"×4" page area.
  //
  // Expected behavior on common 4×6 thermal label printers:
  //   - Zebra ZP450 / ZD420 / GK420d: set paper size to "4x6" in the print dialog;
  //     the label should appear right-side up and fill the entire stock with no
  //     rotation or scaling required.
  //   - Dymo 4XL: select "4 x 6 in" label in Dymo Connect; the carrier logo,
  //     barcode, and address block should all print within the label boundaries.
  //   - Generic thermal / inkjet on 4×6 cut sheets: choose "Actual size" (not
  //     "Fit to page") in the browser print dialog to avoid re-scaling.
  //
  // If the label prints sideways, verify the printer driver is NOT applying an
  // additional 90-degree rotation on top of the landscape orientation already
  // embedded in the PDF.
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: [4, 6],
  });

  const imageDataUrl = `data:image/gif;base64,${labelBase64}`;
  pdf.addImage(imageDataUrl, 'GIF', 0, 0, 6, 4);

  const pdfBlob = pdf.output('blob');
  const pdfBlobUrl = URL.createObjectURL(pdfBlob);

  const printWindow = window.open('', '_blank', 'width=540,height=780');
  if (!printWindow) {
    alert('Please allow popups for this site to print');
    URL.revokeObjectURL(pdfBlobUrl);
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #525659; display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; }
        .toolbar {
          background: #3d4043;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
          z-index: 10;
        }
        .print-btn {
          padding: 8px 20px;
          background: #007cba;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .print-btn:hover { background: #005f8e; }
        .label-text { color: #ccc; font-size: 13px; }
        .pdf-frame {
          flex: 1;
          width: 100%;
          border: none;
          display: block;
        }
        @media print {
          .toolbar { display: none !important; }
          body { background: white; height: auto; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button class="print-btn" id="printBtn">Print</button>
        <span class="label-text">4&times;6 Shipping Label</span>
      </div>
      <iframe class="pdf-frame" id="pdfFrame" src="${pdfBlobUrl}"></iframe>
      <script>
        var blobUrl = '${pdfBlobUrl}';
        var frame = document.getElementById('pdfFrame');
        var btn = document.getElementById('printBtn');

        function doPrint() {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (e) {
            window.print();
          }
        }

        btn.addEventListener('click', doPrint);

        frame.addEventListener('load', function() {
          setTimeout(doPrint, 500);
        });

        setTimeout(function() {
          try { URL.revokeObjectURL(blobUrl); } catch (e) {}
        }, 120000);
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
}
