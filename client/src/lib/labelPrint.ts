export function openLabelPrintWindow(
  labelBase64: string,
  title: string,
  labelFormat: string = 'GIF'
): void {
  const printWindow = window.open('', '_blank', 'width=520,height=720');
  if (!printWindow) {
    alert('Please allow popups for this site to print');
    return;
  }

  if (labelFormat === 'ZPL') {
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

  const mimeType = 'image/gif';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page {
          size: 4in 6in;
          margin: 0;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 4in;
          height: 6in;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        img {
          width: 4in;
          height: 6in;
          object-fit: fill;
          display: block;
        }
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
          body {
            width: 4in;
            height: 6in;
            background: white;
            margin: 0;
            padding: 0;
          }
          img {
            width: 4in;
            height: 6in;
            object-fit: fill;
          }
        }
      </style>
    </head>
    <body>
      <img
        id="label-img"
        src="data:${mimeType};base64,${labelBase64}"
        alt="UPS Shipping Label"
      />
      <button class="print-btn" onclick="window.print()">Print</button>
      <script>
        var img = document.getElementById('label-img');
        function triggerPrint() {
          window.focus();
          window.print();
        }
        if (img.complete) {
          triggerPrint();
        } else {
          img.onload = triggerPrint;
          img.onerror = function() {
            console.error('Label image failed to load');
          };
        }
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
}
