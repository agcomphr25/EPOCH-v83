
import { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
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
  Upload,
  Eye,
  Calendar,
  AlertCircle,
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

// Document types that match backend enum
const DOCUMENT_TYPES = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'INSURANCE', label: 'Insurance Document' },
  { value: 'TAX_FORM', label: 'Tax Form' },
  { value: 'W9', label: 'W-9 Form' },
  { value: 'BUSINESS_LICENSE', label: 'Business License' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'PO', label: 'Purchase Order' },
  { value: 'OTHER', label: 'Other' },
];

interface VendorDocument {
  id: number;
  vendorId: number;
  type: string;
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  uploadedBy?: number;
  uploadedAt: string;
  expiryDate?: string;
  notes?: string;
  isActive: boolean;
}

export default function VendorFormModal({
  isOpen,
  onClose,
  vendor,
  mode = 'create'
}: VendorFormModalProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState('OTHER');
  const [documentNotes, setDocumentNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch vendor documents when vendor exists
  const { data: vendorDocuments, isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/vendor-documents/vendor', vendor?.id],
    enabled: !!vendor?.id && mode === 'edit',
    refetchOnWindowFocus: false,
  });

  // Update documents state when query data changes
  useEffect(() => {
    if (vendorDocuments && Array.isArray(vendorDocuments)) {
      setDocuments(vendorDocuments);
    } else {
      setDocuments([]);
    }
  }, [vendorDocuments]);

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
        phones: [...currentContact.phones, {
          phoneSlot: currentContact.phones.length + 1,
          type: 'work' as const,
          phoneNumber: '',
          isPrimary: currentContact.phones.length === 0,
        }]
      };
      form.setValue(`contacts.${contactIndex}`, updatedContact);
    }
  };

  const addEmail = (contactIndex: number) => {
    const currentContact = contactFields[contactIndex];
    if (currentContact.emails.length < 2) {
      const updatedContact = {
        ...currentContact,
        emails: [...currentContact.emails, {
          emailSlot: currentContact.emails.length + 1,
          type: 'work' as const,
          emailAddress: '',
          isPrimary: currentContact.emails.length === 0,
        }]
      };
      form.setValue(`contacts.${contactIndex}`, updatedContact);
    }
  };

  const removePhone = (contactIndex: number, phoneIndex: number) => {
    const currentContact = contactFields[contactIndex];
    const updatedPhones = currentContact.phones.filter((_, index) => index !== phoneIndex);
    
    // Reindex remaining phones
    updatedPhones.forEach((phone, index) => {
      phone.phoneSlot = index + 1;
      if (index === 0) phone.isPrimary = true;
    });

    const updatedContact = {
      ...currentContact,
      phones: updatedPhones
    };
    form.setValue(`contacts.${contactIndex}`, updatedContact);
  };

  const removeEmail = (contactIndex: number, emailIndex: number) => {
    const currentContact = contactFields[contactIndex];
    const updatedEmails = currentContact.emails.filter((_, index) => index !== emailIndex);
    
    // Reindex remaining emails
    updatedEmails.forEach((email, index) => {
      email.emailSlot = index + 1;
      if (index === 0) email.isPrimary = true;
    });

    const updatedContact = {
      ...currentContact,
      emails: updatedEmails
    };
    form.setValue(`contacts.${contactIndex}`, updatedContact);
  };

  const addAddress = () => {
    if (addressFields.length < 2) {
      appendAddress({
        addressSlot: addressFields.length + 1,
        type: addressFields.length === 0 ? 'business' : 'billing',
        street1: '',
        street2: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'USA',
        isPrimary: addressFields.length === 0,
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
        form.setValue(`addresses.${index}.isPrimary`, index === 0);
      });
    }, 0);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && vendor?.id) {
      handleDocumentUpload();
    }
  };

  const handleDocumentUpload = async () => {
    setIsUploadingDocument(true);
    // Document upload logic would go here
    setIsUploadingDocument(false);
    setShowDocumentForm(false);
  };

  const handleDeleteDocument = (documentId: number) => {
    // Delete document logic
  };

  const handlePreviewDocument = (document: VendorDocument) => {
    window.open(`/api/documents/${document.filePath}`, '_blank');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDocumentTypeLabel = (type: string) => {
    const docType = DOCUMENT_TYPES.find(t => t.value === type);
    return docType ? docType.label : type;
  };

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
      
      // Documents are loaded via useQuery, not from vendor prop
    } else {
      form.reset(defaultValues);
      setDocuments([]);
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
        for (const phoneId of Array.from(currentPhoneIds)) {
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
        for (const emailId of Array.from(currentEmailIds)) {
          await apiRequest(`/api/vendor-contact-emails/${emailId}`, { method: 'DELETE' });
        }
      }

      // Delete removed contacts (and their phones/emails cascade)
      for (const contactId of Array.from(currentContactIds)) {
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
      for (const addressId of Array.from(currentAddressIds)) {
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

      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      onSaved();

    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vendor",
        variant: "destructive",
      });
    },
  });


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
                    name="basic.name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor Name *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-vendor-name" />
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
                          <Input {...field} data-testid="input-vendor-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-4 mt-4">
                {/* Contact management UI would go here */}
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="space-y-4 mt-4">
                {/* Notes UI would go here */}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-vendor-form"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-submit-vendor-form"
              >
                {isPending ? "Saving..." : mode === 'create' ? "Create Vendor" : "Update Vendor"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
