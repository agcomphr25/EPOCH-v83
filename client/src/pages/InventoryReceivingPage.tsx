import { useState, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Package,
  Scan,
  Plus,
  Check,
  Clock,
  AlertCircle,
  Search,
  QrCode,
  FileText,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiRequest } from '@/lib/queryClient';
import P2ReceivingDialog from '@/components/inventory/P2ReceivingDialog';

interface ReceivingItem {
  id?: number;
  agPartNumber: string;
  name: string;
  expectedQuantity: number;
  receivedQuantity: number;
  lotNumber?: string;
  batchNumber?: string;
  expirationDate?: string;
  status: 'pending' | 'partial' | 'complete';
  notes?: string;
  receivedDate?: string;
  receivedBy?: string;
}

interface VendorPO {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName: string;
  status: string;
  requestedDeliveryDate?: string;
  notes?: string;
  createdAt?: string;
}

interface VendorPOItem {
  id: number;
  vendorPoId: number;
  lineNumber: number;
  agPartNumber: string;
  description: string;
  quantity: number;
  vendorUnit: string;
  unitPrice: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  purchaseUnitPrice?: number;
  receivedQuantity?: number;
}

// Function to detect if an item is a P2 product
function isP2Product(item: any): boolean {
  if (!item) return false;

  // Check if the AG Part Number or name contains P2 indicators
  const partNumber = (item.agPartNumber || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  return (
    partNumber.includes('p2') ||
    name.includes('p2') ||
    name.includes('production line 2') ||
    partNumber.startsWith('p2-') ||
    // Add other P2 detection criteria as needed
    false
  );
}

export default function InventoryReceivingPage() {
  const [scanMode, setScanMode] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [p2DialogOpen, setP2DialogOpen] = useState(false);
  const [selectedP2Item, setSelectedP2Item] = useState<any>(null);
  const [receivingData, setReceivingData] = useState<ReceivingItem>({
    agPartNumber: '',
    name: '',
    expectedQuantity: 0,
    receivedQuantity: 0,
    status: 'pending',
  });

  const queryClient = useQueryClient();

  // Mock data for demonstration - in real implementation, this would come from purchase orders or expected shipments
  const mockReceivingItems: ReceivingItem[] = [
    {
      id: 1,
      agPartNumber: 'AG001',
      name: 'Steel Rod - 1/2 inch',
      expectedQuantity: 50,
      receivedQuantity: 0,
      status: 'pending',
      notes: 'From Supplier A - PO #12345',
    },
    {
      id: 2,
      agPartNumber: 'P2-ALU-001',
      name: 'P2 Aluminum Tubing - Special Grade',
      expectedQuantity: 25,
      receivedQuantity: 0,
      status: 'pending',
      notes: 'P2 Production Line - Requires detailed tracking',
    },
    {
      id: 3,
      agPartNumber: 'AG002',
      name: 'Aluminum Sheet - 6x8',
      expectedQuantity: 25,
      receivedQuantity: 20,
      status: 'partial',
      lotNumber: 'LOT-2024-001',
    },
    {
      id: 4,
      agPartNumber: 'P2-STEEL-002',
      name: 'P2 Heat-Treated Steel Components',
      expectedQuantity: 15,
      receivedQuantity: 0,
      status: 'pending',
      notes: 'P2 Manufacturing - Critical batch tracking required',
    },
    {
      id: 5,
      agPartNumber: 'AG003',
      name: 'Precision Screws - M4',
      expectedQuantity: 100,
      receivedQuantity: 100,
      status: 'complete',
      receivedDate: new Date().toISOString(),
      receivedBy: 'John Doe',
    },
  ];

  const { data: inventoryItems } = useQuery({
    queryKey: ['/api/inventory'],
    enabled: true,
  });

  // Fetch Vendor POs with status "Sent" for Pending Receipts
  const { data: sentPOsResponse, isLoading: isLoadingPOs } = useQuery<{ data: VendorPO[] }>({
    queryKey: ['/api/vendor-pos', 'Sent'],
    queryFn: () => apiRequest('/api/vendor-pos?status=Sent'),
  });
  
  const sentPOs = sentPOsResponse?.data || [];

  // Fetch line items for all sent POs
  const { data: poItemsMap, isLoading: isLoadingItems } = useQuery<Record<number, VendorPOItem[]>>({
    queryKey: ['/api/vendor-pos/items', sentPOs.map(po => po.id)],
    queryFn: async () => {
      if (sentPOs.length === 0) return {};
      const itemsMap: Record<number, VendorPOItem[]> = {};
      await Promise.all(
        sentPOs.map(async (po) => {
          try {
            const items = await apiRequest(`/api/vendor-pos/${po.id}/items`);
            itemsMap[po.id] = items || [];
          } catch (error) {
            console.error(`Failed to fetch items for PO ${po.id}:`, error);
            itemsMap[po.id] = [];
          }
        })
      );
      return itemsMap;
    },
    enabled: sentPOs.length > 0,
  });

  // Get valid inventory part numbers for filtering
  const validPartNumbers = new Set<string>();
  if (inventoryItems && Array.isArray(inventoryItems)) {
    inventoryItems.forEach((item: any) => {
      if (item.agPartNumber) {
        validPartNumbers.add(item.agPartNumber.toLowerCase());
      }
    });
  }

  // Transform PO items into receiving items format - only include items with valid inventory part numbers
  const pendingReceivingItems: (ReceivingItem & { poNumber: string; vendorName: string })[] = [];
  if (poItemsMap) {
    sentPOs.forEach((po) => {
      const items = poItemsMap[po.id] || [];
      items.forEach((item) => {
        // Only include items that exist in the inventory
        if (!item.agPartNumber || !validPartNumbers.has(item.agPartNumber.toLowerCase())) {
          return; // Skip items not in inventory
        }

        const expectedQty = item.quantity || 0;
        const receivedQty = item.receivedQuantity || 0;
        let status: 'pending' | 'partial' | 'complete' = 'pending';
        if (receivedQty >= expectedQty && expectedQty > 0) {
          status = 'complete';
        } else if (receivedQty > 0) {
          status = 'partial';
        }
        
        pendingReceivingItems.push({
          id: item.id,
          agPartNumber: item.agPartNumber || '',
          name: item.description || '',
          expectedQuantity: expectedQty,
          receivedQuantity: receivedQty,
          status,
          notes: `${po.poNumber} from ${po.vendorName}`,
          poNumber: po.poNumber,
          vendorName: po.vendorName,
        });
      });
    });
  }

  // Group pending items by VPO-# for accordion display
  const groupedByVPO = useMemo(() => {
    const pendingItems = pendingReceivingItems.filter(item => item.status !== 'complete');
    const grouped: Record<string, { 
      poNumber: string; 
      vendorName: string; 
      items: typeof pendingItems;
      pendingCount: number;
      partialCount: number;
    }> = {};
    
    pendingItems.forEach(item => {
      if (!grouped[item.poNumber]) {
        grouped[item.poNumber] = {
          poNumber: item.poNumber,
          vendorName: item.vendorName,
          items: [],
          pendingCount: 0,
          partialCount: 0,
        };
      }
      grouped[item.poNumber].items.push(item);
      if (item.status === 'pending') {
        grouped[item.poNumber].pendingCount++;
      } else if (item.status === 'partial') {
        grouped[item.poNumber].partialCount++;
      }
    });
    
    return Object.values(grouped).sort((a, b) => a.poNumber.localeCompare(b.poNumber));
  }, [pendingReceivingItems]);

  const createInventoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to add inventory item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast.success('Item received and added to inventory');
      resetForm();
    },
    onError: () => {
      toast.error('Failed to receive item');
    },
  });

  const handleScan = () => {
    if (scannedCode) {
      // Look up item by scanned code
      const foundItem = mockReceivingItems.find(
        (item) =>
          item.agPartNumber === scannedCode ||
          item.name.toLowerCase().includes(scannedCode.toLowerCase())
      );

      if (foundItem) {
        setReceivingData(foundItem);
        toast.success(`Found item: ${foundItem.name}`);
      } else {
        toast.error('Item not found in expected receiving list');
      }
      setScannedCode('');
      setScanMode(false);
    }
  };

  const handleReceive = () => {
    if (
      !receivingData.agPartNumber ||
      !receivingData.name ||
      receivingData.receivedQuantity <= 0
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Check if this is a P2 product
    if (isP2Product(receivingData)) {
      setSelectedP2Item(receivingData);
      setP2DialogOpen(true);
      return;
    }

    // Regular receiving for non-P2 products
    const inventoryData = {
      agPartNumber: receivingData.agPartNumber,
      name: receivingData.name,
      notes: `Received: ${receivingData.receivedQuantity} units. ${receivingData.notes || ''}`,
      department: 'Receiving',
      orderDate: new Date().toISOString().split('T')[0],
    };

    createInventoryMutation.mutate(inventoryData);
  };

  const handleReceiveFromPending = (item: ReceivingItem) => {
    // Check if this is a P2 product
    if (isP2Product(item)) {
      setSelectedP2Item(item);
      setP2DialogOpen(true);
      return;
    }

    // For non-P2 products, load into the form
    setReceivingData(item);
  };

  const resetForm = () => {
    setReceivingData({
      agPartNumber: '',
      name: '',
      expectedQuantity: 0,
      receivedQuantity: 0,
      status: 'pending',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Partial
          </Badge>
        );
      case 'complete':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <Check className="w-3 h-3 mr-1" />
            Complete
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Inventory Receiving
          </h1>
          <p className="text-muted-foreground">
            Receive and process incoming inventory items
          </p>
        </div>
        <Button
          onClick={() => setScanMode(!scanMode)}
          variant={scanMode ? 'default' : 'outline'}
        >
          <Scan className="w-4 h-4 mr-2" />
          {scanMode ? 'Exit Scan Mode' : 'Scan Mode'}
        </Button>
      </div>

      <Tabs defaultValue="receive" className="space-y-6">
        <TabsList>
          <TabsTrigger value="receive">Receive Items</TabsTrigger>
          <TabsTrigger value="pending">Pending Receipts</TabsTrigger>
          <TabsTrigger value="history">Receiving History</TabsTrigger>
        </TabsList>

        <TabsContent value="receive">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scan/Search Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Item Lookup
                </CardTitle>
                <CardDescription>
                  Scan barcode or search for items to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scanMode && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 mb-2">
                      Scan Mode Active
                    </p>
                    <Input
                      placeholder="Scan barcode or enter item code..."
                      value={scannedCode}
                      onChange={(e) => setScannedCode(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                      autoFocus
                    />
                    <Button onClick={handleScan} className="mt-2 w-full">
                      Process Scan
                    </Button>
                  </div>
                )}

                {!scanMode && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="search">Search by AG Part# or Name</Label>
                      <Input
                        id="search"
                        placeholder="Enter AG Part# or item name..."
                        value={scannedCode}
                        onChange={(e) => setScannedCode(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                      />
                    </div>
                    <Button onClick={handleScan} className="w-full">
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Receiving Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Receive Item
                </CardTitle>
                <CardDescription>
                  Enter details for the item being received
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agPartNumber">AG Part# *</Label>
                    <Input
                      id="agPartNumber"
                      value={receivingData.agPartNumber}
                      onChange={(e) =>
                        setReceivingData((prev) => ({
                          ...prev,
                          agPartNumber: e.target.value,
                        }))
                      }
                      placeholder="Enter AG Part#"
                    />
                  </div>
                  <div>
                    <Label htmlFor="receivedQuantity">
                      Received Quantity *
                    </Label>
                    <Input
                      id="receivedQuantity"
                      type="number"
                      value={receivingData.receivedQuantity}
                      onChange={(e) =>
                        setReceivingData((prev) => ({
                          ...prev,
                          receivedQuantity: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">Item Name *</Label>
                  <Input
                    id="name"
                    value={receivingData.name}
                    onChange={(e) =>
                      setReceivingData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Enter item name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lotNumber">Lot Number</Label>
                    <Input
                      id="lotNumber"
                      value={receivingData.lotNumber || ''}
                      onChange={(e) =>
                        setReceivingData((prev) => ({
                          ...prev,
                          lotNumber: e.target.value,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <Label htmlFor="batchNumber">Batch Number</Label>
                    <Input
                      id="batchNumber"
                      value={receivingData.batchNumber || ''}
                      onChange={(e) =>
                        setReceivingData((prev) => ({
                          ...prev,
                          batchNumber: e.target.value,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={receivingData.notes || ''}
                    onChange={(e) =>
                      setReceivingData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Additional notes about this receipt..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleReceive}
                    className={`flex-1 ${isP2Product(receivingData) ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                    disabled={createInventoryMutation.isPending}
                  >
                    {isP2Product(receivingData) ? (
                      <QrCode className="w-4 h-4 mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {createInventoryMutation.isPending
                      ? 'Receiving...'
                      : isP2Product(receivingData)
                        ? 'P2 Receive'
                        : 'Receive Item'}
                  </Button>
                  <Button onClick={resetForm} variant="outline">
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Pending Receipts
              </CardTitle>
              <CardDescription>
                Items from issued Purchase Orders awaiting receipt ({pendingReceivingItems.filter(item => item.status !== 'complete').length} items from {groupedByVPO.length} POs)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(isLoadingPOs || isLoadingItems) ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading pending receipts...</span>
                </div>
              ) : groupedByVPO.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No pending receipts</p>
                  <p className="text-sm">Issue a Purchase Order to see items here</p>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full" defaultValue={[]}>
                  {groupedByVPO.map((group) => (
                    <AccordionItem key={group.poNumber} value={group.poNumber} data-testid={`accordion-vpo-${group.poNumber}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <Badge variant="outline" className="font-mono text-sm font-semibold">
                            {group.poNumber}
                          </Badge>
                          <span className="text-muted-foreground text-sm">
                            {group.vendorName}
                          </span>
                          <div className="flex items-center gap-2 ml-auto mr-4">
                            {group.pendingCount > 0 && (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                                <Clock className="w-3 h-3 mr-1" />
                                {group.pendingCount} pending
                              </Badge>
                            )}
                            {group.partialCount > 0 && (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {group.partialCount} partial
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                            </Badge>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          {group.items.map((item) => (
                            <div
                              key={`${item.poNumber}-${item.id}`}
                              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                              data-testid={`receipt-item-${item.id}`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    #{item.agPartNumber}
                                  </span>
                                  <span className="text-muted-foreground">-</span>
                                  <span className="truncate max-w-[300px]">{item.name}</span>
                                  {isP2Product(item) && (
                                    <Badge
                                      variant="secondary"
                                      className="bg-orange-100 text-orange-800 text-xs"
                                    >
                                      <QrCode className="w-3 h-3 mr-1" />
                                      P2
                                    </Badge>
                                  )}
                                  {getStatusBadge(item.status)}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  Expected: {item.expectedQuantity} | Received:{' '}
                                  {item.receivedQuantity}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleReceiveFromPending(item)}
                                className={
                                  isP2Product(item)
                                    ? 'bg-orange-500 hover:bg-orange-600'
                                    : ''
                                }
                                data-testid={`button-receive-${item.id}`}
                              >
                                {isP2Product(item) && (
                                  <QrCode className="w-4 h-4 mr-1" />
                                )}
                                Receive
                              </Button>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Receiving History</CardTitle>
              <CardDescription>Recently completed receipts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockReceivingItems
                  .filter((item) => item.status === 'complete')
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-green-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {item.agPartNumber}
                          </span>
                          <span className="text-muted-foreground">-</span>
                          <span>{item.name}</span>
                          {getStatusBadge(item.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Received: {item.receivedQuantity} units
                        </p>
                        {item.receivedBy && (
                          <p className="text-sm text-muted-foreground">
                            By: {item.receivedBy} on{' '}
                            {new Date(item.receivedDate!).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* P2 Receiving Dialog */}
      <P2ReceivingDialog
        open={p2DialogOpen}
        onOpenChange={setP2DialogOpen}
        item={selectedP2Item}
      />
    </div>
  );
}
