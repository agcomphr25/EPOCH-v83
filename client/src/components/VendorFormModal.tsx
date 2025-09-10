import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Form validation schema
const vendorFormSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),
  website: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  approved: z.boolean().default(false),
  evaluated: z.boolean().default(false),
  evaluationNotes: z.string().optional(),
  approvalNotes: z.string().optional(),
});

type VendorFormData = z.infer<typeof vendorFormSchema>;

interface VendorFormModalProps {
  open: boolean;
  onClose: () => void;
  vendorToEdit?: any;
  onSaved: () => void;
}

export default function VendorFormModal({ 
  open, 
  onClose, 
  vendorToEdit, 
  onSaved 
}: VendorFormModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!vendorToEdit;

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      contactPerson: "",
      website: "",
      address: {
        street: "",
        city: "",
        state: "",
        zip: "",
        country: "",
      },
      approved: false,
      evaluated: false,
      evaluationNotes: "",
      approvalNotes: "",
    },
  });

  // Reset form when opening with vendor data or clearing
  useEffect(() => {
    if (open) {
      if (vendorToEdit) {
        form.reset({
          name: vendorToEdit.name || "",
          email: vendorToEdit.email || "",
          phone: vendorToEdit.phone || "",
          contactPerson: vendorToEdit.contactPerson || "",
          website: vendorToEdit.website || "",
          address: vendorToEdit.address || {
            street: "",
            city: "",
            state: "",
            zip: "",
            country: "",
          },
          approved: vendorToEdit.approved || false,
          evaluated: vendorToEdit.evaluated || false,
          evaluationNotes: vendorToEdit.evaluationNotes || "",
          approvalNotes: vendorToEdit.approvalNotes || "",
        });
      } else {
        form.reset({
          name: "",
          email: "",
          phone: "",
          contactPerson: "",
          website: "",
          address: {
            street: "",
            city: "",
            state: "",
            zip: "",
            country: "",
          },
          approved: false,
          evaluated: false,
          evaluationNotes: "",
          approvalNotes: "",
        });
      }
    }
  }, [open, vendorToEdit, form]);

  const createVendorMutation = useMutation({
    mutationFn: (data: VendorFormData) => apiRequest("/api/vendors", {
      method: "POST",
      body: data,
    }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Vendor created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      onSaved();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create vendor",
        variant: "destructive",
      });
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: (data: VendorFormData) => apiRequest(`/api/vendors/${vendorToEdit.id}`, {
      method: "PUT",
      body: data,
    }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Vendor updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      onSaved();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vendor",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VendorFormData) => {
    // Clean up empty email to avoid validation issues
    if (data.email === "") {
      delete data.email;
    }

    if (isEditing) {
      updateVendorMutation.mutate(data);
    } else {
      createVendorMutation.mutate(data);
    }
  };

  const isPending = createVendorMutation.isPending || updateVendorMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-vendor-form">
        <DialogHeader>
          <DialogTitle data-testid="text-vendor-form-title">
            {isEditing ? "Edit Vendor" : "Add New Vendor"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Update vendor information below." : "Enter vendor information below."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Name *</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vendor-name" placeholder="Enter vendor name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vendor-email" type="email" placeholder="Enter email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vendor-phone" placeholder="Enter phone number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vendor-contact" placeholder="Enter contact person" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input data-testid="input-vendor-website" placeholder="Enter website URL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Address Fields */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Address</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address.street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street</FormLabel>
                      <FormControl>
                        <Input data-testid="input-vendor-street" placeholder="Enter street address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input data-testid="input-vendor-city" placeholder="Enter city" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address.state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input data-testid="input-vendor-state" placeholder="Enter state" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address.zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input data-testid="input-vendor-zip" placeholder="Enter ZIP code" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address.country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input data-testid="input-vendor-country" placeholder="Enter country" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Status and Notes */}
            <div className="space-y-4">
              <div className="flex space-x-6">
                <FormField
                  control={form.control}
                  name="approved"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          data-testid="checkbox-vendor-approved"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Approved</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="evaluated"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          data-testid="checkbox-vendor-evaluated"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Evaluated</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="evaluationNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evaluation Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        data-testid="textarea-vendor-evaluation" 
                        placeholder="Enter evaluation notes" 
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="approvalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approval Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        data-testid="textarea-vendor-approval" 
                        placeholder="Enter approval notes" 
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                data-testid="button-vendor-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-vendor-save"
              >
                {isPending ? "Saving..." : isEditing ? "Update Vendor" : "Create Vendor"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}