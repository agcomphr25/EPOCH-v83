import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  User,
  MapPin,
  FileText,
  Plus,
  Trash2,
  Star,
  Globe,
  Phone,
  Mail,
  UserCheck,
  Save,
  X,
} from 'lucide-react';

// Form validation schemas
const vendorBasicSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

const contactSchema = z.object({
  contactSlot: z.number().min(1).max(3),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.string().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional(),
  phones: z.array(z.object({
    phoneSlot: z.number().min(1).max(2),
    type: z.enum(['work', 'mobile', 'fax']),
    phoneNumber: z.string().min(1, 'Phone number is required'),
    isPrimary: z.boolean().default(false),
  })).max(2),
  emails: z.array(z.object({
    emailSlot: z.number().min(1).max(2),
    type: z.enum(['work', 'personal']),
    emailAddress: z.string().email('Invalid email address'),
    isPrimary: z.boolean().default(false),
  })).max(2),
});

const addressSchema = z.object({
  addressSlot: z.number().min(1).max(2),
  type: z.enum(['business', 'billing']),
  street1: z.string().min(1, 'Street address is required'),
  street2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zipCode: z.string().min(1, 'ZIP code is required'),
  country: z.string().default('USA'),
  isPrimary: z.boolean().default(false),
});

const vendorFormSchema = z.object({
  basic: vendorBasicSchema,
  contacts: z.array(contactSchema).max(3),
  addresses: z.array(addressSchema).max(2),
});

type VendorFormData = z.infer<typeof vendorFormSchema>;

// Component props
interface VendorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor?: any; // For editing existing vendor
  mode: 'create' | 'edit';
}

export default function VendorFormModal({
  isOpen,
  onClose,
  vendor,
  mode = 'create'
}: VendorFormModalProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Initialize form with default values
  const defaultValues: VendorFormData = {
    basic: {
      name: '',
      website: '',
      status: 'active',
      approvalStatus: 'pending',
      notes: '',
      isActive: true,
    },
    contacts: [],
    addresses: [],
  };

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues,
  });

  const {
    fields: contactFields,
    append: appendContact,
    remove: removeContact,
    update: updateContact,
  } = useFieldArray({
    control: form.control,
    name: 'contacts',
  });

  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
    update: updateAddress,
  } = useFieldArray({
    control: form.control,
    name: 'addresses',
  });

  // Load vendor data for editing
  useEffect(() => {
    if (mode === 'edit' && vendor) {
      form.reset({
        basic: {
          name: vendor.name || '',
          website: vendor.website || '',
          status: vendor.status || 'active',
          approvalStatus: vendor.approvalStatus || 'pending',
          notes: vendor.notes || '',
          isActive: vendor.isActive ?? true,
        },
        contacts: vendor.contacts?.map((contact: any, index: number) => ({
          contactSlot: contact.contactSlot || index + 1,
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          role: contact.role || '',
          isPrimary: contact.isPrimary || false,
          notes: contact.notes || '',
          phones: contact.phones || [],
          emails: contact.emails || [],
        })) || [],
        addresses: vendor.addresses?.map((address: any, index: number) => ({
          addressSlot: address.addressSlot || index + 1,
          type: address.type || 'business',
          street1: address.street1 || '',
          street2: address.street2 || '',
          city: address.city || '',
          state: address.state || '',
          zipCode: address.zipCode || '',
          country: address.country || 'USA',
          isPrimary: address.isPrimary || false,
        })) || [],
      });
    } else {
      form.reset(defaultValues);
    }
  }, [mode, vendor, form]);

  // Create vendor mutation
  const createVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const basicData = {
        ...data.basic,
        isActive: data.basic.isActive,
      };
      
      const response = await apiRequest('/api/vendors', {
        method: 'POST',
        body: JSON.stringify(basicData),
      });

      // Create contacts and addresses after vendor creation
      const vendorId = response.id;
      
      // Create contacts
      for (const contact of data.contacts) {
        const contactResponse = await apiRequest('/api/vendor-contacts', {
          method: 'POST',
          body: JSON.stringify({
            vendorId,
            contactSlot: contact.contactSlot,
            firstName: contact.firstName,
            lastName: contact.lastName,
            role: contact.role,
            isPrimary: contact.isPrimary,
            notes: contact.notes,
          }),
        });

        // Create phones for this contact
        for (const phone of contact.phones) {
          await apiRequest('/api/vendor-contact-phones', {
            method: 'POST',
            body: JSON.stringify({
              contactId: contactResponse.id,
              phoneSlot: phone.phoneSlot,
              type: phone.type,
              phoneNumber: phone.phoneNumber,
              isPrimary: phone.isPrimary,
            }),
          });
        }

        // Create emails for this contact
        for (const email of contact.emails) {
          await apiRequest('/api/vendor-contact-emails', {
            method: 'POST',
            body: JSON.stringify({
              contactId: contactResponse.id,
              emailSlot: email.emailSlot,
              type: email.type,
              emailAddress: email.emailAddress,
              isPrimary: email.isPrimary,
            }),
          });
        }
      }

      // Create addresses
      for (const address of data.addresses) {
        await apiRequest('/api/vendor-addresses', {
          method: 'POST',
          body: JSON.stringify({
            vendorId,
            addressSlot: address.addressSlot,
            type: address.type,
            street1: address.street1,
            street2: address.street2,
            city: address.city,
            state: address.state,
            zipCode: address.zipCode,
            country: address.country,
            isPrimary: address.isPrimary,
          }),
        });
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({
        title: "Success",
        description: "Vendor created successfully",
      });
      onClose();
      form.reset(defaultValues);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create vendor",
        variant: "destructive",
      });
    },
  });

  // Update vendor mutation (complete implementation)
  const updateVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const vendorId = vendor.id;
      
      // 1. Update basic vendor info
      const basicResponse = await apiRequest(`/api/vendors/${vendorId}`, {
        method: 'PUT',
        body: JSON.stringify(data.basic),
      });

      // 2. Get current vendor details to compare
      const currentDetails = await apiRequest(`/api/vendors/${vendorId}/details`);
      
      // 3. Update contacts
      const currentContactIds = new Set((currentDetails.contacts || []).map((c: any) => c.id));
      const newContactIds = new Set();

      // Update/create contacts
      for (const contact of data.contacts) {
        let contactResponse;
        const existingContact = currentDetails.contacts?.find((c: any) => 
          c.contactSlot === contact.contactSlot
        );

        if (existingContact) {
          // Update existing contact
          contactResponse = await apiRequest(`/api/vendor-contacts/${existingContact.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              vendorId,
              contactSlot: contact.contactSlot,
              firstName: contact.firstName,
              lastName: contact.lastName,
              role: contact.role,
              isPrimary: contact.isPrimary,
              notes: contact.notes,
            }),
          });
          newContactIds.add(existingContact.id);
        } else {
          // Create new contact
          contactResponse = await apiRequest('/api/vendor-contacts', {
            method: 'POST',
            body: JSON.stringify({
              vendorId,
              contactSlot: contact.contactSlot,
              firstName: contact.firstName,
              lastName: contact.lastName,
              role: contact.role,
              isPrimary: contact.isPrimary,
              notes: contact.notes,
            }),
          });
          newContactIds.add(contactResponse.id);
        }

        const contactId = existingContact?.id || contactResponse.id;

        // Update phones for this contact
        const currentPhones = existingContact?.phones || [];
        const currentPhoneIds = new Set(currentPhones.map((p: any) => p.id));
        
        for (const phone of contact.phones) {
          const existingPhone = currentPhones.find((p: any) => p.phoneSlot === phone.phoneSlot);
          
          if (existingPhone) {
            await apiRequest(`/api/vendor-contact-phones/${existingPhone.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                contactId,
                phoneSlot: phone.phoneSlot,
                type: phone.type,
                phoneNumber: phone.phoneNumber,
                isPrimary: phone.isPrimary,
              }),
            });
            currentPhoneIds.delete(existingPhone.id);
          } else {
            await apiRequest('/api/vendor-contact-phones', {
              method: 'POST',
              body: JSON.stringify({
                contactId,
                phoneSlot: phone.phoneSlot,
                type: phone.type,
                phoneNumber: phone.phoneNumber,
                isPrimary: phone.isPrimary,
              }),
            });
          }
        }

        // Delete removed phones
        for (const phoneId of currentPhoneIds) {
          await apiRequest(`/api/vendor-contact-phones/${phoneId}`, { method: 'DELETE' });
        }

        // Update emails for this contact
        const currentEmails = existingContact?.emails || [];
        const currentEmailIds = new Set(currentEmails.map((e: any) => e.id));
        
        for (const email of contact.emails) {
          const existingEmail = currentEmails.find((e: any) => e.emailSlot === email.emailSlot);
          
          if (existingEmail) {
            await apiRequest(`/api/vendor-contact-emails/${existingEmail.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                contactId,
                emailSlot: email.emailSlot,
                type: email.type,
                emailAddress: email.emailAddress,
                isPrimary: email.isPrimary,
              }),
            });
            currentEmailIds.delete(existingEmail.id);
          } else {
            await apiRequest('/api/vendor-contact-emails', {
              method: 'POST',
              body: JSON.stringify({
                contactId,
                emailSlot: email.emailSlot,
                type: email.type,
                emailAddress: email.emailAddress,
                isPrimary: email.isPrimary,
              }),
            });
          }
        }

        // Delete removed emails
        for (const emailId of currentEmailIds) {
          await apiRequest(`/api/vendor-contact-emails/${emailId}`, { method: 'DELETE' });
        }
      }

      // Delete removed contacts (and their phones/emails cascade)
      for (const contactId of currentContactIds) {
        if (!newContactIds.has(contactId)) {
          await apiRequest(`/api/vendor-contacts/${contactId}`, { method: 'DELETE' });
        }
      }

      // 4. Update addresses
      const currentAddressIds = new Set((currentDetails.addresses || []).map((a: any) => a.id));
      
      for (const address of data.addresses) {
        const existingAddress = currentDetails.addresses?.find((a: any) => 
          a.addressSlot === address.addressSlot
        );

        if (existingAddress) {
          await apiRequest(`/api/vendor-addresses/${existingAddress.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              vendorId,
              addressSlot: address.addressSlot,
              type: address.type,
              street1: address.street1,
              street2: address.street2,
              city: address.city,
              state: address.state,
              zipCode: address.zipCode,
              country: address.country,
              isPrimary: address.isPrimary,
            }),
          });
          currentAddressIds.delete(existingAddress.id);
        } else {
          await apiRequest('/api/vendor-addresses', {
            method: 'POST',
            body: JSON.stringify({
              vendorId,
              addressSlot: address.addressSlot,
              type: address.type,
              street1: address.street1,
              street2: address.street2,
              city: address.city,
              state: address.state,
              zipCode: address.zipCode,
              country: address.country,
              isPrimary: address.isPrimary,
            }),
          });
        }
      }

      // Delete removed addresses
      for (const addressId of currentAddressIds) {
        await apiRequest(`/api/vendor-addresses/${addressId}`, { method: 'DELETE' });
      }

      return basicResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendor.id, 'details'] });
      toast({
        title: "Success",
        description: "Vendor updated successfully",
      });
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

  const onSubmit = async (data: VendorFormData) => {
    if (mode === 'create') {
      createVendorMutation.mutate(data);
    } else {
      updateVendorMutation.mutate(data);
    }
  };

  const addContact = () => {
    if (contactFields.length < 3) {
      appendContact({
        contactSlot: contactFields.length + 1,
        firstName: '',
        lastName: '',
        role: '',
        isPrimary: contactFields.length === 0, // First contact is primary by default
        notes: '',
        phones: [],
        emails: [],
      });
    }
  };

  const removeContactAndReindex = (contactIndex: number) => {
    removeContact(contactIndex);
    
    // Reindex remaining contacts to maintain contiguous slots
    setTimeout(() => {
      const updatedContacts = form.getValues('contacts');
      updatedContacts.forEach((contact, index) => {
        form.setValue(`contacts.${index}.contactSlot`, index + 1);
      });
    }, 0);
  };

  const addPhone = (contactIndex: number) => {
    const currentContact = contactFields[contactIndex];
    if (currentContact.phones.length < 2) {
      const updatedContact = {
        ...currentContact,
        phones: [
          ...currentContact.phones,
          {
            phoneSlot: currentContact.phones.length + 1,
            type: 'work' as const,
            phoneNumber: '',
            isPrimary: currentContact.phones.length === 0,
          },
        ],
      };
      updateContact(contactIndex, updatedContact);
    }
  };

  const addEmail = (contactIndex: number) => {
    const currentContact = contactFields[contactIndex];
    if (currentContact.emails.length < 2) {
      const updatedContact = {
        ...currentContact,
        emails: [
          ...currentContact.emails,
          {
            emailSlot: currentContact.emails.length + 1,
            type: 'work' as const,
            emailAddress: '',
            isPrimary: currentContact.emails.length === 0,
          },
        ],
      };
      updateContact(contactIndex, updatedContact);
    }
  };

  const removePhone = (contactIndex: number, phoneIndex: number) => {
    const currentContact = contactFields[contactIndex];
    const updatedPhones = currentContact.phones.filter((_, i) => i !== phoneIndex);
    
    // Reindex remaining phones to maintain contiguous slots
    const reindexedPhones = updatedPhones.map((phone, index) => ({
      ...phone,
      phoneSlot: index + 1,
    }));
    
    const updatedContact = {
      ...currentContact,
      phones: reindexedPhones,
    };
    updateContact(contactIndex, updatedContact);
  };

  const removeEmail = (contactIndex: number, emailIndex: number) => {
    const currentContact = contactFields[contactIndex];
    const updatedEmails = currentContact.emails.filter((_, i) => i !== emailIndex);
    
    // Reindex remaining emails to maintain contiguous slots
    const reindexedEmails = updatedEmails.map((email, index) => ({
      ...email,
      emailSlot: index + 1,
    }));
    
    const updatedContact = {
      ...currentContact,
      emails: reindexedEmails,
    };
    updateContact(contactIndex, updatedContact);
  };

  const addAddress = () => {
    if (addressFields.length < 2) {
      appendAddress({
        addressSlot: addressFields.length + 1,
        type: 'business',
        street1: '',
        street2: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA',
        isPrimary: addressFields.length === 0, // First address is primary by default
      });
    }
  };

  const removeAddressAndReindex = (addressIndex: number) => {
    removeAddress(addressIndex);
    
    // Reindex remaining addresses to maintain contiguous slots
    setTimeout(() => {
      const updatedAddresses = form.getValues('addresses');
      updatedAddresses.forEach((address, index) => {
        form.setValue(`addresses.${index}.addressSlot`, index + 1);
      });
    }, 0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {mode === 'create' ? 'Add New Vendor' : 'Edit Vendor'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic" className="flex items-center gap-2" data-testid="tab-basic-info">
                  <Building2 className="h-4 w-4" />
                  Basic Info
                </TabsTrigger>
                <TabsTrigger value="contacts" className="flex items-center gap-2" data-testid="tab-contacts">
                  <User className="h-4 w-4" />
                  Contacts ({contactFields.length}/3)
                </TabsTrigger>
                <TabsTrigger value="addresses" className="flex items-center gap-2" data-testid="tab-addresses">
                  <MapPin className="h-4 w-4" />
                  Addresses ({addressFields.length}/2)
                </TabsTrigger>
                <TabsTrigger value="documents" className="flex items-center gap-2" data-testid="tab-documents">
                  <FileText className="h-4 w-4" />
                  Documents
                </TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="basic.name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor Name *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter vendor name"
                            data-testid="input-vendor-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="basic.website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              placeholder="https://example.com"
                              className="pl-10"
                              data-testid="input-vendor-website"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="basic.status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vendor-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="basic.approvalStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Approval Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vendor-approval">
                              <SelectValue placeholder="Select approval status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="basic.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Additional notes about this vendor"
                          rows={4}
                          data-testid="textarea-vendor-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="basic.isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-vendor-active"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active Vendor</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Inactive vendors won't appear in selection lists
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Contact Information</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addContact}
                    disabled={contactFields.length >= 3}
                    data-testid="button-add-contact"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact ({contactFields.length}/3)
                  </Button>
                </div>

                {contactFields.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No contacts added yet. Click "Add Contact" to get started.
                  </p>
                )}

                {contactFields.map((contact, contactIndex) => (
                  <Card key={contact.id} className="p-4">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Contact {contactIndex + 1}
                          {contact.isPrimary && (
                            <Badge className="bg-blue-100 text-blue-800">Primary</Badge>
                          )}
                        </CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeContactAndReindex(contactIndex)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-remove-contact-${contactIndex}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`contacts.${contactIndex}.firstName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="First name"
                                  data-testid={`input-contact-firstname-${contactIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`contacts.${contactIndex}.lastName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Last name"
                                  data-testid={`input-contact-lastname-${contactIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`contacts.${contactIndex}.role`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Role</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="e.g., Sales Manager"
                                  data-testid={`input-contact-role-${contactIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name={`contacts.${contactIndex}.isPrimary`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid={`checkbox-contact-primary-${contactIndex}`}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Primary Contact</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      {/* Phone Numbers */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone Numbers ({contact.phones.length}/2)
                          </h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addPhone(contactIndex)}
                            disabled={contact.phones.length >= 2}
                            data-testid={`button-add-phone-${contactIndex}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {contact.phones.map((phone, phoneIndex) => (
                          <div key={phoneIndex} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-3">
                              <Select
                                value={phone.type}
                                onValueChange={(value) => {
                                  const updatedContact = {
                                    ...contact,
                                    phones: contact.phones.map((p, i) =>
                                      i === phoneIndex ? { ...p, type: value as any } : p
                                    ),
                                  };
                                  updateContact(contactIndex, updatedContact);
                                }}
                              >
                                <SelectTrigger data-testid={`select-phone-type-${contactIndex}-${phoneIndex}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="work">Work</SelectItem>
                                  <SelectItem value="mobile">Mobile</SelectItem>
                                  <SelectItem value="fax">Fax</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-6">
                              <Input
                                value={phone.phoneNumber}
                                onChange={(e) => {
                                  const updatedContact = {
                                    ...contact,
                                    phones: contact.phones.map((p, i) =>
                                      i === phoneIndex ? { ...p, phoneNumber: e.target.value } : p
                                    ),
                                  };
                                  updateContact(contactIndex, updatedContact);
                                }}
                                placeholder="Phone number"
                                data-testid={`input-phone-number-${contactIndex}-${phoneIndex}`}
                              />
                            </div>
                            <div className="col-span-2">
                              <Checkbox
                                checked={phone.isPrimary}
                                onCheckedChange={(checked) => {
                                  const updatedContact = {
                                    ...contact,
                                    phones: contact.phones.map((p, i) =>
                                      i === phoneIndex ? { ...p, isPrimary: !!checked } : p
                                    ),
                                  };
                                  updateContact(contactIndex, updatedContact);
                                }}
                              />
                              <label className="text-xs ml-1">Primary</label>
                            </div>
                            <div className="col-span-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removePhone(contactIndex, phoneIndex)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-remove-phone-${contactIndex}-${phoneIndex}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Email Addresses */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email Addresses ({contact.emails.length}/2)
                          </h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addEmail(contactIndex)}
                            disabled={contact.emails.length >= 2}
                            data-testid={`button-add-email-${contactIndex}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {contact.emails.map((email, emailIndex) => (
                          <div key={emailIndex} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-3">
                              <Select
                                value={email.type}
                                onValueChange={(value) => {
                                  const updatedContact = {
                                    ...contact,
                                    emails: contact.emails.map((e, i) =>
                                      i === emailIndex ? { ...e, type: value as any } : e
                                    ),
                                  };
                                  updateContact(contactIndex, updatedContact);
                                }}
                              >
                                <SelectTrigger data-testid={`select-email-type-${contactIndex}-${emailIndex}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="work">Work</SelectItem>
                                  <SelectItem value="personal">Personal</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-6">
                              <Input
                                value={email.emailAddress}
                                onChange={(e) => {
                                  const updatedContact = {
                                    ...contact,
                                    emails: contact.emails.map((em, i) =>
                                      i === emailIndex ? { ...em, emailAddress: e.target.value } : em
                                    ),
                                  };
                                  updateContact(contactIndex, updatedContact);
                                }}
                                placeholder="Email address"
                                data-testid={`input-email-address-${contactIndex}-${emailIndex}`}
                              />
                            </div>
                            <div className="col-span-2">
                              <Checkbox
                                checked={email.isPrimary}
                                onCheckedChange={(checked) => {
                                  const updatedContact = {
                                    ...contact,
                                    emails: contact.emails.map((em, i) =>
                                      i === emailIndex ? { ...em, isPrimary: !!checked } : em
                                    ),
                                  };
                                  updateContact(contactIndex, updatedContact);
                                }}
                              />
                              <label className="text-xs ml-1">Primary</label>
                            </div>
                            <div className="col-span-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeEmail(contactIndex, emailIndex)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-remove-email-${contactIndex}-${emailIndex}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <FormField
                        control={form.control}
                        name={`contacts.${contactIndex}.notes`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Notes</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Additional notes about this contact"
                                rows={2}
                                data-testid={`textarea-contact-notes-${contactIndex}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Addresses Tab */}
              <TabsContent value="addresses" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Address Information</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAddress}
                    disabled={addressFields.length >= 2}
                    data-testid="button-add-address"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address ({addressFields.length}/2)
                  </Button>
                </div>

                {addressFields.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No addresses added yet. Click "Add Address" to get started.
                  </p>
                )}

                {addressFields.map((address, addressIndex) => (
                  <Card key={address.id} className="p-4">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Address {addressIndex + 1}
                          {address.isPrimary && (
                            <Badge className="bg-blue-100 text-blue-800">Primary</Badge>
                          )}
                        </CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAddressAndReindex(addressIndex)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-remove-address-${addressIndex}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`addresses.${addressIndex}.type`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid={`select-address-type-${addressIndex}`}>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="business">Business</SelectItem>
                                  <SelectItem value="billing">Billing</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`addresses.${addressIndex}.isPrimary`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 pt-7">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid={`checkbox-address-primary-${addressIndex}`}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Primary Address</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name={`addresses.${addressIndex}.street1`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address *</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Enter street address"
                                data-testid={`input-address-street1-${addressIndex}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`addresses.${addressIndex}.street2`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address 2</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Apartment, suite, etc. (optional)"
                                data-testid={`input-address-street2-${addressIndex}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`addresses.${addressIndex}.city`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="City"
                                  data-testid={`input-address-city-${addressIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`addresses.${addressIndex}.state`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="State"
                                  data-testid={`input-address-state-${addressIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`addresses.${addressIndex}.zipCode`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ZIP Code *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="ZIP"
                                  data-testid={`input-address-zip-${addressIndex}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name={`addresses.${addressIndex}.country`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Country"
                                data-testid={`input-address-country-${addressIndex}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Document Management</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    data-testid="button-upload-document"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                </div>

                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p>Document upload functionality will be implemented in the next phase.</p>
                  <p className="text-sm">This will include contract uploads, certificates, and other vendor documents.</p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Form Actions */}
            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createVendorMutation.isPending || updateVendorMutation.isPending}
                data-testid="button-save-vendor"
              >
                <Save className="h-4 w-4 mr-2" />
                {createVendorMutation.isPending || updateVendorMutation.isPending
                  ? 'Saving...'
                  : mode === 'create'
                  ? 'Create Vendor'
                  : 'Update Vendor'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}