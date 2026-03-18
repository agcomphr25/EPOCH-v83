import { useState, useEffect } from 'react';
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
} from 'lucide-react';
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
import AddressValidationModal from '@/components/AddressValidationModal';
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

  const [vendorAddress, setVendorAddress] = useState<AddressData>({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  const [addressValidationError, setAddressValidationError] = useState<any>(null);
  const [pendingSubmitData, setPendingSubmitData] = useState<VendorFormData | null>(null);

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

  // Create vendor mutation
  const createVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const vendor = (await apiRequest('/api/vendors', {
        method: 'POST',
        body: { ...data, skipValidation: true }, // TODO: re-enable address validation when ready
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
      clearDraft();
      setIsModalOpen(false);
      setPendingContacts([]);
      form.reset();
    },
    onError: (error: any) => {
      if (error.responseData?.validationStatus && error.status === 400) {
        setAddressValidationError(error.responseData);
        return;
      }
      toast({ title: 'Failed to create vendor', variant: 'destructive' });
    },
  });

  // Update vendor mutation
  const updateVendorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: VendorFormData }) => {
      return await apiRequest(`/api/vendors/${id}`, {
        method: 'PUT',
        body: { ...data, skipValidation: true }, // TODO: re-enable address validation when ready
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({ title: 'Vendor updated successfully' });
      setIsModalOpen(false);
      setEditingVendor(null);
      form.reset();
    },
    onError: (error: any) => {
      if (error.responseData?.validationStatus && error.status === 400) {
        setAddressValidationError(error.responseData);
        return;
      }
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

  // Reset monthly evaluations mutation
  const resetEvaluationsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/vendors/reset-monthly-evaluations', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({ 
        title: 'Monthly evaluations reset', 
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

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      form.setValue('mainDocumentUrl', data.url);
      setMainDocFile(file);
      toast({ title: 'Document uploaded successfully' });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: 'Failed to upload document',
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
        description: 'Failed to import monthly evaluations',
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

  const onSubmit = (data: VendorFormData) => {
    const normalizedData = buildNormalizedData(data);
    setPendingSubmitData(data);

    if (editingVendor) {
      updateVendorMutation.mutate({
        id: editingVendor.id,
        data: normalizedData,
      });
    } else {
      createVendorMutation.mutate(normalizedData);
    }
  };

  const handleUseSuggestedAddress = (suggested: { street: string; city: string; state: string; zipCode: string }) => {
    setVendorAddress((prev) => ({ ...prev, ...suggested }));
    setAddressValidationError(null);
    if (pendingSubmitData) {
      const normalizedData = buildNormalizedData(pendingSubmitData, suggested);
      if (editingVendor) {
        updateVendorMutation.mutate({ id: editingVendor.id, data: normalizedData });
      } else {
        createVendorMutation.mutate(normalizedData);
      }
    }
  };

  const handleOverrideAddress = (reason: string) => {
    setAddressValidationError(null);
    if (pendingSubmitData) {
      const normalizedData = buildNormalizedData(pendingSubmitData, { allowOverride: true, overrideReason: reason });
      if (editingVendor) {
        updateVendorMutation.mutate({ id: editingVendor.id, data: normalizedData });
      } else {
        createVendorMutation.mutate(normalizedData);
      }
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
                            <a
                              href={form.watch('mainDocumentUrl')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-2 inline-block"
                              data-testid="link-view-main-doc"
                            >
                              View PDF
                            </a>
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
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Quarterly Vendor Evaluations</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Track quarterly performance scores for Quality, Cost, Delivery, and Response (1-5 scale). Evaluations are due each quarter (Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec).
                      </p>
                    </div>
                    {editingVendor && <MonthlyEvaluationsTable vendorId={editingVendor.id} />}
                  </>
                ) : (
                  <div className="bg-muted/50 border border-dashed rounded-md p-4 text-sm text-muted-foreground">
                    Monthly evaluations are only required for <strong>Approval Level A</strong> vendors. This vendor is currently set to Level <strong>{form.watch('approvalLevel') || '—'}</strong>.
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
                      {vendor.name}
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

            {/* Monthly Evaluations Import */}
            <div className="border border-blue-300 dark:border-blue-600 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
              <h3 className="font-semibold mb-2">Import Monthly Evaluations</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                CSV should include vendor names and monthly scores (Jan-Quality, Jan-Cost, etc.). Vendor names must match existing vendors.
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

      <AddressValidationModal
        open={!!addressValidationError}
        onOpenChange={(open) => { if (!open) setAddressValidationError(null); }}
        validationError={addressValidationError}
        onUseSuggested={handleUseSuggestedAddress}
        onOverride={handleOverrideAddress}
        onEdit={() => setAddressValidationError(null)}
      />
    </div>
  );
}

// Monthly Evaluations Table Component
function MonthlyEvaluationsTable({ vendorId }: { vendorId: number }) {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<{month: number; field: string} | null>(null);
  const [cellValue, setCellValue] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, any>>(new Map());

  // Quarters represented by their starting month (Jan=1, Apr=4, Jul=7, Oct=10)
  const quarters = [
    { name: 'Q1', num: 1, label: 'Jan–Mar' },
    { name: 'Q2', num: 4, label: 'Apr–Jun' },
    { name: 'Q3', num: 7, label: 'Jul–Sep' },
    { name: 'Q4', num: 10, label: 'Oct–Dec' },
  ];

  // Fetch quarterly evaluations
  const { data: evaluations = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['/api/vendors', vendorId, 'evaluations', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/vendors/${vendorId}/evaluations?year=${selectedYear}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch evaluations');
      return res.json();
    },
  });

  // Save all evaluations mutation
  const saveAllEvaluationsMutation = useMutation({
    mutationFn: async (changes: Map<string, any>) => {
      const promises = Array.from(changes.values()).map(data =>
        apiRequest(`/api/vendors/${vendorId}/evaluations`, {
          method: 'POST',
          body: data,
        })
      );
      return await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors', vendorId, 'evaluations'] });
      setPendingChanges(new Map());
      toast({ title: 'Success', description: 'All evaluations saved successfully' });
    },
    onError: () => {
      setPendingChanges(new Map());
      toast({ title: 'Error', description: 'Failed to save evaluations', variant: 'destructive' });
    },
  });

  const getEvaluationForMonth = (month: number) => {
    const key = `${month}`;
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key);
    }
    return evaluations.find((e: any) => e.month === month && e.year === selectedYear);
  };

  const handleCellClick = (month: number, field: string) => {
    const evaluation = getEvaluationForMonth(month);
    const value = evaluation?.[field];
    setCellValue(value ? value.toString() : 'na');
    setEditingCell({ month, field });
  };

  const handleCellUpdate = (month: number, field: string) => {
    const numValue = cellValue ? parseInt(cellValue) : null;

    if (numValue !== null && (numValue < 1 || numValue > 5)) {
      toast({ title: 'Error', description: 'Score must be between 1 and 5', variant: 'destructive' });
      setEditingCell(null);
      return;
    }

    const key = `${month}`;
    
    // Start with existing pending changes if any, otherwise use saved evaluation
    let baseData: any;
    if (pendingChanges.has(key)) {
      // Use existing pending changes as the base
      baseData = { ...pendingChanges.get(key) };
    } else {
      // Use saved evaluation as the base
      const evaluation = evaluations.find((e: any) => e.month === month && e.year === selectedYear);
      baseData = {
        month,
        year: selectedYear,
        qualityScore: evaluation?.qualityScore ?? null,
        costScore: evaluation?.costScore ?? null,
        deliveryScore: evaluation?.deliveryScore ?? null,
        responseScore: evaluation?.responseScore ?? null,
      };
    }

    // Update only the field being edited
    baseData[field] = numValue;

    const newPendingChanges = new Map(pendingChanges);
    newPendingChanges.set(key, baseData);
    setPendingChanges(newPendingChanges);
    setEditingCell(null);
  };

  const handleSaveAll = async () => {
    if (pendingChanges.size === 0) return;
    await saveAllEvaluationsMutation.mutateAsync(pendingChanges);
  };

  const handleDiscardChanges = () => {
    setPendingChanges(new Map());
    toast({ title: 'Changes discarded' });
  };

  const handleKeyDown = (e: React.KeyboardEvent, month: number, field: string) => {
    if (e.key === 'Enter') {
      handleCellUpdate(month, field);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const renderCell = (month: number, field: string) => {
    const evaluation = getEvaluationForMonth(month);
    const key = `${month}`;
    const hasChanges = pendingChanges.has(key);
    
    // Use pending value if there's a pending change, otherwise use saved value
    const pendingData = pendingChanges.get(key);
    const value = hasChanges ? pendingData?.[field] : evaluation?.[field];
    
    const isEditing = editingCell?.month === month && editingCell?.field === field;

    if (isEditing) {
      return (
        <Select
          value={cellValue}
          onValueChange={(newValue) => {
            setCellValue(newValue);
            // Auto-save on selection
            const numValue = newValue === 'na' ? null : parseInt(newValue);
            const evaluation = getEvaluationForMonth(month);
            const existingPending = pendingChanges.get(key);
            const baseData: any = existingPending || {
              vendorId,
              month,
              year: selectedYear,
              qualityScore: evaluation?.qualityScore ?? null,
              costScore: evaluation?.costScore ?? null,
              deliveryScore: evaluation?.deliveryScore ?? null,
              responseScore: evaluation?.responseScore ?? null,
            };
            baseData[field] = numValue;
            const newPendingChanges = new Map(pendingChanges);
            newPendingChanges.set(key, baseData);
            setPendingChanges(newPendingChanges);
            setEditingCell(null);
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingCell(null);
          }}
        >
          <SelectTrigger className="w-16 h-8 text-center p-1" data-testid={`select-${field}-${month}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5</SelectItem>
            <SelectItem value="4">4</SelectItem>
            <SelectItem value="3">3</SelectItem>
            <SelectItem value="2">2</SelectItem>
            <SelectItem value="1">1</SelectItem>
            <SelectItem value="na">N/A</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    // Display the value - show 'N/A' for null values when there's a pending change
    const displayValue = value !== null && value !== undefined ? value : (hasChanges ? 'N/A' : '-');

    return (
      <div
        onClick={() => handleCellClick(month, field)}
        className={cn(
          "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 h-8 flex items-center justify-center rounded",
          hasChanges && "bg-yellow-100 dark:bg-yellow-900/30"
        )}
        data-testid={`cell-${field}-${month}`}
      >
        {displayValue}
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading evaluations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <Label>Select Year</Label>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-32" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pendingChanges.size > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscardChanges}
              data-testid="button-discard-changes"
            >
              Discard Changes
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={saveAllEvaluationsMutation.isPending}
              data-testid="button-save-all"
            >
              {saveAllEvaluationsMutation.isPending ? 'Saving...' : `Save All (${pendingChanges.size} quarter${pendingChanges.size > 1 ? 's' : ''})`}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Criteria</th>
              {quarters.map((q) => (
                <th key={q.num} className="border border-gray-300 dark:border-gray-600 p-2 text-center w-28">
                  <div className="font-semibold">{q.name}</div>
                  <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{q.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 p-2 font-medium">Quality</td>
              {quarters.map((q) => (
                <td key={q.num} className="border border-gray-300 dark:border-gray-600 p-1 text-center">
                  {renderCell(q.num, 'qualityScore')}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50 dark:bg-gray-900/50">
              <td className="border border-gray-300 dark:border-gray-600 p-2 font-medium">Cost</td>
              {quarters.map((q) => (
                <td key={q.num} className="border border-gray-300 dark:border-gray-600 p-1 text-center">
                  {renderCell(q.num, 'costScore')}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-gray-300 dark:border-gray-600 p-2 font-medium">Delivery</td>
              {quarters.map((q) => (
                <td key={q.num} className="border border-gray-300 dark:border-gray-600 p-1 text-center">
                  {renderCell(q.num, 'deliveryScore')}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50 dark:bg-gray-900/50">
              <td className="border border-gray-300 dark:border-gray-600 p-2 font-medium">Response</td>
              {quarters.map((q) => (
                <td key={q.num} className="border border-gray-300 dark:border-gray-600 p-1 text-center">
                  {renderCell(q.num, 'responseScore')}
                </td>
              ))}
            </tr>
            <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold">
              <td className="border border-gray-300 dark:border-gray-600 p-2">Total</td>
              {quarters.map((q) => {
                const evaluation = getEvaluationForMonth(q.num);
                const total = evaluation?.totalScore || 0;
                return (
                  <td key={q.num} className="border border-gray-300 dark:border-gray-600 p-2 text-center" data-testid={`total-${q.num}`}>
                    {total > 0 ? total : '-'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>• Click any cell to edit the score (1-5)</p>
        <p>• Scores represent the full quarter (Q1 = Jan–Mar, etc.)</p>
        <p>• Total score is calculated automatically</p>
      </div>
    </div>
  );
}
