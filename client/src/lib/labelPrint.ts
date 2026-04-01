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

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [4, 6],
  });

  const imageDataUrl = `data:image/gif;base64,${labelBase64}`;
  pdf.addImage(imageDataUrl, 'GIF', 0, 0, 4, 6);

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
