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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, X, Check } from "lucide-react";

const metalAccessorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["Bottom Metals", "Rails", "Other"]),
  inventory: z.number().min(0, "Must be 0 or greater"),
  machined: z.number().min(0, "Must be 0 or greater"),
  atAnodizer: z.number().min(0, "Must be 0 or greater"),
});

type MetalAccessory = z.infer<typeof metalAccessorySchema> & { id: number };

interface EditingQuantities {
  inventory: number;
  machined: number;
  atAnodizer: number;
}

export default function MetalAccessoriesTracker() {
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingQuantities, setEditingQuantities] = useState<EditingQuantities>({
    inventory: 0,
    machined: 0,
    atAnodizer: 0,
  });
  const { toast } = useToast();

  const { data: items = [], isLoading: itemsLoading } = useQuery<MetalAccessory[]>({
    queryKey: ["/api/metal-accessories"],
  });

  const { data: demands = [], isLoading: demandsLoading } = useQuery<any[]>({
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
      toast({ title: "Success", description: "Item added successfully" });
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
      setEditingItemId(null);
      toast({ title: "Success", description: "Quantities updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (data: z.infer<typeof metalAccessorySchema>) => {
    createMutation.mutate(data);
  };

  const handleEditQuantities = (item: MetalAccessory) => {
    if (editingItemId !== null && editingItemId !== item.id) {
      handleCancelEdit();
    }
    setEditingItemId(item.id);
    setEditingQuantities({
      inventory: item.inventory,
      machined: item.machined,
      atAnodizer: item.atAnodizer,
    });
  };

  const handleSaveQuantities = (item: MetalAccessory) => {
    updateMutation.mutate({
      id: item.id,
      data: {
        name: item.name,
        category: item.category as any,
        inventory: editingQuantities.inventory,
        machined: editingQuantities.machined,
        atAnodizer: editingQuantities.atAnodizer,
      },
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Metal Accessories Tracker</h1>
          <p className="text-muted-foreground">Track inventory, machined, and anodizer quantities</p>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-list">
          <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory Management</TabsTrigger>
          <TabsTrigger value="add-new" data-testid="tab-add-new">Add New Item</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current Inventory</CardTitle>
              <CardDescription>
                View and update inventory levels. Click the row to edit quantities.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                        <TableCell data-testid={`text-name-${item.id}`} className="font-medium">
                          {item.name}
                        </TableCell>
                        <TableCell data-testid={`text-category-${item.id}`}>
                          {item.category}
                        </TableCell>
                        <TableCell data-testid={`cell-inventory-${item.id}`}>
                          {editingItemId === item.id ? (
                            <Input
                              type="number"
                              value={editingQuantities.inventory}
                              onChange={(e) =>
                                setEditingQuantities({
                                  ...editingQuantities,
                                  inventory: parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-24"
                              data-testid={`input-inventory-${item.id}`}
                            />
                          ) : (
                            item.inventory
                          )}
                        </TableCell>
                        <TableCell data-testid={`cell-machined-${item.id}`}>
                          {editingItemId === item.id ? (
                            <Input
                              type="number"
                              value={editingQuantities.machined}
                              onChange={(e) =>
                                setEditingQuantities({
                                  ...editingQuantities,
                                  machined: parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-24"
                              data-testid={`input-machined-${item.id}`}
                            />
                          ) : (
                            item.machined
                          )}
                        </TableCell>
                        <TableCell data-testid={`cell-anodizer-${item.id}`}>
                          {editingItemId === item.id ? (
                            <Input
                              type="number"
                              value={editingQuantities.atAnodizer}
                              onChange={(e) =>
                                setEditingQuantities({
                                  ...editingQuantities,
                                  atAnodizer: parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-24"
                              data-testid={`input-at-anodizer-${item.id}`}
                            />
                          ) : (
                            item.atAnodizer
                          )}
                        </TableCell>
                        <TableCell>
                          {editingItemId === item.id ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveQuantities(item)}
                                disabled={updateMutation.isPending}
                                data-testid={`button-save-${item.id}`}
                              >
                                {updateMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEdit}
                                disabled={updateMutation.isPending}
                                data-testid={`button-cancel-${item.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditQuantities(item)}
                              data-testid={`button-edit-${item.id}`}
                            >
                              <Save className="h-4 w-4 mr-2" />
                              Update
                            </Button>
                          )}
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
              <CardDescription>
                Automatically calculated from current IN_PROGRESS and FINALIZED orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {demandsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : demands.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No demand data available. Add items and orders to see production needs.
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
                          <span className="font-semibold" data-testid={`text-demand-name-${demand.itemId}`}>
                            {demand.name}
                          </span>
                          <span
                            className={`font-bold ${
                              demand.productionNeeded > 0 ? "text-red-600" : "text-green-600"
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
                              <p className="text-sm text-muted-foreground">Category</p>
                              <p className="font-medium">{demand.category}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Total Demand (4 weeks)</p>
                              <p className="font-medium">{demand.totalDemandNext4}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                            <div>
                              <p className="text-sm text-muted-foreground">Inventory</p>
                              <p className="font-medium">{demand.inventory}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Machined</p>
                              <p className="font-medium">{demand.machined}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">At Anodizer</p>
                              <p className="font-medium">{demand.atAnodizer}</p>
                            </div>
                          </div>

                          <div className="pt-2 border-t">
                            <p className="font-medium mb-2">Weekly Demand Breakdown:</p>
                            <div className="grid grid-cols-4 gap-2">
                              {demand.weeklyDemand.map((count: number, index: number) => (
                                <div
                                  key={index}
                                  className="text-center p-2 bg-muted rounded"
                                  data-testid={`text-week-${index + 1}-${demand.itemId}`}
                                >
                                  <p className="text-xs text-muted-foreground">Week {index + 1}</p>
                                  <p className="font-bold text-lg">{count}</p>
                                </div>
                              ))}
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
        </TabsContent>

        <TabsContent value="add-new">
          <Card>
            <CardHeader>
              <CardTitle>Add New Item</CardTitle>
              <CardDescription>Create a new metal accessory to track</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., Bottom Metal - Glock" data-testid="input-name" />
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
                          <FormLabel>Current Inventory</FormLabel>
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

                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...
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
    </div>
  );
}
