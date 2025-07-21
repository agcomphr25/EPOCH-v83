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
import { apiRequest } from "@/lib/queryClient";
import { toast } from "react-hot-toast";

const bomDefinitionSchema = z.object({
  modelName: z.string().min(1, "Model name is required"),
  revision: z.string().min(1, "Revision is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type BomDefinitionFormData = z.infer<typeof bomDefinitionSchema>;

interface BomDefinition {
  id: number;
  modelName: string;
  revision: string;
  description?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BOMDefinitionFormProps {
  bom?: BomDefinition;
  onSuccess: () => void;
  onCancel: () => void;
}

export function BOMDefinitionForm({ bom, onSuccess, onCancel }: BOMDefinitionFormProps) {
  const isEditing = !!bom;

  const form = useForm<BomDefinitionFormData>({
    resolver: zodResolver(bomDefinitionSchema),
    defaultValues: {
      modelName: bom?.modelName || "",
      revision: bom?.revision || "",
      description: bom?.description || "",
      notes: bom?.notes || "",
      isActive: bom?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: BomDefinitionFormData) => {
      if (isEditing) {
        return apiRequest(`/api/boms/${bom.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        return apiRequest("/api/boms", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: any) => {
      console.error("BOM operation error:", error);
      toast.error(isEditing ? "Failed to update BOM" : "Failed to create BOM");
    },
  });

  const onSubmit = (data: BomDefinitionFormData) => {
    mutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="modelName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., P2-Chassis-v1" 
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  Unique identifier for the product model
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="revision"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Revision</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., Rev A, v1.0, etc." 
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  Version or revision number
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
                  placeholder="Brief description of the product model" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Optional brief description of the product
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
                  placeholder="Additional notes, specifications, or requirements..."
                  className="min-h-[100px]"
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Detailed notes, specifications, or special requirements
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
                  When inactive, this BOM will not be available for new operations
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
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : (
              isEditing ? "Update BOM" : "Create BOM"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}