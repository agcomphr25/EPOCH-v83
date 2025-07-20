import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, Package } from 'lucide-react';

interface BarcodeDisplayProps {
  orderId: string;
  barcode: string;
  showTitle?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function BarcodeDisplay({ orderId, barcode, showTitle = true, size = 'medium' }: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
          lineColor: "#000000",
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
        
        printWindow.document.write(`
          <html>
            <head>
              <title>Barcode - ${orderId}</title>
              <style>
                body {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  margin: 20px;
                  font-family: monospace;
                }
                .barcode-container {
                  text-align: center;
                  page-break-inside: avoid;
                }
                .order-info {
                  margin-bottom: 10px;
                  font-size: 14px;
                  font-weight: bold;
                }
                img {
                  max-width: 100%;
                  height: auto;
                }
                @media print {
                  body { margin: 0; }
                }
              </style>
            </head>
            <body>
              <div class="barcode-container">
                <div class="order-info">Order: ${orderId}</div>
                <img src="${img}" alt="Barcode for ${orderId}" />
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
        }, 250);
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
              Print
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}