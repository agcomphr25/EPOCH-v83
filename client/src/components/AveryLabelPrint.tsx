import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  labelType?: 'basic' | 'detailed';
  copies?: number;
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
  labelType = 'detailed',
  copies = 6
}: AveryLabelPrintProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [barcodeGenerated, setBarcodeGenerated] = useState(false);

  useEffect(() => {
    if (canvasRef.current && barcode) {
      try {
        JsBarcode(canvasRef.current, barcode, {
          format: "CODE39",
          width: 2,
          height: 40,
          displayValue: false, // Hide text to save space on label
          fontSize: 10,
          textAlign: "center",
          textPosition: "bottom",
          textMargin: 2,
          fontOptions: "",
          font: "monospace",
          background: "#ffffff",
          lineColor: "#000000",
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
      year: '2-digit'
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
          year: '2-digit'
        });

        const generateLabelContent = (index: number) => {
          // Format: "SA CF Chalkbranch" (Action Length + Stock Model)
          const actionLengthModel = actionLength && stockModel ?
            `${actionLength} ${stockModel}` :
            (actionLength || stockModel || orderId);

          return `
            <div class="avery-label">
              <div class="label-content">
                <div class="line1">${orderId}</div>
                ${customerName ? `<div class="line2">${customerName}</div>` : ''}
                ${stockModel || color ? `<div class="line3">${stockModel || ''}${stockModel && color ? ' - ' : ''}${color || ''}</div>` : ''}
                ${dueDate ? `<div class="line4">Due: ${formatDate(dueDate)}</div>` : ''}
                <div class="line5">
                  <canvas id="barcode-${index}" width="180" height="25"></canvas>
                </div>
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

                /* Avery 5160 Label Dimensions: 2.625" x 1" (30 labels per sheet) */
                .avery-label {
                  width: 2.625in;
                  height: 1in;
                  border: 1px solid #ddd;
                  margin: 0;
                  padding: 0.03in;
                  display: inline-block;
                  vertical-align: top;
                  box-sizing: border-box;
                  page-break-inside: avoid;
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
                  font-size: 8pt;
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
                  font-size: 6pt;
                  color: #000;
                  margin: 1px 0;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  white-space: nowrap;
                  text-align: center;
                }

                /* Line 3: Stock Model + Color */
                .line3 {
                  font-size: 5.5pt;
                  font-weight: bold;
                  color: #000;
                  margin: 1px 0;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  white-space: nowrap;
                  text-align: center;
                }

                /* Line 4: Due Date */
                .line4 {
                  font-size: 6pt;
                  font-weight: bold;
                  color: #000;
                  margin-top: 1px;
                  text-align: center;
                }

                /* Line 5: Barcode */
                .line5 {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  margin: 2px 0;
                  min-height: 0.3in;
                }

                .barcode-img {
                  max-width: 100%;
                  max-height: 0.3in;
                  height: auto;
                  display: block;
                }

                @media print {
                  body { margin: 0; }
                  .avery-label {
                    border: none;
                    margin: 0;
                    width: 2.625in;
                    height: 1in;
                  }

                  /* Ensure exact positioning for Avery 5160 */
                  @page {
                    size: 8.5in 11in;
                    margin: 0.5in 0.1875in 0.5in 0.1875in;
                  }
                  
                  /* Fine-tuning adjustments - uncomment if needed */
                  /*
                  @page {
                    margin: 0.48in 0.16in 0.48in 0.16in;
                  }
                  */
                }

                .labels-container {
                  display: flex;
                  flex-wrap: wrap;
                  justify-content: flex-start;
                  width: 8.5in;
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
                ${Array(copies).fill().map((_, i) => `
                  ${generateLabelContent(i)}
                `).join('')}
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();

        // After writing content, generate barcodes in the print window
        setTimeout(() => {
          for (let i = 0; i < copies; i++) {
            const canvas = printWindow.document.getElementById(`barcode-${i}`) as HTMLCanvasElement;
            if (canvas && barcode) {
              try {
                JsBarcode(canvas, barcode, {
                  format: "CODE39",
                  width: 1.5, // Adjusted for smaller canvas
                  height: 25,
                  displayValue: false,
                  margin: 2,
                });
              } catch (error) {
                console.error(`Error generating barcode for label ${i}:`, error);
              }
            }
          }
          printWindow.print();
          printWindow.close();
        }, 500);
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
              style={{ width: '2.625in', height: '1in', fontSize: '8px', lineHeight: '1.1' }}
            >
              <div className="font-bold text-xs">
                {orderId}
              </div>
              {customerName && (
                <div className="text-xs">{customerName}</div>
              )}
              {stockModel || color ? (
                <div className="text-xs font-bold" style={{ fontSize: '7px' }} title={`${stockModel || ''}${stockModel && color ? ' - ' : ''}${color || ''}`}>
                  {`${stockModel || ''}${(stockModel && color) ? ' - ' : ''}${color || ''}`}
                </div>
              ) : ''}
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
                  <div style={{ height: '0.3in' }} className="flex items-center">
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
            {color && (
              <div>
                <strong>Color:</strong> {color}
              </div>
            )}
            <div>
              <strong>Label Type:</strong> {labelType === 'basic' ? 'Basic' : 'Detailed'}
            </div>
            <div>
              <strong>Copies:</strong> {copies}
            </div>
          </div>

          {/* Print Button */}
          <Button
            onClick={handlePrintLabels}
            className="w-full"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print {copies} Avery Labels (5160)
          </Button>

          <div className="text-xs text-gray-600 mt-2">
            <p><strong>Compatible with:</strong> Avery 5160 labels (2.625" x 1", 30 labels per sheet)</p>
            <p><strong>Note:</strong> Ensure your printer is set to actual size (100% scale) for proper alignment</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}