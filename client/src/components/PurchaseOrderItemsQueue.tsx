import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Eye, Calendar, DollarSign } from 'lucide-react';

interface PurchaseOrderItem {
  id: number;
  poId: number;
  itemType: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specifications?: any;
  notes?: string;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

interface POProduct {
  id: number;
  customerName: string;
  productName: string;
  productType: string;
  material: string;
  handedness: string;
  stockModel: string;
  actionLength: string;
  actionInlet: string;
  bottomMetal: string;
  barrelInlet: string;
  qds: string;
  swivelStuds: string;
  paintOptions: string;
  texture: string;
  flatTop: boolean;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PurchaseOrder {
  id: number;
  poNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  createdAt: string;
  expectedDelivery?: string;
}

export default function PurchaseOrderItemsQueue() {
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<Record<number, PurchaseOrder>>({});
  const [poProducts, setPOProducts] = useState<POProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all purchase orders first
      const posResponse = await fetch('/api/pos');
      if (!posResponse.ok) throw new Error('Failed to fetch purchase orders');
      const pos = await posResponse.json();

      // Create a lookup map for purchase orders
      const posMap = pos.reduce((acc: Record<number, PurchaseOrder>, po: PurchaseOrder) => {
        acc[po.id] = po;
        return acc;
      }, {});
      setPurchaseOrders(posMap);

      // Fetch PO Products for product type filtering
      let products: POProduct[] = [];
      const poProductsResponse = await fetch('/api/po-products');
      if (poProductsResponse.ok) {
        products = await poProductsResponse.json();
        setPOProducts(products);
      }

      // Fetch all purchase order items
      const allItems: PurchaseOrderItem[] = [];
      for (const po of pos) {
        try {
          const itemsResponse = await fetch(`/api/pos/${po.id}/items`);
          if (itemsResponse.ok) {
            const poItems = await itemsResponse.json();
            allItems.push(...poItems);
          }
        } catch (err) {
          console.warn(`Failed to fetch items for PO ${po.id}:`, err);
        }
      }

      // Filter items to only show stock items in the production queue
      const stockItems = allItems.filter(item => {
        if (item.itemType === 'custom_model') {
          const poProduct = products.find((product: POProduct) => product.id.toString() === item.itemId);
          return poProduct?.productType === 'stock';
        }
        return false; // Only show custom_model items with stock product type
      });

      setItems(stockItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const getItemTypeColor = (itemType: string) => {
    switch (itemType) {
      case 'stock_model': return 'bg-blue-100 text-blue-800';
      case 'custom_model': return 'bg-purple-100 text-purple-800';
      case 'feature_item': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'received': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const totalQueueValue = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Loading purchase order items...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-red-600">Error: {error}</div>
        <Button onClick={fetchData} className="ml-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">
              Individual line items
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-muted-foreground">
              Units to be delivered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalQueueValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Total value of queued items
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active POs</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(purchaseOrders).length}</div>
            <p className="text-xs text-muted-foreground">
              Purchase orders with items
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>P1 PO Production Queue (Stock Items Only)</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No stock items found in the production queue.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total Price</TableHead>
                    <TableHead>Orders Generated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const po = purchaseOrders[item.poId];
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {po?.poNumber || `PO-${item.poId}`}
                        </TableCell>
                        <TableCell>{po?.customerName || 'Unknown'}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.itemName}</div>
                            <div className="text-sm text-gray-500">ID: {item.itemId}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-blue-100 text-blue-800">
                            STOCK
                          </Badge>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>${item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="font-medium">${item.totalPrice.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={item.orderCount > 0 ? "default" : "secondary"}>
                            {item.orderCount} orders
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(po?.status || 'pending')}>
                            {po?.status || 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Navigate to PO details - you can implement this
                              console.log('View PO:', item.poId);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}