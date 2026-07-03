import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Edit, Trash2, FileText, ChevronRight, Check, ChevronsUpDown, Copy, Save, X, ChevronDown, Package, CheckCircle2, Power, Loader2, FileEdit } from 'lucide-react';
import { MANUFACTURED_CATEGORY_ORDER, CATEGORY_DISPLAY_NAMES } from '@/lib/inventoryConstants';
import type { ManufacturedCategory } from '@shared/schema';
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
  const [selectedTab, setSelectedTab] = useState<string>(MANUFACTURED_CATEGORY_ORDER[0]);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="robust-bom-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Robust BOM
          </h1>
          <p className="text-muted-foreground mt-2">
            Create and manage BOMs and routing for manufactured parts, organized by category
          </p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          {MANUFACTURED_CATEGORY_ORDER.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              data-testid={`tab-${cat.toLowerCase().replace(/_/g, '-')}`}
            >
              {CATEGORY_DISPLAY_NAMES[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        {MANUFACTURED_CATEGORY_ORDER.map((cat) => (
          <TabsContent key={cat} value={cat} className="space-y-4">
            <CategoryBOMTab category={cat} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// Category BOM Tab — renders BOM management filtered to a specific manufactured part category
function CategoryBOMTab({ category }: { category: ManufacturedCategory }) {
  const [searchTerm, setSearchTerm] = useState('');
  return <BOMsTab searchTerm={searchTerm} setSearchTerm={setSearchTerm} category={category} />;
}

// BOMs Tab Component
function BOMsTab({ searchTerm, setSearchTerm, category }: { searchTerm: string; setSearchTerm: (s: string) => void; category?: ManufacturedCategory }) {
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

  // Debounced search for child part picker (wizard Step 3)
  const [debouncedLinePartSearch, setDebouncedLinePartSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLinePartSearch(linePartSearch), 300);
    return () => clearTimeout(timer);
  }, [linePartSearch]);

  const linePartsQueryUrl = `/api/robust-boms/parts?${debouncedLinePartSearch ? `search=${encodeURIComponent(debouncedLinePartSearch)}&` : ''}pageSize=50000`;
  const { data: linePartsData, isFetching: isLinePartsFetching } = useQuery({
    queryKey: [linePartsQueryUrl],
    enabled: isLinePartPopoverOpen,
  });
  const linePartsResults = (linePartsData as any)?.data || [];

  // Debounced search for inline-edit child part picker (BOM revision edit table)
  // Track active row index to avoid cross-row coupling and only fetch when a popover is open
  const [activeEditRowIndex, setActiveEditRowIndex] = useState<number | null>(null);
  const [debouncedEditLineSearch, setDebouncedEditLineSearch] = useState('');
  const activeEditRowSearch = activeEditRowIndex !== null ? (editLinePartSearch[activeEditRowIndex] || '') : '';
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEditLineSearch(activeEditRowSearch), 300);
    return () => clearTimeout(timer);
  }, [activeEditRowSearch]);

  const isAnyEditPopoverOpen = Object.values(editLinePopoverOpen).some(Boolean);
  const editLinePartsQueryUrl = `/api/robust-boms/parts?${debouncedEditLineSearch ? `search=${encodeURIComponent(debouncedEditLineSearch)}&` : ''}pageSize=50000`;
  const { data: editLinePartsData, isFetching: isEditLinePartsFetching } = useQuery({
    queryKey: [editLinePartsQueryUrl],
    enabled: isAnyEditPopoverOpen,
  });
  const editLinePartsResults = (editLinePartsData as any)?.data || [];

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

  const allBoms = (bomsData as any)?.data || [];
  const allParts = (partsData as any)?.data || [];

  // When a category is provided, filter BOMs and parts to that manufactured category
  const boms = category
    ? allBoms.filter((bom: any) => bom.parentInventoryItem?.manufacturedCategory === category)
    : allBoms;

  // Parts filtered by category for the parent part picker (Step 1 of wizard)
  const categoryParts = category
    ? allParts.filter((part: any) => part.manufacturedCategory === category)
    : allParts;

  // All parts available as child parts (BOM lines can reference any part)
  const parts = allParts;
  
  // Filter category parts based on search (for Step 1 parent part)
  const filteredParts = partSearch.trim() === '' 
    ? categoryParts 
    : categoryParts.filter((part: any) => {
        const search = partSearch.toLowerCase();
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
                                            ? (() => {
                                                const found = linePartsResults.find((p: any) => p.agPartNumber === field.value) || parts.find((p: any) => p.agPartNumber === field.value);
                                                return found ? `${found.agPartNumber} - ${found.name}` : field.value;
                                              })()
                                            : "Select child part"}
                                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0">
                                      <Command shouldFilter={false}>
                                        <CommandInput 
                                          placeholder="Search parts..." 
                                          value={linePartSearch}
                                          onValueChange={setLinePartSearch}
                                        />
                                        <CommandList>
                                          {isLinePartsFetching && (
                                            <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                              Loading...
                                            </div>
                                          )}
                                          {!isLinePartsFetching && <CommandEmpty>No parts found.</CommandEmpty>}
                                          <CommandGroup>
                                            {linePartsResults.map((part: any) => (
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
                                            
                                            return (
                                            <TableRow key={index}>
                                              <TableCell className="min-w-[250px]">
                                                <Popover 
                                                  open={editLinePopoverOpen[index] || false} 
                                                  onOpenChange={(open) => {
                                                    setEditLinePopoverOpen({...editLinePopoverOpen, [index]: open});
                                                    if (open) {
                                                      setActiveEditRowIndex(index);
                                                    } else {
                                                      setEditLinePartSearch({...editLinePartSearch, [index]: ''});
                                                      setActiveEditRowIndex(null);
                                                    }
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
                                                        ? (() => {
                                                            const found = editLinePartsResults.find((p: any) => p.agPartNumber === line.childPartAgNumber) || parts.find((p: any) => p.agPartNumber === line.childPartAgNumber);
                                                            return found ? `${found.agPartNumber} - ${found.name}` : line.childPartAgNumber;
                                                          })()
                                                        : "Select part..."}
                                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                  </PopoverTrigger>
                                                  <PopoverContent className="w-[400px] p-0">
                                                    <Command shouldFilter={false}>
                                                      <CommandInput 
                                                        placeholder="Search parts..." 
                                                        value={lineSearch}
                                                        onValueChange={(value) => {
                                                          setEditLinePartSearch({...editLinePartSearch, [index]: value});
                                                          setActiveEditRowIndex(index);
                                                        }}
                                                      />
                                                      <CommandList>
                                                        {isEditLinePartsFetching && (
                                                          <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Loading...
                                                          </div>
                                                        )}
                                                        {!isEditLinePartsFetching && <CommandEmpty>No parts found.</CommandEmpty>}
                                                        <CommandGroup>
                                                          {editLinePartsResults.map((part: any) => (
                                                            <CommandItem
                                                              key={part.agPartNumber}
                                                              value={part.agPartNumber}
                                                              onSelect={() => {
                                                                const newLines = [...editingLines];
                                                                newLines[index].childPartAgNumber = part.agPartNumber;
                                                                setEditingLines(newLines);
                                                                setEditLinePopoverOpen({...editLinePopoverOpen, [index]: false});
                                                                setEditLinePartSearch({...editLinePartSearch, [index]: ''});
                                                                setActiveEditRowIndex(null);
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
  const [metadataDraft, setMetadataDraft] = useState<any>({});
  const [itemDrafts, setItemDrafts] = useState<any[]>([]);
  const [newItemDraft, setNewItemDraft] = useState({
    partName: '',
    quantity: '1',
    itemType: 'material',
    firstDept: 'Layup',
    notes: '',
  });

  const { data: p2PoBoms, isLoading } = useQuery({
    queryKey: ['/api/robust-boms/p2-po-boms', { search: searchTerm }],
    queryFn: () => apiRequest(`/api/robust-boms/p2-po-boms?search=${encodeURIComponent(searchTerm)}`),
  });

  const { data: bomDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['/api/robust-boms/p2-po-boms', selectedBom?.id],
    queryFn: () => apiRequest(`/api/robust-boms/p2-po-boms/${selectedBom?.id}`),
    enabled: !!selectedBom?.id && isViewOpen,
  });

  useEffect(() => {
    if (!bomDetail) return;
    setMetadataDraft({
      sku: bomDetail.sku || '',
      modelName: bomDetail.modelName || '',
      revision: bomDetail.revision || 'A',
      description: bomDetail.description || '',
    });
    setItemDrafts((bomDetail.items || []).map((item: any) => ({
      ...item,
      quantity: String(item.quantity ?? 1),
      firstDept: item.firstDept || 'Layup',
      itemType: item.itemType || 'material',
      notes: item.notes || '',
    })));
  }, [bomDetail]);

  const invalidateP2BomQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/p2-po-boms'] });
    if (selectedBom?.id) {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/p2-po-boms', selectedBom.id] });
    }
  };

  const updateMetadataMutation = useMutation({
    mutationFn: () => apiRequest(`/api/robust-boms/p2-po-boms/${selectedBom?.id}`, {
      method: 'PUT',
      body: metadataDraft,
    }),
    onSuccess: (updatedBom) => {
      setSelectedBom(updatedBom);
      invalidateP2BomQueries();
      toast({ title: 'P2 BOM updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update P2 BOM', description: error.message, variant: 'destructive' });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: (item: any) => apiRequest(`/api/robust-boms/p2-po-boms/${selectedBom?.id}/items/${item.id}`, {
      method: 'PUT',
      body: {
        partName: item.partName,
        quantity: Number.parseFloat(String(item.quantity)),
        itemType: item.itemType,
        firstDept: item.firstDept,
        notes: item.notes,
      },
    }),
    onSuccess: () => {
      invalidateP2BomQueries();
      toast({ title: 'BOM item updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update BOM item', description: error.message, variant: 'destructive' });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: () => apiRequest(`/api/robust-boms/p2-po-boms/${selectedBom?.id}/items`, {
      method: 'POST',
      body: {
        ...newItemDraft,
        quantity: Number.parseFloat(String(newItemDraft.quantity)),
      },
    }),
    onSuccess: () => {
      setNewItemDraft({ partName: '', quantity: '1', itemType: 'material', firstDept: 'Layup', notes: '' });
      invalidateP2BomQueries();
      toast({ title: 'BOM item added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add BOM item', description: error.message, variant: 'destructive' });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => apiRequest(`/api/robust-boms/p2-po-boms/${selectedBom?.id}/items/${itemId}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      invalidateP2BomQueries();
      toast({ title: 'BOM item removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove BOM item', description: error.message, variant: 'destructive' });
    },
  });

  const updateItemDraft = (index: number, updates: Record<string, unknown>) => {
    setItemDrafts((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...updates } : item
    )));
  };

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
                <TableHead>Internal Part #</TableHead>
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
                  <TableCell>
                    {bom.internalPartNumber ? (
                      <Button
                        variant="link"
                        className="h-auto p-0 font-mono"
                        onClick={() => window.open(`/inventory/manager?part=${encodeURIComponent(bom.internalPartNumber)}`, '_self')}
                      >
                        {bom.internalPartNumber}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">Unlinked</span>
                    )}
                  </TableCell>
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
                      <FileEdit className="h-4 w-4" />
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
          <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit P2 PO BOM</SheetTitle>
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
                    <Label>Part Number / SKU</Label>
                    <Input
                      value={metadataDraft.sku || ''}
                      onChange={(e) => setMetadataDraft({ ...metadataDraft, sku: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Model Name</Label>
                    <Input
                      value={metadataDraft.modelName || ''}
                      onChange={(e) => setMetadataDraft({ ...metadataDraft, modelName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Revision</Label>
                    <Input
                      value={metadataDraft.revision || ''}
                      onChange={(e) => setMetadataDraft({ ...metadataDraft, revision: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Internal Part #</Label>
                    {bomDetail.internalPartNumber ? (
                      <Button
                        variant="link"
                        className="h-10 px-0 font-mono"
                        onClick={() => window.open(`/inventory/manager?part=${encodeURIComponent(bomDetail.internalPartNumber)}`, '_self')}
                      >
                        {bomDetail.internalPartNumber} - {bomDetail.internalPartName || 'Inventory item'}
                      </Button>
                    ) : (
                      <div className="flex h-10 items-center text-sm text-muted-foreground">No internal inventory part linked</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={metadataDraft.description || ''}
                      onChange={(e) => setMetadataDraft({ ...metadataDraft, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateMetadataMutation.mutate()}
                    disabled={updateMetadataMutation.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save BOM
                  </Button>
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
                  {itemDrafts.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>First Dept</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemDrafts.map((item: any, index: number) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Input
                                value={item.partName || ''}
                                onChange={(e) => updateItemDraft(index, { partName: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={item.itemType || 'material'}
                                onValueChange={(value) => updateItemDraft(index, { itemType: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="material">Material</SelectItem>
                                  <SelectItem value="manufactured">Manufactured</SelectItem>
                                  <SelectItem value="sub_assembly">Sub-assembly</SelectItem>
                                  <SelectItem value="labor">Labor</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0.0001"
                                step="any"
                                value={item.quantity}
                                onChange={(e) => updateItemDraft(index, { quantity: e.target.value })}
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.firstDept || ''}
                                onChange={(e) => updateItemDraft(index, { firstDept: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.notes || ''}
                                onChange={(e) => updateItemDraft(index, { notes: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateItemMutation.mutate(item)}
                                  disabled={updateItemMutation.isPending}
                                  title="Save item"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                  disabled={deleteItemMutation.isPending}
                                  title="Remove item"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No items configured yet</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-semibold">Add BOM Item</h4>
                  <div className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.9fr_1.2fr_auto] gap-2 items-end">
                    <div>
                      <Label>Part Name / Internal #</Label>
                      <Input
                        value={newItemDraft.partName}
                        onChange={(e) => setNewItemDraft({ ...newItemDraft, partName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Select
                        value={newItemDraft.itemType}
                        onValueChange={(value) => setNewItemDraft({ ...newItemDraft, itemType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="manufactured">Manufactured</SelectItem>
                          <SelectItem value="sub_assembly">Sub-assembly</SelectItem>
                          <SelectItem value="labor">Labor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        min="0.0001"
                        step="any"
                        value={newItemDraft.quantity}
                        onChange={(e) => setNewItemDraft({ ...newItemDraft, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>First Dept</Label>
                      <Input
                        value={newItemDraft.firstDept}
                        onChange={(e) => setNewItemDraft({ ...newItemDraft, firstDept: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input
                        value={newItemDraft.notes}
                        onChange={(e) => setNewItemDraft({ ...newItemDraft, notes: e.target.value })}
                      />
                    </div>
                    <Button
                      onClick={() => addItemMutation.mutate()}
                      disabled={addItemMutation.isPending || !newItemDraft.partName.trim()}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}

