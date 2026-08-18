import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ArrowLeft, Plus, Pencil, Trash2, Package, Send, Check, ChevronsUpDown, AlertCircle, ArrowDown, ArrowUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface P2POItemsManagerProps {
  poId: number;
  poNumber: string;
  onBack: () => void;
  correctionReason?: string;
}

interface P2POItem {
  id: number;
  poId: number;
  inventoryItemId?: number | null;
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specifications?: string;
  notes?: string;
}

export function P2POItemsManager({
  poId,
  poNumber,
  onBack,
  correctionReason,
}: P2POItemsManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<P2POItem | null>(null);
  const [partNumberOpen, setPartNumberOpen] = useState(false);
  const [formData, setFormData] = useState({
    partNumber: '',
    partName: '',
    quantity: 1,
    unitPrice: 0,
    specifications: '',
    notes: '',
    inventoryItemId: null as number | null,
  });
  const [editError, setEditError] = useState<{
    message: string;
    minQuantity?: number;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch unit-counts for the item being edited (used to preview qty-edit impact)
  const { data: editingCounts } = useQuery<{
    serializedTotal: number;
    unstarted: number;
    inProgress: number;
    productionOrders: number;
    productionOrdersPending: number;
  }>({
    queryKey: [
      '/api/p2/purchase-orders',
      poId,
      'items',
      editingItem?.id,
      'unit-counts',
    ],
    queryFn: () =>
      apiRequest(
        `/api/p2/purchase-orders/${poId}/items/${editingItem!.id}/unit-counts`
      ),
    enabled: !!editingItem && dialogOpen,
  });

  // Fetch P2 PO items for this specific PO
  const { data: items = [], isLoading } = useQuery<P2POItem[]>({
    queryKey: ['/api/p2/purchase-orders', poId, 'items'],
    queryFn: () => apiRequest(`/api/p2/purchase-orders/${poId}/items`),
  });

  // Fetch inventory items for autocomplete
  const { data: inventoryItems = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ['/api/inventory/items'],
    select: (data: any[]) =>
      data
        .map((item) => ({
          id: item.id,
          agPartNumber: item.agPartNumber,
          name: item.name,
          sku: item.sku,
        }))
        .filter((item) => item.agPartNumber), // Only items with part numbers
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items`, {
        method: 'POST',
        body: { ...data, correctionReason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/purchase-orders', poId, 'items'],
      });
      toast({
        title: 'Success',
        description: 'Item added successfully',
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add item',
        variant: 'destructive',
      });
    },
  });

  type UpdateSync =
    | null
    | {
        direction: 'increase';
        delta: number;
        serializedItemsAdded: number;
        productionOrdersAdded: number;
      }
    | {
        direction: 'decrease';
        delta: number;
        serializedItemsRemoved: number;
        productionOrdersRemoved: number;
      };
  type UpdateResponse = P2POItem & { sync?: UpdateSync };
  type QtyConflictPayload = {
    error?: string;
    code?: string;
    minQuantity?: number;
    inProgressCount?: number;
    unstartedCount?: number;
    currentQuantity?: number;
    requestedQuantity?: number;
  };
  type ApiError = Error & {
    status?: number;
    responseData?: QtyConflictPayload;
  };

  const updateMutation = useMutation<
    UpdateResponse,
    ApiError,
    { itemId: number; data: typeof formData }
  >({
    mutationFn: ({ itemId, data }) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, {
        method: 'PUT',
        body: { ...data, correctionReason },
      }) as Promise<UpdateResponse>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/purchase-orders', poId, 'items'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/layup-schedules/unscheduled'],
      });
      let description = 'Item updated successfully';
      const sync = data.sync;
      if (sync?.direction === 'increase') {
        description = `Added ${sync.serializedItemsAdded} unit(s)` +
          (sync.productionOrdersAdded
            ? ` and ${sync.productionOrdersAdded} production order(s)`
            : '');
      } else if (sync?.direction === 'decrease') {
        description = `Removed ${sync.serializedItemsRemoved} unstarted unit(s)` +
          (sync.productionOrdersRemoved
            ? ` and ${sync.productionOrdersRemoved} pending production order(s)`
            : '');
      }
      toast({ title: 'Success', description });
      setDialogOpen(false);
      setEditingItem(null);
      setEditError(null);
      resetForm();
    },
    onError: (error) => {
      // Backend assigns the JSON body onto the error object via Object.assign
      const data: QtyConflictPayload = error.responseData ?? {};
      const isQtyConflict =
        error.status === 409 &&
        (data.code === 'IN_PROGRESS_BLOCKS_DECREASE' || typeof data.minQuantity === 'number');

      if (isQtyConflict) {
        setEditError({
          message: data.error || error.message || 'Quantity decrease blocked by in-progress units.',
          minQuantity: data.minQuantity,
        });
        return;
      }

      setEditError({ message: error.message || 'Failed to update item' });
      toast({
        title: 'Error',
        description: error.message || 'Failed to update item',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, {
        method: 'DELETE',
        body: { correctionReason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/purchase-orders', poId, 'items'],
      });
      toast({
        title: 'Success',
        description: 'Item deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete item',
        variant: 'destructive',
      });
    },
  });

  const generateSerializedItemsMutation = useMutation({
    mutationFn: (poItemId: number) =>
      apiRequest(`/api/p2/layup-schedules/generate-serialized-items/${poItemId}`, {
        method: 'POST',
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/layup-schedules/unscheduled'],
      });
      toast({
        title: 'Success',
        description: `Generated ${data.count} serialized items in Pending Layup status`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate serialized items',
        variant: 'destructive',
      });
    },
  });

  const sendToLayupMutation = useMutation({
    mutationFn: (poItemId: number) =>
      apiRequest(`/api/p2/layup-schedules/send-to-layup/${poItemId}`, {
        method: 'POST',
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/layup-schedules/unscheduled'],
      });
      toast({
        title: 'Success',
        description: `${data.count} items sent to Layup Scheduler`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send items to Layup',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      partNumber: '',
      partName: '',
      quantity: 1,
      unitPrice: 0,
      specifications: '',
      notes: '',
      inventoryItemId: null,
    });
    setEditingItem(null);
  };

  const handleOpenCreateDialog = () => {
    resetForm();
    setEditError(null);
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (item: P2POItem) => {
    setEditingItem(item);
    setEditError(null);
    setFormData({
      partNumber: item.partNumber,
      partName: item.partName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      specifications: item.specifications || '',
      notes: item.notes || '',
      inventoryItemId: item.inventoryItemId ?? null,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    if (editingItem) {
      updateMutation.mutate({ itemId: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Compute live impact preview when editing quantity on an item that already
  // has serialized units / production orders generated.
  const qtyDelta = editingItem ? formData.quantity - editingItem.quantity : 0;
  const showQtyPreview =
    !!editingItem && !!editingCounts && editingCounts.serializedTotal > 0 && qtyDelta !== 0;
  const decreaseBlocked =
    !!editingItem &&
    !!editingCounts &&
    qtyDelta < 0 &&
    formData.quantity < editingCounts.inProgress;

  const totalValue = items.reduce((sum, item) => sum + item.totalPrice, 0);

  if (isLoading) {
    return <div className="p-6">Loading P2 purchase order items...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to P2 Purchase Orders
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              P2 PO Items - {poNumber}
            </h2>
            <p className="text-muted-foreground">
              Manage parts and quantities for this P2 purchase order
            </p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreateDialog} data-testid="button-add-item">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Edit P2 PO Item' : 'Add P2 PO Item'}
              </DialogTitle>
              <DialogDescription>
                {editingItem
                  ? 'Update item information'
                  : 'Add a new part to this P2 purchase order'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Part Number * (from inventory or custom)</Label>
                  <Popover open={partNumberOpen} onOpenChange={setPartNumberOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={partNumberOpen}
                        className="w-full justify-between font-normal"
                        disabled={isLoadingInventory}
                      >
                        {formData.partNumber || "Select part number..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search parts..." />
                        <CommandList>
                          <CommandEmpty>No parts found.</CommandEmpty>
                          <CommandGroup className="max-h-[300px] overflow-y-auto">
                            {inventoryItems.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.agPartNumber} ${item.name}`}
                                onSelect={() => {
                                  setFormData({
                                    ...formData,
                                    partNumber: item.agPartNumber,
                                    partName: item.name,
                                    inventoryItemId: item.id,
                                  });
                                  setPartNumberOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.partNumber === item.agPartNumber
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium">{item.agPartNumber}</span>
                                  <span className="text-sm text-muted-foreground">{item.name}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    id="customPartNumber"
                    value={formData.partNumber}
                    onChange={(e) => setFormData({ ...formData, partNumber: e.target.value, inventoryItemId: null })}
                    placeholder="Or type custom part number..."
                    className="mt-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partName">Part Name *</Label>
                  <Input
                    id="partName"
                    value={formData.partName}
                    onChange={(e) =>
                      setFormData({ ...formData, partName: e.target.value })
                    }
                    required
                    placeholder="Enter part name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={editingCounts?.inProgress || 1}
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    required
                    data-testid="input-quantity"
                  />
                  {editingItem && editingCounts && editingCounts.serializedTotal > 0 && (
                    <p className="text-xs text-muted-foreground" data-testid="text-unit-counts">
                      {editingCounts.serializedTotal} unit(s) generated · {editingCounts.unstarted} unstarted ·{' '}
                      {editingCounts.inProgress} in progress
                      {editingCounts.productionOrders > 0
                        ? ` · ${editingCounts.productionOrders} production order(s)`
                        : ''}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">Unit Price ($)</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unitPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specifications">Specifications</Label>
                <Textarea
                  id="specifications"
                  value={formData.specifications}
                  onChange={(e) =>
                    setFormData({ ...formData, specifications: e.target.value })
                  }
                  placeholder="Enter specifications (optional)"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Enter notes (optional)"
                  rows={2}
                />
              </div>

              {/* Live preview of the impact of a quantity change */}
              {showQtyPreview && qtyDelta > 0 && (
                <Alert data-testid="alert-qty-increase-preview">
                  <ArrowUp className="h-4 w-4" />
                  <AlertTitle>Quantity increase</AlertTitle>
                  <AlertDescription>
                    {qtyDelta} new serialized unit(s) will be added with continued barcodes
                    {editingCounts!.productionOrders > 0
                      ? ', and matching production orders will be generated.'
                      : '.'}
                  </AlertDescription>
                </Alert>
              )}
              {showQtyPreview && qtyDelta < 0 && !decreaseBlocked && (
                <Alert data-testid="alert-qty-decrease-preview">
                  <ArrowDown className="h-4 w-4" />
                  <AlertTitle>Quantity decrease</AlertTitle>
                  <AlertDescription>
                    {Math.abs(qtyDelta)} unstarted unit(s) will be removed
                    {editingCounts!.productionOrdersPending > 0
                      ? ' along with matching pending production orders.'
                      : '.'}{' '}
                    {editingCounts!.inProgress} in-progress unit(s) are protected.
                  </AlertDescription>
                </Alert>
              )}
              {showQtyPreview && decreaseBlocked && (
                <Alert variant="destructive" data-testid="alert-qty-blocked">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Quantity too low</AlertTitle>
                  <AlertDescription>
                    {editingCounts!.inProgress} unit(s) have already started production. Minimum
                    quantity is {editingCounts!.inProgress}.
                  </AlertDescription>
                </Alert>
              )}
              {editError && (
                <Alert variant="destructive" data-testid="alert-edit-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Update blocked</AlertTitle>
                  <AlertDescription>
                    {editError.message}
                    {typeof editError.minQuantity === 'number' && (
                      <> Minimum allowed quantity: {editError.minQuantity}.</>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setEditError(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    decreaseBlocked
                  }
                  data-testid="button-save-item"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingItem
                      ? 'Update Item'
                      : 'Add Item'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
          <CardDescription>
            {items.length === 0
              ? 'No items added yet'
              : `${items.length} item${items.length === 1 ? '' : 's'} | Total: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No items added to this P2 purchase order yet.</p>
              <p className="text-sm mt-2">
                Click "Add Item" to add your first item.
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        {item.partNumber}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.partName}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        ${item.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateSerializedItemsMutation.mutate(item.id)}
                            disabled={generateSerializedItemsMutation.isPending}
                            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
                            title="Generate serialized items (Pending Layup status)"
                            data-testid={`button-generate-${item.id}`}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendToLayupMutation.mutate(item.id)}
                            disabled={sendToLayupMutation.isPending}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                            title="Send generated items to Layup Scheduler"
                            data-testid={`button-send-to-layup-${item.id}`}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditDialog(item)}
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-red-600 hover:text-red-800"
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Centralized inventory items datalist for Part Number autocomplete */}
      <datalist id="inventory-items-list">
        {inventoryItems.map((item: any) => (
          <option key={item.id} value={item.agPartNumber}>
            {item.agPartNumber} - {item.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}
