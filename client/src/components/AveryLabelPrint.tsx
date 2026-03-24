import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Printer, Package, Calendar, User } from 'lucide-react';

interface AveryLabelPrintProps {
  orderId: string;
  barcode: string;
  customerName?: string;
  orderDate?: string;
  dueDate?: string;
  productInfo?: string;
  status?: string;
  actionLength?: string;
  stockModel?: string;
  paintOption?: string;
  color?: string; // Added color prop
  features?: any; // Order features object
  modelId?: string; // Stock model ID
  isHighPriority?: boolean; // High priority flag
  isLate?: boolean; // Late order flag
  labelType?: 'basic' | 'detailed';
  copies?: number;
  material?: string; // Material type (for P1 PO orders)
  poNumber?: string; // PO number (for P1 PO orders)
}

export function AveryLabelPrint({
  orderId,
  barcode,
  customerName,
  orderDate,
  dueDate,
  productInfo,
  status,
  actionLength,
  stockModel,
  paintOption,
  color, // Added color prop
  features,
  modelId,
  isHighPriority,
  isLate,
  labelType = 'detailed',
  copies = 6,
  material,
  poNumber,
}: AveryLabelPrintProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [barcodeGenerated, setBarcodeGenerated] = useState(false);

  // Color coding logic
  const getBarcodeColor = () => {
    // Red for high priority or late orders
    if (isHighPriority || isLate) {
      return '#FF0000'; // Red
    }

    // Blue for terrain/premium/standard/rattlesnake_rogue + all FG models
    // Black for carbon options, other rogue options, no paint
    const isCarbonFinish = !!paintOption && (paintOption.startsWith('carbon') || paintOption === 'neon_green_camo');
    const isNonPaintedRogue = !!paintOption && paintOption.endsWith('_rogue') && paintOption !== 'rattlesnake_rogue';
    const isPaintedOption = !!paintOption && !isCarbonFinish && !isNonPaintedRogue;
    const isFiberglassModel = modelId?.toLowerCase().startsWith('fg');

    if (isPaintedOption || isFiberglassModel) {
      return '#0066FF'; // Blue
    }

    return '#000000'; // Black (default)
  };

  // Extract swivel studs and texture options from features
  const getSwivelStudsText = () => {
    if (!features?.swivel_studs) return null;
    return features.swivel_studs !== 'standard_swivel_studs' &&
      features.swivel_studs !== 'standard'
      ? features.swivel_studs.replace(/_/g, ' ')
      : null;
  };

  const getTextureText = () => {
    if (!features?.texture_options) return null;
    return features.texture_options !== 'no_texture' &&
      features.texture_options !== 'none'
      ? features.texture_options.replace(/_/g, ' ')
      : null;
  };

  useEffect(() => {
    if (canvasRef.current && barcode) {
      const format = getBarcodeFormat(barcode);
      try {
        JsBarcode(canvasRef.current, barcode, {
          format: format,
          width: format === 'CODE128' ? 1.5 : 2,
          height: 40,
          displayValue: false,
          fontSize: 10,
          textAlign: 'center',
          textPosition: 'bottom',
          textMargin: 2,
          fontOptions: '',
          font: 'monospace',
          background: '#ffffff',
          lineColor: getBarcodeColor(),
          margin: 5,
        });
        setBarcodeGenerated(true);
      } catch (error) {
        console.error('Error generating barcode:', error);
        setBarcodeGenerated(false);
      }
    }
  }, [barcode]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });
  };

  const handlePrintLabels = () => {
    if (canvasRef.current) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const canvas = canvasRef.current;
        const img = canvas.toDataURL('image/png', 1.0); // High quality PNG
        const currentDate = new Date().toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: '2-digit',
        });

        const generateLabelContent = (_index: number) => {
          // Check if this is a P1 PO order
          const isPOOrder = orderId.startsWith('PO-') || orderId.startsWith('P1-');

          // Get texture text for display
          const textureText = getTextureText();

          const barcodeImg = `<img src="${img}" class="barcode-img" alt="barcode" />`;

          // P1 PO Order Label Layout
          if (isPOOrder) {
            // Extract PO number from orderId (format: PO-P18261-18-1)
            const displayPO = poNumber || orderId;
            
            // Material and stock model display
            const materialAndModel = material && stockModel 
              ? `${material} - ${stockModel}`
              : material || stockModel || '';

            return `
              <div class="avery-label">
                <div class="label-content">
                  <div class="line1">${displayPO}</div>
                  <div class="line5">${barcodeImg}</div>
                  ${materialAndModel ? `<div class="line3">${materialAndModel}</div>` : ''}
                  ${customerName ? `<div class="line2">${customerName}</div>` : ''}
                  ${textureText ? `<div class="line4">${textureText}</div>` : ''}
                </div>
              </div>
            `;
          }

          // Regular Order Label Layout
          return `
            <div class="avery-label">
              <div class="label-content">
                <div class="line1">${orderId}</div>
                ${customerName ? `<div class="line2">${customerName}</div>` : ''}
                ${stockModel || paintOption ? `<div class="line3">${stockModel || ''}${stockModel && paintOption ? ' - ' : ''}${paintOption || ''}</div>` : ''}
                ${textureText ? `<div class="line4">${textureText}</div>` : ''}
                <div class="line5">${barcodeImg}</div>
              </div>
            </div>
          `;
        };

        printWindow.document.write(`
          <html>
            <head>
              <title>Avery Labels - ${orderId}</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  font-family: Arial, sans-serif;
                }

                /* Avery 8162 Label Dimensions: 4" x 1.333" (14 labels per sheet, 2 cols x 7 rows) */
                .avery-label {
                  width: 4in;
                  height: 1.333in;
                  border: 1px solid #ddd;
                  margin: 0;
                  padding: 0.05in 0.08in;
                  display: block;
                  box-sizing: border-box;
                  page-break-inside: avoid;
                  overflow: hidden;
                  background: white;
                  position: relative;
                }

                .label-content {
                  height: 100%;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                  text-align: center;
                  padding: 2px;
                  box-sizing: border-box;
                }

                /* Line 1: Order ID */
                .line1 {
                  font-size: 11pt;
                  font-weight: bold;
                  color: #000;
                  margin-bottom: 2px;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  white-space: nowrap;
                  text-align: center;
                }

                /* Line 2: Customer Name */
                .line2 {
                  font-size: 9pt;
                  color: #000;
                  margin: 2px 0;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  white-space: nowrap;
                  text-align: center;
                }

                /* Line 3: Stock Model + Color */
                .line3 {
                  font-size: 8pt;
                  font-weight: bold;
                  color: #000;
                  margin: 2px 0;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  white-space: nowrap;
                  text-align: center;
                }

                /* Line 4: Due Date */
                .line4 {
                  font-size: 8pt;
                  font-weight: bold;
                  color: #000;
                  margin-top: 2px;
                  text-align: center;
                }

                /* Special options line for swivel studs and texture */
                .line-special {
                  font-size: 7pt;
                  margin: 2px 0;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  white-space: nowrap;
                  text-align: center;
                  line-height: 1.2;
                }

                .swivel-studs {
                  color: #FF6600; /* Orange for non-standard swivel studs */
                  font-weight: bold;
                }

                .texture-options {
                  color: #9933CC; /* Purple for texture options */
                  font-weight: bold;
                }

                /* Line 5: Barcode */
                .line5 {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  margin: 3px 0;
                  min-height: 0.45in;
                }

                .barcode-img {
                  max-width: 90%;
                  max-height: 0.45in;
                  height: auto;
                  display: block;
                }

                /* Grid layout: 2 cols x 7 rows — Avery 8162 (4" x 1.333", 14 per sheet) */
                .labels-container {
                  width: 8.5in;
                  padding: 0.83in 0.156in 0 0.156in;
                  display: grid;
                  grid-template-columns: repeat(2, 4in);
                  grid-template-rows: repeat(7, 1.333in);
                  column-gap: 0.1875in;
                  row-gap: 0;
                }

                @media print {
                  html, body { width: 8.5in; height: 11in; margin: 0; padding: 0; }
                  .avery-label {
                    border: none;
                    margin: 0;
                    width: 4in;
                    height: 1.333in;
                  }
                  @page {
                    size: letter;
                    margin: 0;
                  }
                }

                /* Preview styles */
                .preview-label {
                  border: 2px solid #007bff;
                  background: #f8f9fa;
                }
              </style>
            </head>
            <body>
              <div class="labels-container">
                ${Array(copies)
                  .fill(null)
                  .map(
                    (_, i) => `
                  ${generateLabelContent(i)}
                `
                  )
                  .join('')}
              </div>
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.print();
                  }, 250);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Avery Label Print - {orderId}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Hidden canvas for barcode generation */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Label Preview */}
          <div className="border border-gray-300 bg-gray-50 p-4 rounded">
            <div className="text-sm font-semibold mb-2">Label Preview:</div>
            <div
              className="bg-white border border-gray-400 p-2 text-center flex flex-col justify-between"
              style={{
                width: '4in',
                height: '1.333in',
                fontSize: '10px',
                lineHeight: '1.2',
              }}
            >
              <div className="font-bold text-xs">{orderId}</div>
              {customerName && <div className="text-xs">{customerName}</div>}
              {stockModel || paintOption ? (
                <div
                  className="text-xs font-bold"
                  style={{ fontSize: '7px' }}
                  title={`${stockModel || ''}${stockModel && paintOption ? ' - ' : ''}${paintOption || ''}`}
                >
                  {`${stockModel || ''}${stockModel && paintOption ? ' - ' : ''}${paintOption || ''}`}
                </div>
              ) : (
                ''
              )}
              {(getSwivelStudsText() || getTextureText()) && (
                <div
                  className="text-xs"
                  style={{ fontSize: '6px', lineHeight: '1.1' }}
                >
                  {getSwivelStudsText() && (
                    <span style={{ color: '#FF6600', fontWeight: 'bold' }}>
                      {getSwivelStudsText()}
                    </span>
                  )}
                  {getSwivelStudsText() && getTextureText() && ' | '}
                  {getTextureText() && (
                    <span style={{ color: '#9933CC', fontWeight: 'bold' }}>
                      {getTextureText()}
                    </span>
                  )}
                </div>
              )}
              {dueDate && (
                <div className="text-xs font-bold">{`Due: ${formatDate(dueDate)}`}</div>
              )}
              <div className="my-1 flex justify-center">
                {barcodeGenerated && canvasRef.current && (
                  <img
                    src={canvasRef.current.toDataURL()}
                    alt="Barcode preview"
                    style={{ maxHeight: '0.3in', maxWidth: '100%' }}
                  />
                )}
                {!barcodeGenerated && (
                  <div
                    style={{ height: '0.3in' }}
                    className="flex items-center"
                  >
                    <span className="text-xs text-gray-500">{barcode}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Label Information */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Order ID:</strong> {orderId}
            </div>
            <div>
              <strong>Barcode:</strong> {barcode}
            </div>
            {customerName && (
              <div>
                <strong>Customer:</strong> {customerName}
              </div>
            )}
            {orderDate && (
              <div>
                <strong>Order Date:</strong> {formatDate(orderDate)}
              </div>
            )}
            {status && (
              <div>
                <strong>Status:</strong> {status}
              </div>
            )}
            {stockModel && (
              <div>
                <strong>Stock Model:</strong> {stockModel}
              </div>
            )}
            {paintOption && (
              <div>
                <strong>Paint Option:</strong> {paintOption}
              </div>
            )}
            {getSwivelStudsText() && (
              <div>
                <strong>Swivel Studs:</strong>{' '}
                <span style={{ color: '#FF6600' }}>{getSwivelStudsText()}</span>
              </div>
            )}
            {getTextureText() && (
              <div>
                <strong>Texture:</strong>{' '}
                <span style={{ color: '#9933CC' }}>{getTextureText()}</span>
              </div>
            )}
            <div>
              <strong>Label Type:</strong>{' '}
              {labelType === 'basic' ? 'Basic' : 'Detailed'}
            </div>
            <div>
              <strong>Copies:</strong> {copies}
            </div>
          </div>

          {/* Print Button */}
          <Button onClick={handlePrintLabels} className="w-full">
            <Printer className="h-4 w-4 mr-2" />
            Print {copies} Avery Labels (8162)
          </Button>

          <div className="text-xs text-gray-600 mt-2">
            <p>
              <strong>Compatible with:</strong> Avery 8162 labels (4" x 1⅓",
              14 labels per sheet)
            </p>
            <p>
              <strong>Note:</strong> Ensure your printer is set to actual size
              (100% scale) for proper alignment
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
