import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode, Printer, Save, Calendar } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

interface P2ReceivingData {
  itemCode: string;
  quantity: number;
  receivingDate: string;
  manufactureDate: string;
  expirationDate: string;
  batchNumber: string;
  lotNumber: string;
  aluminumHeatNumber: string;
  barcode: string;
}

interface P2ReceivingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: any;
}

// Generate a Code 39 compatible barcode (using valid characters only)
function generateBarcode(): string {
  // Code 39 valid characters: 0-9, A-Z, space, and symbols - . $ / + %
  // For simplicity, we'll use alphanumeric only for P2 products
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  
  // Create a shorter 10-character barcode with timestamp + random + P2 prefix
  let result = "P2" + timestamp + random;
  
  // Pad or trim to exactly 10 characters for consistent length
  result = result.substr(0, 10).padEnd(10, '0');
  
  return result;
}

// Format barcode for display with dashes every 4 characters
function formatBarcodeDisplay(barcode: string): string {
  return barcode.match(/.{1,4}/g)?.join("-") || barcode;
}

export default function P2ReceivingDialog({ open, onOpenChange, item }: P2ReceivingDialogProps) {
  const [formData, setFormData] = useState<P2ReceivingData>({
    itemCode: item?.agPartNumber || '',
    quantity: 1,
    receivingDate: new Date().toISOString().split('T')[0],
    manufactureDate: '',
    expirationDate: '',
    batchNumber: '',
    lotNumber: '',
    aluminumHeatNumber: '',
    barcode: generateBarcode()
  });

  // Update item code when item changes
  useEffect(() => {
    if (item?.agPartNumber) {
      setFormData(prev => ({
        ...prev,
        itemCode: item.agPartNumber
      }));
    }
  }, [item]);

  const queryClient = useQueryClient();

  const createScanMutation = useMutation({
    mutationFn: async (data: P2ReceivingData) => {
      const response = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create scan record');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/scans'] });
      toast.success('P2 receiving record created successfully');
      handleClose();
    },
    onError: () => {
      toast.error('Failed to create receiving record');
    }
  });

  const handleSave = () => {
    if (!formData.manufactureDate || !formData.expirationDate || !formData.batchNumber || 
        !formData.lotNumber || !formData.aluminumHeatNumber) {
      toast.error('Please fill in all required fields');
      return;
    }

    createScanMutation.mutate(formData);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form data
    setFormData({
      itemCode: item?.agPartNumber || '',
      quantity: 1,
      receivingDate: new Date().toISOString().split('T')[0],
      manufactureDate: '',
      expirationDate: '',
      batchNumber: '',
      lotNumber: '',
      aluminumHeatNumber: '',
      barcode: generateBarcode()
    });
  };

  const handlePrintBarcode = () => {
    // Generate print window with multiple copies
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const barcodeDisplay = formatBarcodeDisplay(formData.barcode);
      
      printWindow.document.write(`
        <html>
          <head>
            <title>P2 Product Barcode - ${formData.itemCode}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+39:wght@400&display=swap');
              
              body { font-family: Arial, sans-serif; margin: 5px; }
              .barcode-label { 
                border: 1px solid #000; 
                padding: 2px; 
                margin: 2px 0; 
                width: 2.625in; 
                height: 1in;
                text-align: center;
                page-break-inside: avoid;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-sizing: border-box;
              }
              .barcode { 
                font-family: 'Libre Barcode 39', 'Courier New', monospace; 
                font-size: 18px; 
                font-weight: normal; 
                letter-spacing: 0px; 
                margin: 1px 0;
                line-height: 1;
                white-space: nowrap;
                overflow: hidden;
              }
              .part-info { font-size: 8px; margin: 1px 0; font-weight: bold; line-height: 1.1; }
              .expiration { font-size: 6px; margin: 1px 0; color: #333; line-height: 1; }
              @media print {
                body { margin: 0; }
                .barcode-label { margin: 5px; }
              }
            </style>
          </head>
          <body>
            ${Array.from({ length: 5 }, (_, i) => `
              <div class="barcode-label">
                <div class="part-info">${formData.itemCode} ${item?.name || 'P2 Product'}</div>
                <div class="barcode">*${formData.barcode}*</div>
                <div class="expiration">Expiration Date: ${formData.expirationDate}</div>
              </div>
            `).join('')}
            <script>
              // Auto-print when page loads
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 500);
              }
            </script>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.focus();
    }
  };

  const regenerateBarcode = () => {
    setFormData(prev => ({ ...prev, barcode: generateBarcode() }));
    toast.success('New barcode generated');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            P2 Product Receiving - {item?.agPartNumber}
          </DialogTitle>
          <DialogDescription>
            Enter detailed information for P2 product receiving and barcode generation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Barcode Generation Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generated Scannable Barcode</CardTitle>
              <CardDescription>Code 39 compatible barcode for P2 product tracking - readable by barcode scanners</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-center">
                    <div className="font-mono text-2xl bg-gray-100 dark:bg-gray-800 p-4 rounded border mb-2" style={{fontFamily: "'Libre Barcode 39', 'Courier New', monospace"}}>
                      *{formData.barcode}*
                    </div>
                    <div className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {formatBarcodeDisplay(formData.barcode)}
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      ✓ Scanner Compatible
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={regenerateBarcode} variant="outline" size="sm">
                    <QrCode className="h-4 w-4 mr-1" />
                    New Code
                  </Button>
                  <Button onClick={handlePrintBarcode} variant="outline" size="sm">
                    <Printer className="h-4 w-4 mr-1" />
                    Print (5x)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="itemCode">Item Code (Auto-filled)</Label>
              <Input
                id="itemCode"
                value={formData.itemCode}
                readOnly
                className="bg-gray-50 dark:bg-gray-800"
                placeholder="AG Part Number"
              />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                min="1"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="receivingDate">
                <Calendar className="h-4 w-4 inline mr-1" />
                Receiving Date *
              </Label>
              <Input
                id="receivingDate"
                type="date"
                value={formData.receivingDate}
                onChange={(e) => setFormData(prev => ({ ...prev, receivingDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="manufactureDate">Manufacturing Date *</Label>
              <Input
                id="manufactureDate"
                type="date"
                value={formData.manufactureDate}
                onChange={(e) => setFormData(prev => ({ ...prev, manufactureDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="expirationDate">Expiration Date *</Label>
              <Input
                id="expirationDate"
                type="date"
                value={formData.expirationDate}
                onChange={(e) => setFormData(prev => ({ ...prev, expirationDate: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Batch and Lot Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="batchNumber">Batch Number *</Label>
              <Input
                id="batchNumber"
                value={formData.batchNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, batchNumber: e.target.value }))}
                placeholder="Enter batch number"
                required
              />
            </div>
            <div>
              <Label htmlFor="lotNumber">Lot Number *</Label>
              <Input
                id="lotNumber"
                value={formData.lotNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, lotNumber: e.target.value }))}
                placeholder="Enter lot number"
                required
              />
            </div>
          </div>

          {/* Aluminum Heat Number */}
          <div>
            <Label htmlFor="aluminumHeatNumber">Aluminum Heat Number *</Label>
            <Input
              id="aluminumHeatNumber"
              value={formData.aluminumHeatNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, aluminumHeatNumber: e.target.value }))}
              placeholder="Enter aluminum heat number"
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={createScanMutation.isPending}
            className="ml-2"
          >
            <Save className="h-4 w-4 mr-2" />
            {createScanMutation.isPending ? 'Saving...' : 'Save P2 Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}