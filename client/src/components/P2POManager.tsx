import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus, FileText, Package, Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

const p2PurchaseOrderSchema = z.object({
  poNumber: z.string().min(1, "PO Number is required"),
  customerId: z.string().min(1, "Customer is required"),
  customerName: z.string().min(1, "Customer Name is required"),
  poDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Valid PO date is required",
  }),
  expectedDelivery: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Valid expected delivery date is required",
  }),
  status: z.enum(["OPEN", "CLOSED", "CANCELED"]).default("OPEN"),
  notes: z.string().optional(),
});

type P2PurchaseOrderForm = z.infer<typeof p2PurchaseOrderSchema>;

interface P2Customer {
  id: number;
  customerId: string;
  customerName: string;
  status: string;
}

interface P2PurchaseOrder extends Omit<P2PurchaseOrderForm, 'poDate' | 'expectedDelivery'> {
  id: number;
  poDate: string;
  expectedDelivery: string;
  createdAt: string;
  updatedAt: string;
}

interface P2POManagerProps {
  onManageItems?: (poId: number, poNumber: string) => void;
}

export function P2POManager({ onManageItems }: P2POManagerProps) {
  const [selectedPO, setSelectedPO] = useState<P2PurchaseOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: purchaseOrders = [], isLoading } = useQuery<P2PurchaseOrder[]>({
    queryKey: ["/api/p2/purchase-orders"],
  });

  const { data: customers = [] } = useQuery<P2Customer[]>({
    queryKey: ["/api/p2/customers"],
  });

  const form = useForm<P2PurchaseOrderForm>({
    resolver: zodResolver(p2PurchaseOrderSchema),
    defaultValues: {
      poNumber: "",
      customerId: "",
      customerName: "",
      poDate: new Date().toISOString().split('T')[0],
      expectedDelivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: "OPEN",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: P2PurchaseOrderForm) => apiRequest("/api/p2/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders"] });
      toast({ title: "Success", description: "P2 Purchase Order created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create P2 purchase order", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<P2PurchaseOrderForm> }) =>
      apiRequest(`/api/p2/purchase-orders/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders"] });
      toast({ title: "Success", description: "P2 Purchase Order updated successfully" });
      setDialogOpen(false);
      setSelectedPO(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update P2 purchase order", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/p2/purchase-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/p2/purchase-orders"] });
      toast({ title: "Success", description: "P2 Purchase Order deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete P2 purchase order", variant: "destructive" });
    },
  });

  const handleSubmit = (data: P2PurchaseOrderForm) => {
    if (selectedPO) {
      updateMutation.mutate({ id: selectedPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.customerId === customerId);
    if (customer) {
      form.setValue("customerId", customer.customerId);
      form.setValue("customerName", customer.customerName);
    }
  };

  const openEditDialog = (po: P2PurchaseOrder) => {
    setSelectedPO(po);
    form.reset({
      poNumber: po.poNumber,
      customerId: po.customerId,
      customerName: po.customerName,
      poDate: po.poDate,
      expectedDelivery: po.expectedDelivery,
      status: po.status,
      notes: po.notes || "",
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedPO(null);
    form.reset({
      poNumber: "",
      customerId: "",
      customerName: "",
      poDate: new Date().toISOString().split('T')[0],
      expectedDelivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: "OPEN",
      notes: "",
    });
    setDialogOpen(true);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "OPEN":
        return "default";
      case "CLOSED":
        return "secondary";
      case "CANCELED":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading P2 purchase orders...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">P2 Purchase Orders</h2>
          <p className="text-muted-foreground">Manage P2 purchase orders and line items</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add P2 Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedPO ? "Edit P2 Purchase Order" : "Add P2 Purchase Order"}
              </DialogTitle>
              <DialogDescription>
                {selectedPO ? "Update purchase order information" : "Create a new P2 purchase order"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="poNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PO Number</FormLabel>
                        <FormControl>
                          <Input placeholder="P2-PO-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          handleCustomerChange(value);
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.customerId}>
                                {customer.customerName} ({customer.customerId})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="poDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PO Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expectedDelivery"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Delivery</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="OPEN">Open</SelectItem>
                          <SelectItem value="CLOSED">Closed</SelectItem>
                          <SelectItem value="CANCELED">Canceled</SelectItem>
                        </SelectContent>
                      </Select>
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
                    {selectedPO ? "Update" : "Create"} Purchase Order
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {purchaseOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No P2 Purchase Orders</h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by creating your first P2 purchase order
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add P2 Purchase Order
              </Button>
            </CardContent>
          </Card>
        ) : (
          purchaseOrders.map((po) => (
            <Card key={po.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {po.poNumber}
                    </CardTitle>
                    <CardDescription>
                      Customer: {po.customerName} • Created: {format(new Date(po.createdAt), 'MMM d, yyyy')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={getStatusBadgeVariant(po.status)}>
                      {po.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>PO Date: {format(new Date(po.poDate), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Expected: {format(new Date(po.expectedDelivery), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span>Customer ID: {po.customerId}</span>
                  </div>
                </div>
                {po.notes && (
                  <p className="text-sm text-muted-foreground mb-4">{po.notes}</p>
                )}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onManageItems?.(po.id, po.poNumber)}
                  >
                    Manage Items
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(po)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => deleteMutation.mutate(po.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}