import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, AlertCircle, FileWarning } from 'lucide-react';
import { format } from 'date-fns';

type NonConformingItem = {
  id: number;
  date: string;
  p1OrP2: string;
  customer: string;
  sku: string;
  qty: number;
  issueCause: string;
  manufacturerDefect: boolean;
  disposition: string;
  authorization: string;
  serialTagNumber?: string;
  dispositionDate?: string;
  correctiveActionNotes?: string;
  createdAt: string;
  updatedAt: string;
};

type FormData = {
  date: string;
  p1OrP2: string;
  customer: string;
  sku: string;
  qty: number;
  issueCause: string;
  manufacturerDefect: boolean;
  disposition: string;
  authorization: string;
  serialTagNumber: string;
  dispositionDate: string;
  correctiveActionNotes: string;
};

const initialFormData: FormData = {
  date: new Date().toISOString().split('T')[0],
  p1OrP2: 'P1',
  customer: '',
  sku: '',
  qty: 1,
  issueCause: '',
  manufacturerDefect: false,
  disposition: '',
  authorization: '',
  serialTagNumber: '',
  dispositionDate: '',
  correctiveActionNotes: '',
};

// Common values from the CSV data
const ISSUE_CAUSES = [
  'customer request for additional work',
  'wrong inlet/CNC error',
  'order error',
  'does not meet customer QC requirement',
  'cosmetic damage/poor finish',
  'shipping damage',
  'foam core issue',
  'paint issue',
  'cracked/broken stock',
  'cheek riser hardware issue',
  'other',
];

const DISPOSITIONS = [
  'Repair',
  'Scrap',
  'Use "As Is"',
];

const AUTHORIZATIONS = [
  'Customer',
  'Glenn',
  'Laurie',
  'Matt',
  'AG',
];

export default function NonConformingItemsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NonConformingItem | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);

  const { data: items = [], isLoading } = useQuery<NonConformingItem[]>({
    queryKey: ['/api/non-conforming-items'],
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest('/api/non-conforming-items', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        qty: Number(data.qty),
        dispositionDate: data.dispositionDate || null,
        serialTagNumber: data.serialTagNumber || null,
        correctiveActionNotes: data.correctiveActionNotes || null,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/non-conforming-items'] });
      toast({ title: 'Success', description: 'Non-conforming item created successfully' });
      setIsDialogOpen(false);
      setFormData(initialFormData);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create non-conforming item', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => 
      apiRequest(`/api/non-conforming-items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...data,
          qty: Number(data.qty),
          dispositionDate: data.dispositionDate || null,
          serialTagNumber: data.serialTagNumber || null,
          correctiveActionNotes: data.correctiveActionNotes || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/non-conforming-items'] });
      toast({ title: 'Success', description: 'Non-conforming item updated successfully' });
      setIsDialogOpen(false);
      setEditingItem(null);
      setFormData(initialFormData);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update non-conforming item', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/non-conforming-items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/non-conforming-items'] });
      toast({ title: 'Success', description: 'Non-conforming item deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete non-conforming item', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (item: NonConformingItem) => {
    setEditingItem(item);
    setFormData({
      date: item.date,
      p1OrP2: item.p1OrP2,
      customer: item.customer,
      sku: item.sku,
      qty: item.qty,
      issueCause: item.issueCause,
      manufacturerDefect: item.manufacturerDefect,
      disposition: item.disposition,
      authorization: item.authorization,
      serialTagNumber: item.serialTagNumber || '',
      dispositionDate: item.dispositionDate || '',
      correctiveActionNotes: item.correctiveActionNotes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this non-conforming item?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenDialog = () => {
    setEditingItem(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <FileWarning className="h-6 w-6 text-red-600" />
            <CardTitle className="text-2xl font-bold">Non-Conforming Items Tracking</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenDialog} data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit Non-Conforming Item' : 'Add Non-Conforming Item'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                      data-testid="input-date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="p1OrP2">P1 or P2 *</Label>
                    <Select
                      value={formData.p1OrP2}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, p1OrP2: value }))}
                      required
                    >
                      <SelectTrigger id="p1OrP2" data-testid="select-p1-or-p2">
                        <SelectValue placeholder="Select P1 or P2" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P1">P1</SelectItem>
                        <SelectItem value="P2">P2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer">Customer *</Label>
                    <Input
                      id="customer"
                      value={formData.customer}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer: e.target.value }))}
                      required
                      placeholder="Enter customer name"
                      data-testid="input-customer"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                      required
                      placeholder="Enter SKU"
                      data-testid="input-sku"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qty">Quantity *</Label>
                    <Input
                      id="qty"
                      type="number"
                      min="1"
                      value={formData.qty}
                      onChange={(e) => setFormData(prev => ({ ...prev, qty: parseInt(e.target.value) || 1 }))}
                      required
                      data-testid="input-qty"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="issueCause">Issue/Cause *</Label>
                    <Select
                      value={formData.issueCause}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, issueCause: value }))}
                    >
                      <SelectTrigger data-testid="select-issue-cause">
                        <SelectValue placeholder="Select issue/cause" />
                      </SelectTrigger>
                      <SelectContent>
                        {ISSUE_CAUSES.map((cause) => (
                          <SelectItem key={cause} value={cause}>
                            {cause}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="manufacturerDefect"
                        checked={formData.manufacturerDefect}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, manufacturerDefect: checked as boolean }))
                        }
                        data-testid="checkbox-manufacturer-defect"
                      />
                      <Label htmlFor="manufacturerDefect" className="cursor-pointer">
                        Manufacturer Defect/Error
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="disposition">Disposition *</Label>
                    <Select
                      value={formData.disposition}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, disposition: value }))}
                    >
                      <SelectTrigger data-testid="select-disposition">
                        <SelectValue placeholder="Select disposition" />
                      </SelectTrigger>
                      <SelectContent>
                        {DISPOSITIONS.map((disp) => (
                          <SelectItem key={disp} value={disp}>
                            {disp}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authorization">Authorization *</Label>
                    <Select
                      value={formData.authorization}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, authorization: value }))}
                    >
                      <SelectTrigger data-testid="select-authorization">
                        <SelectValue placeholder="Select authorization" />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTHORIZATIONS.map((auth) => (
                          <SelectItem key={auth} value={auth}>
                            {auth}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serialTagNumber">Serial/Tag #</Label>
                    <Input
                      id="serialTagNumber"
                      value={formData.serialTagNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, serialTagNumber: e.target.value }))}
                      placeholder="Enter serial/tag number"
                      data-testid="input-serial-tag"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dispositionDate">Disposition Date</Label>
                    <Input
                      id="dispositionDate"
                      type="date"
                      value={formData.dispositionDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, dispositionDate: e.target.value }))}
                      data-testid="input-disposition-date"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="correctiveActionNotes">Corrective Action or Concession Info, Notes</Label>
                    <Textarea
                      id="correctiveActionNotes"
                      value={formData.correctiveActionNotes}
                      onChange={(e) => setFormData(prev => ({ ...prev, correctiveActionNotes: e.target.value }))}
                      placeholder="Enter notes..."
                      rows={4}
                      data-testid="textarea-notes"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingItem(null);
                      setFormData(initialFormData);
                    }}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 text-lg">No non-conforming items found</p>
              <p className="text-gray-400 text-sm mt-2">Click "Add Item" to create your first entry</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>P1/P2</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Issue/Cause</TableHead>
                    <TableHead>Mfr Defect</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Authorization</TableHead>
                    <TableHead>Serial/Tag #</TableHead>
                    <TableHead>Disp. Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                      <TableCell data-testid={`text-date-${item.id}`}>
                        {format(new Date(item.date), 'MM/dd/yyyy')}
                      </TableCell>
                      <TableCell data-testid={`text-p1-or-p2-${item.id}`}>{item.p1OrP2}</TableCell>
                      <TableCell data-testid={`text-customer-${item.id}`}>{item.customer}</TableCell>
                      <TableCell data-testid={`text-sku-${item.id}`}>{item.sku}</TableCell>
                      <TableCell data-testid={`text-qty-${item.id}`}>{item.qty}</TableCell>
                      <TableCell data-testid={`text-issue-${item.id}`} className="max-w-xs truncate" title={item.issueCause}>
                        {item.issueCause}
                      </TableCell>
                      <TableCell data-testid={`text-defect-${item.id}`}>
                        {item.manufacturerDefect ? 'Y' : 'N'}
                      </TableCell>
                      <TableCell data-testid={`text-disposition-${item.id}`}>{item.disposition}</TableCell>
                      <TableCell data-testid={`text-auth-${item.id}`}>{item.authorization}</TableCell>
                      <TableCell data-testid={`text-serial-${item.id}`}>{item.serialTagNumber || '-'}</TableCell>
                      <TableCell data-testid={`text-disp-date-${item.id}`}>
                        {item.dispositionDate ? format(new Date(item.dispositionDate), 'MM/dd/yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(item)}
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(item.id)}
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
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
    </div>
  );
}
