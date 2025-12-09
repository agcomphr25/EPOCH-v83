import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Upload,
  FolderOpen,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Info,
  Loader2,
  Package,
  User,
  Mail,
  Phone,
  MapPin,
  X,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';

interface WebsiteOrder {
  OrderID: string;
  date: string;
  company: string;
  firstname: string;
  lastname: string;
  address: string;
  zip: string;
  city: string;
  state: string;
  email: string;
  phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_zip: string;
  shipping_state: string;
  total: string;
  status: string;
  processing: string;
  fail: string;
  hash: string;
  ordered: string;
  note: string;
  order_number: string;
  order_status: string;
  ship_date: string;
  order_processed: string;
}

interface ParsedOrderDetails {
  category?: string;
  stock?: string;
  hand?: string;
  longShort?: string;
  action?: string;
  port?: string;
  ejectionPort?: string;
  bottomMetal?: string;
  metal?: string;
  barrel?: string;
  color?: string;
  note?: string;
  features: string[];
  quantity: number;
}

interface ImportResult {
  success: boolean;
  orderId?: string;
  error?: string;
  websiteOrderId: string;
  customerName: string;
  matchedModel?: string;
  matchedFeatures?: string[];
  isPaid?: boolean;
}

function parseOrderDetails(orderedHtml: string): ParsedOrderDetails {
  const details: ParsedOrderDetails = {
    features: [],
    quantity: 1,
  };

  if (!orderedHtml) return details;

  const cleanText = orderedHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  const lines = cleanText.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('Category:')) {
      details.category = trimmedLine.replace('Category:', '').trim();
    } else if (trimmedLine.startsWith('Stock:')) {
      details.stock = trimmedLine.replace('Stock:', '').trim();
    } else if (trimmedLine.startsWith('Hand:')) {
      details.hand = trimmedLine.replace('Hand:', '').trim();
    } else if (trimmedLine.startsWith('Long Short:')) {
      details.longShort = trimmedLine.replace('Long Short:', '').trim();
    } else if (trimmedLine.startsWith('Action:')) {
      details.action = trimmedLine.replace('Action:', '').trim();
    } else if (trimmedLine.startsWith('Port:')) {
      details.port = trimmedLine.replace('Port:', '').trim();
    } else if (trimmedLine.startsWith('Ejection Port:')) {
      details.ejectionPort = trimmedLine.replace('Ejection Port:', '').trim();
    } else if (trimmedLine.startsWith('AG Bottom Metal:')) {
      details.bottomMetal = trimmedLine.replace('AG Bottom Metal:', '').trim();
    } else if (trimmedLine.startsWith('Metal:')) {
      details.metal = trimmedLine.replace('Metal:', '').trim();
    } else if (trimmedLine.startsWith('Barrel:')) {
      details.barrel = trimmedLine.replace('Barrel:', '').trim();
    } else if (trimmedLine.startsWith('Color:')) {
      details.color = trimmedLine.replace('Color:', '').trim();
    } else if (trimmedLine.startsWith('Note:')) {
      details.note = trimmedLine.replace('Note:', '').trim();
    } else if (trimmedLine.startsWith('Quantity:')) {
      const qty = parseInt(trimmedLine.replace('Quantity:', '').trim());
      if (!isNaN(qty)) details.quantity = qty;
    } else if (trimmedLine.startsWith('Product:')) {
      details.stock = trimmedLine.replace('Product:', '').trim();
    } else if (trimmedLine && !trimmedLine.includes(':')) {
      details.features.push(trimmedLine);
    }
  }

  return details;
}

const isWebsiteImportEnabled = import.meta.env.VITE_FEATURE_WEBSITE_IMPORT === 'true';

export function WebsiteOrderImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedOrders, setParsedOrders] = useState<WebsiteOrder[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: existingOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/orders'],
    enabled: isWebsiteImportEnabled,
  });

  const importMutation = useMutation({
    mutationFn: async (orders: WebsiteOrder[]) => {
      return apiRequest('/api/orders/import-website', {
        method: 'POST',
        body: { orders },
      });
    },
    onSuccess: (data: ImportResult[]) => {
      setImportResults(data);
      const successCount = data.filter(r => r.success).length;
      const failCount = data.filter(r => !r.success).length;
      
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${successCount} orders${failCount > 0 ? `, ${failCount} failed` : ''}`,
        variant: successCount > 0 ? 'default' : 'destructive',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import orders',
        variant: 'destructive',
      });
    },
  });

  if (!isWebsiteImportEnabled) {
    return null;
  }

  const handleFileSelect = (file: File) => {
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      setParseError('Please select a CSV file');
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setParsedOrders([]);
    setSelectedOrders(new Set());
    setImportResults([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(`CSV parsing error: ${results.errors[0].message}`);
          return;
        }

        const rawOrders = results.data as Record<string, string>[];
        const orders: WebsiteOrder[] = rawOrders.map(row => {
          const normalizedRow: Record<string, string> = {};
          for (const [key, value] of Object.entries(row)) {
            normalizedRow[key.toLowerCase().trim()] = value;
          }
          return {
            OrderID: normalizedRow['orderid'] || normalizedRow['order_id'] || '',
            date: normalizedRow['date'] || '',
            company: normalizedRow['company'] || '',
            firstname: normalizedRow['firstname'] || normalizedRow['first_name'] || '',
            lastname: normalizedRow['lastname'] || normalizedRow['last_name'] || '',
            address: normalizedRow['address'] || '',
            zip: normalizedRow['zip'] || normalizedRow['zipcode'] || '',
            city: normalizedRow['city'] || '',
            state: normalizedRow['state'] || '',
            email: normalizedRow['email'] || '',
            phone: normalizedRow['phone'] || '',
            shipping_address: normalizedRow['shipping_address'] || '',
            shipping_city: normalizedRow['shipping_city'] || '',
            shipping_zip: normalizedRow['shipping_zip'] || '',
            shipping_state: normalizedRow['shipping_state'] || '',
            total: normalizedRow['total'] || '0',
            status: normalizedRow['status'] || '',
            processing: normalizedRow['processing'] || '',
            fail: normalizedRow['fail'] || '',
            hash: normalizedRow['hash'] || '',
            ordered: normalizedRow['ordered'] || '',
            note: normalizedRow['note'] || '',
            order_number: normalizedRow['order_number'] || '',
            order_status: normalizedRow['order_status'] || '',
            ship_date: normalizedRow['ship_date'] || '',
            order_processed: normalizedRow['order_processed'] || '',
          };
        });
        
        const validOrders = orders.filter(o => o.OrderID && o.firstname);
        
        if (validOrders.length === 0) {
          setParseError('No valid orders found in CSV. Make sure the file has OrderID and customer name columns.');
          return;
        }

        setParsedOrders(validOrders);
        setSelectedOrders(new Set(validOrders.map(o => o.OrderID)));
      },
      error: (error) => {
        setParseError(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const toggleAllOrders = () => {
    if (selectedOrders.size === parsedOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(parsedOrders.map(o => o.OrderID)));
    }
  };

  const handleImport = () => {
    const ordersToImport = parsedOrders.filter(o => selectedOrders.has(o.OrderID));
    if (ordersToImport.length === 0) {
      toast({
        title: 'No Orders Selected',
        description: 'Please select at least one order to import',
        variant: 'destructive',
      });
      return;
    }
    importMutation.mutate(ordersToImport);
  };

  const clearAll = () => {
    setParsedOrders([]);
    setSelectedOrders(new Set());
    setImportResults([]);
    setFileName(null);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-3" data-testid="title-website-import">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Website Order Import
          <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-700 border-amber-300">
            Beta
          </Badge>
        </CardTitle>
        <CardDescription>
          Import orders from your website CSV export file
          <span className="ml-2 text-amber-600 text-xs">(Experimental feature - under development)</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {parsedOrders.length === 0 ? (
          <>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 hover:border-primary'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="dropzone-csv"
            >
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-700 mb-2">
                Drop website orders CSV file here or click to browse
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Supports CSV files exported from your website
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInputChange}
                data-testid="input-csv-file"
              />
              <Button
                variant="outline"
                onClick={handleBrowseClick}
                className="bg-gray-100 hover:bg-gray-200"
                data-testid="button-browse-files"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
                <Badge variant="secondary">
                  {parsedOrders.length} orders found
                </Badge>
                <Badge variant="default">
                  {selectedOrders.size} selected
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={clearAll} data-testid="button-clear-import">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>

            <Separator />

            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedOrders.size === parsedOrders.length}
                        onCheckedChange={toggleAllOrders}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedOrders.map((order) => {
                    const details = parseOrderDetails(order.ordered);
                    const importResult = importResults.find(r => r.websiteOrderId === order.OrderID);
                    
                    return (
                      <TableRow 
                        key={order.OrderID}
                        className={importResult ? (importResult.success ? 'bg-green-50' : 'bg-red-50') : ''}
                        data-testid={`row-order-${order.OrderID}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedOrders.has(order.OrderID)}
                            onCheckedChange={() => toggleOrderSelection(order.OrderID)}
                            disabled={importResult?.success}
                            data-testid={`checkbox-order-${order.OrderID}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {order.OrderID}
                          {importResult && (
                            <div className="mt-1">
                              {importResult.success ? (
                                <Badge variant="default" className="bg-green-600 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Imported
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Failed
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {order.date ? new Date(order.date).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {order.firstname} {order.lastname}
                            </span>
                          </div>
                          {order.company && (
                            <div className="text-xs text-muted-foreground">{order.company}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {order.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-[150px]">{order.email}</span>
                              </div>
                            )}
                            {order.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span>{order.phone}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm truncate max-w-[200px]">
                              {details.stock || details.category || 'N/A'}
                            </span>
                          </div>
                          {details.color && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {details.color}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          ${parseFloat(order.total || '0').toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.order_processed === '1' ? 'secondary' : 'outline'}>
                            {order.order_processed === '1' ? 'Processed' : 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>

            {importResults.length > 0 && (
              <div className="space-y-4">
                <Alert variant={importResults.every(r => r.success) ? 'default' : 'destructive'}>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Import Results</AlertTitle>
                  <AlertDescription>
                    {importResults.filter(r => r.success).length} orders imported successfully,{' '}
                    {importResults.filter(r => !r.success).length} failed.
                    {importResults.filter(r => r.success && r.isPaid).length > 0 && (
                      <span className="ml-2 text-green-600 font-medium">
                        ({importResults.filter(r => r.success && r.isPaid).length} marked as paid)
                      </span>
                    )}
                  </AlertDescription>
                </Alert>

                {importResults.filter(r => r.success).length > 0 && (
                  <div className="border rounded-lg p-4 bg-green-50">
                    <h4 className="font-medium text-green-800 mb-2">Successfully Imported Orders</h4>
                    <div className="space-y-2">
                      {importResults.filter(r => r.success).map(r => (
                        <div key={r.websiteOrderId} className="text-sm border-b border-green-200 pb-2 last:border-0">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="font-mono font-medium">{r.orderId}</span>
                            <span className="text-gray-600">← Website #{r.websiteOrderId}</span>
                            {r.isPaid && (
                              <Badge variant="default" className="bg-green-600 text-xs">Paid</Badge>
                            )}
                          </div>
                          <div className="ml-6 text-gray-600">
                            <span>{r.customerName}</span>
                            {r.matchedModel && (
                              <span className="ml-2">• Model: <span className="font-medium">{r.matchedModel}</span></span>
                            )}
                          </div>
                          {r.matchedFeatures && r.matchedFeatures.length > 0 && (
                            <div className="ml-6 text-xs text-gray-500 mt-1">
                              Features matched: {r.matchedFeatures.join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importResults.some(r => !r.success) && (
                  <div className="border rounded-lg p-4 bg-red-50">
                    <h4 className="font-medium text-red-800 mb-2">Failed Imports</h4>
                    <ul className="list-disc list-inside text-sm text-red-700">
                      {importResults.filter(r => !r.success).map(r => (
                        <li key={r.websiteOrderId}>
                          Order {r.websiteOrderId} ({r.customerName}): {r.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={clearAll} data-testid="button-cancel-import">
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedOrders.size === 0 || importMutation.isPending}
                data-testid="button-import-orders"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {selectedOrders.size} Orders
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
