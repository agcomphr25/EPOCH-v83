import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Scan, Plus, Check, Clock, AlertCircle, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

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

export default function InventoryReceivingPage() {
  const [scanMode, setScanMode] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [receivingData, setReceivingData] = useState<ReceivingItem>({
    agPartNumber: '',
    name: '',
    expectedQuantity: 0,
    receivedQuantity: 0,
    status: 'pending'
  });

  const queryClient = useQueryClient();

  // Mock data for demonstration - in real implementation, this would come from purchase orders or expected shipments
  const mockReceivingItems: ReceivingItem[] = [
    {
      id: 1,
      agPartNumber: "AG001",
      name: "Steel Rod - 1/2 inch",
      expectedQuantity: 50,
      receivedQuantity: 0,
      status: 'pending',
      notes: "From Supplier A - PO #12345"
    },
    {
      id: 2,
      agPartNumber: "AG002", 
      name: "Aluminum Sheet - 6x8",
      expectedQuantity: 25,
      receivedQuantity: 20,
      status: 'partial',
      lotNumber: "LOT-2024-001"
    },
    {
      id: 3,
      agPartNumber: "AG003",
      name: "Precision Screws - M4",
      expectedQuantity: 100,
      receivedQuantity: 100,
      status: 'complete',
      receivedDate: new Date().toISOString(),
      receivedBy: "John Doe"
    }
  ];

  const { data: inventoryItems } = useQuery({
    queryKey: ['/api/inventory'],
    enabled: true
  });

  const createInventoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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
    }
  });

  const handleScan = () => {
    if (scannedCode) {
      // Look up item by scanned code
      const foundItem = mockReceivingItems.find(item => 
        item.agPartNumber === scannedCode || 
        item.name.toLowerCase().includes(scannedCode.toLowerCase())
      );
      
      if (foundItem) {
        setReceivingData(foundItem);
        toast.success(`Found item: ${foundItem.name}`);
      } else {
        toast.error('Item not found in expected receiving list');
      }
      setScannedCode("");
      setScanMode(false);
    }
  };

  const handleReceive = () => {
    if (!receivingData.agPartNumber || !receivingData.name || receivingData.receivedQuantity <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Add to inventory as master record
    const inventoryData = {
      agPartNumber: receivingData.agPartNumber,
      name: receivingData.name,
      notes: `Received: ${receivingData.receivedQuantity} units. ${receivingData.notes || ''}`,
      department: 'Receiving',
      orderDate: new Date().toISOString().split('T')[0]
    };

    createInventoryMutation.mutate(inventoryData);
  };

  const resetForm = () => {
    setReceivingData({
      agPartNumber: '',
      name: '',
      expectedQuantity: 0,
      receivedQuantity: 0,
      status: 'pending'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'partial':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800"><AlertCircle className="w-3 h-3 mr-1" />Partial</Badge>;
      case 'complete':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><Check className="w-3 h-3 mr-1" />Complete</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Receiving</h1>
          <p className="text-muted-foreground">Receive and process incoming inventory items</p>
        </div>
        <Button 
          onClick={() => setScanMode(!scanMode)}
          variant={scanMode ? "default" : "outline"}
        >
          <Scan className="w-4 h-4 mr-2" />
          {scanMode ? "Exit Scan Mode" : "Scan Mode"}
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
                <CardDescription>Scan barcode or search for items to receive</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scanMode && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 mb-2">Scan Mode Active</p>
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
                <CardDescription>Enter details for the item being received</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agPartNumber">AG Part# *</Label>
                    <Input
                      id="agPartNumber"
                      value={receivingData.agPartNumber}
                      onChange={(e) => setReceivingData(prev => ({...prev, agPartNumber: e.target.value}))}
                      placeholder="Enter AG Part#"
                    />
                  </div>
                  <div>
                    <Label htmlFor="receivedQuantity">Received Quantity *</Label>
                    <Input
                      id="receivedQuantity"
                      type="number"
                      value={receivingData.receivedQuantity}
                      onChange={(e) => setReceivingData(prev => ({...prev, receivedQuantity: parseInt(e.target.value) || 0}))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">Item Name *</Label>
                  <Input
                    id="name"
                    value={receivingData.name}
                    onChange={(e) => setReceivingData(prev => ({...prev, name: e.target.value}))}
                    placeholder="Enter item name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lotNumber">Lot Number</Label>
                    <Input
                      id="lotNumber"
                      value={receivingData.lotNumber || ''}
                      onChange={(e) => setReceivingData(prev => ({...prev, lotNumber: e.target.value}))}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <Label htmlFor="batchNumber">Batch Number</Label>
                    <Input
                      id="batchNumber"
                      value={receivingData.batchNumber || ''}
                      onChange={(e) => setReceivingData(prev => ({...prev, batchNumber: e.target.value}))}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={receivingData.notes || ''}
                    onChange={(e) => setReceivingData(prev => ({...prev, notes: e.target.value}))}
                    placeholder="Additional notes about this receipt..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleReceive} 
                    className="flex-1"
                    disabled={createInventoryMutation.isPending}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {createInventoryMutation.isPending ? 'Receiving...' : 'Receive Item'}
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
              <CardTitle>Pending Receipts</CardTitle>
              <CardDescription>Items expected to be received</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockReceivingItems.filter(item => item.status !== 'complete').map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.agPartNumber}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{item.name}</span>
                        {getStatusBadge(item.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Expected: {item.expectedQuantity} | Received: {item.receivedQuantity}
                      </p>
                      {item.notes && (
                        <p className="text-sm text-muted-foreground">{item.notes}</p>
                      )}
                    </div>
                    <Button 
                      size="sm"
                      onClick={() => setReceivingData(item)}
                    >
                      Receive
                    </Button>
                  </div>
                ))}
              </div>
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
                {mockReceivingItems.filter(item => item.status === 'complete').map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.agPartNumber}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{item.name}</span>
                        {getStatusBadge(item.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Received: {item.receivedQuantity} units
                      </p>
                      {item.receivedBy && (
                        <p className="text-sm text-muted-foreground">
                          By: {item.receivedBy} on {new Date(item.receivedDate!).toLocaleDateString()}
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
    </div>
  );
}