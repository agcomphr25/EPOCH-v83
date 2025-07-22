import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "react-hot-toast";
import type { InventoryItem } from '@shared/schema';

const bomItemSchema = z.object({
  partName: z.string().min(1, "Part name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  firstDept: z.enum(['Layup', 'Assembly/Disassembly', 'Finish', 'Paint', 'QC', 'Shipping']).default('Layup'),
  isActive: z.boolean().default(true),
});

type BomItemFormData = z.infer<typeof bomItemSchema>;

interface BomItem {
  id: number;
  bomId: number;
  partName: string;
  quantity: number;
  firstDept: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BOMItemFormProps {
  bomId: number;
  item?: BomItem;
  onSuccess: () => void;
  onCancel: () => void;
}

// Common units of measure for manufacturing
const commonUnits = [
  "EA", // Each
  "PC", // Piece
  "FT", // Feet
  "IN", // Inches
  "LB", // Pounds
  "KG", // Kilograms
  "GAL", // Gallons
  "L", // Liters
  "SQ FT", // Square Feet
  "SQ IN", // Square Inches
  "CU FT", // Cubic Feet
  "CU IN", // Cubic Inches
  "HR", // Hours
  "SET", // Set
  "KIT", // Kit
  "BOX", // Box
  "PKG", // Package
];

// Common component categories
const commonCategories = [
  "Raw Materials",
  "Fasteners",
  "Electronics",
  "Hardware",
  "Mechanical",
  "Electrical",
  "Finishing",
  "Packaging",
  "Assembly",
  "Tools",
  "Consumables",
  "Other"
];

export function BOMItemForm({ bomId, item, onSuccess, onCancel }: BOMItemFormProps) {
  const isEditing = !!item;
  const [open, setOpen] = useState(false);

  // Fetch inventory items
  const { data: inventoryItems, isLoading: isLoadingInventory } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
  });

  const form = useForm<BomItemFormData>({
    resolver: zodResolver(bomItemSchema),
    defaultValues: {
      partName: item?.partName || "",
      quantity: item?.quantity || 1,
      firstDept: item?.firstDept || "Layup",
      isActive: item?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: BomItemFormData) => {
      if (isEditing) {
        return apiRequest(`/api/boms/${bomId}/items/${item.id}`, {
          method: "PUT",
          body: data,
        });
      } else {
        return apiRequest(`/api/boms/${bomId}/items`, {
          method: "POST",
          body: data,
        });
      }
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: any) => {
      console.error("BOM item operation error:", error);
      toast.error(isEditing ? "Failed to update item" : "Failed to add item");
    },
  });

  const onSubmit = (data: BomItemFormData) => {
    mutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="partName"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Select Inventory Item *</FormLabel>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className={cn(
                        "w-full justify-between",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isLoadingInventory}
                    >
                      {field.value
                        ? inventoryItems?.find(
                            (item) => item.name === field.value
                          )
                          ? `${inventoryItems.find(item => item.name === field.value)?.agPartNumber} - ${field.value}`
                          : field.value
                        : isLoadingInventory 
                        ? "Loading inventory..."
                        : "Select inventory item..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search inventory items..." />
                    <CommandList>
                      <CommandEmpty>No inventory items found.</CommandEmpty>
                      <CommandGroup>
                        {inventoryItems?.filter(item => item.isActive).map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.agPartNumber} ${item.name}`}
                            onSelect={() => {
                              field.onChange(item.name);
                              setOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                item.name === field.value
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <div className="flex items-center">
                              <span className="font-mono text-sm text-muted-foreground mr-2">
                                {item.agPartNumber}
                              </span>
                              <span>{item.name}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormDescription>
                Search and select from existing inventory items
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity *</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    min="1"
                    placeholder="1"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  />
                </FormControl>
                <FormDescription>
                  Required quantity
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="firstDept"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Department *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Layup">Layup</SelectItem>
                    <SelectItem value="Assembly/Disassembly">Assembly/Disassembly</SelectItem>
                    <SelectItem value="Finish">Finish</SelectItem>
                    <SelectItem value="Paint">Paint</SelectItem>
                    <SelectItem value="QC">QC</SelectItem>
                    <SelectItem value="Shipping">Shipping</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  The first department in the production process
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Status</FormLabel>
                <FormDescription>
                  When inactive, this item will not be included in production
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                {isEditing ? "Updating..." : "Adding..."}
              </>
            ) : (
              isEditing ? "Update Item" : "Add Item"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}