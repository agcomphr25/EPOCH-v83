import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Printer } from 'lucide-react';
import { generateBadgePrintHtml } from '@/lib/badgePrintHtml';

type Props = {
  badgeScanCode: string;
  employeeName: string;
};

export default function EmployeeBadgeBarcode({ badgeScanCode, employeeName }: Props) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current && badgeScanCode) {
      try {
        const barcodeValue = badgeScanCode.replace(/-/g, '');
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: 'CODE128',
          width: 1.2,
          height: 50,
          displayValue: false,
          fontSize: 12,
          margin: 5,
        });
      } catch (error) {
        console.error('Error generating barcode:', error);
      }
    }
  }, [badgeScanCode]);

  const handleDownload = () => {
    if (!barcodeRef.current) return;

    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `badge-${employeeName.replace(/\s+/g, '_')}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(generateBadgePrintHtml(employeeName, barcodeRef.current?.outerHTML || ''));

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!badgeScanCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Employee Badge Barcode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center p-8 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm font-medium text-yellow-800 text-center">
              No Badge Scan Code Assigned
            </p>
            <p className="text-xs text-yellow-700 mt-2 text-center">
              A badge scan code will be automatically generated when the employee record is saved.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Employee Badge Barcode</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center justify-center p-3 bg-white rounded border">
          <p className="text-sm font-medium mb-2">{employeeName}</p>
          <svg ref={barcodeRef} data-testid="employee-barcode"></svg>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDownload}
            data-testid="button-download-badge"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePrint}
            data-testid="button-print-badge"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Scan this barcode on the Badge Scanner page to quickly execute your configured action.
        </p>
      </CardContent>
    </Card>
  );
}
