import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit, Trash2 } from "lucide-react";

const metalAccessorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["Bottom Metals", "Rails", "Other"]),
  inventory: z.number().min(0, "Must be 0 or greater"),
  machined: z.number().min(0, "Must be 0 or greater"),
  atAnodizer: z.number().min(0, "Must be 0 or greater"),
});

type MetalAccessory = z.infer<typeof metalAccessorySchema> & { id: number };

export default function MetalAccessoriesTracker() {
  const [editingItem, setEditingItem] = useState<MetalAccessory | null>(null);
  const { toast } = useToast();

  const { data: items = [], isLoading: itemsLoading } = useQuery<MetalAccessory[]>({
    queryKey: ["/api/metal-accessories"],
  });

  const { data: demands = [], isLoading: demandsLoading } = useQuery({
    queryKey: ["/api/metal-accessories/demands"],
  });

  const form = useForm({
    resolver: zodResolver(metalAccessorySchema),
    defaultValues: {
      name: "",
      category: "Bottom Metals" as const,
      inventory: 0,
      machined: 0,
      atAnodizer: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof metalAccessorySchema>) =>
      apiRequest("/api/metal-accessories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metal-accessories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metal-accessories/demands"] });
      form.reset();
      setEditingItem(null);
      toast({ title: "Success", description: "Item saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: z.infer<typeof metalAccessorySchema> }) =>
      apiRequest(`/api/metal-accessories/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metal-accessories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metal-accessories/demands"] });
      form.reset();
      setEditingItem(null);
      toast({ title: "Success", description: "Item updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/metal-accessories/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/metal-accessories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metal-accessories/demands"] });
      toast({ title: "Success", description: "Item deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (data: z.infer<typeof metalAccessorySchema>) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item: MetalAccessory) => {
    setEditingItem(item);
    form.reset({
      name: item.name,
      category: item.category as any,
      inventory: item.inventory,
      machined: item.machined,
      atAnodizer: item.atAnodizer,
    });
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      deleteMutation.mutate(id);
      if (editingItem?.id === id) {
        setEditingItem(null);
        form.reset();
      }
    }
  };

  const handleCancel = () => {
    setEditingItem(null);
    form.reset();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Metal Accessories Tracker</h1>
          <p className="text-muted-foreground">Track inventory, machined, and anodizer quantities</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingItem ? "Edit Item" : "Add New Item"}</CardTitle>
          <CardDescription>Manage metal accessories inventory and production status</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-name" />
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Bottom Metals">Bottom Metals</SelectItem>
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
                      <FormLabel>Inventory</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-at-anodizer"
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
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                  ) : editingItem ? (
                    "Update Item"
                  ) : (
                    <><Plus className="mr-2 h-4 w-4" /> Add Item</>
                  )}
                </Button>
                {editingItem && (
                  <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items Inventory</CardTitle>
          <CardDescription>Current metal accessories in the system</CardDescription>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No items yet. Add one above!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Inventory</TableHead>
                  <TableHead>Machined</TableHead>
                  <TableHead>At Anodizer</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                    <TableCell data-testid={`text-name-${item.id}`}>{item.name}</TableCell>
                    <TableCell data-testid={`text-category-${item.id}`}>{item.category}</TableCell>
                    <TableCell data-testid={`text-inventory-${item.id}`}>{item.inventory}</TableCell>
                    <TableCell data-testid={`text-machined-${item.id}`}>{item.machined}</TableCell>
                    <TableCell data-testid={`text-anodizer-${item.id}`}>{item.atAnodizer}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
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

      <Card>
        <CardHeader>
          <CardTitle>Production Demand (Next 4 Weeks)</CardTitle>
          <CardDescription>Production planning based on current orders</CardDescription>
        </CardHeader>
        <CardContent>
          {demandsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : demands.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No demand data available</p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {demands.map((demand: any) => (
                <AccordionItem key={demand.itemId} value={`item-${demand.itemId}`} data-testid={`accordion-item-${demand.itemId}`}>
                  <AccordionTrigger>
                    <div className="flex justify-between w-full pr-4">
                      <span className="font-semibold" data-testid={`text-demand-name-${demand.itemId}`}>{demand.name}</span>
                      <span className={`font-bold ${demand.productionNeeded > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid={`text-production-needed-${demand.itemId}`}>
                        Produce: {demand.productionNeeded}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pt-2">
                      <p><span className="font-medium">Category:</span> {demand.category}</p>
                      <p><span className="font-medium">Inventory:</span> {demand.inventory}</p>
                      <p><span className="font-medium">Machined:</span> {demand.machined}</p>
                      <p><span className="font-medium">At Anodizer:</span> {demand.atAnodizer}</p>
                      <p><span className="font-medium">Total Demand (4 weeks):</span> {demand.totalDemandNext4}</p>
                      <div className="mt-3">
                        <p className="font-medium mb-2">Weekly Breakdown:</p>
                        <ul className="space-y-1">
                          {demand.weeklyDemand.map((count: number, index: number) => (
                            <li key={index} data-testid={`text-week-${index + 1}-${demand.itemId}`}>
                              Week {index + 1}: {count} units
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
