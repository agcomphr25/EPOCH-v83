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
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Truck,
  Search,
  Package,
  CheckCircle,
  AlertCircle,
  Factory,
  Plus,
  DollarSign,
  Edit,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RTSSalesDialog from '@/components/RTSSalesDialog';

interface RTSInventoryItem {
  id: string;
  stockModel: string;
  actionLength: string | null;
  action: string | null;
  barrel: string | null;
  bottomMetal: string | null;
  color: string | null;
  extras: string | null;
  status: string;
  currentDepartment: string | null;
  returnReason: string | null;
  returnNotes: string | null;
  shippedDate: string | null;
  createdAt: string;
  price: number | null;
}

const departments = [
  'Layup/Plugging',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'QC & Shipping',
  'Shipping',
];

const returnReasons = [
  'Quality Issue',
  'Missing Components',
  'Finish Defect',
  'Paint Touch-Up Needed',
  'Customer Customization Request',
  'Measurement Error',
  'Other',
];

export default function RTSPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sendToProductionDialog, setSendToProductionDialog] = useState<{
    isOpen: boolean;
    item: RTSInventoryItem | null;
  }>({ isOpen: false, item: null });
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [productionNotes, setProductionNotes] = useState('');
  const [addItemDialog, setAddItemDialog] = useState(false);
  const [editItemDialog, setEditItemDialog] = useState<{
    isOpen: boolean;
    item: RTSInventoryItem | null;
  }>({ isOpen: false, item: null });
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    stockModel: '',
    actionLength: '',
    action: '',
    barrel: '',
    bottomMetal: '',
    color: '',
    extras: '',
  });
  const [editItem, setEditItem] = useState({
    stockModel: '',
    actionLength: '',
    action: '',
    barrel: '',
    bottomMetal: '',
    color: '',
    extras: '',
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
      item.extras?.toLowerCase().includes(searchLower)
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      toast({
        title: 'Item Added',
        description: 'RTS inventory item has been added successfully.',
      });
      setAddItemDialog(false);
      setNewItem({
        stockModel: '',
        actionLength: '',
        action: '',
        barrel: '',
        bottomMetal: '',
        color: '',
        extras: '',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to add RTS inventory item.',
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
        price: '',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update RTS inventory item.',
        variant: 'destructive',
      });
    },
  });

  // Send to shipping mutation
  const sendToShippingMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(`/api/rts-inventory/${itemId}/ship`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      toast({
        title: 'Sent to Shipping',
        description: 'The item has been sent to the Shipping department.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send item to shipping',
        variant: 'destructive',
      });
    },
  });

  // Send to production mutation
  const sendToProductionMutation = useMutation({
    mutationFn: async ({
      itemId,
      department,
      reason,
      notes,
    }: {
      itemId: string;
      department: string;
      reason: string;
      notes: string;
    }) => {
      return apiRequest(`/api/rts-inventory/${itemId}/send-to-production`, {
        method: 'POST',
        body: JSON.stringify({ department, reason, notes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      setSendToProductionDialog({ isOpen: false, item: null });
      setSelectedDepartment('');
      setSelectedReason('');
      setProductionNotes('');
      toast({
        title: 'Sent to Production',
        description: 'The item has been sent back to production.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send item to production',
        variant: 'destructive',
      });
    },
  });

  const handleSendToProduction = () => {
    if (!sendToProductionDialog.item || !selectedDepartment || !selectedReason) {
      toast({
        title: 'Missing Information',
        description: 'Please select both department and reason.',
        variant: 'destructive',
      });
      return;
    }

    sendToProductionMutation.mutate({
      itemId: sendToProductionDialog.item.id,
      department: selectedDepartment,
      reason: selectedReason,
      notes: productionNotes,
    });
  };

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
            <h1 className="text-3xl font-bold">Ready to Ship (RTS)</h1>
            <p className="text-sm text-gray-600">
              Finished stock inventory ready for shipment or production triage
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
                placeholder="Search by stock model, action, barrel, color, etc..."
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
                    <TableHead>Stock Model</TableHead>
                    <TableHead>Action Length</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Barrel</TableHead>
                    <TableHead>Bottom Metal</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Extras</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableInventory.map((item) => (
                    <TableRow key={item.id} data-testid={`row-rts-${item.id}`}>
                      <TableCell className="font-medium" data-testid={`text-stock-model-${item.id}`}>
                        {item.stockModel}
                      </TableCell>
                      <TableCell>{item.actionLength || 'N/A'}</TableCell>
                      <TableCell>{item.action || 'N/A'}</TableCell>
                      <TableCell>{item.barrel || 'N/A'}</TableCell>
                      <TableCell>{item.bottomMetal || 'N/A'}</TableCell>
                      <TableCell>{item.color || 'N/A'}</TableCell>
                      <TableCell>{item.extras || 'N/A'}</TableCell>
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
                            variant="default"
                            size="sm"
                            onClick={() => sendToShippingMutation.mutate(item.id)}
                            disabled={sendToShippingMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
                            data-testid={`button-ship-${item.id}`}
                          >
                            <Truck className="h-3 w-3" />
                            Send to Shipping
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSendToProductionDialog({ isOpen: true, item });
                              setSelectedDepartment('');
                              setSelectedReason('');
                              setProductionNotes('');
                            }}
                            className="flex items-center gap-1"
                            data-testid={`button-production-${item.id}`}
                          >
                            <Factory className="h-3 w-3" />
                            Send to Production
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

      {/* Send to Production Dialog */}
      <Dialog
        open={sendToProductionDialog.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSendToProductionDialog({ isOpen: false, item: null });
            setSelectedDepartment('');
            setSelectedReason('');
            setProductionNotes('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Production</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {sendToProductionDialog.item && (
              <div className="text-sm text-gray-600">
                <strong>Item:</strong> {sendToProductionDialog.item.stockModel}
              </div>
            )}

            <div>
              <Label htmlFor="department">Department *</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reason">Reason for Return *</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger data-testid="select-reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {returnReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Explain what changes are needed..."
                value={productionNotes}
                onChange={(e) => setProductionNotes(e.target.value)}
                rows={4}
                data-testid="textarea-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSendToProductionDialog({ isOpen: false, item: null });
                setSelectedDepartment('');
                setSelectedReason('');
                setProductionNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendToProduction}
              disabled={sendToProductionMutation.isPending || !selectedDepartment || !selectedReason}
              data-testid="button-confirm-production"
            >
              {sendToProductionMutation.isPending ? 'Sending...' : 'Send to Production'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Item Dialog */}
      <Dialog open={addItemDialog} onOpenChange={setAddItemDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New RTS Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addItemMutation.mutate(newItem)}
              disabled={addItemMutation.isPending || !newItem.stockModel.trim()}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit RTS Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              disabled={editItemMutation.isPending || !editItem.stockModel.trim()}
              data-testid="button-confirm-edit-item"
            >
              {editItemMutation.isPending ? 'Updating...' : 'Update Item'}
            </Button>
          </DialogFooter>
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
