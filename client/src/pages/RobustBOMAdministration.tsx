import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Edit, Trash2, FileText, ChevronRight, Check, ChevronsUpDown, Copy, Save, X, ChevronDown, Package, CheckCircle2, Power, Loader2, FileEdit } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

// BOM schema
const bomSchema = z.object({
  parentPartAgNumber: z.string().min(1, 'Parent part is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().default(''),
});

// BOM Revision schema
const revisionSchema = z.object({
  bomId: z.string().min(1, 'BOM is required'),
  revCode: z.string().min(1, 'Revision code is required'),
  notes: z.string().default(''),
});

// BOM Line schema (for wizard Step 3)
const bomLineSchema = z.object({
  childPartAgNumber: z.string().min(1, 'Child part is required'),
  quantityPer: z.number().min(0.001, 'Quantity must be greater than 0'),
  scrapPercent: z.number().min(0).max(100).optional(),
  referenceDesignator: z.string().optional(),
  operationSequence: z.number().int().min(1).optional(),
});

export default function RobustBOMAdministration() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('boms');
  const [selectedBom, setSelectedBom] = useState<any>(null);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="robust-bom-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Robust BOM Administration
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage bills of materials and revisions with advanced tracking
          </p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="boms" data-testid="tab-boms">
            P2 BOMs
          </TabsTrigger>
          <TabsTrigger value="revisions" data-testid="tab-revisions">
            Revisions
          </TabsTrigger>
          <TabsTrigger value="stock-boms" data-testid="tab-stock-boms">
            Stock BOMs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="boms" className="space-y-4">
          <BOMsTab searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
        </TabsContent>

        <TabsContent value="revisions" className="space-y-4">
          <RevisionsTab />
        </TabsContent>

        <TabsContent value="stock-boms" className="space-y-4">
          <StockBOMsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// BOMs Tab Component
function BOMsTab({ searchTerm, setSearchTerm }: { searchTerm: string; setSearchTerm: (s: string) => void }) {
  const { toast } = useToast();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState<any>({
    step1: null, // BOM metadata
    step2: null, // Initial revision
    step3: [], // BOM lines
  });
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<any>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [editingLines, setEditingLines] = useState<any[]>([]);
  const [partSearch, setPartSearch] = useState('');
  const [isPartPopoverOpen, setIsPartPopoverOpen] = useState(false);
  const [bomLines, setBomLines] = useState<any[]>([]); // For Step 3
  const [linePartSearch, setLinePartSearch] = useState('');
  const [isLinePartPopoverOpen, setIsLinePartPopoverOpen] = useState(false);
  const [isCreatingBom, setIsCreatingBom] = useState(false); // Loading state for API calls
  const [editLinePartSearch, setEditLinePartSearch] = useState<{[key: number]: string}>({}); // Search for each line
  const [editLinePopoverOpen, setEditLinePopoverOpen] = useState<{[key: number]: boolean}>({}); // Popover state for each line
  const [isExplosionDialogOpen, setIsExplosionDialogOpen] = useState(false);
  const [explosionBom, setExplosionBom] = useState<any>(null); // BOM being exploded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set()); // Track expanded tree nodes
  const [editSheetTab, setEditSheetTab] = useState('metadata'); // Tab for edit sheet

  const bomsQueryUrl = `/api/robust-boms/boms?${searchTerm ? `search=${encodeURIComponent(searchTerm)}` : ''}`;
  const { data: bomsData, isLoading } = useQuery({
    queryKey: [bomsQueryUrl],
  });

  const { data: partsData } = useQuery({
    queryKey: ['/api/robust-boms/parts?pageSize=1000'],
  });

  const createBOMMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/robust-boms/boms', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey[0] === 'string' && 
          query.queryKey[0].startsWith('/api/robust-boms/boms')
      });
      toast({ title: 'Success', description: 'BOM created successfully' });
      setIsWizardOpen(false);
      setWizardStep(1);
      setWizardData({ step1: null, step2: null, step3: [] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create BOM', variant: 'destructive' });
    },
  });

  const deleteBOMMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/robust-boms/boms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey[0] === 'string' && 
          query.queryKey[0].startsWith('/api/robust-boms/boms')
      });
      toast({ title: 'Success', description: 'BOM deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete BOM', variant: 'destructive' });
    },
  });

  const updateBOMMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/robust-boms/boms/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey[0] === 'string' && 
          query.queryKey[0].startsWith('/api/robust-boms/boms')
      });
      toast({ title: 'Success', description: 'BOM updated successfully' });
      setIsViewDrawerOpen(false);
      setSelectedBom(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update BOM', variant: 'destructive' });
    },
  });

  const toggleBomActiveMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest(`/api/robust-boms/boms/${id}/toggle-active`, { method: 'PATCH' }),
    onSuccess: (data: any) => {
      // Update selectedBom if it's the one that was toggled
      if (selectedBom && selectedBom.id === data.id) {
        setSelectedBom({ ...selectedBom, isActive: data.isActive });
      }
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey[0] === 'string' && 
          query.queryKey[0].startsWith('/api/robust-boms/boms')
      });
      toast({ 
        title: 'Success', 
        description: `BOM ${data.isActive ? 'activated' : 'deactivated'} successfully` 
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to toggle BOM status', variant: 'destructive' });
    },
  });

  // Fetch revision details with lines
  const { data: revisionData } = useQuery({
    queryKey: [`/api/robust-boms/revisions/${selectedRevisionId}`],
    enabled: !!selectedRevisionId,
  });

  // Fetch BOM tree for explosion view
  // Select the released revision, fallback to latest if no released revision exists
  const selectedRevisionForExplosion = explosionBom?.revisions?.find((rev: any) => rev.isReleased)?.id 
    || explosionBom?.revisions?.[0]?.id;
  const { data: bomTreeData, isLoading: isTreeLoading } = useQuery({
    queryKey: [`/api/robust-boms/revisions/${selectedRevisionForExplosion}/tree`],
    enabled: isExplosionDialogOpen && !!selectedRevisionForExplosion,
  });

  // Update revision lines mutation
  const updateLinesMutation = useMutation({
    mutationFn: ({ revisionId, lines }: { revisionId: string; lines: any[] }) => 
      apiRequest(`/api/robust-boms/revisions/${revisionId}/lines`, { 
        method: 'POST', 
        body: { lines } 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/robust-boms/revisions');
        }
      });
      toast({ title: 'Success', description: 'BOM lines updated successfully' });
      // Close the drawer after successful save
      setIsViewDrawerOpen(false);
      setSelectedRevisionId(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update BOM lines', variant: 'destructive' });
    },
  });

  // Release revision mutation
  const releaseRevisionMutation = useMutation({
    mutationFn: (revisionId: string) => 
      apiRequest(`/api/robust-boms/revisions/${revisionId}/release`, { 
        method: 'POST', 
        body: {} 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/boms'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/robust-boms/revisions');
        }
      });
      toast({ title: 'Success', description: 'Revision released successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to release revision', variant: 'destructive' });
    },
  });

  const form = useForm({
    resolver: zodResolver(bomSchema),
    defaultValues: {
      parentPartAgNumber: '',
      code: '',
      description: '',
    },
  });

  const editForm = useForm({
    resolver: zodResolver(bomSchema),
    defaultValues: {
      parentPartAgNumber: '',
      code: '',
      description: '',
    },
  });

  const revisionForm = useForm({
    resolver: zodResolver(revisionSchema.omit({ bomId: true })),
    defaultValues: {
      revCode: '',
      notes: '',
    },
  });

  const lineForm = useForm({
    resolver: zodResolver(bomLineSchema),
    defaultValues: {
      childPartAgNumber: '',
      quantityPer: 1,
      scrapPercent: 0,
      referenceDesignator: '',
      operationSequence: undefined,
    },
  });

  // Sync editing lines when revision data loads
  useEffect(() => {
    const revision = revisionData as any;
    if (revision && revision.lines) {
      setEditingLines(revision.lines.map((line: any) => ({
        id: line.id,
        childPartAgNumber: line.childPartAgNumber,
        quantityPer: line.qtyPer,
        scrapPercent: line.scrapPercent || 0,
        referenceDesignator: line.referenceDesignator || '',
        operationSequence: line.operationSeq,
      })));
    }
  }, [revisionData]);

  const onSubmit = (data: z.infer<typeof bomSchema>) => {
    createBOMMutation.mutate(data);
  };

  const onEditSubmit = (data: z.infer<typeof bomSchema>) => {
    if (selectedBom) {
      updateBOMMutation.mutate({ id: selectedBom.id, data });
    }
  };

  // Wizard navigation handlers
  const handleStep1Next = () => {
    form.trigger().then((isValid) => {
      if (isValid) {
        const formData = form.getValues();
        setWizardData({ ...wizardData, step1: formData });
        setWizardStep(2);
      }
    });
  };

  const handleWizardBack = () => {
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1);
    }
  };

  const handleWizardCancel = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setWizardData({ step1: null, step2: null, step3: [] });
    setBomLines([]);
    form.reset();
    revisionForm.reset();
    lineForm.reset();
  };

  const handleStep2Next = () => {
    revisionForm.trigger().then((isValid) => {
      if (isValid) {
        const formData = revisionForm.getValues();
        setWizardData({ ...wizardData, step2: formData });
        setWizardStep(3);
      }
    });
  };

  const handleAddLine = () => {
    lineForm.trigger().then((isValid) => {
      if (isValid) {
        const lineData = lineForm.getValues();
        const newLines = [...bomLines, lineData];
        setBomLines(newLines);
        setWizardData({ ...wizardData, step3: newLines }); // Sync with wizard data
        lineForm.reset({
          childPartAgNumber: '',
          quantityPer: 1,
          scrapPercent: 0,
          referenceDesignator: '',
          operationSequence: undefined,
        });
        setLinePartSearch('');
      }
    });
  };

  const handleRemoveLine = (index: number) => {
    const newLines = bomLines.filter((_, i) => i !== index);
    setBomLines(newLines);
    setWizardData({ ...wizardData, step3: newLines }); // Sync with wizard data
  };

  const handleStep3Finish = async () => {
    if (bomLines.length === 0) {
      toast({ 
        title: 'Validation Error', 
        description: 'Please add at least one BOM line before finishing',
        variant: 'destructive' 
      });
      return;
    }
    
    setIsCreatingBom(true);
    
    try {
      // Step 1: Create BOM
      const bomResponse = await apiRequest('/api/robust-boms/boms', {
        method: 'POST',
        body: wizardData.step1,
      });
      
      if (!bomResponse || !bomResponse.id) {
        throw new Error('Failed to create BOM');
      }
      
      // Step 2: Create Initial Revision
      const revisionResponse = await apiRequest(`/api/robust-boms/boms/${bomResponse.id}/revisions`, {
        method: 'POST',
        body: wizardData.step2,
      });
      
      if (!revisionResponse || !revisionResponse.id) {
        throw new Error('Failed to create revision');
      }
      
      // Step 3: Create BOM Lines
      await apiRequest(`/api/robust-boms/revisions/${revisionResponse.id}/lines`, {
        method: 'POST',
        body: { lines: bomLines },
      });
      
      // Success! Invalidate all BOM queries (including those with search params)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/robust-boms/boms');
        }
      });
      
      toast({ 
        title: 'Success!', 
        description: `BOM "${bomResponse.code}" created with revision "${revisionResponse.revCode}" and ${bomLines.length} line(s)`,
      });
      
      // Reset wizard
      setIsWizardOpen(false);
      setWizardStep(1);
      setWizardData({ step1: null, step2: null, step3: [] });
      setBomLines([]);
      form.reset();
      revisionForm.reset();
      lineForm.reset();
      
    } catch (error: any) {
      console.error('BOM creation error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create BOM. Please try again.',
        variant: 'destructive' 
      });
    } finally {
      setIsCreatingBom(false);
    }
  };

  // Populate edit form when a BOM is selected
  useEffect(() => {
    if (selectedBom && isViewDrawerOpen) {
      editForm.reset({
        parentPartAgNumber: selectedBom.parentPartAgNumber || '',
        code: selectedBom.code || '',
        description: selectedBom.description || '',
      });
    }
  }, [selectedBom, isViewDrawerOpen, editForm]);

  // Restore wizard Step 1 data when navigating back
  useEffect(() => {
    if (wizardStep === 1 && wizardData.step1) {
      form.reset(wizardData.step1);
    }
  }, [wizardStep, wizardData.step1, form]);

  // Restore wizard Step 2 data when navigating back
  useEffect(() => {
    if (wizardStep === 2 && wizardData.step2) {
      revisionForm.reset(wizardData.step2);
    }
  }, [wizardStep, wizardData.step2, revisionForm]);

  // Restore wizard Step 3 data when navigating back
  useEffect(() => {
    if (wizardStep === 3 && wizardData.step3 && wizardData.step3.length > 0) {
      setBomLines(wizardData.step3);
    }
  }, [wizardStep, wizardData.step3]);

  const boms = (bomsData as any)?.data || [];
  const parts = (partsData as any)?.data || [];
  
  // Filter parts based on search (for Step 1 parent part)
  const filteredParts = partSearch.trim() === '' 
    ? parts 
    : parts.filter((part: any) => {
        const search = partSearch.toLowerCase();
        return (
          part.agPartNumber?.toLowerCase().includes(search) ||
          part.name?.toLowerCase().includes(search) ||
          part.sku?.toLowerCase().includes(search)
        );
      });

  // Filter parts based on search (for Step 3 child parts)
  const filteredLineParts = linePartSearch.trim() === '' 
    ? parts 
    : parts.filter((part: any) => {
        const search = linePartSearch.toLowerCase();
        return (
          part.agPartNumber?.toLowerCase().includes(search) ||
          part.name?.toLowerCase().includes(search) ||
          part.sku?.toLowerCase().includes(search)
        );
      });

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Bills of Materials</CardTitle>
            <CardDescription>Manage BOM definitions and revisions</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search BOMs..."
                className="pl-8 w-[300px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-boms"
              />
            </div>
            {/* Create BOM Wizard */}
            <Dialog open={isWizardOpen} onOpenChange={(open) => {
              setIsWizardOpen(open);
              if (!open) {
                setWizardStep(1);
                setWizardData({ step1: null, step2: null, step3: [] });
                setBomLines([]);
                form.reset();
                revisionForm.reset();
                lineForm.reset();
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-bom">
                  <Plus className="mr-2 h-4 w-4" />
                  Add BOM
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New BOM - Step {wizardStep} of 3</DialogTitle>
                  <DialogDescription>
                    {wizardStep === 1 && "Define BOM metadata (parent part, code, description)"}
                    {wizardStep === 2 && "Create initial revision"}
                    {wizardStep === 3 && "Add child parts and quantities"}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Step 1: BOM Metadata */}
                    {wizardStep === 1 && (
                      <>
                        <FormField
                          control={form.control}
                          name="parentPartAgNumber"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Parent Part (Inventory Item)</FormLabel>
                              <Popover open={isPartPopoverOpen} onOpenChange={setIsPartPopoverOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      className={cn(
                                        "w-full justify-between",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="select-parent-part"
                                    >
                                      {field.value
                                        ? parts.find((part: any) => part.agPartNumber === field.value)
                                          ? `${parts.find((part: any) => part.agPartNumber === field.value).agPartNumber} - ${parts.find((part: any) => part.agPartNumber === field.value).name}`
                                          : "Select a parent part"
                                        : "Select a parent part"}
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0" align="start">
                                  <Command shouldFilter={false}>
                                    <CommandInput 
                                      placeholder="Search parts by AG#, SKU, or name..." 
                                      value={partSearch}
                                      onValueChange={setPartSearch}
                                    />
                                    <CommandList>
                                      <CommandEmpty>No part found.</CommandEmpty>
                                      <CommandGroup>
                                        {filteredParts.map((part: any) => (
                                          <CommandItem
                                            key={part.agPartNumber}
                                            value={part.agPartNumber}
                                            onSelect={() => {
                                              form.setValue("parentPartAgNumber", part.agPartNumber);
                                              setPartSearch('');
                                              setIsPartPopoverOpen(false);
                                            }}
                                            data-testid={`option-part-${part.agPartNumber}`}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                part.agPartNumber === field.value
                                                  ? "opacity-100"
                                                  : "opacity-0"
                                              )}
                                            />
                                            <div className="flex flex-col">
                                              <span className="font-medium">{part.agPartNumber} - {part.name}</span>
                                              {part.sku && <span className="text-xs text-muted-foreground">SKU: {part.sku}</span>}
                                            </div>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              <FormDescription>
                                The inventory item that this BOM produces
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="code"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>BOM Code</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-bom-code" />
                              </FormControl>
                              <FormDescription>
                                Unique identifier for this BOM
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea {...field} data-testid="input-bom-description" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {/* Step 2: Initial Revision */}
                    {wizardStep === 2 && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                          <p className="text-sm text-blue-900 dark:text-blue-100">
                            <strong>Define your initial revision.</strong> The revision code typically follows a versioning scheme 
                            like "A", "B", "C" or "Rev 1", "Rev 2", etc. This will be the first version of your BOM.
                          </p>
                        </div>
                        
                        <FormField
                          control={revisionForm.control}
                          name="revCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Revision Code *</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="e.g., A, Rev 1, V1.0" 
                                  data-testid="input-revision-code"
                                />
                              </FormControl>
                              <FormDescription>
                                Enter a unique code for this revision (e.g., "A", "Rev 1", "V1.0")
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={revisionForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Revision Notes (Optional)</FormLabel>
                              <FormControl>
                                <Textarea 
                                  {...field} 
                                  placeholder="Enter any notes about this revision (e.g., initial release, design changes, etc.)"
                                  rows={4}
                                  data-testid="input-revision-notes"
                                />
                              </FormControl>
                              <FormDescription>
                                Add notes about what this revision includes or why it was created
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {/* Step 3: Add BOM Lines */}
                    {wizardStep === 3 && (
                      <div className="space-y-6">
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                          <p className="text-sm text-blue-900 dark:text-blue-100">
                            <strong>Add child parts to your BOM.</strong> Each line represents a component that makes up the parent part. 
                            You must add at least one line item to complete the BOM.
                          </p>
                        </div>

                        {/* Add Line Form */}
                        <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                          <h4 className="font-semibold">Add BOM Line</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Child Part Selection */}
                            <FormField
                              control={lineForm.control}
                              name="childPartAgNumber"
                              render={({ field }) => (
                                <FormItem className="flex flex-col">
                                  <FormLabel>Child Part *</FormLabel>
                                  <Popover open={isLinePartPopoverOpen} onOpenChange={setIsLinePartPopoverOpen}>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button
                                          variant="outline"
                                          role="combobox"
                                          className={cn(
                                            "justify-between",
                                            !field.value && "text-muted-foreground"
                                          )}
                                          data-testid="button-select-child-part"
                                        >
                                          {field.value
                                            ? parts.find((p: any) => p.agPartNumber === field.value)?.agPartNumber + ' - ' + parts.find((p: any) => p.agPartNumber === field.value)?.name
                                            : "Select child part"}
                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                      <Command>
                                        <CommandInput 
                                          placeholder="Search parts..." 
                                          value={linePartSearch}
                                          onValueChange={setLinePartSearch}
                                        />
                                        <CommandList>
                                          <CommandEmpty>No parts found.</CommandEmpty>
                                          <CommandGroup>
                                            {filteredLineParts.slice(0, 50).map((part: any) => (
                                              <CommandItem
                                                key={part.agPartNumber}
                                                value={part.agPartNumber}
                                                onSelect={() => {
                                                  lineForm.setValue('childPartAgNumber', part.agPartNumber);
                                                  setIsLinePartPopoverOpen(false);
                                                  setLinePartSearch('');
                                                }}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-4 w-4",
                                                    part.agPartNumber === field.value
                                                      ? "opacity-100"
                                                      : "opacity-0"
                                                  )}
                                                />
                                                <div>
                                                  <div className="font-medium">{part.agPartNumber}</div>
                                                  <div className="text-sm text-muted-foreground">{part.name}</div>
                                                </div>
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        </CommandList>
                                      </Command>
                                    </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Quantity Per */}
                            <FormField
                              control={lineForm.control}
                              name="quantityPer"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Quantity Per Unit *</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.001"
                                      {...field}
                                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                      data-testid="input-quantity-per"
                                    />
                                  </FormControl>
                                  <FormDescription>How many of this part per parent unit</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Scrap % */}
                            <FormField
                              control={lineForm.control}
                              name="scrapPercent"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Scrap % (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="100"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                      data-testid="input-scrap-percent"
                                    />
                                  </FormControl>
                                  <FormDescription>Expected scrap percentage (0-100)</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Reference Designator */}
                            <FormField
                              control={lineForm.control}
                              name="referenceDesignator"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Reference Designator (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., R1, C2, U3" data-testid="input-reference-designator" />
                                  </FormControl>
                                  <FormDescription>Reference designator on drawings</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Operation Sequence */}
                            <FormField
                              control={lineForm.control}
                              name="operationSequence"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Operation Sequence (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="1"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid="input-operation-sequence"
                                    />
                                  </FormControl>
                                  <FormDescription>Assembly operation order</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <Button
                            type="button"
                            onClick={handleAddLine}
                            className="w-full"
                            data-testid="button-add-line"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Line to BOM
                          </Button>
                        </div>

                        {/* BOM Lines Table */}
                        <div>
                          <h4 className="font-semibold mb-2">
                            BOM Lines ({bomLines.length})
                          </h4>
                          {bomLines.length === 0 ? (
                            <div className="border rounded-lg p-8 text-center text-muted-foreground">
                              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                              <p>No lines added yet. Add at least one line to complete the BOM.</p>
                            </div>
                          ) : (
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Child Part</TableHead>
                                    <TableHead>Qty/Unit</TableHead>
                                    <TableHead>Scrap %</TableHead>
                                    <TableHead>UOM</TableHead>
                                    <TableHead>Ref Des</TableHead>
                                    <TableHead>Op Seq</TableHead>
                                    <TableHead className="w-[80px]">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {bomLines.map((line, index) => {
                                    const part = parts.find((p: any) => p.agPartNumber === line.childPartAgNumber);
                                    return (
                                      <TableRow key={index} data-testid={`row-bom-line-${index}`}>
                                        <TableCell>
                                          <div>
                                            <div className="font-medium">{line.childPartAgNumber}</div>
                                            <div className="text-sm text-muted-foreground">{part?.name}</div>
                                          </div>
                                        </TableCell>
                                        <TableCell>{line.quantityPer}</TableCell>
                                        <TableCell>{line.scrapPercent || '-'}</TableCell>
                                        <TableCell>{parts.find((p: any) => p.agPartNumber === line.childPartAgNumber)?.usageUnit || 'EA'}</TableCell>
                                        <TableCell>{line.referenceDesignator || '-'}</TableCell>
                                        <TableCell>{line.operationSequence || '-'}</TableCell>
                                        <TableCell>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveLine(index)}
                                            data-testid={`button-delete-line-${index}`}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <DialogFooter className="flex justify-between">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleWizardCancel}
                          data-testid="button-wizard-cancel"
                        >
                          Cancel
                        </Button>
                        {wizardStep > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleWizardBack}
                            data-testid="button-wizard-back"
                          >
                            Back
                          </Button>
                        )}
                      </div>
                      <div>
                        {wizardStep === 1 && (
                          <Button
                            type="button"
                            onClick={handleStep1Next}
                            data-testid="button-wizard-next"
                          >
                            Next: Initial Revision
                          </Button>
                        )}
                        {wizardStep === 2 && (
                          <Button
                            type="button"
                            onClick={handleStep2Next}
                            data-testid="button-wizard-next"
                          >
                            Next: Add Parts
                          </Button>
                        )}
                        {wizardStep === 3 && (
                          <Button
                            type="button"
                            onClick={handleStep3Finish}
                            disabled={isCreatingBom}
                            data-testid="button-submit-bom"
                          >
                            {isCreatingBom ? 'Creating BOM...' : 'Complete & Create BOM'}
                          </Button>
                        )}
                      </div>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            {/* View/Edit BOM Details Drawer */}
            <Sheet open={isViewDrawerOpen} onOpenChange={(open) => {
              setIsViewDrawerOpen(open);
              if (!open) {
                setSelectedBom(null);
                setSelectedRevisionId(null);
                setEditingLines([]);
                setEditSheetTab('metadata');
              }
            }}>
              <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Edit BOM</SheetTitle>
                  <SheetDescription>
                    Edit BOM metadata and manage revisions & line items
                  </SheetDescription>
                </SheetHeader>
                {selectedBom && (
                  <div className="mt-6">
                    <Tabs value={editSheetTab} onValueChange={setEditSheetTab}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="metadata">Metadata</TabsTrigger>
                        <TabsTrigger value="revisions">Revisions & Lines</TabsTrigger>
                      </TabsList>

                      <TabsContent value="metadata" className="space-y-6 mt-6">
                        <Form {...editForm}>
                          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                            <FormField
                              control={editForm.control}
                              name="parentPartAgNumber"
                              render={({ field }) => (
                                <FormItem className="flex flex-col">
                                  <FormLabel>Parent Part (Inventory Item)</FormLabel>
                                  <FormControl>
                                    <Input
                                      value={field.value ? `${field.value} - ${parts.find((p: any) => p.agPartNumber === field.value)?.name || ''}` : ''}
                                      disabled
                                      data-testid="input-edit-parent-part"
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Parent part cannot be changed after BOM creation
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={editForm.control}
                              name="code"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>BOM Code</FormLabel>
                                  <FormControl>
                                    <Input {...field} disabled data-testid="input-edit-bom-code" />
                                  </FormControl>
                                  <FormDescription>
                                    BOM Code cannot be changed after creation (immutable identifier)
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={editForm.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      {...field} 
                                      data-testid="input-edit-bom-description" 
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Edit the BOM description
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="space-y-4 pt-4 border-t">
                              <div className="flex items-center justify-between">
                                <div>
                                  <label className="text-sm font-medium">BOM Status</label>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBom.isActive ? 'Active - In use for production' : 'Inactive - Not used for production'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">
                                    {selectedBom.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                  <Switch
                                    checked={selectedBom.isActive}
                                    onCheckedChange={() => toggleBomActiveMutation.mutate(selectedBom.id)}
                                    disabled={toggleBomActiveMutation.isPending}
                                    data-testid="switch-bom-active"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setIsViewDrawerOpen(false);
                                  setSelectedBom(null);
                                  editForm.reset();
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={updateBOMMutation.isPending}
                                data-testid="button-update-bom"
                              >
                                {updateBOMMutation.isPending ? 'Updating...' : 'Update BOM'}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </TabsContent>

                      <TabsContent value="revisions" className="space-y-6 mt-6">

                        <div className="space-y-3">
                      <h3 className="font-semibold text-lg">Revisions</h3>
                      {selectedBom.revisions && selectedBom.revisions.length > 0 ? (
                        <div className="space-y-2">
                          {selectedBom.revisions.map((rev: any) => (
                            <div key={rev.id}>
                              <div 
                                className={cn(
                                  "flex items-center justify-between p-3 border rounded-md cursor-pointer transition-colors",
                                  selectedRevisionId === rev.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                                )}
                                onClick={() => setSelectedRevisionId(rev.id)}
                                data-testid={`revision-${rev.id}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{rev.revCode}</span>
                                    <Badge variant={rev.isReleased ? 'default' : 'secondary'}>
                                      {rev.isReleased ? 'Released' : 'Draft'}
                                    </Badge>
                                  </div>
                                  {rev.notes && <p className="text-sm text-muted-foreground mt-1">{rev.notes}</p>}
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>

                              {/* Show Line Items when revision is selected */}
                              {selectedRevisionId === rev.id && revisionData && (
                                <div className="mt-3 ml-4 p-4 border rounded-md bg-background">
                                  <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-semibold">Line Items</h4>
                                    <div className="flex items-center gap-2">
                                      {!rev.isReleased && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => releaseRevisionMutation.mutate(rev.id)}
                                          disabled={releaseRevisionMutation.isPending}
                                          data-testid="button-release-revision"
                                        >
                                          <CheckCircle2 className="mr-2 h-4 w-4" />
                                          {releaseRevisionMutation.isPending ? 'Releasing...' : 'Release Revision'}
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          const newLine = {
                                            childPartAgNumber: '',
                                            quantityPer: 1,
                                            scrapPercent: 0,
                                            referenceDesignator: '',
                                            operationSequence: (editingLines.length + 1) * 10,
                                          };
                                          setEditingLines([...editingLines, newLine]);
                                        }}
                                        data-testid="button-add-line"
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Line
                                      </Button>
                                    </div>
                                  </div>

                                  {editingLines.length > 0 ? (
                                    <div className="space-y-4">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Child Part</TableHead>
                                            <TableHead>Qty Per</TableHead>
                                            <TableHead>Scrap %</TableHead>
                                            <TableHead>UOM</TableHead>
                                            <TableHead>Ref Des</TableHead>
                                            <TableHead>Op Seq</TableHead>
                                            <TableHead></TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {editingLines.map((line, index) => {
                                            const lineSearch = editLinePartSearch[index] || '';
                                            const filteredParts = lineSearch.trim() === '' 
                                              ? parts 
                                              : parts.filter((part: any) => {
                                                  const search = lineSearch.toLowerCase();
                                                  return (
                                                    part.agPartNumber?.toLowerCase().includes(search) ||
                                                    part.name?.toLowerCase().includes(search) ||
                                                    part.sku?.toLowerCase().includes(search)
                                                  );
                                                });
                                            
                                            return (
                                            <TableRow key={index}>
                                              <TableCell className="min-w-[250px]">
                                                <Popover 
                                                  open={editLinePopoverOpen[index] || false} 
                                                  onOpenChange={(open) => {
                                                    setEditLinePopoverOpen({...editLinePopoverOpen, [index]: open});
                                                  }}
                                                >
                                                  <PopoverTrigger asChild>
                                                    <Button
                                                      variant="outline"
                                                      role="combobox"
                                                      className={cn(
                                                        "w-full justify-between",
                                                        !line.childPartAgNumber && "text-muted-foreground"
                                                      )}
                                                      data-testid={`button-select-child-part-${index}`}
                                                    >
                                                      {line.childPartAgNumber
                                                        ? `${line.childPartAgNumber} - ${parts.find((p: any) => p.agPartNumber === line.childPartAgNumber)?.name || ''}`
                                                        : "Select part..."}
                                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                  </PopoverTrigger>
                                                  <PopoverContent className="w-[400px] p-0">
                                                    <Command>
                                                      <CommandInput 
                                                        placeholder="Search parts..." 
                                                        value={lineSearch}
                                                        onValueChange={(value) => {
                                                          setEditLinePartSearch({...editLinePartSearch, [index]: value});
                                                        }}
                                                      />
                                                      <CommandList>
                                                        <CommandEmpty>No parts found.</CommandEmpty>
                                                        <CommandGroup>
                                                          {filteredParts.slice(0, 50).map((part: any) => (
                                                            <CommandItem
                                                              key={part.agPartNumber}
                                                              value={part.agPartNumber}
                                                              onSelect={() => {
                                                                const newLines = [...editingLines];
                                                                newLines[index].childPartAgNumber = part.agPartNumber;
                                                                setEditingLines(newLines);
                                                                setEditLinePopoverOpen({...editLinePopoverOpen, [index]: false});
                                                                setEditLinePartSearch({...editLinePartSearch, [index]: ''});
                                                              }}
                                                            >
                                                              <Check
                                                                className={cn(
                                                                  "mr-2 h-4 w-4",
                                                                  line.childPartAgNumber === part.agPartNumber
                                                                    ? "opacity-100"
                                                                    : "opacity-0"
                                                                )}
                                                              />
                                                              {part.agPartNumber} - {part.name}
                                                            </CommandItem>
                                                          ))}
                                                        </CommandGroup>
                                                      </CommandList>
                                                    </Command>
                                                  </PopoverContent>
                                                </Popover>
                                              </TableCell>
                                              <TableCell>
                                                <Input
                                                  type="number"
                                                  value={line.quantityPer}
                                                  onChange={(e) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].quantityPer = parseFloat(e.target.value) || 0;
                                                    setEditingLines(newLines);
                                                  }}
                                                  className="w-20"
                                                  data-testid={`input-quantity-${index}`}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <Input
                                                  type="number"
                                                  value={line.scrapPercent}
                                                  onChange={(e) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].scrapPercent = parseFloat(e.target.value) || 0;
                                                    setEditingLines(newLines);
                                                  }}
                                                  className="w-20"
                                                  data-testid={`input-scrap-${index}`}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                {parts.find((p: any) => p.agPartNumber === line.childPartAgNumber)?.usageUnit || 'EA'}
                                              </TableCell>
                                              <TableCell>
                                                <Input
                                                  value={line.referenceDesignator || ''}
                                                  onChange={(e) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].referenceDesignator = e.target.value;
                                                    setEditingLines(newLines);
                                                  }}
                                                  className="w-24"
                                                  data-testid={`input-refdes-${index}`}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <Input
                                                  type="number"
                                                  value={line.operationSequence ?? ''}
                                                  onChange={(e) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].operationSequence = e.target.value ? parseInt(e.target.value) : undefined;
                                                    setEditingLines(newLines);
                                                  }}
                                                  className="w-20"
                                                  data-testid={`input-opseq-${index}`}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    setEditingLines(editingLines.filter((_, i) => i !== index));
                                                  }}
                                                  data-testid={`button-delete-line-${index}`}
                                                >
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                          })}
                                        </TableBody>
                                      </Table>

                                      <div className="flex justify-end gap-2">
                                        <Button
                                          variant="outline"
                                          onClick={() => {
                                            // Reset to original lines from server
                                            const revision = revisionData as any;
                                            if (revision && revision.lines) {
                                              setEditingLines(revision.lines.map((line: any) => ({
                                                id: line.id,
                                                childPartAgNumber: line.childPartAgNumber,
                                                quantityPer: line.qtyPer,
                                                scrapPercent: line.scrapPercent || 0,
                                                referenceDesignator: line.referenceDesignator || '',
                                                operationSequence: line.operationSeq,
                                              })));
                                            }
                                          }}
                                        >
                                          Reset
                                        </Button>
                                        <Button
                                          onClick={() => {
                                            updateLinesMutation.mutate({
                                              revisionId: rev.id,
                                              lines: editingLines.map(line => ({
                                                childPartAgNumber: line.childPartAgNumber,
                                                qtyPer: line.quantityPer,
                                                scrapPct: line.scrapPercent,
                                                reference: line.referenceDesignator,
                                                operationSeq: line.operationSequence,
                                              }))
                                            });
                                          }}
                                          disabled={updateLinesMutation.isPending}
                                          data-testid="button-save-lines"
                                        >
                                          <Save className="mr-2 h-4 w-4" />
                                          {updateLinesMutation.isPending ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                      No line items yet. Click "Add Line" to add components.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No revisions yet</p>
                      )}
                    </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            {/* BOM Explosion Dialog */}
            <Dialog open={isExplosionDialogOpen} onOpenChange={(open) => {
              setIsExplosionDialogOpen(open);
              if (!open) {
                setExplosionBom(null);
                setExpandedNodes(new Set());
              }
            }}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>BOM Explosion - {explosionBom?.code}</DialogTitle>
                  <DialogDescription>
                    Hierarchical view of all components and sub-assemblies
                  </DialogDescription>
                </DialogHeader>
                
                {isTreeLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading BOM tree...
                  </div>
                ) : bomTreeData ? (
                  <div className="space-y-4">
                    {/* Cost Summary Card */}
                    {(bomTreeData as any)?.totalCost !== undefined && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">Total Assembly Cost</h3>
                            <p className="text-sm text-muted-foreground">
                              Rolled-up cost including all components and scrap
                            </p>
                          </div>
                          <div className="text-2xl font-bold text-primary">
                            {new Intl.NumberFormat('en-US', { 
                              style: 'currency', 
                              currency: 'USD',
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2 
                            }).format((bomTreeData as any).totalCost || 0)}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Parent assembly header */}
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="font-semibold text-lg">
                        {explosionBom?.parentInventoryItem?.agPartNumber} - {explosionBom?.parentInventoryItem?.name}
                      </div>
                      <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                        <span className="min-w-[80px] text-right">Unit Cost</span>
                        <span className="min-w-[90px] text-right">Extended</span>
                      </div>
                    </div>
                    
                    {/* Tree display */}
                    {(bomTreeData as any)?.children && (bomTreeData as any).children.length > 0 ? (
                      <div className="space-y-1">
                        {(bomTreeData as any).children.map((child: any, index: number) => (
                          <TreeNode 
                            key={index} 
                            node={child} 
                            level={0}
                            expandedNodes={expandedNodes}
                            onToggleExpand={(nodeId: string) => {
                              const newExpanded = new Set(expandedNodes);
                              if (newExpanded.has(nodeId)) {
                                newExpanded.delete(nodeId);
                              } else {
                                newExpanded.add(nodeId);
                              }
                              setExpandedNodes(newExpanded);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No components in this BOM
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Unable to load BOM tree
                  </p>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading BOMs...</div>
        ) : boms.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-boms">
            No BOMs found. Click "Add BOM" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Parent Part</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Revisions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boms.map((bom: any) => (
                <TableRow key={bom.id} data-testid={`row-bom-${bom.id}`}>
                  <TableCell className="font-medium">{bom.code}</TableCell>
                  <TableCell>
                    {bom.parentInventoryItem ? `${bom.parentInventoryItem.agPartNumber} - ${bom.parentInventoryItem.name}` : 'N/A'}
                  </TableCell>
                  <TableCell>{bom.description || '-'}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={bom.isActive ? "default" : "secondary"}
                      data-testid={`badge-bom-status-${bom.id}`}
                    >
                      {bom.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {bom.revisions?.length || 0} revision(s)
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setExplosionBom(bom);
                          setIsExplosionDialogOpen(true);
                          setExpandedNodes(new Set()); // Reset expanded nodes
                        }}
                        data-testid={`button-explode-bom-${bom.id}`}
                        title="Explode BOM"
                        disabled={!bom.revisions || bom.revisions.length === 0}
                      >
                        <Package className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedBom(bom);
                          setEditSheetTab('metadata');
                          setIsViewDrawerOpen(true);
                          // Auto-select first revision if available
                          if (bom.revisions && bom.revisions.length > 0) {
                            setSelectedRevisionId(bom.revisions[0].id);
                          }
                        }}
                        data-testid={`button-edit-bom-${bom.id}`}
                        title="Edit BOM"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this BOM and all its revisions?')) {
                            deleteBOMMutation.mutate(bom.id);
                          }
                        }}
                        data-testid={`button-delete-bom-${bom.id}`}
                        title="Delete BOM"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    <P2POBOMsSection />
    </>
  );
}

function P2POBOMsSection() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBom, setSelectedBom] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const { data: p2PoBoms, isLoading } = useQuery({
    queryKey: ['/api/robust-boms/p2-po-boms', { search: searchTerm }],
    queryFn: () => apiRequest(`/api/robust-boms/p2-po-boms?search=${encodeURIComponent(searchTerm)}`),
  });

  const { data: bomDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['/api/robust-boms/p2-po-boms', selectedBom?.id],
    queryFn: () => apiRequest(`/api/robust-boms/p2-po-boms/${selectedBom?.id}`),
    enabled: !!selectedBom?.id && isViewOpen,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>P2 Purchase Order BOMs</CardTitle>
            <CardDescription>BOMs created through the P2 BOM Wizard for purchase order parts</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search P2 PO BOMs..."
              className="pl-8 w-[300px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading P2 PO BOMs...</div>
        ) : !p2PoBoms || p2PoBoms.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No P2 PO BOMs found. BOMs created through the P2 Control Center BOM Wizard will appear here.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part Number / SKU</TableHead>
                <TableHead>Model Name</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p2PoBoms.map((bom: any) => (
                <TableRow key={bom.id}>
                  <TableCell className="font-medium">{bom.sku || '-'}</TableCell>
                  <TableCell>{bom.modelName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{bom.revision}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] truncate">{bom.description || '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {bom.createdAt ? new Date(bom.createdAt).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedBom(bom);
                        setIsViewOpen(true);
                      }}
                      title="View BOM details"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Sheet open={isViewOpen} onOpenChange={(open) => {
          setIsViewOpen(open);
          if (!open) setSelectedBom(null);
        }}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>P2 PO BOM Details</SheetTitle>
              <SheetDescription>
                {selectedBom?.sku} - {selectedBom?.modelName}
              </SheetDescription>
            </SheetHeader>
            {isDetailLoading ? (
              <div className="mt-6 text-center text-muted-foreground">Loading...</div>
            ) : bomDetail ? (
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Part Number</label>
                    <p className="font-medium">{bomDetail.sku || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Model Name</label>
                    <p className="font-medium">{bomDetail.modelName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Revision</label>
                    <p>{bomDetail.revision}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <p>{bomDetail.description || '-'}</p>
                  </div>
                </div>

                {bomDetail.linkedPurchaseOrders && bomDetail.linkedPurchaseOrders.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Linked Purchase Orders</h4>
                    <div className="flex flex-wrap gap-2">
                      {bomDetail.linkedPurchaseOrders.map((po: any, idx: number) => (
                        <Badge key={idx} variant="secondary">
                          PO #{po.poNumber}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold mb-2">BOM Items ({bomDetail.items?.length || 0})</h4>
                  {bomDetail.items && bomDetail.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>First Dept</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bomDetail.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.partName}</TableCell>
                            <TableCell>
                              <Badge variant={item.itemType === 'manufactured' ? 'default' : 'outline'}>
                                {item.itemType}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{item.firstDept}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                              {item.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No items configured yet</p>
                  )}
                </div>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}

// Revisions Tab Component  
function RevisionsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>BOM Revisions</CardTitle>
        <CardDescription>
          Manage BOM revisions, lines, and view explosions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Revision management coming soon</p>
          <p className="text-sm mt-2">
            This will include revision creation, line management, release control, and BOM explosion views
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Tree Node Component for BOM Explosion
interface TreeNodeProps {
  node: any;
  level: number;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
}

function TreeNode({ node, level, expandedNodes, onToggleExpand }: TreeNodeProps) {
  const nodeId = `${node.partId || node.sku}-${level}`;
  const isExpanded = expandedNodes.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;
  const indentWidth = level * 24; // 24px per level

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(value);
  };

  return (
    <div>
      <div 
        className={cn(
          "flex items-center gap-3 p-2 rounded hover:bg-muted/50",
          node.type === 'assembly' && "font-medium"
        )}
        style={{ paddingLeft: `${indentWidth + 8}px` }}
      >
        <div 
          className="cursor-pointer flex items-center gap-2 flex-1"
          onClick={() => hasChildren && onToggleExpand(nodeId)}
        >
          {hasChildren ? (
            <div className="w-4 h-4 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
          ) : (
            <div className="w-4 h-4" />
          )}
          
          <Badge variant={node.type === 'assembly' ? 'default' : 'outline'} className="shrink-0">
            {node.type === 'assembly' ? 'Assembly' : 'Component'}
          </Badge>
          
          <span className="flex-1">
            {node.sku} - {node.name}
          </span>
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground min-w-[60px]">
            Qty: {node.qtyPer}
          </span>
          
          {node.scrapPct > 0 && (
            <span className="text-muted-foreground min-w-[70px]">
              Scrap: {node.scrapPct}%
            </span>
          )}
          
          <span className="text-xs text-muted-foreground min-w-[40px]">
            {node.uom}
          </span>
          
          <span className="text-muted-foreground min-w-[80px] text-right">
            {formatCurrency(node.unitCost || 0)}
          </span>
          
          <span className="font-medium min-w-[90px] text-right">
            {formatCurrency(node.extendedCost || 0)}
          </span>
        </div>
      </div>
      
      {/* Render children recursively */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child: any, index: number) => (
            <TreeNode
              key={`${child.partId || child.sku}-${index}`}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Stock BOMs Tab Component (for Stock Model BOMs with optional items and labor)
function StockBOMsTab() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState<any>({
    step1: null, // BOM metadata (modelName, SKU, revision, description)
    step2: [], // BOM items (materials and labor)
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [bomItems, setBomItems] = useState<any[]>([]); // For Step 2

  // Fetch stock BOMs with harmonized query key
  const { data: stockBoms, isLoading } = useQuery({
    queryKey: ['/api/robust-boms/stock-boms', { search: searchTerm }],
    queryFn: () => apiRequest(`/api/robust-boms/stock-boms?search=${encodeURIComponent(searchTerm)}`),
  });

  const createBomMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/robust-boms/stock-boms', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/stock-boms'] });
      toast({ title: 'Success', description: 'Stock BOM created successfully' });
      setIsWizardOpen(false);
      setWizardStep(1);
      setWizardData({ step1: null, step2: [] });
      setBomItems([]);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create stock BOM', variant: 'destructive' });
    },
  });

  const updateBomMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/robust-boms/stock-boms/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/stock-boms'] });
      toast({ title: 'Success', description: 'Stock BOM updated successfully' });
      setIsEditDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update stock BOM', variant: 'destructive' });
    },
  });

  const deleteBomMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/robust-boms/stock-boms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/stock-boms'] });
      toast({ title: 'Success', description: 'Stock BOM deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete stock BOM', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search stock BOMs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
            data-testid="input-search-stock-boms"
          />
        </div>
        <Button onClick={() => setIsWizardOpen(true)} data-testid="button-create-stock-bom">
          <Plus className="h-4 w-4 mr-2" />
          New Stock BOM
        </Button>
      </div>

      {/* Stock BOMs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock BOMs</CardTitle>
          <CardDescription>
            Bill of Materials for stock models with optional components and labor tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !stockBoms || stockBoms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No stock BOMs found. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockBoms.map((bom: any) => (
                  <TableRow key={bom.id}>
                    <TableCell className="font-medium">{bom.modelName}</TableCell>
                    <TableCell>{bom.sku || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{bom.revision}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{bom.description || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBom(bom);
                            setIsViewDialogOpen(true);
                          }}
                          data-testid={`button-view-${bom.id}`}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBom(bom);
                            setIsEditDialogOpen(true);
                          }}
                          data-testid={`button-edit-${bom.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this stock BOM?')) {
                              deleteBomMutation.mutate(bom.id);
                            }
                          }}
                          disabled={deleteBomMutation.isPending}
                          data-testid={`button-delete-${bom.id}`}
                        >
                          {deleteBomMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Stock BOM Wizard */}
      <CreateStockBOMWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        wizardData={wizardData}
        setWizardData={setWizardData}
        bomItems={bomItems}
        setBomItems={setBomItems}
        onComplete={(data) => createBomMutation.mutate(data)}
        isPending={createBomMutation.isPending}
      />

      {/* Edit Stock BOM Dialog */}
      {selectedBom && (
        <EditStockBOMDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          bom={selectedBom}
          onSubmit={(data) => updateBomMutation.mutate({ id: selectedBom.id, data })}
          isPending={updateBomMutation.isPending}
        />
      )}

      {/* View Stock BOM Dialog */}
      {selectedBom && (
        <ViewStockBOMDialog
          open={isViewDialogOpen}
          onOpenChange={setIsViewDialogOpen}
          bomId={selectedBom.id}
        />
      )}
    </div>
  );
}

// Create Stock BOM Wizard
function CreateStockBOMWizard({
  open,
  onOpenChange,
  wizardStep,
  setWizardStep,
  wizardData,
  setWizardData,
  bomItems,
  setBomItems,
  onComplete,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  wizardData: any;
  setWizardData: (data: any) => void;
  bomItems: any[];
  setBomItems: (items: any[]) => void;
  onComplete: (data: any) => void;
  isPending: boolean;
}) {
  const [itemType, setItemType] = useState<'material' | 'labor'>('material');
  const { toast } = useToast();
  const [partSearchOpen, setPartSearchOpen] = useState(false);
  const [partSearchValue, setPartSearchValue] = useState('');

  // Fetch inventory items for part selection
  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory/items'],
  });

  // Step 1: Basic Info Form
  const basicInfoForm = useForm({
    resolver: zodResolver(
      z.object({
        modelName: z.string().min(1, 'Model name is required'),
        sku: z.string().optional(),
        revision: z.string().default('A'),
        description: z.string().optional(),
      })
    ),
    defaultValues: wizardData.step1 || {
      modelName: '',
      sku: '',
      revision: 'A',
      description: '',
    },
  });

  // Step 2: Add Item Form
  const itemForm = useForm({
    resolver: zodResolver(
      z.object({
        partName: z.string().min(1, 'Part name is required'),
        quantity: z.number().min(0.001, 'Quantity must be greater than 0'),
        itemType: z.enum(['material', 'labor']),
        isOptional: z.boolean().default(false),
        laborHours: z.number().min(0).optional().nullable(),
        hourlyRate: z.number().min(0).optional().nullable(),
      })
    ),
    defaultValues: {
      partName: '',
      quantity: 1,
      itemType: 'material' as const,
      isOptional: false,
      laborHours: null,
      hourlyRate: null,
    },
  });

  const handleStep1Next = (data: any) => {
    setWizardData({ ...wizardData, step1: data });
    setWizardStep(2);
  };

  const handleAddItem = (data: any) => {
    setBomItems([...bomItems, data]);
    itemForm.reset({
      partName: '',
      quantity: 1,
      itemType: 'material' as const,
      isOptional: false,
      laborHours: null,
      hourlyRate: null,
    });
    toast({ title: 'Success', description: 'Item added to BOM' });
  };

  const handleRemoveItem = (index: number) => {
    setBomItems(bomItems.filter((_, i) => i !== index));
  };

  const handleComplete = () => {
    if (bomItems.length === 0) {
      toast({ 
        title: 'Error', 
        description: 'Please add at least one item to the BOM', 
        variant: 'destructive' 
      });
      return;
    }

    // Combine step1 data with items
    const completeData = {
      ...wizardData.step1,
      items: bomItems,
    };
    onComplete(completeData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Stock BOM - Step {wizardStep} of 2</DialogTitle>
          <DialogDescription>
            {wizardStep === 1 && 'Enter basic information for your stock BOM'}
            {wizardStep === 2 && 'Add materials and labor items to your BOM'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Basic Info */}
        {wizardStep === 1 && (
          <Form {...basicInfoForm}>
            <form onSubmit={basicInfoForm.handleSubmit(handleStep1Next)} className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Define your stock BOM.</strong> Enter the model name, SKU, and revision information. 
                  This will create a template for tracking materials and labor costs for stock items.
                </p>
              </div>

              <FormField
                control={basicInfoForm.control}
                name="modelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="AR-15 Carbon Fiber Stock" {...field} data-testid="input-model-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={basicInfoForm.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="AR15-CF-KIT" {...field} data-testid="input-sku" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={basicInfoForm.control}
                name="revision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Revision</FormLabel>
                    <FormControl>
                      <Input placeholder="A" {...field} data-testid="input-revision" />
                    </FormControl>
                    <FormDescription>Revision code (e.g., A, B, Rev 1)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={basicInfoForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Complete kit with all materials and labor" {...field} data-testid="input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" data-testid="button-next">
                  Next Step
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {/* Step 2: Add Items */}
        {wizardStep === 2 && (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Add parts and labor to your BOM.</strong> Select parts from your inventory or add custom labor operations. 
                For labor items, specify hours and hourly rate.
              </p>
            </div>

            {/* Add Item Form */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Add Item</h4>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={itemType === 'material' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setItemType('material');
                      (itemForm.setValue as any)('itemType', 'material');
                    }}
                    data-testid="button-type-part"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Part
                  </Button>
                  <Button
                    type="button"
                    variant={itemType === 'labor' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setItemType('labor');
                      (itemForm.setValue as any)('itemType', 'labor');
                    }}
                    data-testid="button-type-labor"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    Labor
                  </Button>
                </div>
              </div>

              <Form {...itemForm}>
                <form onSubmit={itemForm.handleSubmit(handleAddItem)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {itemType === 'material' ? (
                      <FormField
                        control={itemForm.control}
                        name="partName"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Inventory Part *</FormLabel>
                            <Popover open={partSearchOpen} onOpenChange={setPartSearchOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "w-full justify-between",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-select-part"
                                  >
                                    {field.value || "Select inventory part..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0">
                                <Command>
                                  <CommandInput 
                                    placeholder="Search parts..." 
                                    value={partSearchValue}
                                    onValueChange={setPartSearchValue}
                                  />
                                  <CommandList>
                                    <CommandEmpty>No parts found.</CommandEmpty>
                                    <CommandGroup>
                                      {inventoryItems
                                        .filter((item: any) => {
                                          if (!partSearchValue) return true;
                                          const search = partSearchValue.toLowerCase();
                                          return (
                                            item.agPartNumber?.toLowerCase().includes(search) ||
                                            item.name?.toLowerCase().includes(search) ||
                                            item.sku?.toLowerCase().includes(search)
                                          );
                                        })
                                        .slice(0, 50)
                                        .map((item: any) => (
                                          <CommandItem
                                            key={item.id}
                                            value={`${item.agPartNumber} - ${item.name}`}
                                            onSelect={() => {
                                              field.onChange(`${item.agPartNumber} - ${item.name}`);
                                              setPartSearchOpen(false);
                                              setPartSearchValue('');
                                            }}
                                            data-testid={`option-part-${item.id}`}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                field.value === `${item.agPartNumber} - ${item.name}` ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            <div className="flex flex-col">
                                              <span className="font-medium">{item.agPartNumber}</span>
                                              <span className="text-sm text-muted-foreground">{item.name}</span>
                                            </div>
                                          </CommandItem>
                                        ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={itemForm.control}
                        name="partName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operation Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Layup Labor" {...field} data-testid="input-part-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={itemForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.001"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              data-testid="input-quantity"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {itemType === 'labor' && (
                      <>
                        <FormField
                          control={itemForm.control}
                          name="laborHours"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Labor Hours *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.25"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                  value={field.value || ''}
                                  data-testid="input-labor-hours"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={itemForm.control}
                          name="hourlyRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hourly Rate ($) *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                  value={field.value || ''}
                                  data-testid="input-hourly-rate"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <FormField
                      control={itemForm.control}
                      name="isOptional"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-optional"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Optional Item</FormLabel>
                            <FormDescription>
                              Mark if this item is not always required
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" className="w-full" data-testid="button-add-item">
                    <Plus className="mr-2 h-4 w-4" />
                    Add {itemType === 'labor' ? 'Labor' : 'Part'}
                  </Button>
                </form>
              </Form>
            </div>

            {/* Items List */}
            <div>
              <h4 className="font-semibold mb-2">
                BOM Items ({bomItems.length})
              </h4>
              {bomItems.length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No items added yet. Add at least one item to complete the BOM.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Labor Hours</TableHead>
                        <TableHead>Hourly Rate</TableHead>
                        <TableHead>Optional</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bomItems.map((item, index) => (
                        <TableRow key={index} data-testid={`row-item-${index}`}>
                          <TableCell>
                            <Badge variant={item.itemType === 'labor' ? 'secondary' : 'outline'}>
                              {item.itemType === 'labor' ? '⚙️ Labor' : '📦 Part'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{item.partName}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.laborHours || '-'}</TableCell>
                          <TableCell>{item.hourlyRate ? `$${item.hourlyRate}` : '-'}</TableCell>
                          <TableCell>
                            {item.isOptional ? <Badge variant="outline">Optional</Badge> : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(index)}
                              data-testid={`button-remove-item-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWizardStep(1)} data-testid="button-back">
                Back
              </Button>
              <Button
                type="button"
                onClick={handleComplete}
                disabled={isPending || bomItems.length === 0}
                data-testid="button-complete"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? 'Creating...' : 'Create Stock BOM'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Edit Stock BOM Dialog (with item management)
function EditStockBOMDialog({
  open,
  onOpenChange,
  bom,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bom: any;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [itemType, setItemType] = useState<'material' | 'labor'>('material');
  const [partSearchOpen, setPartSearchOpen] = useState(false);
  const [partSearchValue, setPartSearchValue] = useState('');
  const [editingItems, setEditingItems] = useState<any[]>([]);

  // Fetch inventory items for part selection
  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory/items'],
  });

  // Fetch BOM details with items when dialog opens
  const { data: bomDetails } = useQuery({
    queryKey: ['/api/robust-boms/stock-boms', bom.id],
    queryFn: () => apiRequest(`/api/robust-boms/stock-boms/${bom.id}`),
    enabled: open && !!bom.id,
  });

  // Initialize editing items when bomDetails loads
  useEffect(() => {
    if (bomDetails?.items) {
      setEditingItems(bomDetails.items.map((item: any) => ({ ...item, isExisting: true })));
    }
  }, [bomDetails]);

  const metadataForm = useForm({
    resolver: zodResolver(
      z.object({
        modelName: z.string().min(1, 'Model name is required'),
        sku: z.string().optional(),
        revision: z.string().default('A'),
        description: z.string().optional(),
      })
    ),
    defaultValues: {
      modelName: bom.modelName || '',
      sku: bom.sku || '',
      revision: bom.revision || 'A',
      description: bom.description || '',
    },
  });

  const itemForm = useForm({
    resolver: zodResolver(
      z.object({
        partName: z.string().min(1, 'Part name is required'),
        quantity: z.number().min(0.001, 'Quantity must be greater than 0'),
        itemType: z.enum(['material', 'labor']),
        isOptional: z.boolean().default(false),
        laborHours: z.number().min(0).optional().nullable(),
        hourlyRate: z.number().min(0).optional().nullable(),
      })
    ),
    defaultValues: {
      partName: '',
      quantity: 1,
      itemType: 'material' as const,
      isOptional: false,
      laborHours: null,
      hourlyRate: null,
    },
  });

  const handleAddItem = (data: any) => {
    setEditingItems([...editingItems, { ...data, isExisting: false }]);
    itemForm.reset({
      partName: '',
      quantity: 1,
      itemType: 'material' as const,
      isOptional: false,
      laborHours: null,
      hourlyRate: null,
    });
    toast({ title: 'Item added', description: 'Item added to BOM' });
  };

  const handleRemoveItem = (index: number) => {
    setEditingItems(editingItems.filter((_, i) => i !== index));
  };

  const handleSaveAll = (metadataData: any) => {
    // Combine metadata and items
    const completeData = {
      ...metadataData,
      items: editingItems,
    };
    onSubmit(completeData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Stock BOM</DialogTitle>
          <DialogDescription>
            Update BOM metadata and manage parts and labor
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Metadata Section */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-lg">BOM Metadata</h3>
            <Form {...metadataForm}>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={metadataForm.control}
                  name="modelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model Name *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-model-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metadataForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-sku" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metadataForm.control}
                  name="revision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revision</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-revision" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={metadataForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-edit-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Form>
          </div>

          <Separator />

          {/* Items Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">BOM Items ({editingItems.length})</h3>
            
            {/* Add Item Form */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Add Item</h4>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={itemType === 'material' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setItemType('material');
                      (itemForm.setValue as any)('itemType', 'material');
                    }}
                    data-testid="button-type-part-edit"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Part
                  </Button>
                  <Button
                    type="button"
                    variant={itemType === 'labor' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setItemType('labor');
                      (itemForm.setValue as any)('itemType', 'labor');
                    }}
                    data-testid="button-type-labor-edit"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    Labor
                  </Button>
                </div>
              </div>

              <Form {...itemForm}>
                <form onSubmit={itemForm.handleSubmit(handleAddItem)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {itemType === 'material' ? (
                      <FormField
                        control={itemForm.control}
                        name="partName"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Inventory Part *</FormLabel>
                            <Popover open={partSearchOpen} onOpenChange={setPartSearchOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "w-full justify-between",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-select-part-edit"
                                  >
                                    {field.value || "Select inventory part..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0">
                                <Command>
                                  <CommandInput 
                                    placeholder="Search parts..." 
                                    value={partSearchValue}
                                    onValueChange={setPartSearchValue}
                                  />
                                  <CommandList>
                                    <CommandEmpty>No parts found.</CommandEmpty>
                                    <CommandGroup>
                                      {inventoryItems
                                        .filter((item: any) => {
                                          if (!partSearchValue) return true;
                                          const search = partSearchValue.toLowerCase();
                                          return (
                                            item.agPartNumber?.toLowerCase().includes(search) ||
                                            item.name?.toLowerCase().includes(search) ||
                                            item.sku?.toLowerCase().includes(search)
                                          );
                                        })
                                        .slice(0, 50)
                                        .map((item: any) => (
                                          <CommandItem
                                            key={item.id}
                                            value={`${item.agPartNumber} - ${item.name}`}
                                            onSelect={() => {
                                              field.onChange(`${item.agPartNumber} - ${item.name}`);
                                              setPartSearchOpen(false);
                                              setPartSearchValue('');
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                field.value === `${item.agPartNumber} - ${item.name}` ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            <div className="flex flex-col">
                                              <span className="font-medium">{item.agPartNumber}</span>
                                              <span className="text-sm text-muted-foreground">{item.name}</span>
                                            </div>
                                          </CommandItem>
                                        ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={itemForm.control}
                        name="partName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operation Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Layup Labor" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={itemForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.001"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {itemType === 'labor' && (
                      <>
                        <FormField
                          control={itemForm.control}
                          name="laborHours"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Labor Hours *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.25"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                  value={field.value || ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={itemForm.control}
                          name="hourlyRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hourly Rate ($) *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                  value={field.value || ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <FormField
                      control={itemForm.control}
                      name="isOptional"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Optional Item</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add {itemType === 'labor' ? 'Labor' : 'Part'}
                  </Button>
                </form>
              </Form>
            </div>

            {/* Items List */}
            {editingItems.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No items in this BOM yet. Add parts or labor above.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Labor Hours</TableHead>
                      <TableHead>Hourly Rate</TableHead>
                      <TableHead>Optional</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editingItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={item.itemType === 'labor' ? 'secondary' : 'outline'}>
                            {item.itemType === 'labor' ? '⚙️ Labor' : '📦 Part'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.partName}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.laborHours || '-'}</TableCell>
                        <TableCell>{item.hourlyRate ? `$${item.hourlyRate}` : '-'}</TableCell>
                        <TableCell>
                          {item.isOptional ? <Badge variant="outline">Optional</Badge> : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button 
            onClick={metadataForm.handleSubmit(handleSaveAll)} 
            disabled={isPending}
            data-testid="button-save-all"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? 'Saving...' : 'Save All Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// View Stock BOM Dialog (shows items with optional and labor support)
function ViewStockBOMDialog({
  open,
  onOpenChange,
  bomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bomId: number;
}) {
  const { data: bomDetails } = useQuery({
    queryKey: ['/api/robust-boms/stock-boms', bomId],
    queryFn: () => apiRequest(`/api/robust-boms/stock-boms/${bomId}`),
    enabled: open,
  });

  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);

  const addItemMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest(`/api/robust-boms/stock-boms/${bomId}/items`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/stock-boms', bomId] });
      setIsAddItemDialogOpen(false);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest(`/api/robust-boms/stock-boms/${bomId}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/stock-boms', bomId] });
    },
  });

  const materials = bomDetails?.items?.filter((item: any) => item.itemType !== 'labor') || [];
  const labor = bomDetails?.items?.filter((item: any) => item.itemType === 'labor') || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bomDetails?.modelName} - Items</DialogTitle>
          <DialogDescription>
            Materials and labor for {bomDetails?.modelName} (Rev {bomDetails?.revision})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Materials Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Materials</h3>
              <Button size="sm" onClick={() => setIsAddItemDialogOpen(true)} data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No materials added yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Optional</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.partName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.itemType}</Badge>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.firstDept}</TableCell>
                      <TableCell>
                        {item.isOptional && <Badge>Optional</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this item?')) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Labor Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Labor</h3>
            {labor.length === 0 ? (
              <p className="text-sm text-muted-foreground">No labor added yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operation</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Optional</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labor.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.partName}</TableCell>
                      <TableCell>{item.firstDept}</TableCell>
                      <TableCell>{item.laborHours || 0}</TableCell>
                      <TableCell>${item.hourlyRate || 0}/hr</TableCell>
                      <TableCell className="font-medium">
                        ${((item.laborHours || 0) * (item.hourlyRate || 0)).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {item.isOptional && <Badge>Optional</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this labor item?')) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Add Item Dialog */}
        <AddStockBOMItemDialog
          open={isAddItemDialogOpen}
          onOpenChange={setIsAddItemDialogOpen}
          onSubmit={(data) => addItemMutation.mutate(data)}
          isPending={addItemMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

// Add Stock BOM Item Dialog
function AddStockBOMItemDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(
      z.object({
        partName: z.string().min(1, 'Part name is required'),
        quantity: z.number().min(1, 'Quantity must be at least 1'),
        firstDept: z.string().default('Layup'),
        itemType: z.enum(['material', 'manufactured', 'labor']),
        isOptional: z.boolean().default(false),
        laborHours: z.number().optional(),
        hourlyRate: z.number().optional(),
        notes: z.string().optional(),
      })
    ),
    defaultValues: {
      partName: '',
      quantity: 1,
      firstDept: 'Layup',
      itemType: 'material' as const,
      isOptional: false,
      laborHours: undefined,
      hourlyRate: undefined,
      notes: '',
    },
  });

  const watchItemType = form.watch('itemType');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add BOM Item</DialogTitle>
          <DialogDescription>
            Add a material or labor item to this BOM
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="itemType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-item-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="manufactured">Manufactured</SelectItem>
                      <SelectItem value="labor">Labor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="partName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{watchItemType === 'labor' ? 'Operation Name' : 'Part Name'}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={watchItemType === 'labor' ? 'Layup Labor' : 'Carbon Fiber Sheet'} 
                      {...field} 
                      data-testid="input-part-name" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      data-testid="input-quantity" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="firstDept"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-dept">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Layup">Layup</SelectItem>
                      <SelectItem value="Assembly/Disassembly">Assembly/Disassembly</SelectItem>
                      <SelectItem value="Finish">Finish</SelectItem>
                      <SelectItem value="Paint">Paint</SelectItem>
                      <SelectItem value="QC">QC</SelectItem>
                      <SelectItem value="Shipping">Shipping</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watchItemType === 'labor' && (
              <>
                <FormField
                  control={form.control}
                  name="laborHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Labor Hours</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.1" 
                          {...field} 
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          data-testid="input-labor-hours" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate ($)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          {...field} 
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          data-testid="input-hourly-rate" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            <FormField
              control={form.control}
              name="isOptional"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-is-optional"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Optional Component
                    </FormLabel>
                    <FormDescription>
                      Mark this item as optional (e.g., paint, accessories)
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} data-testid="input-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-add-item">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-add-item">
                {isPending ? 'Adding...' : 'Add Item'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
