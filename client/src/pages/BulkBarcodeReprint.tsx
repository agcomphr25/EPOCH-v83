import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Printer, Package, Users, Search, CheckSquare, Square, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface Customer {
  id: number;
  name: string;
}

interface Order {
  order_id: string;
  id?: number;
  customer: string;
  product?: string;
  status?: string;
  current_department?: string;
  due_date?: string;
  date?: string;
  fb_order_number?: string;
  model_id?: string;
}

interface P2SerializedItem {
  id: string;
  serialNumber: string;
  barcode: string;
  poId: number;
  poItemId: number;
  poNumber: string;
  partNumber: string;
  partName: string;
  customerId: string;
  customerName: string;
  sequenceNumber: number;
  currentDepartment: string;
  status: string;
}

export default function BulkBarcodeReprint() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedP2Items, setSelectedP2Items] = useState<Set<string>>(new Set());
  const [customerSearch, setCustomerSearch] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('orders');
  const { toast } = useToast();

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: allOrders = [], isLoading: ordersLoading, refetch: refetchOrders, isRefetching: ordersRefetching } = useQuery<Order[]>({
    queryKey: ['/api/orders/all'],
  });

  const { data: p2Items = [], isLoading: p2Loading, refetch: refetchP2, isRefetching: p2Refetching } = useQuery<P2SerializedItem[]>({
    queryKey: ['/api/p2/production-control/scheduling-list'],
  });

  const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId);

  const customerOrders = allOrders.filter(order => {
    if (!selectedCustomer) return false;
    return order.customer?.toLowerCase() === selectedCustomer.name?.toLowerCase();
  });

  const inProgressOrders = customerOrders.filter(order => {
    const status = order.status?.toLowerCase();
    return status !== 'completed' && status !== 'shipped' && status !== 'cancelled';
  });

  const customerP2Items = p2Items.filter(item => {
    if (!selectedCustomer) return false;
    return item.customerName?.toLowerCase() === selectedCustomer.name?.toLowerCase() &&
           item.status === 'ACTIVE';
  });

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(customerSearch.toLowerCase())
  ).slice(0, 100);

  const handleSelectAllOrders = () => {
    if (inProgressOrders.length === 0) {
      toast({
        title: 'No orders to select',
        description: 'There are no in-progress orders for this customer.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedOrders.size === inProgressOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(inProgressOrders.map(o => o.order_id)));
    }
  };

  const handleSelectAllP2 = () => {
    if (customerP2Items.length === 0) {
      toast({
        title: 'No items to select',
        description: 'There are no active P2 items for this customer.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedP2Items.size === customerP2Items.length) {
      setSelectedP2Items(new Set());
    } else {
      setSelectedP2Items(new Set(customerP2Items.map(i => i.barcode)));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectP2Item = (barcode: string) => {
    setSelectedP2Items(prev => {
      const newSet = new Set(prev);
      if (newSet.has(barcode)) {
        newSet.delete(barcode);
      } else {
        newSet.add(barcode);
      }
      return newSet;
    });
  };

  const generateBarcodeDataUrl = (barcodeValue: string): string => {
    if (!barcodeValue) return '';
    const canvas = document.createElement('canvas');
    const format = getBarcodeFormat(barcodeValue);
    try {
      JsBarcode(canvas, barcodeValue, {
        format: format,
        width: format === 'CODE128' ? 1.2 : 1.5,
        height: 30,
        displayValue: true,
        fontSize: 8,
        textAlign: 'center',
        textPosition: 'bottom',
        textMargin: 1,
        font: 'monospace',
        background: '#ffffff',
        lineColor: '#000000',
        margin: 2,
      });
      return canvas.toDataURL('image/png', 1.0);
    } catch (e) {
      console.error('Barcode generation error:', e, barcodeValue);
      return '';
    }
  };

  const handlePrintOrderBarcodes = () => {
    if (selectedOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select at least one order to print barcodes.',
        variant: 'destructive',
      });
      return;
    }

    setIsPrinting(true);
    const ordersToPrint = inProgressOrders.filter(o => selectedOrders.has(o.order_id));
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Popup blocked',
        description: 'Please allow popups to print barcodes.',
        variant: 'destructive',
      });
      setIsPrinting(false);
      return;
    }

    const currentDate = new Date().toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });

    const labelsHtml = ordersToPrint.map((order) => {
      const displayId = order.fb_order_number || order.order_id;
      const barcodeDataUrl = generateBarcodeDataUrl(order.order_id);
      return `
        <div class="avery-label">
          <div class="label-content">
            <div class="line1">${displayId}</div>
            <div class="barcode-container">
              ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" alt="Barcode ${order.order_id}" class="barcode-img" />` : '<span>Barcode Error</span>'}
            </div>
            <div class="line2">${order.customer || ''}</div>
            <div class="line3">${order.model_id || order.product || ''}</div>
            <div class="line4">Printed: ${currentDate}</div>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(getLabelHtml(labelsHtml, selectedCustomer?.name || 'Orders'));
    printWindow.document.close();
    setIsPrinting(false);
    
    toast({
      title: 'Print dialog opened',
      description: `Printing ${ordersToPrint.length} barcode label(s).`,
    });
  };

  const handlePrintP2Barcodes = () => {
    if (selectedP2Items.size === 0) {
      toast({
        title: 'No items selected',
        description: 'Please select at least one P2 item to print barcodes.',
        variant: 'destructive',
      });
      return;
    }

    setIsPrinting(true);
    const itemsToPrint = customerP2Items.filter(i => selectedP2Items.has(i.barcode));
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Popup blocked',
        description: 'Please allow popups to print barcodes.',
        variant: 'destructive',
      });
      setIsPrinting(false);
      return;
    }

    const currentDate = new Date().toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });

    const labelsHtml = itemsToPrint.map((item) => {
      const barcodeDataUrl = generateBarcodeDataUrl(item.barcode);
      return `
        <div class="avery-label">
          <div class="label-content">
            <div class="line1">${item.poNumber}</div>
            <div class="barcode-container">
              ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" alt="Barcode ${item.barcode}" class="barcode-img" />` : '<span>Barcode Error</span>'}
            </div>
            <div class="line2">${item.customerName || ''}</div>
            <div class="line3">${item.partNumber} - ${item.partName}</div>
            <div class="line4">Printed: ${currentDate}</div>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(getLabelHtml(labelsHtml, selectedCustomer?.name || 'P2 Items'));
    printWindow.document.close();
    setIsPrinting(false);
    
    toast({
      title: 'Print dialog opened',
      description: `Printing ${itemsToPrint.length} barcode label(s).`,
    });
  };

  const getLabelHtml = (labelsHtml: string, title: string) => `
    <html>
      <head>
        <title>Bulk Barcode Print - ${title}</title>
        <style>
          @page {
            size: letter;
            margin: 0.5in 0.1875in 0.5in 0.1875in;
          }

          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
          }

          .labels-container {
            width: 8.125in;
            margin: 0 auto;
            overflow: hidden;
          }

          .avery-label {
            width: 2.625in;
            height: 1in;
            border: 1px solid #ccc;
            padding: 0.04in 0.06in;
            box-sizing: border-box;
            page-break-inside: avoid;
            background: white;
            float: left;
          }

          .label-content {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-align: center;
          }

          .line1 {
            font-size: 8pt;
            font-weight: bold;
            color: #000;
          }

          .barcode-container {
            display: flex;
            justify-content: center;
            align-items: center;
          }

          .barcode-img {
            max-width: 100%;
            max-height: 0.3in;
          }

          .line2 {
            font-size: 6pt;
            color: #000;
          }

          .line3 {
            font-size: 5.5pt;
            color: #000;
          }

          .line4 {
            font-size: 5pt;
            color: #666;
          }

          @media print {
            body { margin: 0; padding: 0; }
            .avery-label { border: none; }
          }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelsHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  const isLoading = customersLoading || ordersLoading || p2Loading;
  const isRefetching = ordersRefetching || p2Refetching;

  const handleRefresh = () => {
    refetchOrders();
    refetchP2();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="page-bulk-barcode-reprint">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-page-title">
            <Printer className="h-6 w-6" />
            Bulk Barcode Reprint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <label className="font-medium">Select Customer</label>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                <Select
                  value={selectedCustomerId}
                  onValueChange={(value) => {
                    setSelectedCustomerId(value);
                    setSelectedOrders(new Set());
                    setSelectedP2Items(new Set());
                  }}
                  disabled={customersLoading}
                >
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder={customersLoading ? "Loading customers..." : "Choose a customer..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <input
                        type="text"
                        placeholder="Search customers..."
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid="input-customer-search"
                      />
                    </div>
                    {customersLoading ? (
                      <SelectItem value="loading" disabled>Loading customers...</SelectItem>
                    ) : filteredCustomers.length === 0 ? (
                      <SelectItem value="none" disabled>No customers found</SelectItem>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <SelectItem 
                          key={customer.id} 
                          value={customer.id.toString()}
                          data-testid={`select-item-customer-${customer.id}`}
                        >
                          {customer.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="outline" 
                onClick={handleRefresh}
                disabled={isRefetching}
                data-testid="button-refresh"
              >
                {isRefetching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          {selectedCustomer && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="orders" data-testid="tab-orders">
                  Regular Orders ({inProgressOrders.length})
                </TabsTrigger>
                <TabsTrigger value="p2" data-testid="tab-p2">
                  P2 Serialized Items ({customerP2Items.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="orders" className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium" data-testid="text-orders-customer-name">
                      In-Progress Orders for {selectedCustomer.name}
                    </span>
                    <Badge variant="secondary" data-testid="badge-orders-count">
                      {ordersLoading ? '...' : `${inProgressOrders.length} orders`}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllOrders}
                      disabled={ordersLoading || inProgressOrders.length === 0}
                      data-testid="button-select-all-orders"
                    >
                      {selectedOrders.size === inProgressOrders.length && inProgressOrders.length > 0 ? (
                        <>
                          <Square className="h-4 w-4 mr-2" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <CheckSquare className="h-4 w-4 mr-2" />
                          Select All
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={handlePrintOrderBarcodes}
                      disabled={selectedOrders.size === 0 || isPrinting}
                      data-testid="button-print-order-barcodes"
                    >
                      {isPrinting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4 mr-2" />
                      )}
                      Print {selectedOrders.size} Barcode{selectedOrders.size !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </div>

                {ordersLoading ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="loading-orders">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading orders...</p>
                  </div>
                ) : inProgressOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="empty-orders">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No in-progress orders found for this customer</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden" data-testid="table-orders">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="w-12 p-3 text-left">
                            <Checkbox
                              checked={selectedOrders.size === inProgressOrders.length && inProgressOrders.length > 0}
                              onCheckedChange={handleSelectAllOrders}
                              data-testid="checkbox-select-all-orders-header"
                            />
                          </th>
                          <th className="p-3 text-left font-medium">Order ID</th>
                          <th className="p-3 text-left font-medium">FB #</th>
                          <th className="p-3 text-left font-medium">Model</th>
                          <th className="p-3 text-left font-medium">Department</th>
                          <th className="p-3 text-left font-medium">Due Date</th>
                          <th className="p-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inProgressOrders.map((order) => (
                          <tr 
                            key={order.order_id} 
                            className={`border-t hover:bg-muted/50 cursor-pointer ${
                              selectedOrders.has(order.order_id) ? 'bg-primary/10' : ''
                            }`}
                            onClick={() => handleSelectOrder(order.order_id)}
                            data-testid={`row-order-${order.order_id}`}
                          >
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedOrders.has(order.order_id)}
                                onCheckedChange={() => handleSelectOrder(order.order_id)}
                                data-testid={`checkbox-order-${order.order_id}`}
                              />
                            </td>
                            <td className="p-3 font-mono font-medium" data-testid={`text-order-id-${order.order_id}`}>
                              {order.order_id}
                            </td>
                            <td className="p-3 text-muted-foreground" data-testid={`text-fb-number-${order.order_id}`}>
                              {order.fb_order_number || '-'}
                            </td>
                            <td className="p-3" data-testid={`text-model-${order.order_id}`}>
                              {order.model_id || order.product || '-'}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" data-testid={`badge-department-${order.order_id}`}>
                                {order.current_department || 'Unknown'}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground" data-testid={`text-due-date-${order.order_id}`}>
                              {order.due_date 
                                ? format(new Date(order.due_date), 'MM/dd/yyyy')
                                : '-'}
                            </td>
                            <td className="p-3">
                              <Badge 
                                variant={order.status === 'in_progress' ? 'default' : 'secondary'}
                                data-testid={`badge-status-${order.order_id}`}
                              >
                                {order.status || 'Unknown'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="p2" className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium" data-testid="text-p2-customer-name">
                      P2 Serialized Items for {selectedCustomer.name}
                    </span>
                    <Badge variant="secondary" data-testid="badge-p2-count">
                      {p2Loading ? '...' : `${customerP2Items.length} items`}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllP2}
                      disabled={p2Loading || customerP2Items.length === 0}
                      data-testid="button-select-all-p2"
                    >
                      {selectedP2Items.size === customerP2Items.length && customerP2Items.length > 0 ? (
                        <>
                          <Square className="h-4 w-4 mr-2" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <CheckSquare className="h-4 w-4 mr-2" />
                          Select All
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={handlePrintP2Barcodes}
                      disabled={selectedP2Items.size === 0 || isPrinting}
                      data-testid="button-print-p2-barcodes"
                    >
                      {isPrinting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4 mr-2" />
                      )}
                      Print {selectedP2Items.size} Barcode{selectedP2Items.size !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </div>

                {p2Loading ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="loading-p2">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading P2 items...</p>
                  </div>
                ) : customerP2Items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground" data-testid="empty-p2">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active P2 serialized items found for this customer</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden" data-testid="table-p2">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="w-12 p-3 text-left">
                            <Checkbox
                              checked={selectedP2Items.size === customerP2Items.length && customerP2Items.length > 0}
                              onCheckedChange={handleSelectAllP2}
                              data-testid="checkbox-select-all-p2-header"
                            />
                          </th>
                          <th className="p-3 text-left font-medium">Barcode</th>
                          <th className="p-3 text-left font-medium">PO Number</th>
                          <th className="p-3 text-left font-medium">Part Number</th>
                          <th className="p-3 text-left font-medium">Part Name</th>
                          <th className="p-3 text-left font-medium">Department</th>
                          <th className="p-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerP2Items.map((item) => (
                          <tr 
                            key={item.barcode} 
                            className={`border-t hover:bg-muted/50 cursor-pointer ${
                              selectedP2Items.has(item.barcode) ? 'bg-primary/10' : ''
                            }`}
                            onClick={() => handleSelectP2Item(item.barcode)}
                            data-testid={`row-p2-${item.barcode}`}
                          >
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedP2Items.has(item.barcode)}
                                onCheckedChange={() => handleSelectP2Item(item.barcode)}
                                data-testid={`checkbox-p2-${item.barcode}`}
                              />
                            </td>
                            <td className="p-3 font-mono font-medium text-blue-600" data-testid={`text-barcode-${item.barcode}`}>
                              {item.barcode}
                            </td>
                            <td className="p-3" data-testid={`text-po-number-${item.barcode}`}>
                              {item.poNumber}
                            </td>
                            <td className="p-3 font-mono" data-testid={`text-part-number-${item.barcode}`}>
                              {item.partNumber}
                            </td>
                            <td className="p-3" data-testid={`text-part-name-${item.barcode}`}>
                              {item.partName}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" data-testid={`badge-p2-department-${item.barcode}`}>
                                {item.currentDepartment || 'Unknown'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge 
                                variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}
                                data-testid={`badge-p2-status-${item.barcode}`}
                              >
                                {item.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {!selectedCustomer && (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a customer to view their orders and P2 items</p>
              <p className="text-sm mt-2">You can then select multiple items to reprint barcodes</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
