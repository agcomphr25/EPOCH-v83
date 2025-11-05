import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Edit, Trash2, FileText, ChevronRight, Check, ChevronsUpDown, Eye, Copy, Save, X } from 'lucide-react';
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
  uom: z.string().optional(),
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
            BOMs
          </TabsTrigger>
          <TabsTrigger value="revisions" data-testid="tab-revisions">
            Revisions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="boms" className="space-y-4">
          <BOMsTab searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
        </TabsContent>

        <TabsContent value="revisions" className="space-y-4">
          <RevisionsTab />
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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/boms'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/boms'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/boms'] });
      toast({ title: 'Success', description: 'BOM updated successfully' });
      setIsEditDialogOpen(false);
      setSelectedBom(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update BOM', variant: 'destructive' });
    },
  });

  // Fetch revision details with lines
  const { data: revisionData } = useQuery({
    queryKey: [`/api/robust-boms/revisions/${selectedRevisionId}`],
    enabled: !!selectedRevisionId,
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
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update BOM lines', variant: 'destructive' });
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
      uom: '',
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
        quantityPer: line.quantityPer,
        scrapPercent: line.scrapPercent || 0,
        uom: line.uom || '',
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
          uom: '',
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
    if (selectedBom && isEditDialogOpen) {
      editForm.reset({
        parentPartAgNumber: selectedBom.parentPartAgNumber || '',
        code: selectedBom.code || '',
        description: selectedBom.description || '',
      });
    }
  }, [selectedBom, isEditDialogOpen, editForm]);

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

                            {/* UOM */}
                            <FormField
                              control={lineForm.control}
                              name="uom"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Unit of Measure (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="e.g., EA, FT, LB" data-testid="input-uom" />
                                  </FormControl>
                                  <FormDescription>Unit of measure (EA, FT, LB, etc.)</FormDescription>
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
                                        <TableCell>{line.uom || '-'}</TableCell>
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

            {/* Edit BOM Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
              setIsEditDialogOpen(open);
              if (!open) setSelectedBom(null);
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit BOM</DialogTitle>
                  <DialogDescription>
                    Update BOM metadata (parent part, code, description)
                  </DialogDescription>
                </DialogHeader>
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
                            <Input {...field} data-testid="input-edit-bom-code" />
                          </FormControl>
                          <FormDescription>
                            Unique identifier for this BOM
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
                            <Textarea {...field} data-testid="input-edit-bom-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsEditDialogOpen(false);
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
              }
            }}>
              <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>BOM Details & Line Items</SheetTitle>
                  <SheetDescription>
                    View and edit BOM revisions and their line items
                  </SheetDescription>
                </SheetHeader>
                {selectedBom && (
                  <div className="mt-6 space-y-6">
                    {/* BOM Metadata */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg">BOM Information</h3>
                      <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">BOM Code</label>
                          <p className="text-sm font-mono mt-1">{selectedBom.code}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Parent Part</label>
                          <p className="text-sm mt-1">
                            {selectedBom.parentInventoryItem 
                              ? `${selectedBom.parentInventoryItem.agPartNumber} - ${selectedBom.parentInventoryItem.name}` 
                              : selectedBom.parentPartAgNumber || 'N/A'}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-muted-foreground">Description</label>
                          <p className="text-sm mt-1">{selectedBom.description || 'No description'}</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Revisions List */}
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
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        const newLine = {
                                          childPartAgNumber: '',
                                          quantityPer: 1,
                                          scrapPercent: 0,
                                          uom: 'EA',
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
                                          {editingLines.map((line, index) => (
                                            <TableRow key={index}>
                                              <TableCell className="min-w-[200px]">
                                                <Select
                                                  value={line.childPartAgNumber}
                                                  onValueChange={(value) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].childPartAgNumber = value;
                                                    setEditingLines(newLines);
                                                  }}
                                                >
                                                  <SelectTrigger data-testid={`select-child-part-${index}`}>
                                                    <SelectValue placeholder="Select part..." />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {parts.slice(0, 100).map((part: any) => (
                                                      <SelectItem key={part.id} value={part.agPartNumber}>
                                                        {part.agPartNumber} - {part.name}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
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
                                                <Input
                                                  value={line.uom || ''}
                                                  onChange={(e) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].uom = e.target.value;
                                                    setEditingLines(newLines);
                                                  }}
                                                  className="w-20"
                                                  data-testid={`input-uom-${index}`}
                                                />
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
                                                  value={line.operationSequence || ''}
                                                  onChange={(e) => {
                                                    const newLines = [...editingLines];
                                                    newLines[index].operationSequence = parseInt(e.target.value) || undefined;
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
                                          ))}
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
                                                quantityPer: line.quantityPer,
                                                scrapPercent: line.scrapPercent || 0,
                                                uom: line.uom || '',
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
                                                quantityPer: line.quantityPer,
                                                scrapPercent: line.scrapPercent,
                                                uom: line.uom,
                                                referenceDesignator: line.referenceDesignator,
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
                  </div>
                )}
              </SheetContent>
            </Sheet>
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
                          setSelectedBom(bom);
                          setIsViewDrawerOpen(true);
                          // Auto-select first revision if available
                          if (bom.revisions && bom.revisions.length > 0) {
                            setSelectedRevisionId(bom.revisions[0].id);
                          }
                        }}
                        data-testid={`button-view-bom-${bom.id}`}
                        title="View & Edit BOM Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedBom(bom);
                          setIsViewDrawerOpen(true);
                          // Auto-select first revision if available
                          if (bom.revisions && bom.revisions.length > 0) {
                            setSelectedRevisionId(bom.revisions[0].id);
                          }
                        }}
                        data-testid={`button-edit-bom-${bom.id}`}
                        title="Edit BOM & Line Items"
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
