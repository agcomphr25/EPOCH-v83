import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Edit, Trash2, FileText, ChevronRight, Check, ChevronsUpDown, Eye, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<any>(null);
  const [partSearch, setPartSearch] = useState('');
  const [isPartPopoverOpen, setIsPartPopoverOpen] = useState(false);

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
    form.reset();
  };

  const handleStep2Next = () => {
    // TODO: Task 3 - Validate and save Step 2 revision data
    // For now, just advance to Step 3
    setWizardData({ ...wizardData, step2: { revCode: 'A', notes: '' } }); // Placeholder
    setWizardStep(3);
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

  const boms = (bomsData as any)?.data || [];
  const parts = (partsData as any)?.data || [];
  
  // Filter parts based on search
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
                form.reset();
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-bom">
                  <Plus className="mr-2 h-4 w-4" />
                  Add BOM
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
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

                    {/* Step 2: Initial Revision (Coming in Task 3) */}
                    {wizardStep === 2 && (
                      <div className="py-8 text-center">
                        <h3 className="text-lg font-semibold mb-2">Initial Revision Details</h3>
                        <p className="text-muted-foreground mb-4">
                          This step will allow you to define the initial revision code and notes.
                        </p>
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm">Coming in Task 3...</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Preview: You'll enter revision code (e.g., "A", "Rev 1") and optional notes.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Add BOM Lines (Coming in Task 4) */}
                    {wizardStep === 3 && (
                      <div className="py-8 text-center">
                        <h3 className="text-lg font-semibold mb-2">Add Child Parts & Quantities</h3>
                        <p className="text-muted-foreground mb-4">
                          This step will provide a table to add child parts with quantities, scrap %, UOM, and more.
                        </p>
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm">Coming in Task 4...</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Preview: You'll add rows with child parts, quantity per unit, scrap percentage,
                            unit of measure, reference designator, and operation sequence.
                          </p>
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
                            type="submit"
                            disabled={createBOMMutation.isPending}
                            data-testid="button-submit-bom"
                          >
                            {createBOMMutation.isPending ? 'Creating...' : 'Complete & Create BOM'}
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

            {/* View BOM Dialog */}
            <Dialog open={isViewDialogOpen} onOpenChange={(open) => {
              setIsViewDialogOpen(open);
              if (!open) setSelectedBom(null);
            }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>BOM Details</DialogTitle>
                  <DialogDescription>
                    View BOM information and revisions
                  </DialogDescription>
                </DialogHeader>
                {selectedBom && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">BOM Code</label>
                        <p className="text-sm font-mono mt-1">{selectedBom.code}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Parent Part</label>
                        <p className="text-sm mt-1">
                          {selectedBom.parentInventoryItem 
                            ? `${selectedBom.parentInventoryItem.agPartNumber} - ${selectedBom.parentInventoryItem.name}` 
                            : selectedBom.parentPartAgNumber || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Description</label>
                      <p className="text-sm mt-1">{selectedBom.description || 'No description'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Revisions</label>
                      {selectedBom.revisions && selectedBom.revisions.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {selectedBom.revisions.map((rev: any) => (
                            <div key={rev.id} className="flex items-center justify-between p-2 border rounded-md">
                              <div>
                                <span className="font-medium">{rev.revCode}</span>
                                {rev.notes && <span className="text-sm text-muted-foreground ml-2">- {rev.notes}</span>}
                              </div>
                              <Badge variant={rev.isReleased ? 'default' : 'secondary'}>
                                {rev.isReleased ? 'Released' : 'Draft'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-2">No revisions yet</p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>Created: {new Date(selectedBom.createdAt).toLocaleString()}</p>
                      {selectedBom.updatedAt && (
                        <p>Last Updated: {new Date(selectedBom.updatedAt).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      setSelectedBom(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      setIsEditDialogOpen(true);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit BOM
                  </Button>
                </DialogFooter>
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
                          setIsViewDialogOpen(true);
                        }}
                        data-testid={`button-view-bom-${bom.id}`}
                        title="View BOM Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedBom(bom);
                          setIsEditDialogOpen(true);
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
