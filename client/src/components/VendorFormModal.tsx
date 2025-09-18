import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Star } from "lucide-react";

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Contact validation schema - simplified to match current database
const contactSchema = z.object({
  name: z.string().min(1, "Contact name is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

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
  contacts: z.array(contactSchema).optional(),
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
      contacts: [],
      approved: false,
      evaluated: false,
      evaluationNotes: "",
      approvalNotes: "",
    },
  });

  const { fields: contactFields, append: addContact, remove: removeContact } = useFieldArray({
    control: form.control,
    name: "contacts"
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
          contacts: vendorToEdit.contacts || [],
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
          contacts: [],
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

    // Convert address object to string for database compatibility
    let addressString = "";
    if (data.address && typeof data.address === "object") {
      const addr = data.address;
      const parts = [
        addr.street,
        addr.city,
        addr.state,
        addr.zip,
        addr.country
      ].filter(part => part && part.trim());
      addressString = parts.join(", ");
    } else if (typeof data.address === "string") {
      addressString = data.address;
    }

    // Clean up contact emails
    if (data.contacts) {
      data.contacts = data.contacts.map(contact => ({
        ...contact,
        email: contact.email === "" ? undefined : contact.email
      }));
    }

    // Prepare final data with address as string
    const submitData = {
      ...data,
      address: addressString || undefined
    };

    if (isEditing) {
      updateVendorMutation.mutate(submitData);
    } else {
      createVendorMutation.mutate(submitData);
    }
  };

  const handleAddContact = () => {
    addContact({
      name: "",
      email: "",
      phone: "",
      role: "",
      isPrimary: false,
    });
  };

  const isPending = createVendorMutation.isPending || updateVendorMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-vendor-form">
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
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" data-testid="tab-basic-info">Basic Info</TabsTrigger>
                <TabsTrigger value="contacts" data-testid="tab-contacts">Contacts</TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4 mt-4">
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

                {/* Status */}
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
              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Contact Persons</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddContact}
                    data-testid="button-add-contact"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>

                {contactFields.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No contacts added yet. Click "Add Contact" to add contact persons.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contactFields.map((field, index) => (
                      <Card key={field.id} data-testid={`contact-card-${index}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Contact {index + 1}</CardTitle>
                            <div className="flex items-center space-x-2">
                              <FormField
                                control={form.control}
                                name={`contacts.${index}.isPrimary`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        data-testid={`checkbox-primary-${index}`}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm">Primary</FormLabel>
                                  </FormItem>
                                )}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeContact(index)}
                                data-testid={`button-remove-contact-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`contacts.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Name *</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Enter contact name"
                                      data-testid={`input-contact-name-${index}`}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`contacts.${index}.role`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Role</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., Sales Manager"
                                      data-testid={`input-contact-role-${index}`}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`contacts.${index}.email`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="email"
                                      placeholder="Enter email address"
                                      data-testid={`input-contact-email-${index}`}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`contacts.${index}.phone`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Phone</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Enter phone number"
                                      data-testid={`input-contact-phone-${index}`}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="evaluationNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Evaluation Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            data-testid="textarea-vendor-evaluation" 
                            placeholder="Enter evaluation notes, quality assessments, performance reviews..." 
                            className="min-h-[120px]"
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
                            placeholder="Enter approval notes, terms, conditions, restrictions..." 
                            className="min-h-[120px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2 pt-4 border-t">
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