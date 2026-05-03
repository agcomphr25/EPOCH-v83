export function generateBadgePrintHtml(employeeName: string, barcodeSvgHtml: string): string {
  return `
    <html>
      <head>
        <title>Employee Badge - ${employeeName}</title>
        <style>
          @page {
            size: 3.375in 2.125in;
            margin: 0;
          }
          html {
            width: 3.375in;
            height: 2.125in;
            overflow: hidden;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            width: 3.375in;
            height: 2.125in;
            padding: 0.1in 0.12in 0.08in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            background: #fff;
          }
          .company {
            font-size: 7pt;
            color: #888;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            margin-bottom: 3px;
          }
          h1 {
            font-size: 13pt;
            font-weight: bold;
            margin: 0 0 5px;
            text-align: center;
          }
          svg {
            width: 100%;
            max-width: 2.9in;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div class="company">AG Composites</div>
        <h1>${employeeName}</h1>
        ${barcodeSvgHtml}
      </body>
    </html>
  `;
}
