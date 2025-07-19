import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Percent } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPersistentDiscountSchema, type PersistentDiscount, type CustomerType } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const persistentDiscountFormSchema = insertPersistentDiscountSchema.extend({
  customerTypeId: z.number().min(1, "Customer type is required"),
  name: z.string().min(1, "Name is required"),
  percent: z.number().min(0).max(100, "Percent must be between 0 and 100").optional(),
  fixedAmount: z.number().min(0).optional(),
  appliesTo: z.string().default("stock_model"),
}).refine(
  (data) => {
    // For Custom discount, we don't require preset values
    if (data.name === "Custom") return true;
    // For other discounts, require either percent or fixedAmount
    return data.percent !== undefined || data.fixedAmount !== undefined;
  },
  {
    message: "Either percent or fixed amount is required for non-custom discounts",
    path: ["percent"],
  }
);

type PersistentDiscountFormData = z.infer<typeof persistentDiscountFormSchema>;

export default function PersistentDiscountManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<PersistentDiscount | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: persistentDiscounts = [], isLoading } = useQuery({
    queryKey: ['/api/persistent-discounts'],
    queryFn: () => apiRequest('/api/persistent-discounts'),
  });

  const { data: customerTypes = [] } = useQuery({
    queryKey: ['/api/customer-types'],
    queryFn: () => apiRequest('/api/customer-types'),
  });

  const createMutation = useMutation({
    mutationFn: (data: PersistentDiscountFormData) => apiRequest('/api/persistent-discounts', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/persistent-discounts'] });
      setIsCreateDialogOpen(false);
      toast({ title: "Success", description: "Persistent discount created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create persistent discount", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PersistentDiscountFormData> }) => 
      apiRequest(`/api/persistent-discounts/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/persistent-discounts'] });
      setEditingDiscount(null);
      toast({ title: "Success", description: "Persistent discount updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update persistent discount", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/persistent-discounts/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/persistent-discounts'] });
      toast({ title: "Success", description: "Persistent discount deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete persistent discount", variant: "destructive" });
    },
  });

  const createForm = useForm<PersistentDiscountFormData>({
    resolver: zodResolver(persistentDiscountFormSchema),
    defaultValues: {
      customerTypeId: 0,
      name: "",
      percent: 0,
      fixedAmount: 0,
      description: "",
      appliesTo: "stock_model",
      isActive: 1,
    },
  });

  const editForm = useForm<PersistentDiscountFormData>({
    resolver: zodResolver(persistentDiscountFormSchema),
    defaultValues: {
      customerTypeId: 0,
      name: "",
      percent: 0,
      fixedAmount: 0,
      description: "",
      appliesTo: "stock_model",
      isActive: 1,
    },
  });

  const onCreateSubmit = (data: PersistentDiscountFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: PersistentDiscountFormData) => {
    if (editingDiscount) {
      updateMutation.mutate({ id: editingDiscount.id, data });
    }
  };

  const handleEdit = (discount: PersistentDiscount) => {
    setEditingDiscount(discount);
    editForm.reset({
      customerTypeId: discount.customerTypeId,
      name: discount.name,
      percent: discount.percent || 0,
      fixedAmount: discount.fixedAmount || 0,
      description: discount.description || "",
      appliesTo: discount.appliesTo || "stock_model",
      isActive: discount.isActive,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this persistent discount?')) {
      deleteMutation.mutate(id);
    }
  };

  const getCustomerTypeName = (customerTypeId: number) => {
    const customerType = customerTypes.find((ct: CustomerType) => ct.id === customerTypeId);
    return customerType?.name || 'Unknown';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Persistent Discounts
          </CardTitle>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Discount
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Persistent Discount</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="customerTypeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Type</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customerTypes.filter((ct: CustomerType) => ct.name !== 'OEM').map((customerType: CustomerType) => (
                              <SelectItem key={customerType.id} value={customerType.id.toString()}>
                                {customerType.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g., GB-20, GB-25, GB-30" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="percent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Percentage</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            placeholder="e.g., 10" 
                            disabled={createForm.watch("name") === "Custom"}
                          />
                        </FormControl>
                        <FormMessage />
                        {createForm.watch("name") === "Custom" && (
                          <div className="text-sm text-muted-foreground">
                            Custom discounts allow ad-hoc percentage or amount during order entry
                          </div>
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="fixedAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fixed Amount (in cents)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            placeholder="e.g., 5000 for $50.00" 
                            disabled={createForm.watch("name") === "Custom"}
                          />
                        </FormControl>
                        <FormMessage />
                        {createForm.watch("name") === "Custom" && (
                          <div className="text-sm text-muted-foreground">
                            Custom discounts allow ad-hoc percentage or amount during order entry
                          </div>
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g., 20% off for select gunbuilders" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="appliesTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Applies To</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select what this discount applies to" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="stock_model">Stock Model Only</SelectItem>
                            <SelectItem value="total_order">Total Order</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Enable this discount
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value === 1}
                            onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create Discount
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Loading persistent discounts...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {persistentDiscounts.map((discount: PersistentDiscount) => (
                <TableRow key={discount.id}>
                  <TableCell className="font-medium">{getCustomerTypeName(discount.customerTypeId)}</TableCell>
                  <TableCell className="font-semibold">{discount.name}</TableCell>
                  <TableCell>
                    {discount.name === "Custom" ? (
                      <span className="text-blue-600 font-medium">Ad-hoc Entry</span>
                    ) : discount.fixedAmount ? (
                      `$${(discount.fixedAmount / 100).toFixed(2)}`
                    ) : (
                      `${discount.percent}%`
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{discount.description || "-"}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs ${
                      discount.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {discount.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(discount)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(discount.id)}
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

      {/* Edit Dialog */}
      <Dialog open={!!editingDiscount} onOpenChange={() => setEditingDiscount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Persistent Discount</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="customerTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Type</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customerTypes.filter((ct: CustomerType) => ct.name !== 'OEM').map((customerType: CustomerType) => (
                          <SelectItem key={customerType.id} value={customerType.id.toString()}>
                            {customerType.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Name</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="e.g., GB-20, GB-25, GB-30" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="percent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Percentage</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        placeholder="e.g., 10" 
                        disabled={editForm.watch("name") === "Custom"}
                      />
                    </FormControl>
                    <FormMessage />
                    {editForm.watch("name") === "Custom" && (
                      <div className="text-sm text-muted-foreground">
                        Custom discounts allow ad-hoc percentage or amount during order entry
                      </div>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="fixedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fixed Amount (in cents)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                        placeholder="e.g., 5000 for $50.00" 
                        disabled={editForm.watch("name") === "Custom"}
                      />
                    </FormControl>
                    <FormMessage />
                    {editForm.watch("name") === "Custom" && (
                      <div className="text-sm text-muted-foreground">
                        Custom discounts allow ad-hoc percentage or amount during order entry
                      </div>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="e.g., 20% off for select gunbuilders" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="appliesTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Applies To</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select what this discount applies to" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="stock_model">Stock Model Only</SelectItem>
                        <SelectItem value="total_order">Total Order</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Enable this discount
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value === 1}
                        onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateMutation.isPending}>
                Update Discount
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}