import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerTypeSchema, type CustomerType } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const customerTypeFormSchema = insertCustomerTypeSchema.extend({
  name: z.string().min(1, "Name is required"),
});

type CustomerTypeFormData = z.infer<typeof customerTypeFormSchema>;

export default function CustomerTypeManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCustomerType, setEditingCustomerType] = useState<CustomerType | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customerTypes = [], isLoading } = useQuery({
    queryKey: ['/api/customer-types'],
    queryFn: () => apiRequest('/api/customer-types'),
  });

  const createMutation = useMutation({
    mutationFn: (data: CustomerTypeFormData) => apiRequest('/api/customer-types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-types'] });
      setIsCreateDialogOpen(false);
      toast({ title: "Success", description: "Customer type created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create customer type", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomerTypeFormData> }) => 
      apiRequest(`/api/customer-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-types'] });
      setEditingCustomerType(null);
      toast({ title: "Success", description: "Customer type updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update customer type", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/customer-types/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-types'] });
      toast({ title: "Success", description: "Customer type deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete customer type", variant: "destructive" });
    },
  });

  const createForm = useForm<CustomerTypeFormData>({
    resolver: zodResolver(customerTypeFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const editForm = useForm<CustomerTypeFormData>({
    resolver: zodResolver(customerTypeFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const onCreateSubmit = (data: CustomerTypeFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: CustomerTypeFormData) => {
    if (editingCustomerType) {
      updateMutation.mutate({ id: editingCustomerType.id, data });
    }
  };

  const handleEdit = (customerType: CustomerType) => {
    setEditingCustomerType(customerType);
    editForm.reset({
      name: customerType.name,
      description: customerType.description || '',
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this customer type?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customer Types
          </CardTitle>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Customer Type</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., AGR-Individual" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Optional description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create Customer Type
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Loading customer types...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerTypes.map((customerType: CustomerType) => (
                <TableRow key={customerType.id}>
                  <TableCell className="font-medium">{customerType.name}</TableCell>
                  <TableCell>{customerType.description || 'No description'}</TableCell>
                  <TableCell>{new Date(customerType.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(customerType)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(customerType.id)}
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
      <Dialog open={!!editingCustomerType} onOpenChange={() => setEditingCustomerType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer Type</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., AGR-Individual" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Optional description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateMutation.isPending}>
                Update Customer Type
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}