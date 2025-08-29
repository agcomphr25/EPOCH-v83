import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Printer, Package, Tag } from 'lucide-react';
import { AveryLabelPrint } from './AveryLabelPrint';

interface BarcodeDisplayProps {
  orderId: string;
  barcode: string;
  showTitle?: boolean;
  size?: 'small' | 'medium' | 'large';
  customerName?: string;
  orderDate?: string;
  dueDate?: string;
  status?: string;
  actionLength?: string;
  stockModel?: string;
  paintOption?: string;
  color?: string;
  features?: any; // Order features object
  modelId?: string; // Stock model ID
  isHighPriority?: boolean; // High priority flag
  isLate?: boolean; // Late order flag
}

export function BarcodeDisplay({ orderId, barcode, showTitle = true, size = 'medium', customerName, orderDate, dueDate, status, actionLength, stockModel, paintOption, color, features, modelId, isHighPriority, isLate }: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showAveryDialog, setShowAveryDialog] = useState(false);

  // Color coding logic
  const getBarcodeColor = () => {
    // Red for high priority or late orders
    if (isHighPriority || isLate) {
      return '#FF0000'; // Red
    }
    
    // Blue for painted stock (terraine, premium, standard, rattlesnake rogue, fg* models)
    const paintedOptions = ['terraine', 'premium', 'standard', 'rattlesnake_rogue'];
    const isPaintedOption = paintedOptions.some(option => 
      paintOption?.toLowerCase().includes(option)
    );
    const isFiberglassModel = modelId?.toLowerCase().startsWith('fg');
    
    if (isPaintedOption || isFiberglassModel) {
      return '#0066FF'; // Blue
    }
    
    return '#000000'; // Black (default)
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return { width: 1.5, height: 40, fontSize: 12 };
      case 'large':
        return { width: 3, height: 80, fontSize: 16 };
      default:
        return { width: 2, height: 60, fontSize: 14 };
    }
  };

  useEffect(() => {
    if (canvasRef.current && barcode) {
      const config = getSizeConfig();

      try {
        JsBarcode(canvasRef.current, barcode, {
          format: "CODE39",
          width: config.width,
          height: config.height,
          displayValue: true,
          fontSize: config.fontSize,
          textAlign: "center",
          textPosition: "bottom",
          textMargin: 2,
          fontOptions: "",
          font: "monospace",
          background: "#ffffff",
          lineColor: getBarcodeColor(),
          margin: 10,
          marginTop: undefined,
          marginBottom: undefined,
          marginLeft: undefined,
          marginRight: undefined,
        });
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [barcode, size]);

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `barcode-${orderId}.png`;
      link.href = canvasRef.current.toDataURL();
      link.click();
    }
  };

  const handlePrint = () => {
    if (canvasRef.current) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const canvas = canvasRef.current;
        const img = canvas.toDataURL();
        const currentDate = new Date().toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        });

        printWindow.document.write(`
          <html>
            <head>
              <title>Barcode Label - ${orderId}</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  font-family: Arial, sans-serif;
                }

                /* Avery 5160 Label Dimensions: 2.625" x 1" */
                .avery-label {
                  width: 2.625in;
                  height: 1in;
                  border: 1px solid #ccc;
                  margin: 0.125in;
                  padding: 0.05in;
                  display: inline-block;
                  vertical-align: top;
                  box-sizing: border-box;
                  page-break-inside: avoid;
                  background: white;
                }

                .label-content {
                  height: 100%;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                  text-align: center;
                }

                .order-header {
                  font-size: 8pt;
                  font-weight: bold;
                  margin-bottom: 2px;
                  color: #333;
                }

                .barcode-img {
                  max-width: 100%;
                  max-height: 0.5in;
                  height: auto;
                  margin: 2px 0;
                }

                .order-details {
                  font-size: 6pt;
                  line-height: 1.1;
                  color: #666;
                }

                .date-info {
                  font-size: 5pt;
                  color: #888;
                  margin-top: 1px;
                }

                @media print {
                  body { margin: 0; }
                  .avery-label { border: none; margin: 0; }
                }

                /* Multiple labels layout */
                .labels-container {
                  display: flex;
                  flex-wrap: wrap;
                  justify-content: flex-start;
                }
              </style>
            </head>
            <body>
              <div class="labels-container">
                <!-- Print 6 copies for easy use -->
                ${Array(6).fill().map((_, i) => `
                  <div class="avery-label">
                    <div class="label-content">
                      <div class="order-header">P1 ORDER</div>
                      <img src="${img}" alt="Barcode ${orderId}" class="barcode-img" />
                      <div class="order-details">
                        <div>${orderId}</div>
                        <div class="date-info">Printed: ${currentDate}</div>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();

        // Small delay to ensure content loads before printing
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }
    }
  };

  if (!barcode) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <Package className="h-8 w-8 mx-auto mb-2" />
            <p>No barcode available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showTitle && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Order Barcode - {orderId}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <div className="flex flex-col items-center space-y-4">
          <div className="bg-white p-4 rounded border">
            <canvas ref={canvasRef} />
          </div>

          <div className="text-center text-sm text-gray-600">
            <p className="font-mono">{barcode}</p>
            <p className="mt-1">CODE39 Format</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Quick Print
            </Button>
            <Dialog open={showAveryDialog} onOpenChange={setShowAveryDialog}>
              <DialogTrigger asChild>
                <Button variant="default" size="sm">
                  <Tag className="h-4 w-4 mr-2" />
                  Avery Labels
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Print Avery Labels</DialogTitle>
                </DialogHeader>
                <AveryLabelPrint 
                  orderId={orderId}
                  barcode={barcode}
                  customerName={customerName}
                  orderDate={orderDate}
                  dueDate={dueDate}
                  status={status}
                  actionLength={actionLength}
                  stockModel={stockModel}
                  paintOption={paintOption}
                  color={color}
                  features={features}
                  modelId={modelId}
                  isHighPriority={isHighPriority}
                  isLate={isLate}
                  labelType="detailed"
                  copies={6}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}