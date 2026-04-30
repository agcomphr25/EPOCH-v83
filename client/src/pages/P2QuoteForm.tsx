import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Save, FileText, Printer, Search, Upload, Eye, CheckCircle, BookOpen, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Link, useLocation, useSearch } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/utils';
import type { InventoryItem } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';

interface QuoteLineItem {
  id: string;
  lineNumber: number;
  quantity: number;
  description: string;
  unitPrice: number;
  totalPrice: number;
  inventoryItemId?: number | null;
  agPartNumber?: string | null;
}

interface RFQAssessment {
  id: number;
  rfqNumber: string;
  customerId: string;
  customerName: string;
  description: string | null;
  status: string;
  submittedBy: string | null;
  submittedAt: string | null;
}

export default function P2QuoteForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const urlCustomerId = new URLSearchParams(search).get('customerId') ?? '';
  const autoFilledRef = useRef(false);
  const [quoteDate, setQuoteDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [quoteNumber, setQuoteNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [fromName, setFromName] = useState('Dave Tandy');
  const [fromEmail, setFromEmail] = useState('dave@agcomposites.com');
  const [fromPhone, setFromPhone] = useState('256-723-8381');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [notes, setNotes] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<string>('DRAFT');
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');

  // Modal state for inventory item selection
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [itemQuantity, setItemQuantity] = useState('1');
  const [profitMarginPercent, setProfitMarginPercent] = useState('30');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch P2 customers for autocomplete
  const { data: p2Customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  // Fetch RFQ Risk Assessments
  const { data: rfqAssessments = [] } = useQuery<RFQAssessment[]>({
    queryKey: ['/api/customers/rfq-assessments'],
  });

  // Fetch inventory items from enhanced MRP system
  const { data: inventoryItems = [], isLoading: isLoadingInventory } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
    queryFn: () => apiRequest('/api/enhanced/inventory/items'),
  });

  // Filter for submitted RFQs only (case-insensitive)
  const submittedRFQs = useMemo(() => 
    rfqAssessments.filter((rfq) => rfq.status?.toLowerCase() === 'submitted'),
    [rfqAssessments]
  );

  // Derive the selected RFQ's customerId for similarity lookup
  const selectedRFQ = useMemo(
    () => submittedRFQs.find((rfq) => rfq.rfqNumber === quoteNumber) ?? null,
    [quoteNumber, submittedRFQs]
  );

  interface SimilarClosing {
    id: number; projectId: string; projectCode: string; projectName: string;
    summary: string | null; strengths: string | null; whatWentWrong: string | null;
    nextProjectRecommendations: string | null; approvedAt: string | null;
  }
  const { data: similarClosings = [], isLoading: isLoadingSimilar } = useQuery<SimilarClosing[]>({
    queryKey: ['/api/projects/closings/similar', selectedRFQ?.customerId, selectedRFQ?.description],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '3' });
      if (selectedRFQ!.customerId) params.set('customerId', selectedRFQ!.customerId);
      if (selectedRFQ!.description) params.set('partFamily', selectedRFQ!.description);
      return fetch(`/api/projects/closings/similar?${params.toString()}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : []);
    },
    enabled: !!selectedRFQ?.customerId,
  });
  const [showInsights, setShowInsights] = useState(false);

  // Load existing quote if id is in URL query params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const quoteId = urlParams.get('id');
    
    if (quoteId) {
      // Fetch the quote data
      fetch(`/api/quotes/${quoteId}`)
        .then(res => res.json())
        .then(data => {
          // Populate form with quote data
          setSavedQuoteId(data.id);
          setQuoteNumber(data.quoteNumber);
          setQuoteStatus(data.status);
          setLinkedProjectId(data.projectId ?? null);
          setCustomerName(data.description?.split('(')[0]?.replace('From: ', '').trim() || '');
          setCustomerCompany(data.customerName);
          setNotes(data.notes || '');
          setValidityDays(String(Math.round((new Date(data.validUntil).getTime() - new Date(data.createdAt).getTime()) / (1000 * 60 * 60 * 24))));
          setAttachments(data.attachments || []);
          
          // Load line items if present
          if (data.lineItems && data.lineItems.length > 0) {
            const loadedItems = data.lineItems.map((item: any) => ({
              id: `${Date.now()}-${item.lineNumber}`,
              lineNumber: item.lineNumber,
              quantity: item.quantity,
              description: item.description,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            }));
            setLineItems(loadedItems);
          }
          
          toast({
            title: 'Quote Loaded',
            description: `Viewing quote ${data.quoteNumber}`,
          });
        })
        .catch(error => {
          console.error('Error loading quote:', error);
          toast({
            title: 'Error',
            description: 'Failed to load quote data',
            variant: 'destructive',
          });
        });
    }
  }, []);

  // Auto-select the first matching RFQ when customerId is provided via URL param
  useEffect(() => {
    if (urlCustomerId && submittedRFQs.length > 0 && !autoFilledRef.current) {
      const matchingRFQ = submittedRFQs.find((rfq) => rfq.customerId === urlCustomerId);
      if (matchingRFQ) {
        autoFilledRef.current = true;
        setQuoteNumber(matchingRFQ.rfqNumber);
      }
    }
  }, [urlCustomerId, submittedRFQs]);

  // Auto-populate customer info when RFQ is selected
  useEffect(() => {
    if (quoteNumber) {
      const selectedRFQ = submittedRFQs.find(
        (rfq) => rfq.rfqNumber === quoteNumber
      );
      if (selectedRFQ) {
        // Find the P2 customer details using customerId from RFQ
        const p2Customer = p2Customers.find(
          (customer: any) => customer.customerId === selectedRFQ.customerId
        );
        
        if (p2Customer) {
          // Populate both To and Company fields from P2 customer data
          setCustomerName(p2Customer.contactName || '');
          setCustomerCompany(p2Customer.customerName || selectedRFQ.customerName);
        } else {
          // Fallback to RFQ data if P2 customer not found
          setCustomerCompany(selectedRFQ.customerName);
        }
      }
    }
  }, [quoteNumber, submittedRFQs, p2Customers]);

  // Calculate grand total
  const grandTotal = lineItems.reduce(
    (sum, item) => sum + item.totalPrice,
    0
  );

  const openAddItemModal = () => {
    setSelectedInventoryItem(null);
    setItemQuantity('1');
    setProfitMarginPercent('30');
    setSearchTerm('');
    setIsItemModalOpen(true);
  };

  const handleAddItemFromInventory = () => {
    if (!selectedInventoryItem) {
      toast({
        title: 'No Item Selected',
        description: 'Please select an inventory item first.',
        variant: 'destructive',
      });
      return;
    }

    const quantity = Number(itemQuantity) || 1;
    const cost = Number(selectedInventoryItem.costPer) || 0;
    const profitMargin = Number(profitMarginPercent) || 0;
    
    // Calculate unit price: cost + (cost * profitMargin%)
    const unitPrice = cost + (cost * (profitMargin / 100));
    
    const newLineNumber = lineItems.length + 1;
    const newLineItem: QuoteLineItem = {
      id: crypto.randomUUID(),
      lineNumber: newLineNumber,
      quantity,
      description: `${selectedInventoryItem.name} (${selectedInventoryItem.agPartNumber})`,
      unitPrice: Math.round(unitPrice * 100) / 100, // Round to 2 decimals
      totalPrice: Math.round(quantity * unitPrice * 100) / 100,
    };

    setLineItems([...lineItems, newLineItem]);
    setIsItemModalOpen(false);
    
    toast({
      title: 'Line Item Added',
      description: `Added ${selectedInventoryItem.name} to quote.`,
    });
  };

  // Filter inventory items based on search term
  const filteredInventoryItems = inventoryItems.filter(item => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.agPartNumber?.toLowerCase().includes(searchLower) ||
      item.name?.toLowerCase().includes(searchLower) ||
      item.sku?.toLowerCase().includes(searchLower)
    );
  });

  const removeLineItem = (id: string) => {
    const filtered = lineItems.filter((item) => item.id !== id);
    // Renumber remaining items
    const renumbered = filtered.map((item, index) => ({
      ...item,
      lineNumber: index + 1,
    }));
    setLineItems(renumbered);
  };

  const updateLineItem = (
    id: string,
    field: keyof QuoteLineItem,
    value: string | number
  ) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // Recalculate total price when quantity or unit price changes
        if (field === 'quantity' || field === 'unitPrice') {
          // Default to 0 for NaN/empty values
          const qty = Number(updated.quantity) || 0;
          const price = Number(updated.unitPrice) || 0;
          updated.totalPrice = Math.max(0, qty * price);
        }

        return updated;
      })
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const handleViewPDF = () => {
    if (!savedQuoteId) {
      toast({
        title: 'No Quote Selected',
        description: 'Please save the quote first to view the PDF.',
        variant: 'destructive',
      });
      return;
    }

    // Open PDF in new tab
    const pdfUrl = `/api/quotes/${savedQuoteId}/pdf`;
    window.open(pdfUrl, '_blank');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Validation
      if (!customerName && !customerCompany) {
        toast({
          title: 'Validation Error',
          description: 'Please enter customer information.',
          variant: 'destructive',
        });
        return;
      }

      const quoteData = {
        id: savedQuoteId,
        rfqNumber: quoteNumber,
        customerId: '',
        customerName,
        customerCompany,
        fromName,
        fromEmail,
        fromPhone,
        paymentTerms,
        notes,
        validityDays,
        lineItems: lineItems.map(item => ({
          lineNumber: item.lineNumber,
          quantity: item.quantity,
          description: item.description,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          inventoryItemId: item.inventoryItemId || null,
          agPartNumber: item.agPartNumber || null,
        })),
      };

      const response = await apiRequest('/api/quotes/save', {
        method: 'POST',
        body: JSON.stringify(quoteData),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Update local state with saved quote info
      setSavedQuoteId(response.id);
      setQuoteNumber(response.quoteNumber);
      setQuoteStatus(response.status);
      setAttachments(response.attachments || []);

      toast({
        title: 'Quote Saved',
        description: `Quote ${response.quoteNumber} has been saved as draft.`,
      });
    } catch (error) {
      console.error('Save quote error:', error);
      toast({
        title: 'Save Failed',
        description: getErrorMessage(error, 'Failed to save quote. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // File upload handlers
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Validate PDF files only
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') {
        toast({ title: 'Invalid File Type', description: 'Only PDF files are allowed.', variant: 'destructive' });
        return;
      }
    }

    setIsUploadingFile(true);

    try {
      let quoteId = savedQuoteId;
      let wasAutoSaved = false;

      // Auto-save quote if not already saved
      if (!quoteId) {
        // Validate required fields before auto-saving
        if (!customerName && !customerCompany) {
          toast({
            title: 'Missing Information',
            description: 'Please enter customer information first before uploading files.',
            variant: 'destructive',
          });
          setIsUploadingFile(false);
          return;
        }

        toast({
          title: 'Auto-saving Quote',
          description: 'Saving quote before uploading files...',
        });

        const quoteData = {
          id: savedQuoteId,
          rfqNumber: quoteNumber,
          customerId: '',
          customerName,
          customerCompany,
          fromName,
          fromEmail,
          fromPhone,
          paymentTerms,
          notes,
          validityDays,
          lineItems: lineItems.map(item => ({
            lineNumber: item.lineNumber,
            quantity: item.quantity,
            description: item.description,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            inventoryItemId: item.inventoryItemId || null,
            agPartNumber: item.agPartNumber || null,
          })),
        };

        const saveResponse = await apiRequest('/api/quotes/save', {
          method: 'POST',
          body: JSON.stringify(quoteData),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        // Update local state with saved quote info
        quoteId = saveResponse.id;
        setSavedQuoteId(saveResponse.id);
        setQuoteNumber(saveResponse.quoteNumber);
        setQuoteStatus(saveResponse.status);
        wasAutoSaved = true;
      }

      // Now upload the files
      const uploadFormData = new FormData();
      for (const file of Array.from(files)) {
        uploadFormData.append('files', file);
      }

      const response = await fetch(`/api/quotes/${quoteId}/attachments`, {
        method: 'POST',
        body: uploadFormData,
      });

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const errorData = await response.json();
          if (errorData?.error) errorMessage = errorData.error;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      const result = await response.json();
      setAttachments(result.attachments || []);
      
      toast({ 
        title: 'Success', 
        description: wasAutoSaved 
          ? 'Quote saved and files uploaded successfully.' 
          : 'Files uploaded successfully.' 
      });
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({ 
        title: 'Upload Failed', 
        description: getErrorMessage(error, 'Failed to upload files. Please try again.'), 
        variant: 'destructive' 
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (fileName: string) => {
    if (!savedQuoteId) return;

    try {
      const response = await fetch(`/api/quotes/${savedQuoteId}/attachments/${fileName}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');

      const result = await response.json();
      setAttachments(result.quote?.attachments || []);
      toast({ title: 'Success', description: 'Attachment deleted successfully.' });
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Delete Failed', description: getErrorMessage(error, 'Failed to delete attachment. Please try again.'), variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let quoteIdToSubmit = savedQuoteId;

      // Save first if not already saved
      if (!quoteIdToSubmit) {
        setIsSaving(true);
        try {
          // Validation
          if (!customerName && !customerCompany) {
            toast({
              title: 'Validation Error',
              description: 'Please enter customer information.',
              variant: 'destructive',
            });
            return;
          }

          const quoteData = {
            id: savedQuoteId,
            rfqNumber: quoteNumber,
            customerId: '',
            customerName,
            customerCompany,
            fromName,
            fromEmail,
            fromPhone,
            paymentTerms,
            notes,
            validityDays,
            lineItems: lineItems.map(item => ({
              lineNumber: item.lineNumber,
              quantity: item.quantity,
              description: item.description,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              inventoryItemId: item.inventoryItemId || null,
              agPartNumber: item.agPartNumber || null,
            })),
          };

          const saveResponse = await apiRequest('/api/quotes/save', {
            method: 'POST',
            body: JSON.stringify(quoteData),
            headers: {
              'Content-Type': 'application/json',
            },
          });

          // Capture the returned ID
          quoteIdToSubmit = saveResponse.id;
          setSavedQuoteId(saveResponse.id);
          setQuoteNumber(saveResponse.quoteNumber);
          setAttachments(saveResponse.attachments || []);
        } finally {
          setIsSaving(false);
        }
      }

      // Verify we have a quote ID before submitting
      if (!quoteIdToSubmit) {
        throw new Error('Failed to save quote before submitting');
      }

      // Submit the quote
      const response = await apiRequest('/api/quotes/submit', {
        method: 'POST',
        body: JSON.stringify({ id: quoteIdToSubmit }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      setQuoteStatus('SENT');

      toast({
        title: 'Quote Submitted',
        description: `Quote ${quoteNumber} has been submitted to the customer.`,
      });
    } catch (error) {
      console.error('Submit quote error:', error);
      toast({
        title: 'Submit Failed',
        description: getErrorMessage(error, 'Failed to submit quote. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptQuote = async () => {
    if (!savedQuoteId) return;
    setIsAccepting(true);
    try {
      const response = await apiRequest(`/api/quotes/${savedQuoteId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACCEPTED' }),
        headers: { 'Content-Type': 'application/json' },
      });

      setQuoteStatus('ACCEPTED');

      queryClient.invalidateQueries({ queryKey: ['/api/quotes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/project'] });

      const projectId = response.projectId as string | null;
      if (projectId) {
        setLinkedProjectId(projectId);
        toast({
          title: 'Quote Accepted',
          description: `Quote ${quoteNumber} has been accepted. A Work Authorization Document has been prepared for production.`,
          action: (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLocation(`/projects/${projectId}`)}
            >
              View Project
            </Button>
          ),
        });
      } else {
        toast({
          title: 'Quote Accepted',
          description: `Quote ${quoteNumber} has been accepted. A Work Authorization Document has been prepared for production.`,
        });
      }
    } catch (error) {
      console.error('Accept quote error:', error);
      toast({
        title: 'Acceptance Failed',
        description: getErrorMessage(error, 'Failed to accept quote. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Navigation */}
      <div className="mb-6 no-print">
        <Link href="/p2-forms">
          <Button variant="outline" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to P2 Forms
          </Button>
        </Link>
      </div>

      {/* Quote Form */}
      <Card className="print:shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-bold">Job Quote</CardTitle>
              <CardDescription className="mt-2">
                Generate professional quotes for P2 customers
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center no-print">
              {quoteStatus === 'ACCEPTED' && (
                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm font-medium border border-blue-200 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Accepted
                </div>
              )}
              {quoteStatus === 'ACCEPTED' && linkedProjectId && (
                <Link href={`/projects/${linkedProjectId}`}>
                  <Button size="sm" variant="outline" className="text-blue-700 border-blue-300" data-testid="button-view-project">
                    View Project
                  </Button>
                </Link>
              )}
              {quoteStatus === 'SENT' && (
                <div className="bg-green-50 text-green-700 px-3 py-1 rounded-md text-sm font-medium border border-green-200">
                  ✓ Submitted
                </div>
              )}
              {quoteStatus === 'DRAFT' && savedQuoteId && (
                <div className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-md text-sm font-medium border border-yellow-200">
                  Draft
                </div>
              )}
              <Button
                variant="outline"
                onClick={handleViewPDF}
                disabled={!savedQuoteId}
                data-testid="button-view-pdf"
              >
                <Eye className="h-4 w-4 mr-2" />
                View PDF
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                data-testid="button-print"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving || isSubmitting || quoteStatus === 'ACCEPTED'}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Quote'}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving || isSubmitting || quoteStatus === 'SENT' || quoteStatus === 'ACCEPTED'}
                variant="default"
                data-testid="button-submit"
              >
                <FileText className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Submitting...' : 'Submit Quote'}
              </Button>
              {quoteStatus === 'SENT' && savedQuoteId && (
                <Button
                  onClick={handleAcceptQuote}
                  disabled={isAccepting || !savedQuoteId}
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-accept-quote"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isAccepting ? 'Accepting...' : 'Mark as Accepted'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-8">
          {/* Company Header */}
          <div className="flex justify-between mb-8 pb-6 border-b">
            <div>
              <h2 className="font-bold text-lg">AG Composites, LLC</h2>
              <p className="text-sm">dba AG Advanced Technologies</p>
              <p className="text-sm">230 Hamer Road</p>
              <p className="text-sm">Owens Cross Roads, AL 35763</p>
            </div>
            <div className="text-right">
              <Label className="text-sm font-semibold">Quote Number (RFQ)</Label>
              <Select value={quoteNumber} onValueChange={setQuoteNumber}>
                <SelectTrigger
                  className="w-48 mt-1 text-right font-mono"
                  data-testid="select-quote-number"
                >
                  <SelectValue placeholder="Select RFQ..." />
                </SelectTrigger>
                <SelectContent data-testid="select-quote-number-content">
                  {submittedRFQs.length === 0 ? (
                    <SelectItem value="none" disabled data-testid="option-no-rfqs">
                      No submitted RFQs
                    </SelectItem>
                  ) : (
                    submittedRFQs.map((rfq) => (
                      <SelectItem
                        key={rfq.id}
                        value={rfq.rfqNumber}
                        data-testid={`option-rfq-${rfq.rfqNumber}`}
                      >
                        {rfq.rfqNumber} - {rfq.customerName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quote Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  data-testid="input-date"
                />
              </div>
              <div>
                <Label>To (Contracting Person)</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter contracting person's name"
                  data-testid="input-customer-name"
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  list="p2-customers-list"
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder="Select or enter company name"
                  data-testid="input-customer-company"
                />
                <datalist id="p2-customers-list">
                  {p2Customers.map((customer: any) => (
                    <option key={customer.id} value={customer.customerName}>
                      {customer.customerName}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger data-testid="select-payment-terms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-testid="select-payment-terms-content">
                    <SelectItem value="Net 30" data-testid="option-net-30">Net 30</SelectItem>
                    <SelectItem value="Net 60" data-testid="option-net-60">Net 60</SelectItem>
                    <SelectItem value="Due on Receipt" data-testid="option-due-on-receipt">Due on Receipt</SelectItem>
                    <SelectItem value="50% Deposit" data-testid="option-50-deposit">50% Deposit</SelectItem>
                    <SelectItem value="Custom" data-testid="option-custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <Label>From</Label>
                <Input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  data-testid="input-from-name"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  data-testid="input-from-email"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={fromPhone}
                  onChange={(e) => setFromPhone(e.target.value)}
                  data-testid="input-from-phone"
                />
              </div>
            </div>
          </div>

          {/* Past Project Insights — no-print */}
          {selectedRFQ && (isLoadingSimilar || similarClosings.length > 0) && (
            <div className="mb-8 no-print border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                onClick={() => setShowInsights(prev => !prev)}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Past Project Insights</span>
                  <span className="text-xs text-muted-foreground">— lessons from approved closed projects for this customer</span>
                  {!isLoadingSimilar && similarClosings.length > 0 && (
                    <Badge variant="secondary" className="text-xs h-5">{similarClosings.length}</Badge>
                  )}
                </div>
                {showInsights ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showInsights && (
                <div className="px-4 py-3 bg-background">
                  {isLoadingSimilar ? (
                    <div className="animate-pulse space-y-3">
                      <div className="h-5 bg-gray-200 rounded w-1/3" />
                      <div className="h-14 bg-gray-200 rounded" />
                    </div>
                  ) : (
                    <Accordion type="multiple" className="space-y-1">
                      {similarClosings.map((closing) => (
                        <AccordionItem key={closing.id} value={String(closing.id)} className="border rounded-md px-3">
                          <AccordionTrigger className="py-2 hover:no-underline">
                            <div className="flex items-center gap-3 text-left">
                              <Badge variant="outline" className="text-xs font-mono shrink-0">{closing.projectCode}</Badge>
                              <span className="text-sm font-medium truncate">{closing.projectName}</span>
                              {closing.approvedAt && (
                                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                                  {format(new Date(closing.approvedAt), 'MMM yyyy')}
                                </span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-3 space-y-3">
                            {closing.summary && (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                                <p className="text-sm">{closing.summary}</p>
                              </div>
                            )}
                            <div className="grid gap-3 md:grid-cols-2">
                              {closing.strengths && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">What Went Well</p>
                                  <p className="text-sm">{closing.strengths}</p>
                                </div>
                              )}
                              {closing.whatWentWrong && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">What Went Wrong</p>
                                  <p className="text-sm">{closing.whatWentWrong}</p>
                                </div>
                              )}
                            </div>
                            {closing.nextProjectRecommendations && (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Recommendations</p>
                                <p className="text-sm">{closing.nextProjectRecommendations}</p>
                              </div>
                            )}
                            <Link href={`/projects/${closing.projectId}/closing`}>
                              <Button variant="ghost" size="sm" className="text-xs mt-1 h-7">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                View full closing record
                              </Button>
                            </Link>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Line Items Table */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Line Items</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={openAddItemModal}
                className="no-print"
                data-testid="button-add-line"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Line Item from Inventory
              </Button>
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead className="w-32">Quantity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-32">Unit Price</TableHead>
                    <TableHead className="w-32">Total Price</TableHead>
                    <TableHead className="w-16 no-print"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.lineNumber}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'quantity',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full"
                          data-testid={`input-quantity-${item.lineNumber}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'description',
                              e.target.value
                            )
                          }
                          rows={2}
                          className="w-full"
                          placeholder="Enter detailed description..."
                          data-testid={`input-description-${item.lineNumber}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <span className="mr-1">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateLineItem(
                                item.id,
                                'unitPrice',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full"
                            data-testid={`input-unit-price-${item.lineNumber}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        ${item.totalPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="no-print">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(item.id)}
                          className="text-red-600 hover:text-red-800"
                          data-testid={`button-delete-${item.lineNumber}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="flex justify-end mt-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-8">
                  <span className="text-lg font-semibold">Total</span>
                  <span
                    className="text-2xl font-bold"
                    data-testid="text-grand-total"
                  >
                    ${grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="mb-8">
            <Label className="text-lg font-semibold mb-2 block">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Enter detailed notes about materials, delivery schedule, lead times, etc..."
              className="w-full"
              data-testid="textarea-notes"
            />
          </div>

          {/* PDF Attachments Section */}
          <div className="mb-8 border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5" />
              <Label className="text-lg font-semibold">PDF Attachments</Label>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              data-testid="input-file-upload"
            />

            {/* Upload button */}
            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingFile}
                className="flex items-center gap-2"
                data-testid="button-upload-pdf"
              >
                <Upload className="h-4 w-4" />
                {isUploadingFile ? 'Uploading...' : 'Upload PDF Files'}
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                {!savedQuoteId 
                  ? 'Quote will be auto-saved when you upload files.' 
                  : 'Upload one or more PDF files (max 5 files, 10MB each).'}
              </p>
            </div>

            {/* Attachments list */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium">Attached Files ({attachments.length})</Label>
                <div className="space-y-2">
                  {attachments.map((attachment, index) => {
                    const fileName = attachment.split('/').pop() || attachment;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 border rounded-md"
                        data-testid={`attachment-${index}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-600" />
                          <a
                            href={`/api/quotes/${savedQuoteId}/attachments/${fileName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                            data-testid={`link-attachment-${index}`}
                          >
                            {fileName}
                          </a>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPreviewUrl(`/api/quotes/${savedQuoteId}/attachments/${fileName}`);
                              setPreviewFileName(fileName);
                            }}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            data-testid={`button-preview-attachment-${index}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAttachment(fileName)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-attachment-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t pt-6 space-y-4">
            <p className="text-center text-sm">
              Thank you for the opportunity to provide this quotation.
            </p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-center text-sm font-semibold">
                This quote has a validity period of
              </p>
              <Input
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-20 text-center"
                data-testid="input-validity-days"
              />
              <span className="text-sm font-semibold">days.</span>
            </div>
          </div>

          {/* Form Footer */}
          <div className="mt-8 text-center text-xs text-gray-500 border-t pt-4">
            FO Form 7 - Version 1.4 07/15/2024
          </div>
        </CardContent>
      </Card>

      {/* Inventory Item Selection Modal */}
      <Dialog open={isItemModalOpen} onOpenChange={setIsItemModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Item from Inventory</DialogTitle>
            <DialogDescription>
              Select an inventory item and configure pricing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by Part#, Name, or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-inventory"
              />
            </div>

            {/* Inventory Items List */}
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {isLoadingInventory ? (
                <div className="p-4 text-center text-gray-500">Loading inventory...</div>
              ) : filteredInventoryItems.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No items found</div>
              ) : (
                <div className="divide-y">
                  {filteredInventoryItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedInventoryItem(item)}
                      className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedInventoryItem?.id === item.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                      data-testid={`item-${item.agPartNumber}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-gray-500">
                            Part#: {item.agPartNumber}
                            {item.sku && ` • SKU: ${item.sku}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">
                            ${Number(item.costPer || 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">Cost per {item.vendorUnit || 'unit'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Item Details */}
            {selectedInventoryItem && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-blue-900">Selected Item</h4>
                  <p className="text-sm text-blue-700">{selectedInventoryItem.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="item-quantity">Quantity</Label>
                    <Input
                      id="item-quantity"
                      type="number"
                      min="1"
                      step="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      data-testid="input-item-quantity"
                    />
                  </div>

                  <div>
                    <Label htmlFor="profit-margin">Profit Margin (%)</Label>
                    <Input
                      id="profit-margin"
                      type="number"
                      min="0"
                      step="0.1"
                      value={profitMarginPercent}
                      onChange={(e) => setProfitMarginPercent(e.target.value)}
                      data-testid="input-profit-margin"
                    />
                  </div>
                </div>

                {/* Pricing Summary */}
                <div className="bg-white rounded p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Base Cost:</span>
                    <span className="font-medium">
                      ${Number(selectedInventoryItem.costPer || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Profit Margin ({profitMarginPercent}%):</span>
                    <span className="font-medium text-green-600">
                      +${(Number(selectedInventoryItem.costPer || 0) * (Number(profitMarginPercent) / 100)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Unit Price:</span>
                    <span className="text-blue-600">
                      ${(
                        Number(selectedInventoryItem.costPer || 0) +
                        Number(selectedInventoryItem.costPer || 0) * (Number(profitMarginPercent) / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Line Total:</span>
                    <span className="text-purple-600">
                      ${(
                        (Number(selectedInventoryItem.costPer || 0) +
                          Number(selectedInventoryItem.costPer || 0) * (Number(profitMarginPercent) / 100)) *
                        Number(itemQuantity || 1)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsItemModalOpen(false)}
              data-testid="button-cancel-add-item"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddItemFromInventory}
              disabled={!selectedInventoryItem}
              data-testid="button-confirm-add-item"
            >
              Add to Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Modal */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="max-w-4xl w-full" style={{ height: '90vh', display: 'flex', flexDirection: 'column' }}>
          <DialogHeader>
            <DialogTitle>Preview: {previewFileName}</DialogTitle>
            <DialogDescription>
              PDF preview — use the link below to open in a new tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {previewUrl && (
              <iframe
                src={previewUrl}
                title={previewFileName}
                className="w-full h-full rounded border"
                style={{ minHeight: '60vh' }}
              />
            )}
          </div>
          <DialogFooter className="mt-2">
            <a
              href={previewUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Open in new tab
            </a>
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </div>
  );
}
