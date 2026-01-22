import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search,
  Calendar,
  DollarSign,
  Edit,
  History,
  FileText,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface ShipmentAccountingSnapshot {
  id: string;
  shipmentId: string;
  shipmentDate: string;
  customerId: string;
  customerName: string | null;
  salesOrderId: string | null;
  arAmount: string;
  stockRevenueAmount: string;
  shippingIncomeAmount: string;
  discountAmount: string;
  netTotal: string;
  currency: string;
  originalArAmount: string | null;
  originalStockRevenueAmount: string | null;
  originalShippingIncomeAmount: string | null;
  originalDiscountAmount: string | null;
  originalNetTotal: string | null;
  autoCapturedAt: string;
  lastAdjustedAt: string | null;
  lastAdjustedBy: string | null;
  adjustmentReason: string | null;
}

interface ShipmentAccountingAdjustment {
  id: string;
  snapshotId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

function formatCurrency(value: string | number | null | undefined): string {
  const num = parseFloat(String(value || 0));
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(num);
}

function getFieldDisplayName(fieldName: string): string {
  const names: Record<string, string> = {
    ar_amount: 'A/R Amount',
    stock_revenue_amount: 'Stock Revenue',
    shipping_income_amount: 'Shipping Income',
    discount_amount: 'Discounts',
    net_total: 'Net Total',
  };
  return names[fieldName] || fieldName;
}

export default function AccountingPrepPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedSnapshot, setSelectedSnapshot] = useState<ShipmentAccountingSnapshot | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValues, setEditedValues] = useState({
    arAmount: '',
    stockRevenueAmount: '',
    shippingIncomeAmount: '',
    discountAmount: '',
    reason: '',
  });
  
  const now = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [customerFilter, setCustomerFilter] = useState('');
  const [adjustedOnly, setAdjustedOnly] = useState(false);
  
  const { data: session, isLoading: isLoadingUser } = useQuery<{ username: string } | null>({
    queryKey: ['/api/auth/session'],
    queryFn: () => apiRequest('/api/auth/session'),
  });
  
  const isAuthorized = session?.username === 'glennj';
  
  const { data: snapshots = [], isLoading, refetch } = useQuery<ShipmentAccountingSnapshot[]>({
    queryKey: ['/api/accounting-prep', startDate, endDate, customerFilter, adjustedOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (customerFilter) params.append('customerId', customerFilter);
      if (adjustedOnly) params.append('adjustedOnly', 'true');
      const res = await fetch(`/api/accounting-prep?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return res.json();
    },
    enabled: isAuthorized === true,
  });
  
  const { data: adjustments = [] } = useQuery<ShipmentAccountingAdjustment[]>({
    queryKey: ['/api/accounting-prep', selectedSnapshot?.id, 'adjustments'],
    queryFn: async () => {
      if (!selectedSnapshot?.id) return [];
      const res = await fetch(`/api/accounting-prep/${selectedSnapshot.id}/adjustments`);
      if (!res.ok) throw new Error('Failed to fetch adjustments');
      return res.json();
    },
    enabled: !!selectedSnapshot?.id && isAuthorized === true,
  });
  
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; values: typeof editedValues }) => {
      return await apiRequest(`/api/accounting-prep/${data.id}`, {
        method: 'PATCH',
        body: {
          arAmount: parseFloat(data.values.arAmount),
          stockRevenueAmount: parseFloat(data.values.stockRevenueAmount),
          shippingIncomeAmount: parseFloat(data.values.shippingIncomeAmount),
          discountAmount: parseFloat(data.values.discountAmount),
          reason: data.values.reason,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Snapshot updated', description: 'The accounting snapshot has been adjusted successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-prep'] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.message || 'Failed to update snapshot',
        variant: 'destructive',
      });
    },
  });
  
  const summary = useMemo(() => {
    return {
      totalAR: snapshots.reduce((sum, s) => sum + parseFloat(s.arAmount || '0'), 0),
      totalStockRevenue: snapshots.reduce((sum, s) => sum + parseFloat(s.stockRevenueAmount || '0'), 0),
      totalShippingIncome: snapshots.reduce((sum, s) => sum + parseFloat(s.shippingIncomeAmount || '0'), 0),
      totalDiscounts: snapshots.reduce((sum, s) => sum + parseFloat(s.discountAmount || '0'), 0),
      totalNet: snapshots.reduce((sum, s) => sum + parseFloat(s.netTotal || '0'), 0),
      snapshotCount: snapshots.length,
      adjustedCount: snapshots.filter(s => s.lastAdjustedAt).length,
    };
  }, [snapshots]);
  
  const handleRowClick = (snapshot: ShipmentAccountingSnapshot) => {
    setSelectedSnapshot(snapshot);
    setEditedValues({
      arAmount: snapshot.arAmount || '0',
      stockRevenueAmount: snapshot.stockRevenueAmount || '0',
      shippingIncomeAmount: snapshot.shippingIncomeAmount || '0',
      discountAmount: snapshot.discountAmount || '0',
      reason: '',
    });
    setIsEditing(false);
    setIsDetailOpen(true);
  };
  
  const handleSave = () => {
    if (!editedValues.reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a reason for this adjustment.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedSnapshot) {
      updateMutation.mutate({ id: selectedSnapshot.id, values: editedValues });
    }
  };
  
  const calculatedNetTotal = useMemo(() => {
    const stock = parseFloat(editedValues.stockRevenueAmount || '0');
    const shipping = parseFloat(editedValues.shippingIncomeAmount || '0');
    const discount = parseFloat(editedValues.discountAmount || '0');
    return stock + shipping - discount;
  }, [editedValues.stockRevenueAmount, editedValues.shippingIncomeAmount, editedValues.discountAmount]);
  
  const hasImbalance = useMemo(() => {
    const ar = parseFloat(editedValues.arAmount || '0');
    return Math.abs(ar - calculatedNetTotal) > 0.01;
  }, [editedValues.arAmount, calculatedNetTotal]);

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access the Accounting Prep feature. 
              This page is restricted to authorized personnel only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLocation('/')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounting Prep</h1>
          <p className="text-muted-foreground">
            Phase 0 - Shipment accounting snapshots for QuickBooks journal entry preparation
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total A/R</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.totalAR)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stock Revenue</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.totalStockRevenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shipping Income</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.totalShippingIncome)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Discounts</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.totalDiscounts)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net Total</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.totalNet)}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="startDate">From:</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="endDate">To:</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="customer">Customer:</Label>
              <Input
                id="customer"
                placeholder="Filter by customer ID..."
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-48"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="adjustedOnly"
                checked={adjustedOnly}
                onCheckedChange={(checked) => setAdjustedOnly(checked === true)}
              />
              <Label htmlFor="adjustedOnly" className="cursor-pointer">Adjusted only</Label>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Shipment Snapshots
            </span>
            <Badge variant="outline">
              {summary.snapshotCount} snapshots ({summary.adjustedCount} adjusted)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No shipment snapshots found for the selected date range.
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment ID</TableHead>
                    <TableHead>Shipment Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">A/R</TableHead>
                    <TableHead className="text-right">Stock Revenue</TableHead>
                    <TableHead className="text-right">Shipping</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Net Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snapshot) => (
                    <TableRow
                      key={snapshot.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(snapshot)}
                    >
                      <TableCell className="font-mono text-xs">
                        {snapshot.shipmentId.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {format(new Date(snapshot.shipmentDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {snapshot.customerName || snapshot.customerId}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(snapshot.arAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(snapshot.stockRevenueAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(snapshot.shippingIncomeAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(snapshot.discountAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(snapshot.netTotal)}
                      </TableCell>
                      <TableCell>
                        {snapshot.lastAdjustedAt ? (
                          <Badge variant="secondary" className="gap-1">
                            <Edit className="h-3 w-3" />
                            Adjusted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Original
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>Shipment Accounting Snapshot</SheetTitle>
            <SheetDescription>
              {selectedSnapshot && (
                <>
                  Captured on {format(new Date(selectedSnapshot.autoCapturedAt), 'MMM d, yyyy h:mm a')}
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          
          {selectedSnapshot && (
            <ScrollArea className="h-[calc(100vh-120px)] pr-4 mt-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Shipment Info</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Shipment ID</Label>
                      <p className="font-mono">{selectedSnapshot.shipmentId}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Shipment Date</Label>
                      <p>{format(new Date(selectedSnapshot.shipmentDate), 'MMM d, yyyy')}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Customer</Label>
                      <p>{selectedSnapshot.customerName || selectedSnapshot.customerId}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Sales Order</Label>
                      <p>{selectedSnapshot.salesOrderId || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Journal Entry Preview</h3>
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 font-mono text-sm">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="pl-0">Dr Accounts Receivable</span>
                          <span>{formatCurrency(isEditing ? editedValues.arAmount : selectedSnapshot.arAmount)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span className="pl-6">Cr Stock Revenue</span>
                          <span>{formatCurrency(isEditing ? editedValues.stockRevenueAmount : selectedSnapshot.stockRevenueAmount)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span className="pl-6">Cr Shipping Income</span>
                          <span>{formatCurrency(isEditing ? editedValues.shippingIncomeAmount : selectedSnapshot.shippingIncomeAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="pl-0">Dr Discounts</span>
                          <span>{formatCurrency(isEditing ? editedValues.discountAmount : selectedSnapshot.discountAmount)}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between font-bold">
                          <span>Net Total</span>
                          <span>{formatCurrency(isEditing ? calculatedNetTotal : selectedSnapshot.netTotal)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {isEditing && hasImbalance && (
                    <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 p-3 rounded-md">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">
                        A/R amount ({formatCurrency(editedValues.arAmount)}) does not match calculated net total ({formatCurrency(calculatedNetTotal)})
                      </span>
                    </div>
                  )}
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">
                      {isEditing ? 'Edit Values' : 'Current Values'}
                    </h3>
                    {!isEditing && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                  
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="arAmount">A/R Amount</Label>
                          <Input
                            id="arAmount"
                            type="number"
                            step="0.01"
                            value={editedValues.arAmount}
                            onChange={(e) => setEditedValues({ ...editedValues, arAmount: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="stockRevenue">Stock Revenue</Label>
                          <Input
                            id="stockRevenue"
                            type="number"
                            step="0.01"
                            value={editedValues.stockRevenueAmount}
                            onChange={(e) => setEditedValues({ ...editedValues, stockRevenueAmount: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="shippingIncome">Shipping Income</Label>
                          <Input
                            id="shippingIncome"
                            type="number"
                            step="0.01"
                            value={editedValues.shippingIncomeAmount}
                            onChange={(e) => setEditedValues({ ...editedValues, shippingIncomeAmount: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="discounts">Discounts</Label>
                          <Input
                            id="discounts"
                            type="number"
                            step="0.01"
                            value={editedValues.discountAmount}
                            onChange={(e) => setEditedValues({ ...editedValues, discountAmount: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="reason">Adjustment Reason (required)</Label>
                        <Textarea
                          id="reason"
                          placeholder="Explain why this adjustment is being made..."
                          value={editedValues.reason}
                          onChange={(e) => setEditedValues({ ...editedValues, reason: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-muted-foreground">A/R Amount</Label>
                        <p className="font-mono">{formatCurrency(selectedSnapshot.arAmount)}</p>
                        {selectedSnapshot.originalArAmount && selectedSnapshot.originalArAmount !== selectedSnapshot.arAmount && (
                          <p className="text-xs text-muted-foreground line-through">
                            Original: {formatCurrency(selectedSnapshot.originalArAmount)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Stock Revenue</Label>
                        <p className="font-mono">{formatCurrency(selectedSnapshot.stockRevenueAmount)}</p>
                        {selectedSnapshot.originalStockRevenueAmount && selectedSnapshot.originalStockRevenueAmount !== selectedSnapshot.stockRevenueAmount && (
                          <p className="text-xs text-muted-foreground line-through">
                            Original: {formatCurrency(selectedSnapshot.originalStockRevenueAmount)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Shipping Income</Label>
                        <p className="font-mono">{formatCurrency(selectedSnapshot.shippingIncomeAmount)}</p>
                        {selectedSnapshot.originalShippingIncomeAmount && selectedSnapshot.originalShippingIncomeAmount !== selectedSnapshot.shippingIncomeAmount && (
                          <p className="text-xs text-muted-foreground line-through">
                            Original: {formatCurrency(selectedSnapshot.originalShippingIncomeAmount)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Discounts</Label>
                        <p className="font-mono">{formatCurrency(selectedSnapshot.discountAmount)}</p>
                        {selectedSnapshot.originalDiscountAmount && selectedSnapshot.originalDiscountAmount !== selectedSnapshot.discountAmount && (
                          <p className="text-xs text-muted-foreground line-through">
                            Original: {formatCurrency(selectedSnapshot.originalDiscountAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Audit Trail
                  </h3>
                  {adjustments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No adjustments have been made to this snapshot.</p>
                  ) : (
                    <div className="space-y-3">
                      {adjustments.map((adj) => (
                        <Card key={adj.id} className="bg-muted/30">
                          <CardContent className="pt-3 pb-3">
                            <div className="text-sm">
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-medium">{getFieldDisplayName(adj.fieldName)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(adj.adjustedAt), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                              <div className="text-muted-foreground">
                                <span className="line-through">{formatCurrency(adj.oldValue)}</span>
                                <span className="mx-2">→</span>
                                <span className="font-medium text-foreground">{formatCurrency(adj.newValue)}</span>
                              </div>
                              <div className="mt-1 text-xs">
                                <span className="text-muted-foreground">By {adj.adjustedBy}: </span>
                                <span>{adj.reason}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
