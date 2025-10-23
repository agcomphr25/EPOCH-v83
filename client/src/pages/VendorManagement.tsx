import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Plus,
  Search,
  ChevronUp,
  ChevronDown,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  User,
  Package,
  Upload,
  FileText,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  insertVendorSchema,
  insertVendorContactSchema,
  type Vendor,
  type VendorContact,
} from '@shared/schema';
import SimpleAddressInput from '@/components/SimpleAddressInput';
import type { AddressData } from '@/utils/addressUtils';

const vendorFormSchema = insertVendorSchema.extend({
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  additionalEmail: z
    .string()
    .email('Invalid email')
    .optional()
    .or(z.literal('')),
  scope: z.string().optional(),
  approvalSource: z.string().optional(),
  approvalPdfUrl: z.string().optional(),
  evaluationDate: z.string().optional(),
  qualityScore: z.number().int().min(1).max(5).optional().nullable(),
  costScore: z.number().int().min(1).max(5).optional().nullable(),
  deliveryScore: z.number().int().min(1).max(5).optional().nullable(),
  responseScore: z.number().int().min(1).max(5).optional().nullable(),
});

const vendorContactFormSchema = insertVendorContactSchema
  .extend({
    email: z.string().email('Invalid email').optional().or(z.literal('')),
  })
  .omit({ vendorId: true });

type VendorFormData = z.infer<typeof vendorFormSchema>;
type VendorContactFormData = z.infer<typeof vendorContactFormSchema>;

interface VendorsResponse {
  data: Vendor[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
}

type PendingContact = VendorContactFormData & { tempId: string };

export default function VendorManagement() {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);

  // Pending contacts for new vendors (before vendor is created)
  const [pendingContacts, setPendingContacts] = useState<PendingContact[]>([]);

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Filter and pagination state
  const [search, setSearch] = useState('');
  const [approved, setApproved] = useState<'any' | 'true' | 'false'>('any');
  const [evaluated, setEvaluated] = useState<'any' | 'true' | 'false'>('any');
  const [evalFrom, setEvalFrom] = useState('');
  const [evalTo, setEvalTo] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [vendorAddress, setVendorAddress] = useState<AddressData>({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      email: '',
      additionalEmail: '',
      phone: '',
      scope: '',
      approvalSource: '',
      approvalPdfUrl: '',
      approved: false,
      evaluated: false,
      evaluationDate: '',
      qualityScore: null,
      costScore: null,
      deliveryScore: null,
      responseScore: null,
      notes: '',
    },
  });

  // Build query params
  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(search && { search }),
    approved,
    evaluated,
    ...(evalFrom && { evalFrom }),
    ...(evalTo && { evalTo }),
    sort,
  }).toString();

  // Fetch vendors
  const { data: vendorsData, isLoading } = useQuery<VendorsResponse>({
    queryKey: [
      '/api/vendors',
      page,
      pageSize,
      search,
      approved,
      evaluated,
      evalFrom,
      evalTo,
      sort,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/vendors?${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch vendors');
      return res.json();
    },
  });

  // Create vendor mutation
  const createVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const vendor = (await apiRequest('/api/vendors', {
        method: 'POST',
        body: data,
      })) as Vendor;

      // Create pending contacts if any
      if (pendingContacts.length > 0) {
        await Promise.all(
          pendingContacts.map((contact) =>
            apiRequest(`/api/vendors/${vendor.id}/contacts`, {
              method: 'POST',
              body: {
                name: contact.name,
                title: contact.title,
                email: contact.email,
                phone: contact.phone,
                isPrimary: contact.isPrimary,
                notes: contact.notes,
              },
            })
          )
        );
      }

      return vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({ title: 'Vendor created successfully' });
      setIsModalOpen(false);
      setPendingContacts([]);
      form.reset();
    },
    onError: () => {
      toast({ title: 'Failed to create vendor', variant: 'destructive' });
    },
  });

  // Update vendor mutation
  const updateVendorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: VendorFormData }) => {
      return await apiRequest(`/api/vendors/${id}`, {
        method: 'PUT',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({ title: 'Vendor updated successfully' });
      setIsModalOpen(false);
      setEditingVendor(null);
      form.reset();
    },
    onError: () => {
      toast({ title: 'Failed to update vendor', variant: 'destructive' });
    },
  });

  // Delete vendor mutation
  const deleteVendorMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/vendors/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({ title: 'Vendor deleted successfully' });
      setDeleteVendor(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete vendor', variant: 'destructive' });
    },
  });

  // Contact management state
  const [editingContact, setEditingContact] = useState<VendorContact | null>(
    null
  );
  const [editingPendingContact, setEditingPendingContact] =
    useState<PendingContact | null>(null);
  const [deleteContact, setDeleteContact] = useState<VendorContact | null>(
    null
  );
  const [deletePendingContact, setDeletePendingContact] =
    useState<PendingContact | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);

  const contactForm = useForm<VendorContactFormData>({
    resolver: zodResolver(vendorContactFormSchema),
    defaultValues: {
      name: '',
      title: '',
      email: '',
      phone: '',
      isPrimary: false,
      notes: '',
    },
  });

  // Fetch vendor contacts
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<
    VendorContact[]
  >({
    queryKey: ['/api/vendors', editingVendor?.id, 'contacts'],
    queryFn: async () => {
      if (!editingVendor?.id) return [];
      const res = await fetch(`/api/vendors/${editingVendor.id}/contacts`);
      if (!res.ok) throw new Error('Failed to fetch contacts');
      return res.json();
    },
    enabled: !!editingVendor?.id,
  });

  // Create contact mutation
  const createContactMutation = useMutation({
    mutationFn: async (data: VendorContactFormData) => {
      if (editingVendor?.id) {
        // Editing existing vendor - create via API
        return await apiRequest(`/api/vendors/${editingVendor.id}/contacts`, {
          method: 'POST',
          body: data,
        });
      } else {
        // Creating new vendor - add to pending contacts
        const newContact: PendingContact = {
          ...data,
          tempId: `temp-${Date.now()}-${Math.random()}`,
        };
        setPendingContacts((prev) => [...prev, newContact]);
        return newContact;
      }
    },
    onSuccess: () => {
      if (editingVendor?.id) {
        queryClient.invalidateQueries({
          queryKey: ['/api/vendors', editingVendor.id, 'contacts'],
        });
      }
      toast({ title: 'Contact added successfully' });
      setIsAddingContact(false);
      contactForm.reset();
    },
    onError: () => {
      toast({ title: 'Failed to add contact', variant: 'destructive' });
    },
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      tempId,
    }: {
      id?: number;
      data: VendorContactFormData;
      tempId?: string;
    }) => {
      if (tempId) {
        // Update pending contact
        setPendingContacts((prev) =>
          prev.map((c) => (c.tempId === tempId ? { ...c, ...data } : c))
        );
        return data;
      } else if (id && editingVendor?.id) {
        // Update existing contact via API
        return await apiRequest(
          `/api/vendors/${editingVendor.id}/contacts/${id}`,
          { method: 'PUT', body: data }
        );
      }
      throw new Error('No contact identifier provided');
    },
    onSuccess: () => {
      if (editingVendor?.id) {
        queryClient.invalidateQueries({
          queryKey: ['/api/vendors', editingVendor.id, 'contacts'],
        });
      }
      toast({ title: 'Contact updated successfully' });
      setEditingContact(null);
      setEditingPendingContact(null);
      contactForm.reset();
    },
    onError: () => {
      toast({ title: 'Failed to update contact', variant: 'destructive' });
    },
  });

  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async ({ id, tempId }: { id?: number; tempId?: string }) => {
      if (tempId) {
        // Delete pending contact
        setPendingContacts((prev) => prev.filter((c) => c.tempId !== tempId));
        return;
      } else if (id && editingVendor?.id) {
        // Delete existing contact via API
        return await apiRequest(
          `/api/vendors/${editingVendor.id}/contacts/${id}`,
          { method: 'DELETE' }
        );
      }
      throw new Error('No contact identifier provided');
    },
    onSuccess: () => {
      if (editingVendor?.id) {
        queryClient.invalidateQueries({
          queryKey: ['/api/vendors', editingVendor.id, 'contacts'],
        });
      }
      toast({ title: 'Contact deleted successfully' });
      setDeleteContact(null);
      setDeletePendingContact(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete contact', variant: 'destructive' });
    },
  });

  const handleOpenModal = (vendor?: Vendor) => {
    if (vendor) {
      setEditingVendor(vendor);
      form.reset({
        name: vendor.name,
        contactPerson: vendor.contactPerson || '',
        email: vendor.email || '',
        additionalEmail: vendor.additionalEmail || '',
        phone: vendor.phone || '',

        street: vendor.street || '',
        city: vendor.city || '',
        state: vendor.state || '',
        zipCode: vendor.zipCode || '',
        country: vendor.country || 'United States',

        scope: vendor.scope || '',
        approvalSource: vendor.approvalSource || '',
        approvalPdfUrl: vendor.approvalPdfUrl || '',
        approved: vendor.approved,
        evaluated: vendor.evaluated,
        evaluationDate: vendor.evaluationDate || '',
        qualityScore: vendor.qualityScore || null,
        costScore: vendor.costScore || null,
        deliveryScore: vendor.deliveryScore || null,
        responseScore: vendor.responseScore || null,
        notes: vendor.notes || '',
      });
      setVendorAddress({
        street: vendor.street || '',
        city: vendor.city || '',
        state: vendor.state || '',
        zipCode: vendor.zipCode || '',
        country: vendor.country || 'United States',
      });
    } else {
      setEditingVendor(null);
      form.reset();
      setVendorAddress({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'United States',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingVendor(null);
    setPendingContacts([]);
    form.reset();
    setVendorAddress({
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
    });
    // Reset contact form states
    setIsAddingContact(false);
    setEditingContact(null);
    contactForm.reset();
    // Reset file upload state
    setUploadedFile(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/vendors/upload/approval', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      form.setValue('approvalPdfUrl', data.url);
      setUploadedFile(file);
      toast({ title: 'File uploaded successfully' });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    form.setValue('approvalPdfUrl', '');
  };

  const onSubmit = (data: VendorFormData) => {
    const normalizedData = {
      ...data,
      contactPerson: data.contactPerson || undefined,
      email: data.email || undefined,
      additionalEmail: data.additionalEmail || undefined,
      phone: data.phone || undefined,

      street: vendorAddress.street || undefined,
      city: vendorAddress.city || undefined,
      state: vendorAddress.state || undefined,
      zipCode: vendorAddress.zipCode || undefined,
      country: vendorAddress.country || undefined,

      evaluationDate: data.evaluationDate || undefined,
      notes: data.notes || undefined,
      approvalSource: data.approvalSource || undefined,
      approvalPdfUrl: data.approvalPdfUrl || undefined,
    };

    console.log('Submitting vendor data:', {
      approvalSource: normalizedData.approvalSource,
      approvalPdfUrl: normalizedData.approvalPdfUrl,
    });

    if (editingVendor) {
      updateVendorMutation.mutate({
        id: editingVendor.id,
        data: normalizedData,
      });
    } else {
      createVendorMutation.mutate(normalizedData);
    }
  };

  const toggleSort = (field: string) => {
    const [currentField, currentDir] = sort.split(':');
    if (currentField === field) {
      setSort(`${field}:${currentDir === 'asc' ? 'desc' : 'asc'}`);
    } else {
      setSort(`${field}:asc`);
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    const [currentField, currentDir] = sort.split(':');
    if (currentField !== field) return null;
    return currentDir === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Vendor Management
          </h1>
          {vendorsData && (() => {
            const vendorsWithScores = vendorsData.data.filter(v => 
              v.qualityScore || v.costScore || v.deliveryScore || v.responseScore
            );
            if (vendorsWithScores.length === 0) return null;
            
            const totalPoints = vendorsWithScores.reduce((sum, vendor) => {
              return sum + (vendor.qualityScore ?? 0) + (vendor.costScore ?? 0) + 
                     (vendor.deliveryScore ?? 0) + (vendor.responseScore ?? 0);
            }, 0);
            const maxPossiblePoints = vendorsWithScores.length * 20;
            const overallAverage = ((totalPoints / maxPossiblePoints) * 100).toFixed(1);
            
            return (
              <div className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full font-semibold">
                Overall Average: {overallAverage}%
              </div>
            );
          })()}
        </div>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => handleOpenModal()}
              data-testid="button-create-vendor"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-modal-title">
                {editingVendor ? 'Edit Vendor' : 'New Vendor'}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="main" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="main" data-testid="tab-main-info">
                  Main Info
                </TabsTrigger>
                <TabsTrigger value="contacts" data-testid="tab-contacts">
                  Additional Contacts{' '}
                  {!editingVendor &&
                    pendingContacts.length > 0 &&
                    `(${pendingContacts.length})`}
                </TabsTrigger>
                <TabsTrigger value="scope" data-testid="tab-scope">
                  Scope
                </TabsTrigger>
                <TabsTrigger value="evaluation" data-testid="tab-evaluation">
                  Evaluation & Notes
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Main Info */}
              <TabsContent value="main" className="space-y-4 mt-4">
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
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

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactPerson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Primary Contact Person</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                data-testid="input-contact-person"
                              />
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
                              <Input {...field} data-testid="input-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Primary Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                {...field}
                                data-testid="input-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="additionalEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Additional Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                {...field}
                                data-testid="input-additional-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>


                    <div>
                      <SimpleAddressInput
                        label="Address"
                        value={vendorAddress}
                        onChange={setVendorAddress}
                        required={false}

                      />
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseModal}
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          createVendorMutation.isPending ||
                          updateVendorMutation.isPending
                        }
                        data-testid="button-save"
                      >
                        {createVendorMutation.isPending ||
                        updateVendorMutation.isPending
                          ? 'Saving...'
                          : 'Save'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>

              {/* Tab 2: Additional Contacts */}
              <TabsContent value="contacts" className="space-y-4 mt-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Contact List</h3>
                  <Button
                    onClick={() => setIsAddingContact(true)}
                    size="sm"
                    data-testid="button-add-contact"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Contact
                  </Button>
                </div>

                {!editingVendor &&
                  !isAddingContact &&
                  pendingContacts.length === 0 && (
                    <p className="text-center text-gray-500 py-4">
                      No additional contacts added yet. Contacts will be saved
                      when you create the vendor.
                    </p>
                  )}

                {editingVendor && contactsLoading ? (
                  <p className="text-center text-gray-500 py-4">
                    Loading contacts...
                  </p>
                ) : editingVendor &&
                  contacts.length === 0 &&
                  !isAddingContact ? (
                  <p className="text-center text-gray-500 py-4">
                    No additional contacts added yet.
                  </p>
                ) : null}

                {/* Display pending contacts (for new vendors) */}
                {!editingVendor && pendingContacts.length > 0 && (
                  <div className="space-y-2">
                    {pendingContacts.map((contact) => (
                      <div
                        key={contact.tempId}
                        className="border rounded-lg p-3 flex justify-between items-start"
                        data-testid={`contact-card-${contact.tempId}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{contact.name}</span>
                            {contact.isPrimary && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                          {contact.title && (
                            <p className="text-sm text-gray-600 mt-1">
                              {contact.title}
                            </p>
                          )}
                          {contact.email && (
                            <p className="text-sm text-gray-600">
                              {contact.email}
                            </p>
                          )}
                          {contact.phone && (
                            <p className="text-sm text-gray-600">
                              {contact.phone}
                            </p>
                          )}
                          {contact.notes && (
                            <p className="text-sm text-gray-500 mt-1 italic">
                              {contact.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPendingContact(contact);
                              contactForm.reset({
                                name: contact.name,
                                title: contact.title || '',
                                email: contact.email || '',
                                phone: contact.phone || '',
                                isPrimary: contact.isPrimary ?? false,
                                notes: contact.notes || '',
                              });
                            }}
                            data-testid={`button-edit-contact-${contact.tempId}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletePendingContact(contact)}
                            data-testid={`button-delete-contact-${contact.tempId}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Display API contacts (for existing vendors) */}
                {editingVendor && contacts.length > 0 && (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="border rounded-lg p-3 flex justify-between items-start"
                        data-testid={`contact-card-${contact.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{contact.name}</span>
                            {contact.isPrimary && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                          {contact.title && (
                            <p className="text-sm text-gray-600 mt-1">
                              {contact.title}
                            </p>
                          )}
                          {contact.email && (
                            <p className="text-sm text-gray-600">
                              {contact.email}
                            </p>
                          )}
                          {contact.phone && (
                            <p className="text-sm text-gray-600">
                              {contact.phone}
                            </p>
                          )}
                          {contact.notes && (
                            <p className="text-sm text-gray-500 mt-1 italic">
                              {contact.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingContact(contact);
                              contactForm.reset({
                                name: contact.name,
                                title: contact.title || '',
                                email: contact.email || '',
                                phone: contact.phone || '',
                                isPrimary: contact.isPrimary ?? false,
                                notes: contact.notes || '',
                              });
                            }}
                            data-testid={`button-edit-contact-${contact.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteContact(contact)}
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add/Edit Contact Form */}
                {(isAddingContact ||
                  editingContact ||
                  editingPendingContact) && (
                  <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                    <h4 className="font-semibold mb-3">
                      {editingContact || editingPendingContact
                        ? 'Edit Contact'
                        : 'New Contact'}
                    </h4>
                    <Form {...contactForm}>
                      <form
                        onSubmit={contactForm.handleSubmit((data) => {
                          if (editingContact) {
                            updateContactMutation.mutate({
                              id: editingContact.id,
                              data,
                            });
                          } else if (editingPendingContact) {
                            updateContactMutation.mutate({
                              tempId: editingPendingContact.tempId,
                              data,
                            });
                          } else {
                            createContactMutation.mutate(data);
                          }
                        })}
                        className="space-y-3"
                      >
                        <FormField
                          control={contactForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name *</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  data-testid="input-contact-name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={contactForm.control}
                            name="title"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Title</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    data-testid="input-contact-title"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={contactForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    data-testid="input-contact-phone"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={contactForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  {...field}
                                  data-testid="input-contact-email"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={contactForm.control}
                          name="isPrimary"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primary Contact</FormLabel>
                              <Select
                                onValueChange={(value) =>
                                  field.onChange(value === 'true')
                                }
                                value={field.value ? 'true' : 'false'}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-contact-primary">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="true">Yes</SelectItem>
                                  <SelectItem value="false">No</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={contactForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  rows={2}
                                  data-testid="input-contact-notes"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex gap-2 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setIsAddingContact(false);
                              setEditingContact(null);
                              setEditingPendingContact(null);
                              contactForm.reset();
                            }}
                            data-testid="button-cancel-contact"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={
                              createContactMutation.isPending ||
                              updateContactMutation.isPending
                            }
                            data-testid="button-save-contact"
                          >
                            {createContactMutation.isPending ||
                            updateContactMutation.isPending
                              ? 'Saving...'
                              : 'Save Contact'}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Scope - PL2 Approved Materials */}
              <TabsContent value="scope" className="space-y-4 mt-4">
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <Package className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-blue-900">Vendor Scope</h4>
                          <p className="text-sm text-blue-700">
                            Define which materials and products this vendor is approved to supply.
                            Vendor will only show as "PL2 Approved" when scope is filled in.
                          </p>
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="approvalSource"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Approval Source</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex flex-col space-y-1"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="Certification"
                                  id="certification"
                                  data-testid="radio-certification"
                                />
                                <Label
                                  htmlFor="certification"
                                  className="font-normal cursor-pointer"
                                >
                                  Certification
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="Supplier Approval Form"
                                  id="supplier-approval"
                                  data-testid="radio-supplier-approval"
                                />
                                <Label
                                  htmlFor="supplier-approval"
                                  className="font-normal cursor-pointer"
                                >
                                  Supplier Approval Form
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label>Approval Document (PDF)</Label>
                      {!uploadedFile && !form.watch('approvalPdfUrl') ? (
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
                          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <Label
                            htmlFor="file-upload"
                            className="cursor-pointer text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            Click to upload PDF
                          </Label>
                          <Input
                            id="file-upload"
                            type="file"
                            accept="application/pdf"
                            onChange={handleFileUpload}
                            className="hidden"
                            data-testid="input-file-upload"
                            disabled={uploadingFile}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            PDF files only
                          </p>
                        </div>
                      ) : (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-5 h-5 text-blue-600" />
                              <span className="text-sm font-medium">
                                {uploadedFile?.name || 'Approval Document.pdf'}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveFile}
                              data-testid="button-remove-file"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          {form.watch('approvalPdfUrl') && (
                            <a
                              href={form.watch('approvalPdfUrl')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-2 inline-block"
                              data-testid="link-view-pdf"
                            >
                              View PDF
                            </a>
                          )}
                        </div>
                      )}
                      {uploadingFile && (
                        <p className="text-xs text-gray-500">Uploading...</p>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="scope"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PL2 Approved Materials & Products *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Example: CF stocks, FG stocks, Hybrid materials, etc."
                              rows={6}
                              data-testid="input-scope"
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-gray-500">
                            List the materials, products, and services this vendor is approved to provide.
                          </p>
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseModal}
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          createVendorMutation.isPending ||
                          updateVendorMutation.isPending
                        }
                        data-testid="button-save"
                      >
                        {createVendorMutation.isPending ||
                        updateVendorMutation.isPending
                          ? 'Saving...'
                          : 'Save'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>

              {/* Tab 4: Evaluation & Notes */}
              <TabsContent value="evaluation" className="space-y-4 mt-4">
                <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
                  <h4 className="font-semibold text-amber-900 mb-2">Vendor Evaluation</h4>
                  <p className="text-sm text-amber-700">
                    Rate the vendor on 4 criteria using a 1-5 scale.
                  </p>
                </div>

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="qualityScore"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quality</FormLabel>
                            <Select
                              value={field.value?.toString() || ''}
                              onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-quality-score">
                                  <SelectValue placeholder="Select rating..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="5">5 – Excellent</SelectItem>
                                <SelectItem value="4">4 – Good</SelectItem>
                                <SelectItem value="3">3 – Acceptable</SelectItem>
                                <SelectItem value="2">2 – Needs improvement</SelectItem>
                                <SelectItem value="1">1 – Poor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="costScore"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost</FormLabel>
                            <Select
                              value={field.value?.toString() || ''}
                              onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-cost-score">
                                  <SelectValue placeholder="Select rating..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="5">5 – Excellent</SelectItem>
                                <SelectItem value="4">4 – Good</SelectItem>
                                <SelectItem value="3">3 – Acceptable</SelectItem>
                                <SelectItem value="2">2 – Needs improvement</SelectItem>
                                <SelectItem value="1">1 – Poor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="deliveryScore"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delivery</FormLabel>
                            <Select
                              value={field.value?.toString() || ''}
                              onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-delivery-score">
                                  <SelectValue placeholder="Select rating..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="5">5 – Excellent</SelectItem>
                                <SelectItem value="4">4 – Good</SelectItem>
                                <SelectItem value="3">3 – Acceptable</SelectItem>
                                <SelectItem value="2">2 – Needs improvement</SelectItem>
                                <SelectItem value="1">1 – Poor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="responseScore"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Response</FormLabel>
                            <Select
                              value={field.value?.toString() || ''}
                              onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-response-score">
                                  <SelectValue placeholder="Select rating..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="5">5 – Excellent</SelectItem>
                                <SelectItem value="4">4 – Good</SelectItem>
                                <SelectItem value="3">3 – Acceptable</SelectItem>
                                <SelectItem value="2">2 – Needs improvement</SelectItem>
                                <SelectItem value="1">1 – Poor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={6}
                              data-testid="input-eval-notes"
                              placeholder="Add any additional notes about this vendor..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseModal}
                        data-testid="button-eval-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          createVendorMutation.isPending ||
                          updateVendorMutation.isPending
                        }
                        data-testid="button-eval-save"
                      >
                        {createVendorMutation.isPending ||
                        updateVendorMutation.isPending
                          ? 'Saving...'
                          : 'Save'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6 space-y-4">
        <div className="grid md:grid-cols-6 grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                id="search"
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="approved-filter">PL2 Approved</Label>
            <Select
              value={approved}
              onValueChange={(value: any) => {
                setApproved(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                id="approved-filter"
                data-testid="select-filter-approved"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="evaluated-filter">Evaluated</Label>
            <Select
              value={evaluated}
              onValueChange={(value: any) => {
                setEvaluated(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                id="evaluated-filter"
                data-testid="select-filter-evaluated"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="eval-from">Eval From</Label>
            <Input
              id="eval-from"
              type="date"
              value={evalFrom}
              onChange={(e) => {
                setEvalFrom(e.target.value);
                setPage(1);
              }}
              data-testid="input-eval-from"
            />
          </div>

          <div>
            <Label htmlFor="eval-to">Eval To</Label>
            <Input
              id="eval-to"
              type="date"
              value={evalTo}
              onChange={(e) => {
                setEvalTo(e.target.value);
                setPage(1);
              }}
              data-testid="input-eval-to"
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Label htmlFor="sort">Sort By</Label>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger
                id="sort"
                className="w-48"
                data-testid="select-sort"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt:desc">Newest</SelectItem>
                <SelectItem value="updatedAt:desc">Recently Updated</SelectItem>
                <SelectItem value="name:asc">Name A→Z</SelectItem>
                <SelectItem value="name:desc">Name Z→A</SelectItem>
                <SelectItem value="evaluationDate:desc">Eval Date ↓</SelectItem>
                <SelectItem value="evaluationDate:asc">Eval Date ↑</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div
            className="text-sm text-gray-600 dark:text-gray-400"
            data-testid="text-total-vendors"
          >
            {vendorsData?.meta.total || 0} vendors found
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleSort('name')}
                  data-testid="header-name"
                >
                  <div className="flex items-center gap-1">
                    Name <SortIcon field="name" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Phone
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleSort('approved')}
                  data-testid="header-approved"
                >
                  <div className="flex items-center gap-1">
                    PL2 Approved <SortIcon field="approved" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleSort('evaluated')}
                  data-testid="header-evaluated"
                >
                  <div className="flex items-center gap-1">
                    Evaluated <SortIcon field="evaluated" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleSort('evaluationDate')}
                  data-testid="header-eval-date"
                >
                  <div className="flex items-center gap-1">
                    Eval Date <SortIcon field="evaluationDate" />
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Score (/20)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    Loading vendors...
                  </td>
                </tr>
              ) : vendorsData?.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No vendors found
                  </td>
                </tr>
              ) : (
                vendorsData?.data.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    data-testid={`row-vendor-${vendor.id}`}
                  >
                    <td
                      className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100"
                      data-testid={`text-vendor-name-${vendor.id}`}
                    >
                      {vendor.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {vendor.contactPerson || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {vendor.email || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {vendor.phone || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {vendor.scope && vendor.scope.trim().length > 0 ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs">Yes</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400">
                          <XCircle className="w-4 h-4" />
                          <span className="text-xs">No</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {vendor.evaluated ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs">Yes</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400">
                          <XCircle className="w-4 h-4" />
                          <span className="text-xs">No</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {vendor.evaluationDate
                        ? new Date(vendor.evaluationDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 text-center">
                      {(() => {
                        const hasScores = vendor.qualityScore || vendor.costScore || vendor.deliveryScore || vendor.responseScore;
                        if (!hasScores) return '—';
                        const totalScore = (vendor.qualityScore ?? 0) + (vendor.costScore ?? 0) + (vendor.deliveryScore ?? 0) + (vendor.responseScore ?? 0);
                        return totalScore;
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenModal(vendor)}
                          data-testid={`button-edit-${vendor.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteVendor(vendor)}
                          data-testid={`button-delete-${vendor.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {vendorsData && vendorsData.meta.pageCount > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Page {vendorsData.meta.page} of {vendorsData.meta.pageCount}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page === vendorsData.meta.pageCount}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Vendor Confirmation Dialog */}
      <AlertDialog
        open={!!deleteVendor}
        onOpenChange={() => setDeleteVendor(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteVendor?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteVendor && deleteVendorMutation.mutate(deleteVendor.id)
              }
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Contact Confirmation Dialog */}
      <AlertDialog
        open={!!deleteContact}
        onOpenChange={() => setDeleteContact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteContact?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-contact">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteContact &&
                deleteContactMutation.mutate({ id: deleteContact.id })
              }
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-contact"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Pending Contact Confirmation Dialog */}
      <AlertDialog
        open={!!deletePendingContact}
        onOpenChange={() => setDeletePendingContact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deletePendingContact?.name}"
              from the contact list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-pending-contact">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletePendingContact &&
                deleteContactMutation.mutate({
                  tempId: deletePendingContact.tempId,
                })
              }
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-pending-contact"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
