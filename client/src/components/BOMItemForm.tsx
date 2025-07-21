import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { toast } from "react-hot-toast";

const bomItemSchema = z.object({
  partName: z.string().min(1, "Part name is required"),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unitOfMeasure: z.string().min(1, "Unit of measure is required"),
  category: z.string().optional(),
  supplier: z.string().optional(),
  cost: z.number().min(0).optional(),
  leadTime: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type BomItemFormData = z.infer<typeof bomItemSchema>;

interface BomItem {
  id: number;
  bomId: number;
  partName: string;
  partNumber?: string;
  description?: string;
  quantity: number;
  unitOfMeasure: string;
  category?: string;
  supplier?: string;
  cost?: number;
  leadTime?: string;
  notes?: string;
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

  const form = useForm<BomItemFormData>({
    resolver: zodResolver(bomItemSchema),
    defaultValues: {
      partName: item?.partName || "",
      partNumber: item?.partNumber || "",
      description: item?.description || "",
      quantity: item?.quantity || 1,
      unitOfMeasure: item?.unitOfMeasure || "",
      category: item?.category || "",
      supplier: item?.supplier || "",
      cost: item?.cost || undefined,
      leadTime: item?.leadTime || "",
      notes: item?.notes || "",
      isActive: item?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: BomItemFormData) => {
      if (isEditing) {
        return apiRequest(`/api/boms/${bomId}/items/${item.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        return apiRequest(`/api/boms/${bomId}/items`, {
          method: "POST",
          body: JSON.stringify(data),
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="partName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Part Name *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., Aluminum Chassis" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  Descriptive name of the component
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="partNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Part Number</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., ALU-CH-001" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  Internal or supplier part number
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Detailed description of the component" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Technical specifications or additional details
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity *</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="1"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
            name="unitOfMeasure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit of Measure *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {commonUnits.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  How the quantity is measured
                </FormDescription>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {commonCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Component category
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., ABC Manufacturing" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  Primary supplier for this component
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost per Unit</FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                  />
                </FormControl>
                <FormDescription>
                  Cost per unit in USD
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="leadTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lead Time</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., 2-3 weeks, 5 business days" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Expected lead time for procurement
              </FormDescription>
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
                <Textarea 
                  placeholder="Additional notes, specifications, or procurement requirements..."
                  className="min-h-[80px]"
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Special handling, quality requirements, or other notes
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Status</FormLabel>
                <FormDescription>
                  When inactive, this item will not be included in calculations
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