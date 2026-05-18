import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
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
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import Papa from 'papaparse';
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
import VendorScopeSelector from '@/components/VendorScopeSelector';
import MediaLibraryPicker from '@/components/MediaLibraryPicker';
import { FolderOpen } from 'lucide-react';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

const vendorFormSchema = insertVendorSchema.extend({
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  additionalEmail: z
    .string()
    .email('Invalid email')
    .optional()
    .or(z.literal('')),
  scope: z.string().optional(),
  approvalLevel: z.string().optional(),
  approvalSource: z.string().optional(),
  approvalPdfUrl: z.string().optional(),
  mainDocumentUrl: z.string().optional(),
  startRenewalDate: z.string().optional(),
  approvalExpiration: z.string().optional(),
  evaluationDate: z.string().optional(),
  qualityScore: z.number().int().min(1).max(5).optional().nullable(),
  costScore: z.number().int().min(1).max(5).optional().nullable(),
  deliveryScore: z.number().int().min(1).max(5).optional().nullable(),
  responseScore: z.number().int().min(1).max(5).optional().nullable(),
  termsAndConditions: z.string().optional(),
  paymentTerms: z.string().optional(),
  shippingInstructions: z.string().optional(),
});

const vendorContactFormSchema = insertVendorContactSchema
  .extend({
    email: z.string().email('Invalid email').optional().or(z.literal('')),
  })
  .omit({ vendorId: true });

type VendorFormData = z.infer<typeof vendorFormSchema>;
type VendorContactFormData = z.infer<typeof vendorContactFormSchema>;
type MonthlyEvaluationsTableHandle = {
  savePendingChanges: () => Promise<boolean>;
};

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
  const evaluationTableRef = useRef<MonthlyEvaluationsTableHandle>(null);

  // Pending contacts for new vendors (before vendor is created)
  const [pendingContacts, setPendingContacts] = useState<PendingContact[]>([]);

  // File upload state (for approval document on Scope tab)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Main document upload state (for Main Info tab)
  const [mainDocFile, setMainDocFile] = useState<File | null>(null);
  const [uploadingMainDoc, setUploadingMainDoc] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);

  // CSV import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);

  // Filter and pagination state
  const [search, setSearch] = useState('');
  const [approved, setApproved] = useState<'any' | 'true' | 'false'>('any');
  const [evaluated, setEvaluated] = useState<'any' | 'true' | 'false'>('any');
  const [evalFrom, setEvalFrom] = useState('');
  const [evalTo, setEvalTo] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10000);
  const [activePageTab, setActivePageTab] = useState('vendors');

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
      approvalLevel: '',
      approvalSource: '',
      approvalPdfUrl: '',
      mainDocumentUrl: '',
      startRenewalDate: '',
      approvalExpiration: '',
      approved: false,
      evaluated: false,
      evaluationDate: '',
      qualityScore: null,
      costScore: null,
      deliveryScore: null,
      responseScore: null,
      notes: '',
      termsAndConditions: '',
      paymentTerms: '',
      shippingInstructions: '',
    },
  });

  const isCreateMode = isModalOpen && !editingVendor;

  const { hasDraft, restoreDraft, clearDraft } = useFormDraft<{
    formValues: VendorFormData;
    vendorAddress: AddressData;
    pendingContacts: PendingContact[];
  }>({
    storageKey: 'vendor-draft',
    getValues: () => ({
      formValues: form.getValues(),
      vendorAddress,
      pendingContacts,
    }),
    enabled: isCreateMode,
  });

  const [showDraftBanner, setShowDraftBanner] = useState(false);

  useUnsavedChangesWarning(isModalOpen && form.formState.isDirty);

  // Auto-update evaluated field based on scores
  useEffect(() => {
    const subscription = form.watch((value) => {
      const { qualityScore, costScore, deliveryScore, responseScore } = value;
      const hasAllScores = 
        qualityScore !== null && qualityScore !== undefined &&
        costScore !== null && costScore !== undefined &&
        deliveryScore !== null && deliveryScore !== undefined &&
        responseScore !== null && responseScore !== undefined;
      
      const hasAnyScore = 
        qualityScore !== null && qualityScore !== undefined ||
        costScore !== null && costScore !== undefined ||
        deliveryScore !== null && deliveryScore !== undefined ||
        responseScore !== null && responseScore !== undefined;
      
      // Set evaluated to true if at least one score is present
      const currentEvaluated = form.getValues('evaluated');
      if (hasAnyScore && !currentEvaluated) {
        form.setValue('evaluated', true);
      } else if (!hasAnyScore && currentEvaluated) {
        form.setValue('evaluated', false);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

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

  // Fetch YTD overall average summary
  const { data: ytdSummary } = useQuery<{
    overallAveragePercent: number;
    totalScores: number;
    recordedScoreCount: number;
  }>({
    queryKey: ['/api/vendors/evaluations/ytd-summary'],
    queryFn: async () => {
      const res = await fetch('/api/vendors/evaluations/ytd-summary');
      if (!res.ok) throw new Error('Failed to fetch YTD summary');
      return res.json();
    },
  });

  // Fetch all vendors with documents
  const { data: vendorDocuments = [], isLoading: docsLoading } = useQuery<
    { id: number; name: string; mainDocumentUrl: string }[]
  >({
    queryKey: ['/api/vendors/documents/all'],
    queryFn: async () => {
      const res = await fetch('/api/vendors/documents/all');
      if (!res.ok) throw new Error('Failed to fetch vendor documents');
      return res.json();
    },
  });

  // Create vendor mutation
  const createVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const vendor = (await apiRequest('/api/vendors', {
        method: 'POST',
        body: { ...data, skipValidation: true },
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
      queryClient.invalidateQueries({ queryKey: ['/api/vendors/documents/all'] });
      toast({ title: 'Vendor created successfully' });
      clearDraft();
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
        body: { ...data, skipValidation: true },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors/documents/all'] });
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

  // Reset annual evaluations mutation
  const resetEvaluationsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/vendors/reset-monthly-evaluations', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({ 
        title: 'Annual evaluations reset', 
        description: `Successfully reset ${data.vendorsReset} vendors` 
      });
    },
    onError: () => {
      toast({ 
        title: 'Failed to reset evaluations', 
        variant: 'destructive' 
      });
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
    // Reset file upload state when opening modal
    setUploadedFile(null);
    setMainDocFile(null);
    
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
        approvalLevel: vendor.approvalLevel || '',
        approvalSource: vendor.approvalSource || '',
        approvalPdfUrl: vendor.approvalPdfUrl || '',
        mainDocumentUrl: vendor.mainDocumentUrl || '',
        startRenewalDate: vendor.startRenewalDate || '',
        approvalExpiration: vendor.approvalExpiration || '',
        approved: vendor.approved,
        evaluated: vendor.evaluated,
        evaluationDate: vendor.evaluationDate || '',
        qualityScore: vendor.qualityScore || null,
        costScore: vendor.costScore || null,
        deliveryScore: vendor.deliveryScore || null,
        responseScore: vendor.responseScore || null,
        notes: vendor.notes || '',
        termsAndConditions: vendor.termsAndConditions || '',
        paymentTerms: vendor.paymentTerms || '',
        shippingInstructions: vendor.shippingInstructions || '',
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
      setShowDraftBanner(hasDraft);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingVendor(null);
    setPendingContacts([]);
    setShowDraftBanner(false);
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
    setMainDocFile(null);
  };

  const handleMainDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploadingMainDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/vendors/upload/document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          errorData.message ||
          errorData.error ||
          errorData.reason ||
          'Upload failed';
        throw new Error(message);
      }

      const data = await response.json();
      form.setValue('mainDocumentUrl', data.url);
      setMainDocFile(file);
      toast({ title: 'Document uploaded successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload document';
      toast({
        title: 'Upload failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setUploadingMainDoc(false);
    }
  };

  const handleRemoveMainDoc = () => {
    setMainDocFile(null);
    form.setValue('mainDocumentUrl', '');
  };

  // Opens a vendor PDF URL after a HEAD precheck so users get a clear toast
  // instead of a blank tab when the underlying object is missing / forbidden /
  // the storage backend is unavailable.
  const openVendorPdf = async (
    url: string | undefined | null,
    label: string = 'document'
  ) => {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      toast({
        title: 'No document on file',
        description: `There is no ${label} uploaded for this vendor yet.`,
        variant: 'destructive',
      });
      return;
    }

    // Only HEAD-precheck same-origin storage paths (`/objects/...`,
    // `/uploads/...`). For full external URLs (e.g. a legacy
    // `https://storage.googleapis.com/...` value) HEAD is typically blocked
    // by CORS or unsupported, so a precheck would produce false negatives.
    // In that case we just open the URL directly and let the browser handle it.
    const isSameOriginStoragePath =
      trimmed.startsWith('/objects/') || trimmed.startsWith('/uploads/');

    const newWindow = window.open('', '_blank', 'noopener,noreferrer');

    if (!isSameOriginStoragePath) {
      if (newWindow) {
        newWindow.location.href = trimmed;
      } else {
        toast({
          title: 'Pop-up blocked',
          description:
            'Your browser blocked the PDF from opening. Please allow pop-ups for this site and try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    let res: Response;
    try {
      res = await fetch(trimmed, { method: 'HEAD' });
    } catch {
      // Network error or HEAD unsupported — fall back to direct open so we
      // don't block a document that might actually load via GET.
      if (newWindow) {
        newWindow.location.href = trimmed;
      } else {
        toast({
          title: 'Pop-up blocked',
          description:
            'Your browser blocked the PDF from opening. Please allow pop-ups for this site and try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    if (res.ok) {
      if (newWindow) {
        newWindow.location.href = trimmed;
      } else {
        toast({
          title: 'Pop-up blocked',
          description:
            'Your browser blocked the PDF from opening. Please allow pop-ups for this site and try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    // HEAD may legitimately be rejected with 405 / 501 by some object stores
    // even when GET works fine. Don't block the user — try a direct open.
    if (res.status === 405 || res.status === 501) {
      if (newWindow) {
        newWindow.location.href = trimmed;
      } else {
        toast({
          title: 'Pop-up blocked',
          description:
            'Your browser blocked the PDF from opening. Please allow pop-ups for this site and try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    if (newWindow) newWindow.close();
    if (res.status === 404) {
      toast({
        title: 'Document not found',
        description: `The ${label} could not be located in storage. It may have been deleted — please re-upload it.`,
        variant: 'destructive',
      });
    } else if (res.status === 403) {
      toast({
        title: 'Access denied',
        description: `You do not have permission to view this ${label}, or its access policy is missing. Re-uploading the document will restore access.`,
        variant: 'destructive',
      });
    } else if (res.status === 503) {
      toast({
        title: 'Storage temporarily unavailable',
        description:
          'The document storage is temporarily unavailable. Please try again in a moment.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Unable to open document',
        description: `An error occurred (${res.status}) while trying to open the ${label}. Please try again.`,
        variant: 'destructive',
      });
    }
  };

  const handleSelectFromLibrary = (url: string, filename: string) => {
    form.setValue('mainDocumentUrl', url);
    setMainDocFile(null); // Clear file since we're using library
    toast({ title: `Selected: ${filename}` });
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
          errorData.error ||
          errorData.reason ||
          'Upload failed'
        );
      }

      const data = await response.json();
      form.setValue('approvalPdfUrl', data.url);
      setUploadedFile(file);
      toast({ title: 'File uploaded successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload file';
      toast({
        title: 'Upload failed',
        description: message,
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

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    setImportingCsv(true);
    try {
      const text = await file.text();
      
      // Use Papa Parse for proper CSV parsing
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
      });

      const vendorsToImport = [];

      for (const row of parsed.data as any[]) {
        const name = row['Supplier Name']?.trim();
        
        if (!name) continue; // Skip empty rows

        const startDate = row['Start/Renewal Date']?.trim();
        const approvalMethod = row['Method of Approval']?.trim();
        const expiration = row['Approval Expiration']?.trim();

        // Determine approval source from Method of Approval
        let approvalSource = '';
        if (approvalMethod) {
          // Check for "Supplier Approval Form" first before generic PDF check
          if (approvalMethod.toLowerCase().includes('supplier approval form')) {
            approvalSource = 'Supplier Approval Form';
          } else if (approvalMethod.toLowerCase().includes('.pdf')) {
            approvalSource = 'Certification';
          }
        }

        // Parse dates - handle various formats like "1/2025", "01/2024", "9/2025", "8/27/28"
        const parseDate = (dateStr: string): string => {
          if (!dateStr || dateStr === 'N/A') return '';
          
          // Handle M/YYYY or MM/YYYY format
          if (dateStr.match(/^\d{1,2}\/\d{4}$/)) {
            const [month, year] = dateStr.split('/');
            return `${year}-${month.padStart(2, '0')}-01`;
          }
          
          // Handle MM/DD/YYYY format (4-digit year)
          if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            const [month, day, year] = dateStr.split('/');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          // Handle MM/DD/YY format (2-digit year) - assume 20xx
          if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
            const [month, day, year] = dateStr.split('/');
            const fullYear = `20${year}`;
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          return '';
        };

        vendorsToImport.push({
          name,
          startRenewalDate: parseDate(startDate),
          approvalExpiration: parseDate(expiration),
          approvalSource,
          approved: false,
          evaluated: false,
        });
      }

      // Bulk create vendors
      let successCount = 0;
      let errorCount = 0;

      for (const vendor of vendorsToImport) {
        try {
          await apiRequest('/api/vendors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vendor),
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to import vendor: ${vendor.name}`, error);
          errorCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });

      toast({
        title: 'Import complete',
        description: `Successfully imported ${successCount} vendors. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
      });

      setIsImportDialogOpen(false);
      e.target.value = ''; // Reset file input
    } catch (error) {
      console.error('CSV import error:', error);
      toast({
        title: 'Import failed',
        description: 'Failed to parse CSV file',
        variant: 'destructive',
      });
    } finally {
      setImportingCsv(false);
    }
  };

  const handleEvaluationsCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    setImportingCsv(true);
    try {
      const text = await file.text();
      
      // Use Papa Parse for proper CSV parsing
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
      });

      // Send CSV data to backend for processing
      const response = await apiRequest('/api/vendors/import-evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: parsed.data }),
      });

      const result = response as any;

      toast({
        title: 'Import Complete',
        description: `Processed: ${result.processed}, Matched: ${result.matched}, Created: ${result.created}${result.unmatched.length > 0 ? `, Unmatched: ${result.unmatched.length}` : ''}`,
      });

      if (result.unmatched.length > 0) {
        console.log('Unmatched vendors:', result.unmatched);
      }

      if (result.errors.length > 0) {
        console.log('Import errors:', result.errors);
      }

      // Invalidate both vendors and evaluations caches
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      setIsImportDialogOpen(false);
      e.target.value = ''; // Reset file input
    } catch (error) {
      console.error('CSV import error:', error);
      toast({
        title: 'Import failed',
        description: 'Failed to import annual evaluations',
        variant: 'destructive',
      });
    } finally {
      setImportingCsv(false);
    }
  };

  const buildNormalizedData = (data: VendorFormData, extra?: Record<string, any>) => ({
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
    startRenewalDate: data.startRenewalDate || undefined,
    approvalExpiration: data.approvalExpiration || undefined,
    ...extra,
  });

  const onSubmit = async (data: VendorFormData) => {
    const evaluationSaved = await evaluationTableRef.current?.savePendingChanges();
    if (evaluationSaved === false) return;

    const normalizedData = buildNormalizedData(data);

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
          {ytdSummary && ytdSummary.recordedScoreCount > 0 && (
            <div className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full font-semibold">
              Overall Average (YTD): {ytdSummary.overallAveragePercent}%
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm('This will reset all vendor evaluation statuses and scores. Are you sure you want to continue?')) {
                resetEvaluationsMutation.mutate();
              }
            }}
            disabled={resetEvaluationsMutation.isPending}
            data-testid="button-reset-evaluations"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${resetEvaluationsMutation.isPending ? 'animate-spin' : ''}`} />
            {resetEvaluationsMutation.isPending ? 'Resetting...' : 'Reset Evaluations'}
          </Button>
          <Button
            onClick={() => handleOpenModal()}
            data-testid="button-create-vendor"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Vendor Edit/Create Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-modal-title">
                {editingVendor ? `Edit Vendor: ${editingVendor.name}` : 'New Vendor'}
              </DialogTitle>
            </DialogHeader>

            {showDraftBanner && !editingVendor && (
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md p-3 text-sm">
                <span className="text-blue-800 dark:text-blue-200">You have a previous unsaved draft. Would you like to restore it?</span>
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const draft = restoreDraft();
                      if (draft) {
                        form.reset(draft.formValues);
                        setVendorAddress(draft.vendorAddress);
                        setPendingContacts(draft.pendingContacts || []);
                        toast({ title: 'Draft restored' });
                      }
                      setShowDraftBanner(false);
                    }}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearDraft();
                      setShowDraftBanner(false);
                    }}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            )}

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
                  Scope Approval
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

                    <FormField
                      control={form.control}
                      name="startRenewalDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start/Renewal Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-start-renewal-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label>Vendor Document (PDF)</Label>
                      <p className="text-xs text-muted-foreground">
                        Upload a W-9, agreement, or other vendor document
                      </p>
                      {editingVendor?.approved && !form.watch('mainDocumentUrl') && !mainDocFile && (
                        <Alert variant="destructive" className="border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-600">
                          <AlertTriangle className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
                          <AlertTitle className="text-amber-800 dark:text-amber-300">Document missing</AlertTitle>
                          <AlertDescription className="text-amber-700 dark:text-amber-400">
                            <span>This approved vendor's document was cleared and needs to be re-uploaded.</span>
                            <Label
                              htmlFor="main-doc-upload"
                              className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-500 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-500 dark:hover:bg-amber-800"
                            >
                              <Upload className="h-3 w-3" />
                              Upload replacement
                            </Label>
                          </AlertDescription>
                        </Alert>
                      )}
                      {!mainDocFile && !form.watch('mainDocumentUrl') ? (
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
                          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                            <div className="flex flex-col items-center">
                              <Upload className="w-6 h-6 mb-1 text-gray-400" />
                              <Label
                                htmlFor="main-doc-upload"
                                className="cursor-pointer text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                              >
                                Upload from Computer
                              </Label>
                              <Input
                                id="main-doc-upload"
                                type="file"
                                accept="application/pdf"
                                onChange={handleMainDocUpload}
                                className="hidden"
                                data-testid="input-main-doc-upload"
                                disabled={uploadingMainDoc}
                              />
                            </div>
                            <span className="text-gray-400">or</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsMediaLibraryOpen(true)}
                              data-testid="button-select-from-library"
                            >
                              <FolderOpen className="w-4 h-4 mr-2" />
                              Select from Library
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-5 h-5 text-blue-600" />
                              <span className="text-sm font-medium truncate max-w-[200px]">
                                {mainDocFile?.name || (
                                  form.watch('mainDocumentUrl')
                                    ? (form.watch('mainDocumentUrl') ?? '').split('/').pop()
                                    : 'Vendor Document.pdf'
                                )}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveMainDoc}
                              data-testid="button-remove-main-doc"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          {form.watch('mainDocumentUrl') && (
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-2 inline-block underline"
                              data-testid="link-view-main-doc"
                              onClick={() =>
                                openVendorPdf(
                                  form.getValues('mainDocumentUrl'),
                                  'vendor document'
                                )
                              }
                            >
                              View PDF
                            </button>
                          )}
                        </div>
                      )}
                      {uploadingMainDoc && (
                        <p className="text-xs text-gray-500">Uploading...</p>
                      )}
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
                      name="approvalLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Approval Level</FormLabel>
                          <Select
                            value={field.value || ''}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-approval-level">
                                <SelectValue placeholder="Select approval level..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="A">A</SelectItem>
                              <SelectItem value="B">B</SelectItem>
                              <SelectItem value="C">C</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                                {uploadedFile?.name || (
                                  form.watch('approvalPdfUrl')
                                    ? (form.watch('approvalPdfUrl') ?? '').split('/').pop()
                                    : 'Approval Document.pdf'
                                )}
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
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-2 inline-block underline"
                              data-testid="link-view-pdf"
                              onClick={() =>
                                openVendorPdf(
                                  form.getValues('approvalPdfUrl'),
                                  'approval PDF'
                                )
                              }
                            >
                              View PDF
                            </button>
                          )}
                        </div>
                      )}
                      {uploadingFile && (
                        <p className="text-xs text-gray-500">Uploading...</p>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="approvalExpiration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Approval Expiration</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-approval-expiration"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="scope"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PL2 Approved Materials & Products *</FormLabel>
                          <FormControl>
                            <VendorScopeSelector
                              value={field.value || ''}
                              onChange={field.onChange}
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
                {form.watch('approvalLevel') === 'A' ? (
                  <>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md p-4 mb-4">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Annual Vendor Evaluation</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Track annual performance scores for Quality, Cost, Delivery, and Response (1-5 scale). One evaluation is due per calendar year.
                      </p>
                    </div>
                    {editingVendor && (
                      <MonthlyEvaluationsTable
                        ref={evaluationTableRef}
                        vendorId={editingVendor.id}
                      />
                    )}
                  </>
                ) : (
                  <div className="bg-muted/50 border border-dashed rounded-md p-4 text-sm text-muted-foreground">
                    Annual evaluations are only required for <strong>Approval Level A</strong> vendors. This vendor is currently set to Level <strong>{form.watch('approvalLevel') || '—'}</strong>.
                  </div>
                )}

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
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

      <Tabs value={activePageTab} onValueChange={setActivePageTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Vendor Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
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
        <div className="overflow-x-auto overscroll-x-contain scroll-smooth">
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
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleSort('approvalLevel')}
                  data-testid="header-approval-level"
                >
                  <div className="flex items-center gap-1">
                    Approval Level <SortIcon field="approvalLevel" />
                  </div>
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
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    Loading vendors...
                  </td>
                </tr>
              ) : vendorsData?.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                      <div className="flex items-center gap-2">
                        {vendor.name}
                        {vendor.approved && !vendor.mainDocumentUrl?.trim() && (
                          <span
                            tabIndex={0}
                            role="img"
                            aria-label="Missing document: this approved vendor has no main document on file"
                            title="Missing document: this approved vendor has no main document on file"
                            className="text-amber-500 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
                            data-testid={`icon-missing-doc-${vendor.id}`}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {vendor.approvalLevel || '—'}
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
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 text-center">
                      {(vendor as any).ytdTotalScore 
                        ? Number((vendor as any).ytdTotalScore).toFixed(1)
                        : '—'}
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
        </TabsContent>

        <TabsContent value="documents">
          <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900">
            {docsLoading ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                Loading documents...
              </div>
            ) : vendorDocuments.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No vendor documents uploaded yet. Open a vendor record and upload a document to see it here.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Vendor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Document
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {vendorDocuments.map((vd) => {
                    const filename = vd.mainDocumentUrl.split('/').pop() || 'document.pdf';
                    return (
                      <tr key={vd.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {vd.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate max-w-xs">{filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            data-testid={`button-open-vendor-doc-${vd.id}`}
                            onClick={() =>
                              openVendorPdf(vd.mainDocumentUrl, 'vendor document')
                            }
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {vendorDocuments.length} vendor{vendorDocuments.length !== 1 ? 's' : ''} with documents
          </div>
        </TabsContent>
      </Tabs>


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

      {/* CSV Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from CSV</DialogTitle>
            <p className="text-sm text-gray-500">
              Choose what type of data you want to import
            </p>
          </DialogHeader>
          <div className="space-y-6">
            {/* Vendors Import */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Import Vendors</h3>
              <p className="text-sm text-gray-500 mb-3">
                CSV should include: Supplier Name, Start/Renewal Date, Method of Approval, and Approval Expiration.
              </p>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
                <Upload className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <Label
                  htmlFor="csv-upload"
                  className="cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                >
                  Upload Vendors CSV
                </Label>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleCsvImport}
                  className="hidden"
                  data-testid="input-csv-upload"
                  disabled={importingCsv}
                />
                {importingCsv && (
                  <p className="text-sm text-blue-600 mt-2">
                    Importing...
                  </p>
                )}
              </div>
            </div>

            {/* Annual Evaluations Import */}
            <div className="border border-blue-300 dark:border-blue-600 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
              <h3 className="font-semibold mb-2">Import Annual Evaluations</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                CSV should include vendor names and annual scores (Annual- Quality, Annual- Cost, Annual- Delivery, Annual- Response). Vendor names must match existing vendors.
              </p>
              <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg p-6 text-center bg-white dark:bg-gray-900">
                <Upload className="w-10 h-10 mx-auto mb-2 text-blue-400" />
                <Label
                  htmlFor="evaluations-csv-upload"
                  className="cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                >
                  Upload Evaluations CSV
                </Label>
                <Input
                  id="evaluations-csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleEvaluationsCsvImport}
                  className="hidden"
                  data-testid="input-evaluations-csv-upload"
                  disabled={importingCsv}
                />
                {importingCsv && (
                  <p className="text-sm text-blue-600 mt-2">
                    Importing evaluations...
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsImportDialogOpen(false)}
              disabled={importingCsv}
              data-testid="button-close-import"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaLibraryPicker
        open={isMediaLibraryOpen}
        onOpenChange={setIsMediaLibraryOpen}
        onSelect={handleSelectFromLibrary}
        acceptedTypes={['application/pdf']}
        title="Select Vendor Document from Library"
      />

    </div>
  );
}

// Annual Evaluations Table Component
const MonthlyEvaluationsTable = forwardRef<
  MonthlyEvaluationsTableHandle,
  { vendorId: number }
>(function MonthlyEvaluationsTable({ vendorId }, ref) {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingField, setEditingField] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number | null>>({});

  // Annual evaluation is stored using month=1 as the canonical slot
  const ANNUAL_MONTH = 1;

  // Fetch all evaluations for this vendor (no year filter — we need history too)
  const { data: allEvaluations = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/vendors', vendorId, 'evaluations'],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendorId}/evaluations`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch evaluations');
      return res.json();
    },
  });

  // Current year's annual evaluation (month=1)
  const currentYearEval = allEvaluations.find(
    (e: any) => e.year === selectedYear && e.month === ANNUAL_MONTH
  );

  // Historical quarterly records: rows from prior years with quarter-start months (1,4,7,10)
  // Group by year, show as read-only history
  const historicalYears = Array.from(
    new Set(
      allEvaluations
        .filter((e: any) => e.year < selectedYear)
        .map((e: any) => e.year)
    )
  ).sort((a, b) => b - a);

  const getHistoricalRowsForYear = (year: number) =>
    allEvaluations
      .filter((e: any) => e.year === year)
      .sort((a: any, b: any) => a.month - b.month);

  const quarterLabel = (month: number) => {
    const map: Record<number, string> = { 1: 'Q1 / Annual', 4: 'Q2', 7: 'Q3', 10: 'Q4' };
    return map[month] ?? `Month ${month}`;
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, number | null>) => {
      return apiRequest(`/api/vendors/${vendorId}/evaluations`, {
        method: 'POST',
        body: {
          month: ANNUAL_MONTH,
          year: selectedYear,
          ...data,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendorId, 'evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors/evaluations/ytd-summary'] });
      setPendingChanges({});
      toast({ title: 'Success', description: 'Annual evaluation saved successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save evaluation', variant: 'destructive' });
    },
  });

  const getDisplayValue = (field: string) => {
    if (field in pendingChanges) return pendingChanges[field];
    return currentYearEval?.[field] ?? null;
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const handleFieldSelect = (field: string, rawValue: string) => {
    const numValue = rawValue === 'na' ? null : parseInt(rawValue);
    setPendingChanges(prev => ({ ...prev, [field]: numValue }));
    setEditingField(null);
  };

  const handleSave = async () => {
    const base: Record<string, number | null> = {
      qualityScore: currentYearEval?.qualityScore ?? null,
      costScore: currentYearEval?.costScore ?? null,
      deliveryScore: currentYearEval?.deliveryScore ?? null,
      responseScore: currentYearEval?.responseScore ?? null,
    };
    await saveMutation.mutateAsync({ ...base, ...pendingChanges });
  };

  useImperativeHandle(ref, () => ({
    savePendingChanges: async () => {
      if (!hasPendingChanges) return true;

      try {
        await handleSave();
        return true;
      } catch {
        return false;
      }
    },
  }));

  const handleDiscard = () => {
    setPendingChanges({});
    setEditingField(null);
    toast({ title: 'Changes discarded' });
  };

  const renderEditableCell = (field: string) => {
    const value = getDisplayValue(field);
    const isPending = field in pendingChanges;
    const isEditing = editingField === field;

    if (isEditing) {
      return (
        <select
          autoFocus
          value={value !== null && value !== undefined ? value.toString() : 'na'}
          onChange={(e) => handleFieldSelect(field, e.target.value)}
          onBlur={() => setEditingField(null)}
          className="h-8 w-20 rounded border border-input bg-background p-1 text-center text-sm"
          data-testid={`select-annual-${field}`}
        >
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
          <option value="1">1</option>
          <option value="na">N/A</option>
        </select>
      );
    }

    const displayValue = value !== null && value !== undefined ? value : (isPending ? 'N/A' : '-');
    return (
      <div
        onClick={() => setEditingField(field)}
        className={cn(
          "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 h-8 flex items-center justify-center rounded text-sm",
          isPending && "bg-yellow-100 dark:bg-yellow-900/30 font-medium"
        )}
      >
        {displayValue}
      </div>
    );
  };

  const computeTotal = (ev: any, overrides?: Record<string, number | null>) => {
    const scores = ['qualityScore', 'costScore', 'deliveryScore', 'responseScore'].map(f =>
      overrides && f in overrides ? overrides[f] : ev?.[f] ?? null
    ).filter(s => s !== null && s !== undefined);
    return scores.length > 0 ? (scores as number[]).reduce((a, b) => a + b, 0) : null;
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading evaluations...</div>;
  }

  const currentTotal = computeTotal(currentYearEval, pendingChanges);

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex justify-between items-center">
        <div>
          <Label>Select Year</Label>
          <Select value={selectedYear.toString()} onValueChange={(v) => { setSelectedYear(parseInt(v)); setPendingChanges({}); setEditingField(null); }}>
            <SelectTrigger className="w-32" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasPendingChanges && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDiscard} data-testid="button-discard-changes">
              Discard Changes
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-all">
              {saveMutation.isPending ? 'Saving...' : 'Save Annual Evaluation'}
            </Button>
          </div>
        )}
      </div>

      {/* Annual evaluation grid for the selected year */}
      <div className="overflow-x-auto overscroll-x-contain scroll-smooth">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Criteria</th>
              <th className="border border-gray-300 dark:border-gray-600 p-2 text-center w-40">
                <div className="font-semibold">{selectedYear} Annual Score</div>
                <div className="text-xs font-normal text-gray-500 dark:text-gray-400">Click to edit (1–5)</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Quality', field: 'qualityScore' },
              { label: 'Cost', field: 'costScore' },
              { label: 'Delivery', field: 'deliveryScore' },
              { label: 'Response', field: 'responseScore' },
            ].map(({ label, field }, idx) => (
              <tr key={field} className={idx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-900/50' : ''}>
                <td className="border border-gray-300 dark:border-gray-600 p-2 font-medium">{label}</td>
                <td className="border border-gray-300 dark:border-gray-600 p-1 text-center">
                  {renderEditableCell(field)}
                </td>
              </tr>
            ))}
            <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold">
              <td className="border border-gray-300 dark:border-gray-600 p-2">Total</td>
              <td className="border border-gray-300 dark:border-gray-600 p-2 text-center" data-testid="total-annual">
                {currentTotal !== null ? currentTotal : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>• Click any score cell to edit (1–5 scale)</p>
        <p>• One annual evaluation is recorded per calendar year</p>
        <p>• Total score is calculated automatically</p>
      </div>

      {/* Historical (quarterly) records — read-only */}
      {historicalYears.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-sm font-semibold text-gray-600 dark:text-gray-400 border-t pt-4">
            Historical Records (Read-Only)
          </h5>
          {historicalYears.map(year => {
            const rows = getHistoricalRowsForYear(year);
            return (
              <div key={year}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{year}</p>
                <div className="overflow-x-auto overscroll-x-contain scroll-smooth">
                  <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="border border-gray-200 dark:border-gray-700 p-1.5 text-left text-xs">Criteria</th>
                        {rows.map((row: any) => (
                          <th key={row.month} className="border border-gray-200 dark:border-gray-700 p-1.5 text-center text-xs w-24">
                            {quarterLabel(row.month)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Quality', field: 'qualityScore' },
                        { label: 'Cost', field: 'costScore' },
                        { label: 'Delivery', field: 'deliveryScore' },
                        { label: 'Response', field: 'responseScore' },
                      ].map(({ label, field }, idx) => (
                        <tr key={field} className={idx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-900/30' : ''}>
                          <td className="border border-gray-200 dark:border-gray-700 p-1.5 text-xs font-medium">{label}</td>
                          {rows.map((row: any) => (
                            <td key={row.month} className="border border-gray-200 dark:border-gray-700 p-1.5 text-center text-xs text-gray-600 dark:text-gray-400">
                              {row[field] ?? '–'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="font-semibold bg-gray-100 dark:bg-gray-800/50">
                        <td className="border border-gray-200 dark:border-gray-700 p-1.5 text-xs">Total</td>
                        {rows.map((row: any) => (
                          <td key={row.month} className="border border-gray-200 dark:border-gray-700 p-1.5 text-center text-xs">
                            {row.totalScore > 0 ? row.totalScore : '–'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
