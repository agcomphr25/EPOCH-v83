import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Package,
  CheckCircle,
  AlertCircle,
  Plus,
  DollarSign,
  Edit,
  QrCode,
  Truck,
  Factory,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RTSSalesDialog from '@/components/RTSSalesDialog';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';

interface RTSInventoryItem {
  id: string;
  rtsNumber: string;
  stockModel: string;
  actionLength: string | null;
  action: string | null;
  barrel: string | null;
  bottomMetal: string | null;
  color: string | null;
  extras: string | null;
  lastDepartment: string | null;
  status: string;
  currentDepartment: string | null;
  returnReason: string | null;
  returnNotes: string | null;
  shippedDate: string | null;
  createdAt: string;
  price: number | null;
}

const RTS_LAST_DEPARTMENTS = [
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
] as const;

const RTS_NEXT_DEPARTMENT: Record<(typeof RTS_LAST_DEPARTMENTS)[number], string> = {
  'Layup/Plugging': 'Barcode',
  Barcode: 'CNC',
  CNC: 'Gunsmith',
  Gunsmith: 'Finish',
  Finish: 'Finish QC',
  'Finish QC': 'Paint',
  Paint: 'Shipping QC',
  'Shipping QC': 'Shipping',
};

export default function RTSPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [addItemDialog, setAddItemDialog] = useState(false);
  const [editItemDialog, setEditItemDialog] = useState<{
    isOpen: boolean;
    item: RTSInventoryItem | null;
  }>({ isOpen: false, item: null });
  const [barcodeItem, setBarcodeItem] = useState<RTSInventoryItem | null>(null);
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    stockModel: '',
    actionLength: '',
    action: '',
    barrel: '',
    bottomMetal: '',
    color: '',
    extras: '',
    lastDepartment: '',
  });
  const [editItem, setEditItem] = useState({
    stockModel: '',
    actionLength: '',
    action: '',
    barrel: '',
    bottomMetal: '',
    color: '',
    extras: '',
    lastDepartment: '',
    price: '',
  });

  const { toast } = useToast();

  // Fetch RTS inventory
  const { data: rtsInventory, isLoading } = useQuery<RTSInventoryItem[]>({
    queryKey: ['/api/rts-inventory'],
  });

  // Apply search filter
  const filteredInventory = rtsInventory?.filter((item) => {
    if (!searchTerm.trim()) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      item.stockModel?.toLowerCase().includes(searchLower) ||
      item.actionLength?.toLowerCase().includes(searchLower) ||
      item.action?.toLowerCase().includes(searchLower) ||
      item.barrel?.toLowerCase().includes(searchLower) ||
      item.bottomMetal?.toLowerCase().includes(searchLower) ||
      item.color?.toLowerCase().includes(searchLower) ||
      item.extras?.toLowerCase().includes(searchLower) ||
      item.rtsNumber?.toLowerCase().includes(searchLower)
    );
  });

  // Add new item mutation
  const addItemMutation = useMutation({
    mutationFn: async (item: typeof newItem) => {
      return apiRequest('/api/rts-inventory', {
        method: 'POST',
        body: JSON.stringify(item),
      });
    },
    onSuccess: (createdItem: RTSInventoryItem) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      toast({
        title: 'Item Added',
        description: `${createdItem.rtsNumber} was added and is ready for a stock label.`,
      });
      setAddItemDialog(false);
      setBarcodeItem(createdItem);
      setNewItem({
        stockModel: '',
        actionLength: '',
        action: '',
        barrel: '',
        bottomMetal: '',
        color: '',
        extras: '',
        lastDepartment: '',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add RTS inventory item.',
        variant: 'destructive',
      });
    },
  });

  // Edit item mutation
  const editItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editItem }) => {
      return apiRequest(`/api/rts-inventory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      toast({
        title: 'Item Updated',
        description: 'RTS inventory item has been updated successfully.',
      });
      setEditItemDialog({ isOpen: false, item: null });
      setEditItem({
        stockModel: '',
        actionLength: '',
        action: '',
        barrel: '',
        bottomMetal: '',
        color: '',
        extras: '',
        lastDepartment: '',
        price: '',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update RTS inventory item.',
        variant: 'destructive',
      });
    },
  });


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <Badge className="bg-green-100 text-green-800 gap-1">
            <CheckCircle className="h-3 w-3" />
            Available
          </Badge>
        );
      case 'IN_SHIPPING':
        return (
          <Badge className="bg-blue-100 text-blue-800 gap-1">
            <Truck className="h-3 w-3" />
            In Shipping
          </Badge>
        );
      case 'SHIPPED':
        return (
          <Badge className="bg-gray-100 text-gray-800 gap-1">
            <CheckCircle className="h-3 w-3" />
            Shipped
          </Badge>
        );
      case 'IN_PRODUCTION':
        return (
          <Badge className="bg-orange-100 text-orange-800 gap-1">
            <Factory className="h-3 w-3" />
            In Production
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            {status}
          </Badge>
        );
    }
  };

  // Filter to only show available items
  const availableInventory = filteredInventory?.filter(item => item.status === 'AVAILABLE');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Ready to Sell (RTS)</h1>
            <p className="text-sm text-gray-600">
              Finished stock inventory available for sale or production re-entry
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setSalesDialogOpen(true)}
            variant="outline"
            className="gap-2"
            disabled={!availableInventory || availableInventory.length === 0}
            data-testid="button-create-sale"
          >
            <DollarSign className="h-4 w-4" />
            Create Sale
          </Button>
          <Button
            onClick={() => setAddItemDialog(true)}
            className="bg-primary hover:bg-primary/90"
            data-testid="button-add-item"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Item
          </Button>
          {availableInventory && (
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {availableInventory.length} Item{availableInventory.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by RTS number, stock model, action, barrel, color..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-rts"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            On-Hand Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Package className="h-6 w-6 animate-spin mr-2" />
              Loading inventory...
            </div>
          ) : !availableInventory || availableInventory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="text-lg font-medium">No inventory available</p>
              <p className="text-sm">All items have been shipped or sent to production</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RTS Number</TableHead>
                    <TableHead>Stock Model</TableHead>
                    <TableHead>Action Length</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Barrel</TableHead>
                    <TableHead>Bottom Metal</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Extras</TableHead>
                    <TableHead>Last Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableInventory.map((item) => (
                    <TableRow key={item.id} data-testid={`row-rts-${item.id}`}>
                      <TableCell className="font-mono font-semibold">{item.rtsNumber}</TableCell>
                      <TableCell className="font-medium" data-testid={`text-stock-model-${item.id}`}>
                        {item.stockModel}
                      </TableCell>
                      <TableCell>{item.actionLength || 'N/A'}</TableCell>
                      <TableCell>{item.action || 'N/A'}</TableCell>
                      <TableCell>{item.barrel || 'N/A'}</TableCell>
                      <TableCell>{item.bottomMetal || 'N/A'}</TableCell>
                      <TableCell>{item.color || 'N/A'}</TableCell>
                      <TableCell>{item.extras || 'N/A'}</TableCell>
                      <TableCell>
                        <div>{item.lastDepartment || 'Not set'}</div>
                        {item.lastDepartment && (
                          <div className="text-xs text-muted-foreground">
                            Resumes in {RTS_NEXT_DEPARTMENT[item.lastDepartment as keyof typeof RTS_NEXT_DEPARTMENT]}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditItemDialog({ isOpen: true, item });
                              setEditItem({
                                stockModel: item.stockModel || '',
                                actionLength: item.actionLength || '',
                                action: item.action || '',
                                barrel: item.barrel || '',
                                bottomMetal: item.bottomMetal || '',
                                color: item.color || '',
                                extras: item.extras || '',
                                lastDepartment: item.lastDepartment || '',
                                price: item.price?.toString() || '',
                              });
                            }}
                            className="flex items-center gap-1"
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBarcodeItem(item)}
                            className="flex items-center gap-1"
                            data-testid={`button-print-barcode-${item.id}`}
                          >
                            <QrCode className="h-3 w-3" />
                            Barcode
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

      {/* Add New Item Dialog */}
      <Dialog open={addItemDialog} onOpenChange={setAddItemDialog}>
        <DialogContent className="sm:max-w-md max-h-[calc(100vh-4rem)] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New RTS Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <div>
              <Label htmlFor="stockModel">Stock Model *</Label>
              <Input
                id="stockModel"
                placeholder="e.g., SA Long Action"
                value={newItem.stockModel}
                onChange={(e) =>
                  setNewItem({ ...newItem, stockModel: e.target.value })
                }
                data-testid="input-stock-model"
              />
            </div>

            <div>
              <Label htmlFor="actionLength">Action Length</Label>
              <Input
                id="actionLength"
                placeholder="e.g., Long"
                value={newItem.actionLength}
                onChange={(e) =>
                  setNewItem({ ...newItem, actionLength: e.target.value })
                }
                data-testid="input-action-length"
              />
            </div>

            <div>
              <Label htmlFor="action">Action</Label>
              <Input
                id="action"
                placeholder="e.g., Tikka, Rem 700"
                value={newItem.action}
                onChange={(e) =>
                  setNewItem({ ...newItem, action: e.target.value })
                }
                data-testid="input-action"
              />
            </div>

            <div>
              <Label htmlFor="barrel">Barrel</Label>
              <Input
                id="barrel"
                placeholder="e.g., Med Palma"
                value={newItem.barrel}
                onChange={(e) =>
                  setNewItem({ ...newItem, barrel: e.target.value })
                }
                data-testid="input-barrel"
              />
            </div>

            <div>
              <Label htmlFor="bottomMetal">Bottom Metal</Label>
              <Input
                id="bottomMetal"
                placeholder="e.g., BDL, M5"
                value={newItem.bottomMetal}
                onChange={(e) =>
                  setNewItem({ ...newItem, bottomMetal: e.target.value })
                }
                data-testid="input-bottom-metal"
              />
            </div>

            <div>
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                placeholder="e.g., Black, Coyote"
                value={newItem.color}
                onChange={(e) =>
                  setNewItem({ ...newItem, color: e.target.value })
                }
                data-testid="input-color"
              />
            </div>

            <div>
              <Label htmlFor="extras">Extras / Order Code</Label>
              <Input
                id="extras"
                placeholder="e.g., SAL-B-REG"
                value={newItem.extras}
                onChange={(e) =>
                  setNewItem({ ...newItem, extras: e.target.value })
                }
                data-testid="input-extras"
              />
            </div>

            <div>
              <Label htmlFor="lastDepartment">Last Department Item Finished *</Label>
              <Select
                value={newItem.lastDepartment}
                onValueChange={(lastDepartment) => setNewItem({ ...newItem, lastDepartment })}
              >
                <SelectTrigger id="lastDepartment" data-testid="select-last-department">
                  <SelectValue placeholder="Select the last completed department" />
                </SelectTrigger>
                <SelectContent>
                  {RTS_LAST_DEPARTMENTS.map((department) => (
                    <SelectItem key={department} value={department}>{department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {newItem.lastDepartment
                  ? `When purchased, the production order will enter ${RTS_NEXT_DEPARTMENT[newItem.lastDepartment as keyof typeof RTS_NEXT_DEPARTMENT]}.`
                  : 'This determines where the item resumes as a regular production order.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddItemDialog(false);
                setNewItem({
                  stockModel: '',
                  actionLength: '',
                  action: '',
                  barrel: '',
                  bottomMetal: '',
                  color: '',
                  extras: '',
                  lastDepartment: '',
                });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addItemMutation.mutate(newItem)}
              disabled={addItemMutation.isPending || !newItem.stockModel.trim() || !newItem.lastDepartment}
              data-testid="button-confirm-add-item"
            >
              {addItemMutation.isPending ? 'Adding...' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog
        open={editItemDialog.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditItemDialog({ isOpen: false, item: null });
            setEditItem({
              stockModel: '',
              actionLength: '',
              action: '',
              barrel: '',
              bottomMetal: '',
              color: '',
              extras: '',
              price: '',
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[calc(100vh-4rem)] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit RTS Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <div>
              <Label htmlFor="edit-stockModel">Stock Model *</Label>
              <Input
                id="edit-stockModel"
                placeholder="e.g., SA Long Action"
                value={editItem.stockModel}
                onChange={(e) =>
                  setEditItem({ ...editItem, stockModel: e.target.value })
                }
                data-testid="input-edit-stock-model"
              />
            </div>

            <div>
              <Label htmlFor="edit-actionLength">Action Length</Label>
              <Input
                id="edit-actionLength"
                placeholder="e.g., Long"
                value={editItem.actionLength}
                onChange={(e) =>
                  setEditItem({ ...editItem, actionLength: e.target.value })
                }
                data-testid="input-edit-action-length"
              />
            </div>

            <div>
              <Label htmlFor="edit-action">Action</Label>
              <Input
                id="edit-action"
                placeholder="e.g., Tikka, Rem 700"
                value={editItem.action}
                onChange={(e) =>
                  setEditItem({ ...editItem, action: e.target.value })
                }
                data-testid="input-edit-action"
              />
            </div>

            <div>
              <Label htmlFor="edit-barrel">Barrel</Label>
              <Input
                id="edit-barrel"
                placeholder="e.g., Med Palma"
                value={editItem.barrel}
                onChange={(e) =>
                  setEditItem({ ...editItem, barrel: e.target.value })
                }
                data-testid="input-edit-barrel"
              />
            </div>

            <div>
              <Label htmlFor="edit-bottomMetal">Bottom Metal</Label>
              <Input
                id="edit-bottomMetal"
                placeholder="e.g., BDL, M5"
                value={editItem.bottomMetal}
                onChange={(e) =>
                  setEditItem({ ...editItem, bottomMetal: e.target.value })
                }
                data-testid="input-edit-bottom-metal"
              />
            </div>

            <div>
              <Label htmlFor="edit-color">Color</Label>
              <Input
                id="edit-color"
                placeholder="e.g., Black, Coyote"
                value={editItem.color}
                onChange={(e) =>
                  setEditItem({ ...editItem, color: e.target.value })
                }
                data-testid="input-edit-color"
              />
            </div>

            <div>
              <Label htmlFor="edit-extras">Extras / Order Code</Label>
              <Input
                id="edit-extras"
                placeholder="e.g., SAL-B-REG"
                value={editItem.extras}
                onChange={(e) =>
                  setEditItem({ ...editItem, extras: e.target.value })
                }
                data-testid="input-edit-extras"
              />
            </div>

            <div>
              <Label htmlFor="edit-price">Price</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                placeholder="e.g., 1250.00"
                value={editItem.price}
                onChange={(e) =>
                  setEditItem({ ...editItem, price: e.target.value })
                }
                data-testid="input-edit-price"
              />
            </div>

            <div>
              <Label htmlFor="edit-lastDepartment">Last Department Item Finished *</Label>
              <Select
                value={editItem.lastDepartment}
                onValueChange={(lastDepartment) => setEditItem({ ...editItem, lastDepartment })}
              >
                <SelectTrigger id="edit-lastDepartment" data-testid="select-edit-last-department">
                  <SelectValue placeholder="Select the last completed department" />
                </SelectTrigger>
                <SelectContent>
                  {RTS_LAST_DEPARTMENTS.map((department) => (
                    <SelectItem key={department} value={department}>{department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditItemDialog({ isOpen: false, item: null });
                setEditItem({
                  stockModel: '',
                  actionLength: '',
                  action: '',
                  barrel: '',
                  bottomMetal: '',
                  color: '',
                  extras: '',
                  lastDepartment: '',
                  price: '',
                });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editItemDialog.item) {
                  editItemMutation.mutate({
                    id: editItemDialog.item.id,
                    data: editItem,
                  });
                }
              }}
              disabled={editItemMutation.isPending || !editItem.stockModel.trim() || !editItem.lastDepartment}
              data-testid="button-confirm-edit-item"
            >
              {editItemMutation.isPending ? 'Updating...' : 'Update Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!barcodeItem} onOpenChange={(open) => !open && setBarcodeItem(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>RTS Stock Barcode</DialogTitle>
          </DialogHeader>
          {barcodeItem && (
            <BarcodeDisplay
              orderId={barcodeItem.rtsNumber}
              barcode={barcodeItem.rtsNumber}
              stockModel={barcodeItem.stockModel}
              actionLength={barcodeItem.actionLength || undefined}
              color={barcodeItem.color || undefined}
              titleLabel="Ready to Sell Item"
              printHeaderLabel="RTS STOCK"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* RTS Sales Dialog */}
      <RTSSalesDialog
        isOpen={salesDialogOpen}
        onClose={() => setSalesDialogOpen(false)}
        availableItems={availableInventory || []}
      />
    </div>
  );
}
