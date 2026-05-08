import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import JsBarcode from 'jsbarcode';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  Plus,
  Check,
  Printer,
  Loader2,
  Save,
  Tag,
  AlertCircle,
  Thermometer,
  Clock,
  Calendar,
  Warehouse,
  FileText,
} from 'lucide-react';

interface MaterialLot {
  id: string;
  internalControlNumber: string;
  materialPartNumber: string;
  materialName: string;
  supplier: string;
  supplierLotNumber?: string;
  supplierPartNumber?: string;
  purchaseOrderNumber?: string;
  receivingRecordNumber?: string;
  receivedQty: string;
  remainingQty: string;
  unitOfMeasure: string;
  expirationDate?: string;
  cureDate?: string;
  manufactureDate?: string;
  storageLocation?: string;
  storageRequirements?: string;
  status: string;
  maxOutTimeMinutes?: number;
  receivedBy?: string;
  receivedAt?: string;
}

interface FormData {
  inventoryItemId: string;
  materialPartNumber: string;
  materialName: string;
  supplier: string;
  supplierLotNumber: string;
  supplierPartNumber: string;
  purchaseOrderNumber: string;
  receivingRecordNumber: string;
  receivedQty: string;
  unitOfMeasure: string;
  expirationDate: string;
  cureDate: string;
  manufactureDate: string;
  storageLocation: string;
  storageRequirements: string;
  maxOutTimeMinutes: string;
  notes: string;
}

const initialFormData: FormData = {
  inventoryItemId: '',
  materialPartNumber: '',
  materialName: '',
  supplier: '',
  supplierLotNumber: '',
  supplierPartNumber: '',
  purchaseOrderNumber: '',
  receivingRecordNumber: '',
  receivedQty: '',
  unitOfMeasure: 'EA',
  expirationDate: '',
  cureDate: '',
  manufactureDate: '',
  storageLocation: '',
  storageRequirements: '',
  maxOutTimeMinutes: '',
  notes: '',
};

const UNIT_OPTIONS = [
  { value: 'EA', label: 'Each' },
  { value: 'LB', label: 'Pounds' },
  { value: 'KG', label: 'Kilograms' },
  { value: 'FT', label: 'Feet' },
  { value: 'M', label: 'Meters' },
  { value: 'SQ FT', label: 'Square Feet' },
  { value: 'SQ M', label: 'Square Meters' },
  { value: 'GAL', label: 'Gallons' },
  { value: 'L', label: 'Liters' },
  { value: 'ROLL', label: 'Roll' },
  { value: 'SHEET', label: 'Sheet' },
];

interface InventoryItemPreview {
  id: number;
  agPartNumber: string;
  name: string;
  shelfLifeControlled?: boolean;
  frozenShelfLifeDays?: number | null;
  roomTempShelfLifeDays?: number | null;
  defaultMaxOutTimeMinutes?: number | null;
}

export default function MaterialReceivingPage() {
  const [formData, setFormData] = useState<FormData>(initialFormData);

  // Lookup inventory item by AG part number to pre-fill shelf-life policy
  // defaults when the user enters a known part. (Task #165)
  const { data: allInventoryItems = [] } = useQuery<InventoryItemPreview[]>({
    queryKey: ['/api/inventory/items'],
  });

  useEffect(() => {
    if (!formData.materialPartNumber.trim()) return;
    const match = allInventoryItems.find(
      (it) => it.agPartNumber?.toLowerCase() === formData.materialPartNumber.trim().toLowerCase()
    );
    if (!match) return;
    setFormData((prev) => {
      const next = { ...prev };
      if (!prev.inventoryItemId) next.inventoryItemId = String(match.id);
      if (!prev.materialName && match.name) next.materialName = match.name;
      if (!prev.maxOutTimeMinutes && match.defaultMaxOutTimeMinutes != null) {
        next.maxOutTimeMinutes = String(match.defaultMaxOutTimeMinutes);
      }
      if (match.shelfLifeControlled && !prev.expirationDate) {
        const days = match.frozenShelfLifeDays ?? match.roomTempShelfLifeDays;
        if (days != null && days > 0) {
          const base = prev.manufactureDate ? new Date(prev.manufactureDate) : new Date();
          base.setDate(base.getDate() + days);
          next.expirationDate = base.toISOString().split('T')[0];
        }
      }
      return next;
    });
  }, [formData.materialPartNumber, formData.manufactureDate, allInventoryItems]);

  const [recentlyReceived, setRecentlyReceived] = useState<MaterialLot[]>([]);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedForPrint, setSelectedForPrint] = useState<MaterialLot | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const receiveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        inventoryItemId: data.inventoryItemId || undefined,
        materialPartNumber: data.materialPartNumber,
        materialName: data.materialName,
        supplier: data.supplier,
        supplierLotNumber: data.supplierLotNumber || undefined,
        supplierPartNumber: data.supplierPartNumber || undefined,
        purchaseOrderNumber: data.purchaseOrderNumber || undefined,
        receivingRecordNumber: data.receivingRecordNumber || undefined,
        receivedQty: data.receivedQty,
        remainingQty: data.receivedQty,
        unitOfMeasure: data.unitOfMeasure,
        expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
        cureDate: data.cureDate ? new Date(data.cureDate) : undefined,
        manufactureDate: data.manufactureDate ? new Date(data.manufactureDate) : undefined,
        storageLocation: data.storageLocation || undefined,
        storageRequirements: data.storageRequirements || undefined,
        maxOutTimeMinutes: data.maxOutTimeMinutes ? parseInt(data.maxOutTimeMinutes) : undefined,
        status: 'RECEIVED' as const,
        receivedBy: 'Current User',
      };
      return apiRequest('/api/material-lots', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (newLot: MaterialLot) => {
      toast.success(`Material received with ICN: ${newLot.internalControlNumber}`);
      setRecentlyReceived((prev) => [newLot, ...prev.slice(0, 9)]);
      setFormData(initialFormData);
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      setSelectedForPrint(newLot);
      setPrintDialogOpen(true);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to receive material');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.materialPartNumber || !formData.materialName || !formData.receivedQty || !formData.supplier) {
      toast.error('Please fill in required fields: Part Number, Name, Supplier, and Quantity');
      return;
    }
    receiveMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateLabel = (lot: MaterialLot): string => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, lot.internalControlNumber, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 12,
    });
    return canvas.toDataURL('image/png');
  };

  const printLabel = (lot: MaterialLot) => {
    const barcodeDataUrl = generateLabel(lot);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print labels');
      return;
    }

    const labelHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Material Label - ${lot.internalControlNumber}</title>
        <style>
          @page { size: 4in 2in; margin: 0.1in; }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 8px;
            font-size: 10px;
          }
          .label-container {
            border: 1px solid #000;
            padding: 8px;
            max-width: 3.8in;
          }
          .icn-header {
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            border-bottom: 1px solid #000;
            padding-bottom: 4px;
            margin-bottom: 4px;
          }
          .barcode-container {
            text-align: center;
            margin: 8px 0;
          }
          .barcode-container img {
            max-width: 100%;
            height: auto;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2px 8px;
          }
          .info-row {
            display: flex;
            gap: 4px;
          }
          .info-label {
            font-weight: bold;
            min-width: 60px;
          }
          .info-value {
            flex: 1;
          }
          .full-width {
            grid-column: 1 / -1;
          }
          .expiration {
            background-color: #fff3cd;
            padding: 2px 4px;
            border-radius: 2px;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="icn-header">${lot.internalControlNumber}</div>
          <div class="barcode-container">
            <img src="${barcodeDataUrl}" alt="Barcode" />
          </div>
          <div class="info-grid">
            <div class="info-row full-width">
              <span class="info-label">Part #:</span>
              <span class="info-value">${lot.materialPartNumber}</span>
            </div>
            <div class="info-row full-width">
              <span class="info-label">Name:</span>
              <span class="info-value">${lot.materialName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Supplier:</span>
              <span class="info-value">${lot.supplier}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Lot #:</span>
              <span class="info-value">${lot.supplierLotNumber || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Qty:</span>
              <span class="info-value">${lot.receivedQty} ${lot.unitOfMeasure}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Location:</span>
              <span class="info-value">${lot.storageLocation || 'TBD'}</span>
            </div>
            ${lot.expirationDate ? `
            <div class="info-row full-width expiration">
              <span class="info-label">Expires:</span>
              <span class="info-value">${format(new Date(lot.expirationDate), 'MM/dd/yyyy')}</span>
            </div>
            ` : ''}
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(labelHtml);
    printWindow.document.close();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      RECEIVED: { variant: 'secondary', label: 'Received' },
      QUARANTINE: { variant: 'outline', label: 'Quarantine' },
      ACCEPTED: { variant: 'default', label: 'Accepted' },
      ISSUED: { variant: 'default', label: 'Issued' },
      REJECTED: { variant: 'destructive', label: 'Rejected' },
      EXPIRED: { variant: 'destructive', label: 'Expired' },
      CONSUMED: { variant: 'secondary', label: 'Consumed' },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8" />
            Material Receiving
          </h1>
          <p className="text-muted-foreground">
            Receive materials and generate Internal Control Numbers (ICN) for AS9100 traceability
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Receive New Material
            </CardTitle>
            <CardDescription>
              Enter material details to generate an ICN and create a traceable lot record
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="materialPartNumber">
                    Material Part Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="materialPartNumber"
                    data-testid="input-material-part-number"
                    value={formData.materialPartNumber}
                    onChange={(e) => handleInputChange('materialPartNumber', e.target.value)}
                    placeholder="e.g., CF-3K-T700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="materialName">
                    Material Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="materialName"
                    data-testid="input-material-name"
                    value={formData.materialName}
                    onChange={(e) => handleInputChange('materialName', e.target.value)}
                    placeholder="e.g., Carbon Fiber 3K Weave"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier">
                    Supplier <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="supplier"
                    data-testid="input-supplier"
                    value={formData.supplier}
                    onChange={(e) => handleInputChange('supplier', e.target.value)}
                    placeholder="e.g., Toray Industries"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierLotNumber">Supplier Lot Number</Label>
                  <Input
                    id="supplierLotNumber"
                    data-testid="input-supplier-lot-number"
                    value={formData.supplierLotNumber}
                    onChange={(e) => handleInputChange('supplierLotNumber', e.target.value)}
                    placeholder="e.g., TY-2024-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierPartNumber">Supplier Part Number</Label>
                  <Input
                    id="supplierPartNumber"
                    data-testid="input-supplier-part-number"
                    value={formData.supplierPartNumber}
                    onChange={(e) => handleInputChange('supplierPartNumber', e.target.value)}
                    placeholder="e.g., T700SC-12K"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchaseOrderNumber">Purchase Order #</Label>
                  <Input
                    id="purchaseOrderNumber"
                    data-testid="input-po-number"
                    value={formData.purchaseOrderNumber}
                    onChange={(e) => handleInputChange('purchaseOrderNumber', e.target.value)}
                    placeholder="e.g., PO-2024-0123"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receivedQty">
                    Quantity Received <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="receivedQty"
                    data-testid="input-received-qty"
                    type="number"
                    step="0.001"
                    value={formData.receivedQty}
                    onChange={(e) => handleInputChange('receivedQty', e.target.value)}
                    placeholder="e.g., 100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                  <Select
                    value={formData.unitOfMeasure}
                    onValueChange={(value) => handleInputChange('unitOfMeasure', value)}
                  >
                    <SelectTrigger data-testid="select-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date Tracking
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manufactureDate">Manufacture Date</Label>
                    <Input
                      id="manufactureDate"
                      data-testid="input-manufacture-date"
                      type="date"
                      value={formData.manufactureDate}
                      onChange={(e) => handleInputChange('manufactureDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cureDate">Cure Date</Label>
                    <Input
                      id="cureDate"
                      data-testid="input-cure-date"
                      type="date"
                      value={formData.cureDate}
                      onChange={(e) => handleInputChange('cureDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expirationDate" className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                      Expiration Date
                    </Label>
                    <Input
                      id="expirationDate"
                      data-testid="input-expiration-date"
                      type="date"
                      value={formData.expirationDate}
                      onChange={(e) => handleInputChange('expirationDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Warehouse className="h-4 w-4" />
                  Storage Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="storageLocation">Storage Location</Label>
                    <Input
                      id="storageLocation"
                      data-testid="input-storage-location"
                      value={formData.storageLocation}
                      onChange={(e) => handleInputChange('storageLocation', e.target.value)}
                      placeholder="e.g., Freezer-A, Shelf-B2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxOutTimeMinutes" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Max Out-Time (minutes)
                    </Label>
                    <Input
                      id="maxOutTimeMinutes"
                      data-testid="input-max-out-time"
                      type="number"
                      value={formData.maxOutTimeMinutes}
                      onChange={(e) => handleInputChange('maxOutTimeMinutes', e.target.value)}
                      placeholder="e.g., 480 (8 hours)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storageRequirements">
                      <Thermometer className="h-3 w-3 inline mr-1" />
                      Storage Requirements
                    </Label>
                    <Input
                      id="storageRequirements"
                      data-testid="input-storage-requirements"
                      value={formData.storageRequirements}
                      onChange={(e) => handleInputChange('storageRequirements', e.target.value)}
                      placeholder="e.g., -18°C ± 5°C"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  data-testid="input-notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Additional notes about this material lot..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData(initialFormData)}
                  data-testid="button-clear-form"
                >
                  Clear Form
                </Button>
                <Button
                  type="submit"
                  disabled={receiveMutation.isPending}
                  data-testid="button-receive-material"
                >
                  {receiveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Receive Material
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Recently Received
              </CardTitle>
              <CardDescription>Last 10 materials received this session</CardDescription>
            </CardHeader>
            <CardContent>
              {recentlyReceived.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No materials received yet
                </p>
              ) : (
                <div className="space-y-2">
                  {recentlyReceived.map((lot) => (
                    <div
                      key={lot.id}
                      className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium truncate">
                          {lot.internalControlNumber}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lot.materialName}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => printLabel(lot)}
                        data-testid={`button-print-label-${lot.id}`}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                ICN Format
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-2">
                <p className="font-mono bg-muted p-2 rounded text-center">
                  ICN-MAT-YYYYMMDD-NNNNNN
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li><strong>ICN-MAT:</strong> Internal Control Number - Material</li>
                  <li><strong>YYYYMMDD:</strong> Date received</li>
                  <li><strong>NNNNNN:</strong> Sequential number for the day</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Material Received Successfully
            </DialogTitle>
            <DialogDescription>
              The material has been assigned ICN: {selectedForPrint?.internalControlNumber}
            </DialogDescription>
          </DialogHeader>
          {selectedForPrint && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Part Number:</span>
                  <span className="font-medium">{selectedForPrint.materialPartNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Material:</span>
                  <span className="font-medium">{selectedForPrint.materialName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="font-medium">
                    {selectedForPrint.receivedQty} {selectedForPrint.unitOfMeasure}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="font-medium">{selectedForPrint.supplier}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (selectedForPrint) {
                  printLabel(selectedForPrint);
                }
              }}
              data-testid="button-print-label-dialog"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
