import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const metalAccessorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['Bottom Metals', 'Rails', 'Other']),
  inventory: z.number().min(0, 'Must be 0 or greater'),
  machined: z.number().min(0, 'Must be 0 or greater'),
  atAnodizer: z.number().min(0, 'Must be 0 or greater'),
});

type MetalAccessory = z.infer<typeof metalAccessorySchema> & { id: number };

export default function MetalAccessoriesTracker() {
  const [editingItem, setEditingItem] = useState<MetalAccessory | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MetalAccessory | null>(null);
  const [weeklyOrdersModal, setWeeklyOrdersModal] = useState<{
    open: boolean;
    weekNumber: number;
    itemName: string;
    orders: any[];
  }>({
    open: false,
    weekNumber: 0,
    itemName: '',
    orders: [],
  });
  const { toast } = useToast();

  const { data: items = [], isLoading: itemsLoading } = useQuery<
    MetalAccessory[]
  >({
    queryKey: ['/api/metal-accessories'],
  });

  const { data: demands = [], isLoading: demandsLoading } = useQuery<any[]>({
    queryKey: ['/api/metal-accessories/demands'],
  });

  const form = useForm({
    resolver: zodResolver(metalAccessorySchema),
    defaultValues: {
      name: '',
      category: 'Bottom Metals' as const,
      inventory: 0,
      machined: 0,
      atAnodizer: 0,
    },
  });

  const editForm = useForm({
    resolver: zodResolver(metalAccessorySchema),
    defaultValues: {
      name: '',
      category: 'Bottom Metals' as const,
      inventory: 0,
      machined: 0,
      atAnodizer: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof metalAccessorySchema>) =>
      apiRequest('/api/metal-accessories', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/metal-accessories'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/metal-accessories/demands'],
      });
      form.reset();
      toast({ title: 'Success', description: 'Item added successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: z.infer<typeof metalAccessorySchema>;
    }) =>
      apiRequest(`/api/metal-accessories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/metal-accessories'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/metal-accessories/demands'],
      });
      setEditingItem(null);
      toast({ title: 'Success', description: 'Item updated successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/metal-accessories/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/metal-accessories'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/metal-accessories/demands'],
      });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      toast({ title: 'Success', description: 'Item deleted successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (data: z.infer<typeof metalAccessorySchema>) => {
    createMutation.mutate(data);
  };

  const handleEdit = (item: MetalAccessory) => {
    setEditingItem(item);
    editForm.reset({
      name: item.name,
      category: item.category as any,
      inventory: item.inventory,
      machined: item.machined,
      atAnodizer: item.atAnodizer,
    });
  };

  const handleUpdate = (data: z.infer<typeof metalAccessorySchema>) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    }
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
  };

  const handleDeleteClick = (item: MetalAccessory) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (itemToDelete) {
      deleteMutation.mutate(itemToDelete.id);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Metal Accessories Tracker</h1>
          <p className="text-muted-foreground">
            Track inventory, machined, and anodizer quantities
          </p>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList
          className="grid w-full max-w-md grid-cols-2"
          data-testid="tabs-list"
        >
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            Inventory Management
          </TabsTrigger>
          <TabsTrigger value="add-new" data-testid="tab-add-new">
            Add New Item
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Production Demand (Next 4 Weeks)</CardTitle>
              <CardDescription>
                Automatically calculated from current IN_PROGRESS and FINALIZED
                orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {demandsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : demands.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No demand data available. Add items and orders to see
                  production needs.
                </p>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {demands.map((demand: any) => (
                    <AccordionItem
                      key={demand.itemId}
                      value={`item-${demand.itemId}`}
                      data-testid={`accordion-item-${demand.itemId}`}
                    >
                      <AccordionTrigger>
                        <div className="flex justify-between w-full pr-4">
                          <span
                            className="font-semibold"
                            data-testid={`text-demand-name-${demand.itemId}`}
                          >
                            {demand.name}
                          </span>
                          <span
                            className={`font-bold ${
                              demand.productionNeeded > 0
                                ? 'text-red-600'
                                : 'text-green-600'
                            }`}
                            data-testid={`text-production-needed-${demand.itemId}`}
                          >
                            {demand.productionNeeded > 0
                              ? `⚠️ Produce: ${demand.productionNeeded}`
                              : `✓ Sufficient Stock`}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                Category
                              </p>
                              <p className="font-medium">{demand.category}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">
                                Total Demand (4 weeks)
                              </p>
                              <p className="font-medium">
                                {demand.totalDemandNext4}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                Inventory
                              </p>
                              <p className="font-medium">{demand.inventory}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">
                                Machined
                              </p>
                              <p className="font-medium">{demand.machined}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">
                                At Anodizer
                              </p>
                              <p className="font-medium">{demand.atAnodizer}</p>
                            </div>
                          </div>

                          <div className="pt-2 border-t">
                            <p className="font-medium mb-2">
                              Weekly Demand Breakdown:
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {demand.weeklyDemand.map(
                                (count: number, index: number) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      if (
                                        count > 0 &&
                                        demand.weeklyOrders &&
                                        demand.weeklyOrders[index]
                                      ) {
                                        setWeeklyOrdersModal({
                                          open: true,
                                          weekNumber: index + 1,
                                          itemName: demand.name,
                                          orders: demand.weeklyOrders[index],
                                        });
                                      }
                                    }}
                                    disabled={count === 0}
                                    className={`text-center p-2 rounded transition-colors ${
                                      count > 0
                                        ? 'bg-muted hover:bg-primary/10 cursor-pointer active:scale-95 border-2 border-transparent hover:border-primary/30'
                                        : 'bg-muted/50 cursor-not-allowed opacity-60'
                                    }`}
                                    data-testid={`button-week-${index + 1}-${demand.itemId}`}
                                  >
                                    <p className="text-xs text-muted-foreground">
                                      Week {index + 1}
                                    </p>
                                    <p
                                      className={`font-bold text-lg ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}
                                    >
                                      {count}
                                    </p>
                                    {count > 0 && (
                                      <p className="text-xs text-blue-500 mt-1">
                                        Click to view
                                      </p>
                                    )}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Inventory</CardTitle>
              <CardDescription>
                View and manage your metal accessories. Click Edit to modify or
                Delete to remove items.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editingItem ? (
                <div className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/50">
                  <h3 className="font-semibold">Editing: {editingItem.name}</h3>
                  <Form {...editForm}>
                    <form
                      onSubmit={editForm.handleSubmit(handleUpdate)}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={editForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  data-testid="edit-input-name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={editForm.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="edit-select-category">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Bottom Metals">
                                    Bottom Metals
                                  </SelectItem>
                                  <SelectItem value="Rails">Rails</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={editForm.control}
                          name="inventory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Current Inventory</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  data-testid="edit-input-inventory"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={editForm.control}
                          name="machined"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantity Machined</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  data-testid="edit-input-machined"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={editForm.control}
                          name="atAnodizer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantity at Anodizer</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  data-testid="edit-input-at-anodizer"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={updateMutation.isPending}
                          data-testid="button-save-edit"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" /> Save Changes
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={updateMutation.isPending}
                          data-testid="button-cancel-edit"
                        >
                          <X className="mr-2 h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              ) : null}

              {itemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No items yet. Switch to "Add New Item" tab to create one!
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Inventory</TableHead>
                      <TableHead>Quantity Machined</TableHead>
                      <TableHead>Quantity at Anodizer</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        data-testid={`row-item-${item.id}`}
                      >
                        <TableCell
                          data-testid={`text-name-${item.id}`}
                          className="font-medium"
                        >
                          {item.name}
                        </TableCell>
                        <TableCell data-testid={`text-category-${item.id}`}>
                          {item.category}
                        </TableCell>
                        <TableCell data-testid={`text-inventory-${item.id}`}>
                          {item.inventory}
                        </TableCell>
                        <TableCell data-testid={`text-machined-${item.id}`}>
                          {item.machined}
                        </TableCell>
                        <TableCell data-testid={`text-anodizer-${item.id}`}>
                          {item.atAnodizer}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(item)}
                              disabled={editingItem !== null}
                              data-testid={`button-edit-${item.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteClick(item)}
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="add-new">
          <Card>
            <CardHeader>
              <CardTitle>Add New Item</CardTitle>
              <CardDescription>
                Create a new metal accessory to track
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleSubmit)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., Bottom Metal - Glock"
                              data-testid="input-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Bottom Metals">
                                Bottom Metals
                              </SelectItem>
                              <SelectItem value="Rails">Rails</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="inventory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Inventory</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 0)
                              }
                              data-testid="input-inventory"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="machined"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity Machined</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 0)
                              }
                              data-testid="input-machined"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="atAnodizer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity at Anodizer</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 0)
                              }
                              data-testid="input-at-anodizer"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" /> Add Item
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={weeklyOrdersModal.open}
        onOpenChange={(open) =>
          setWeeklyOrdersModal({ ...weeklyOrdersModal, open })
        }
      >
        <DialogContent
          className="max-w-3xl max-h-[80vh] overflow-y-auto"
          data-testid="weekly-orders-dialog"
        >
          <DialogHeader>
            <DialogTitle>
              Week {weeklyOrdersModal.weekNumber} Orders -{' '}
              {weeklyOrdersModal.itemName}
            </DialogTitle>
            <DialogDescription>
              {weeklyOrdersModal.orders.length} order
              {weeklyOrdersModal.orders.length !== 1 ? 's' : ''} requiring this
              item
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {weeklyOrdersModal.orders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyOrdersModal.orders.map((order, idx) => (
                    <TableRow
                      key={idx}
                      data-testid={`order-row-${order.orderId}`}
                    >
                      <TableCell className="font-medium">
                        {order.orderId}
                      </TableCell>
                      <TableCell>
                        {order.dueDate
                          ? new Date(order.dueDate).toLocaleDateString()
                          : 'No due date'}
                      </TableCell>
                      <TableCell>{order.quantity}</TableCell>
                      <TableCell>{order.customerId || 'N/A'}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            order.status === 'FINALIZED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg mb-2">
                  No orders scheduled this week
                </p>
                <p className="text-sm text-muted-foreground">
                  This week has no production demand for this item
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{itemToDelete?.name}</strong>{' '}
              from the tracker. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
