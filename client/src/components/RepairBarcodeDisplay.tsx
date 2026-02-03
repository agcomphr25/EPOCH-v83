import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Download, Printer, Wrench } from 'lucide-react';

interface RepairBarcodeDisplayProps {
  rmaNumber: string;
  orderId?: string;
  serialNumber?: string;
  repairDepartment?: string;
  customerName?: string;
  stockModel?: string;
  size?: 'small' | 'medium' | 'large';
  showTriggerButton?: boolean;
}

export function RepairBarcodeDisplay({
  rmaNumber,
  orderId,
  serialNumber,
  repairDepartment,
  customerName,
  stockModel,
  size = 'medium',
  showTriggerButton = true,
}: RepairBarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [barcodeRendered, setBarcodeRendered] = useState(false);

  const barcodeValue = rmaNumber || orderId || serialNumber || '';

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
    if (!barcodeValue || !isOpen) {
      setBarcodeRendered(false);
      return;
    }
    
    // Small delay to ensure SVG is in DOM after dialog animation
    const timer = setTimeout(() => {
      if (svgRef.current) {
        const config = getSizeConfig();
        const format = getBarcodeFormat(barcodeValue);
        
        console.log('Generating repair barcode (SVG):', { barcodeValue, format });

        try {
          JsBarcode(svgRef.current, barcodeValue, {
            format: format,
            width: format === 'CODE128' ? config.width * 0.8 : config.width,
            height: config.height,
            displayValue: true,
            fontSize: config.fontSize,
            textAlign: 'center',
            textPosition: 'bottom',
            textMargin: 2,
            fontOptions: 'bold',
            font: 'monospace',
            background: '#ffffff',
            lineColor: '#DC2626',
            margin: 10,
          });
          setBarcodeRendered(true);
          console.log('Barcode SVG generated successfully');
        } catch (error) {
          console.error('Error generating repair barcode:', error);
          setBarcodeRendered(false);
        }
      } else {
        console.error('SVG ref not available');
      }
    }, 150);
    
    return () => clearTimeout(timer);
  }, [barcodeValue, size, isOpen]);

  const handleDownload = () => {
    if (svgRef.current && barcodeRendered) {
      const svgData = new XMLSerializer().serializeToString(svgRef.current);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const link = document.createElement('a');
      link.download = `repair-barcode-${barcodeValue}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    if (!svgRef.current || !barcodeRendered) {
      console.error('Barcode not rendered yet');
      return;
    }
    
    // Get SVG content as string
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Repair Tracking Label - ${barcodeValue}</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
              }

              .repair-label {
                width: 2.625in;
                height: 1in;
                border: 2px solid #DC2626;
                margin: 0;
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

              .repair-header {
                font-size: 7pt;
                font-weight: bold;
                color: #DC2626;
                margin-bottom: 1px;
                text-transform: uppercase;
              }

              .barcode-container {
                display: flex;
                justify-content: center;
                align-items: center;
              }

              .barcode-container svg {
                max-width: 100%;
                max-height: 0.5in;
                height: auto;
              }

              .repair-details {
                font-size: 6pt;
                line-height: 1.1;
                color: #333;
              }

              .repair-dept {
                font-size: 6pt;
                font-weight: bold;
                color: #DC2626;
                background: #FEE2E2;
                padding: 1px 3px;
                margin-top: 1px;
              }

              @media print {
                body { margin: 0; }
                .repair-label { margin: 0; }
              }

              .labels-container {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-start;
              }
            </style>
          </head>
          <body>
            <div class="labels-container">
              <div class="repair-label">
                <div class="label-content">
                  <div class="repair-header">NONCONFORMING - REPAIR</div>
                  <div class="barcode-container">${svgData}</div>
                  <div class="repair-details">
                    ${rmaNumber ? `<strong>RMA:</strong> ${rmaNumber}` : ''}
                    ${orderId && orderId !== rmaNumber ? ` | <strong>Order:</strong> ${orderId}` : ''}
                  </div>
                  ${repairDepartment ? `<div class="repair-dept">${repairDepartment}</div>` : ''}
                </div>
              </div>
            </div>
            <script>
              setTimeout(function() { window.print(); window.close(); }, 200);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
    }
  };

  if (!barcodeValue) {
    return null;
  }

  const dialogContent = (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-red-600">
          <Wrench className="h-5 w-5" />
          Repair Tracking Barcode
        </DialogTitle>
      </DialogHeader>
      <div className="flex flex-col items-center space-y-4 py-4">
        <div className="bg-white p-4 rounded border-2 border-red-200 min-w-[200px] min-h-[80px] flex items-center justify-center">
          <svg ref={svgRef} />
        </div>

        <div className="text-center text-sm">
          <p className="font-mono text-red-600 font-bold">{barcodeValue}</p>
          {rmaNumber && <p className="text-gray-600">RMA: {rmaNumber}</p>}
          {orderId && orderId !== rmaNumber && <p className="text-gray-600">Order: {orderId}</p>}
          {repairDepartment && (
            <p className="mt-1 px-2 py-1 bg-red-100 text-red-700 rounded font-medium">
              {repairDepartment}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button 
            size="sm" 
            onClick={handlePrint}
            className="bg-red-600 hover:bg-red-700"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Labels
          </Button>
        </div>
        
        <p className="text-xs text-gray-500 text-center">
          Red barcodes are used to track items through the repair process
        </p>
      </div>
    </DialogContent>
  );

  if (showTriggerButton) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Wrench className="h-4 w-4 mr-2" />
            Print Repair Barcode
          </Button>
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {dialogContent}
    </Dialog>
  );
}
