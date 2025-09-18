
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
      });

      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: (newDocument) => {
      setDocuments(prev => [...prev, newDocument]);
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendor.id, 'details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-documents/vendor', vendor.id] });
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      setShowDocumentForm(false);
      setSelectedDocumentType('OTHER');
      setDocumentNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await fetch(`/api/vendor-documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      return documentId;
    },
    onSuccess: (deletedId) => {
      setDocuments(prev => prev.filter(doc => doc.id !== deletedId));
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendor.id, 'details'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-documents/vendor', vendor.id] });
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  // Document management functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (mode === 'create') {
      toast({
        title: "Info",
        description: "Please save the vendor first before uploading documents",
        variant: "default",
      });
      return;
    }

    // File validation
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "Error",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    // Set the selected file and show form
    setShowDocumentForm(true);
  };

  const handleDocumentUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    uploadDocumentMutation.mutate({
      file,
      type: selectedDocumentType,
      notes: documentNotes,
    });
  };

  const handleDeleteDocument = (documentId: number) => {
    deleteDocumentMutation.mutate(documentId);
  };

  const handlePreviewDocument = (document: VendorDocument) => {
    // Open document in new tab for preview
    const previewUrl = `/api/vendor-documents/${document.id}/view`;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDocumentTypeLabel = (type: string) => {
    return DOCUMENT_TYPES.find(t => t.value === type)?.label || type;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Contact Persons</h3>


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
                              <FormField
                                control={form.control}
                                name={`contacts.${contactIndex}.emails.${emailIndex}.emailAddress`}
                                render={({ field }) => (
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="Email address"
                                      data-testid={`input-email-address-${contactIndex}-${emailIndex}`}
                                    />
                                  </FormControl>
                                )}
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
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      data-testid="file-input-documents"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={mode === 'create' || uploadDocumentMutation.isPending}
                      data-testid="button-select-document"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadDocumentMutation.isPending ? 'Uploading...' : 'Select Document'}
                    </Button>
                  </div>
                </div>

                {mode === 'create' && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 text-blue-800">
                      <AlertCircle className="h-4 w-4" />
                      <p className="text-sm font-medium">Save vendor first</p>
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      Documents can be uploaded after creating the vendor record.
                    </p>
                  </div>
                )}

                {showDocumentForm && (
                  <Card className="p-4 mb-4">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Upload Document</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowDocumentForm(false);
                            setSelectedDocumentType('OTHER');
                            setDocumentNotes('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          data-testid="button-cancel-document-upload"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="text-sm font-medium">Document Type</label>
                          <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
                            <SelectTrigger data-testid="select-document-type">
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                            <SelectContent>
                              {DOCUMENT_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">Notes (Optional)</label>
                          <Textarea
                            value={documentNotes}
                            onChange={(e) => setDocumentNotes(e.target.value)}
                            placeholder="Add any notes about this document..."
                            rows={2}
                            data-testid="textarea-document-notes"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowDocumentForm(false);
                            setSelectedDocumentType('OTHER');
                            setDocumentNotes('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          data-testid="button-cancel-upload"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleDocumentUpload}
                          disabled={uploadDocumentMutation.isPending}
                          data-testid="button-confirm-upload"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {uploadDocumentMutation.isPending ? 'Uploading...' : 'Upload Document'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {mode === 'edit' && (
                  <>
                    {documents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p className="text-lg font-medium">No documents uploaded</p>
                        <p className="text-sm">Click "Upload Document" to add contracts, certificates, or other vendor documents.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {documents.map((document) => (
                          <Card key={document.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                  <FileText className="h-8 w-8 text-blue-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p 
                                      className="text-sm font-medium text-gray-900 truncate"
                                      data-testid={`text-document-name-${document.id}`}
                                    >
                                      {document.originalName}
                                    </p>
                                    <Badge 
                                      variant="secondary" 
                                      className="text-xs"
                                      data-testid={`badge-document-type-${document.id}`}
                                    >
                                      {getDocumentTypeLabel(document.type)}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1">
                                    <p 
                                      className="text-xs text-gray-500"
                                      data-testid={`text-document-size-${document.id}`}
                                    >
                                      {formatFileSize(document.fileSize)}
                                    </p>
                                    <p 
                                      className="text-xs text-gray-500 flex items-center gap-1"
                                      data-testid={`text-document-date-${document.id}`}
                                    >
                                      <Calendar className="h-3 w-3" />
                                      {new Date(document.uploadedAt).toLocaleDateString()}
                                    </p>
                                    {document.expiryDate && (
                                      <p 
                                        className="text-xs text-amber-600 flex items-center gap-1"
                                        data-testid={`text-document-expiry-${document.id}`}
                                      >
                                        <AlertCircle className="h-3 w-3" />
                                        Expires: {new Date(document.expiryDate).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                  {document.notes && (
                                    <p 
                                      className="text-xs text-gray-600 mt-1"
                                      data-testid={`text-document-notes-${document.id}`}
                                    >
                                      {document.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePreviewDocument(document)}
                                  data-testid={`button-preview-document-${document.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDocument(document.id)}
                                  disabled={deleteDocumentMutation.isPending}
                                  className="text-red-600 hover:text-red-700"
                                  data-testid={`button-delete-document-${document.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    <div className="text-center pt-4">
                      <p className="text-xs text-gray-500" data-testid="text-supported-files">
                        Supported file types: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG • Max size: 10MB
                      </p>
                    </div>
                  </>
                )}
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