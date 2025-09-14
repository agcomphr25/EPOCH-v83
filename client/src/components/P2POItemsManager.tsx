import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus, Package, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const p2PurchaseOrderItemSchema = z.object({
  partNumber: z.string().min(1, "SKU is required"),
  partName: z.string().min(1, "Part Name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Unit price must be non-negative").default(0),
<<<<<<< HEAD
=======
  dueDate: z.string().min(1, "Due date is required"),
  p2ProductId: z.string().optional(),
>>>>>>> origin/main
  specifications: z.string().optional(),
  notes: z.string().optional(),
});

type P2PurchaseOrderItemForm = z.infer<typeof p2PurchaseOrderItemSchema>;

interface P2PurchaseOrderItem extends P2PurchaseOrderItemForm {
  id: number;
  poId: number;
  totalPrice: number;
<<<<<<< HEAD
=======
  dueDate: string;
  p2ProductId?: string;
>>>>>>> origin/main
  createdAt: string;
  updatedAt: string;
}

interface BOMDefinition {
  id: number;
  sku: string;
  modelName: string;
  revision: string;
  description?: string;
  isActive: boolean;
}

<<<<<<< HEAD
=======
interface P2POProduct {
  id: number;
  customerName: string;
  productName: string;
  productType: string;
  partNumber: string;
  specifications: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

>>>>>>> origin/main
interface P2POItemsManagerProps {
  poId: number;
  poNumber: string;
  onBack: () => void;
}

export function P2POItemsManager({ poId, poNumber, onBack }: P2POItemsManagerProps) {
  const [selectedItem, setSelectedItem] = useState<P2PurchaseOrderItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<P2PurchaseOrderItem[]>({
    queryKey: ["/api/p2/purchase-orders", poId, "items"],
    queryFn: () => apiRequest(`/api/p2/purchase-orders/${poId}/items`),
  });

  const { data: boms = [] } = useQuery<BOMDefinition[]>({
    queryKey: ["/api/boms"],
  });

<<<<<<< HEAD
=======
  const { data: p2Products = [] } = useQuery<P2POProduct[]>({
    queryKey: ["/api/p2-po-products"],
    queryFn: () => apiRequest("/api/p2-po-products"),
  });

>>>>>>> origin/main
  const { data: productionOrders = [] } = useQuery({
    queryKey: ["/api/p2/purchase-orders", poId, "production-orders"],
    queryFn: () => apiRequest(`/api/p2/purchase-orders/${poId}/production-orders`),
  });

  const { data: materialRequirements = [] } = useQuery({
    queryKey: ["/api/p2/purchase-orders", poId, "material-requirements"],
    queryFn: () => apiRequest(`/api/p2/purchase-orders/${poId}/material-requirements`),
    enabled: items.length > 0, // Only fetch when items exist
  });

  const generateProductionOrdersMutation = useMutation({
    mutationFn: () => apiRequest(`/api/p2/purchase-orders/${poId}/generate-production-orders`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders", poId, "production-orders"] });
      toast({ title: "Success", description: "P2 production orders generated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to generate P2 production orders",
        variant: "destructive" 
      });
    },
  });

  const form = useForm<P2PurchaseOrderItemForm>({
    resolver: zodResolver(p2PurchaseOrderItemSchema),
    defaultValues: {
      partNumber: "",
      partName: "",
      quantity: 1,
      unitPrice: 0,
<<<<<<< HEAD
=======
      dueDate: new Date().toISOString().split('T')[0], // Default to today's date
      p2ProductId: "none",
>>>>>>> origin/main
      specifications: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
<<<<<<< HEAD
    mutationFn: (data: P2PurchaseOrderItemForm) => apiRequest(`/api/p2/purchase-orders/${poId}/items`, {
      method: "POST",
      body: data,
    }),
=======
    mutationFn: (data: P2PurchaseOrderItemForm) => {
      // Convert "none" to null for p2ProductId before sending to API
      const apiData = {
        ...data,
        p2ProductId: data.p2ProductId === "none" ? null : (data.p2ProductId ? parseInt(data.p2ProductId) : null)
      };
      return apiRequest(`/api/p2/purchase-orders/${poId}/items`, {
        method: "POST",
        body: apiData,
      });
    },
>>>>>>> origin/main
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders", poId, "items"] });
      toast({ title: "Success", description: "P2 Purchase Order item added successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add P2 purchase order item", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
<<<<<<< HEAD
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<P2PurchaseOrderItemForm> }) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, {
        method: "PUT",
        body: data,
      }),
=======
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<P2PurchaseOrderItemForm> }) => {
      // Convert "none" to null for p2ProductId before sending to API
      const apiData = {
        ...data,
        p2ProductId: data.p2ProductId === "none" ? null : (data.p2ProductId ? parseInt(data.p2ProductId) : undefined)
      };
      return apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, {
        method: "PUT",
        body: apiData,
      });
    },
>>>>>>> origin/main
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders", poId, "items"] });
      toast({ title: "Success", description: "P2 Purchase Order item updated successfully" });
      setDialogOpen(false);
      setSelectedItem(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update P2 purchase order item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders", poId, "items"] });
      toast({ title: "Success", description: "P2 Purchase Order item deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete P2 purchase order item", variant: "destructive" });
    },
  });

  const handleSubmit = (data: P2PurchaseOrderItemForm) => {
    if (selectedItem) {
      updateMutation.mutate({ itemId: selectedItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (item: P2PurchaseOrderItem) => {
    setSelectedItem(item);
    form.reset({
      partNumber: item.partNumber,
      partName: item.partName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
<<<<<<< HEAD
=======
      dueDate: item.dueDate || new Date().toISOString().split('T')[0],
      p2ProductId: item.p2ProductId || "none",
>>>>>>> origin/main
      specifications: item.specifications || "",
      notes: item.notes || "",
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedItem(null);
    form.reset({
      partNumber: "",
      partName: "",
      quantity: 1,
      unitPrice: 0,
<<<<<<< HEAD
=======
      dueDate: new Date().toISOString().split('T')[0],
      p2ProductId: "none",
>>>>>>> origin/main
      specifications: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

<<<<<<< HEAD
  const totalValue = items.reduce((sum, item) => sum + item.totalPrice, 0);
=======
  const totalValue = Array.isArray(items) ? items.reduce((sum, item) => sum + item.totalPrice, 0) : 0;
>>>>>>> origin/main

  if (isLoading) {
    return <div className="p-6">Loading P2 purchase order items...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to P2 Purchase Orders
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">P2 PO Items - {poNumber}</h2>
            <p className="text-muted-foreground">Manage parts and quantities for this P2 purchase order</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => generateProductionOrdersMutation.mutate()}
<<<<<<< HEAD
            disabled={generateProductionOrdersMutation.isPending || items.length === 0}
=======
            disabled={generateProductionOrdersMutation.isPending || !Array.isArray(items) || items.length === 0}
>>>>>>> origin/main
          >
            {generateProductionOrdersMutation.isPending ? "Generating..." : "Generate Production Orders"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
              <DialogTitle>
                {selectedItem ? "Edit P2 PO Item" : "Add P2 PO Item"}
              </DialogTitle>
              <DialogDescription>
                {selectedItem ? "Update item information" : "Add a new part to this P2 purchase order"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="partNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select SKU from BOM" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {boms
                              .filter(bom => bom.isActive && bom.sku)
                              .map((bom) => (
                                <SelectItem key={bom.id} value={bom.sku}>
                                  {bom.sku} - {bom.modelName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="partName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Part Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Part description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1" 
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Price ($)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
<<<<<<< HEAD
=======
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="p2ProductId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>P2 Product (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select P2 Product" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {Array.isArray(p2Products) && p2Products
                              .filter(product => product.isActive)
                              .map((product) => (
                                <SelectItem key={product.id} value={product.id.toString()}>
                                  {product.productName} - {product.partNumber}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
>>>>>>> origin/main
                <FormField
                  control={form.control}
                  name="specifications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specifications</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Part specifications and requirements..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional notes..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {selectedItem ? "Update" : "Add"} Item
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Items Added</h3>
            <p className="text-muted-foreground text-center mb-4">
              Start by adding parts to this P2 purchase order
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>P2 Purchase Order Items</span>
                <Badge variant="secondary">
                  Total: {formatCurrency(totalValue)}
                </Badge>
              </CardTitle>
              <CardDescription>
<<<<<<< HEAD
                {items.length} item{items.length !== 1 ? 's' : ''} in this P2 purchase order
=======
                {Array.isArray(items) ? items.length : 0} item{(Array.isArray(items) ? items.length : 0) !== 1 ? 's' : ''} in this P2 purchase order
>>>>>>> origin/main
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total Price</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
<<<<<<< HEAD
                  {items.map((item) => (
=======
                  {Array.isArray(items) && items.map((item) => (
>>>>>>> origin/main
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.partNumber}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.partName}</p>
                          {item.specifications && (
                            <p className="text-sm text-muted-foreground">{item.specifications}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.totalPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => deleteMutation.mutate(item.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Production Orders Section */}
<<<<<<< HEAD
      {productionOrders.length > 0 && (
=======
      {Array.isArray(productionOrders) && productionOrders.length > 0 && (
>>>>>>> origin/main
        <Card>
          <CardHeader>
            <CardTitle>Generated Production Orders</CardTitle>
            <CardDescription>
<<<<<<< HEAD
              {productionOrders.length} production order{productionOrders.length !== 1 ? 's' : ''} generated from this P2 purchase order
=======
              {Array.isArray(productionOrders) ? productionOrders.length : 0} production order{(Array.isArray(productionOrders) ? productionOrders.length : 0) !== 1 ? 's' : ''} generated from this P2 purchase order
>>>>>>> origin/main
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
<<<<<<< HEAD
                {productionOrders.map((order: any) => (
=======
                {Array.isArray(productionOrders) && productionOrders.map((order: any) => (
>>>>>>> origin/main
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.orderId}</TableCell>
                    <TableCell className="font-medium">{order.sku}</TableCell>
                    <TableCell>{order.partName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.department}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{order.quantity}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'PENDING' ? 'secondary' : 
                                    order.status === 'IN_PROGRESS' ? 'default' : 
<<<<<<< HEAD
                                    order.status === 'COMPLETED' ? 'success' : 'destructive'}>
=======
                                    order.status === 'COMPLETED' ? 'secondary' : 'destructive'}>
>>>>>>> origin/main
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'No due date'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Material Requirements Section */}
<<<<<<< HEAD
      {materialRequirements.length > 0 && (
=======
      {Array.isArray(materialRequirements) && materialRequirements.length > 0 && (
>>>>>>> origin/main
        <Card>
          <CardHeader>
            <CardTitle>Material Requirements</CardTitle>
            <CardDescription>
              Materials needed for production (quantity tracking only - no production orders created)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Total Quantity</TableHead>
                  <TableHead>Sources</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
<<<<<<< HEAD
                {materialRequirements.map((material: any, index: number) => (
=======
                {Array.isArray(materialRequirements) && materialRequirements.map((material: any, index: number) => (
>>>>>>> origin/main
                  <TableRow key={index}>
                    <TableCell className="font-medium">{material.partName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{material.department}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{material.totalQuantity}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {material.sources.map((source: any, sourceIndex: number) => (
                          <div key={sourceIndex} className="text-sm text-muted-foreground">
                            {source.sku} × {source.skuQuantity} = {source.subtotal} 
                            <span className="text-xs"> ({source.bomQuantity} each)</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}