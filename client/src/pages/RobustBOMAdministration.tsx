import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Edit, Trash2, FileText, ChevronRight } from 'lucide-react';
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
import { apiRequest, queryClient } from '@/lib/queryClient';

// Part schema
const partSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  uom: z.string().default('EA'),
  stdCost: z.string().default('0'),
  weight: z.string().default('0'),
  isMake: z.boolean().default(false),
});

// BOM schema
const bomSchema = z.object({
  parentPartId: z.string().min(1, 'Parent part is required'),
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
  const [selectedTab, setSelectedTab] = useState('parts');
  const [selectedPart, setSelectedPart] = useState<any>(null);
  const [selectedBom, setSelectedBom] = useState<any>(null);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="robust-bom-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Robust BOM Administration
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage parts, bills of materials, and revisions with advanced tracking
          </p>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="parts" data-testid="tab-parts">
            Parts Library
          </TabsTrigger>
          <TabsTrigger value="boms" data-testid="tab-boms">
            BOMs
          </TabsTrigger>
          <TabsTrigger value="revisions" data-testid="tab-revisions">
            Revisions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parts" className="space-y-4">
          <PartsTab searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
        </TabsContent>

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

// Parts Tab Component
function PartsTab({ searchTerm, setSearchTerm }: { searchTerm: string; setSearchTerm: (s: string) => void }) {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<any>(null);

  const { data: partsData, isLoading } = useQuery({
    queryKey: ['/api/robust-boms/parts', searchTerm],
  });

  const createPartMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/robust-boms/parts', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/parts'] });
      toast({ title: 'Success', description: 'Part created successfully' });
      setIsAddDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create part', variant: 'destructive' });
    },
  });

  const updatePartMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest(`/api/robust-boms/parts/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/parts'] });
      toast({ title: 'Success', description: 'Part updated successfully' });
      setEditingPart(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update part', variant: 'destructive' });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/robust-boms/parts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/parts'] });
      toast({ title: 'Success', description: 'Part deleted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error?.response?.data?.details || 'Failed to delete part', 
        variant: 'destructive' 
      });
    },
  });

  const form = useForm({
    resolver: zodResolver(partSchema),
    defaultValues: {
      sku: '',
      name: '',
      uom: 'EA',
      stdCost: '0',
      weight: '0',
      isMake: false,
    },
  });

  const onSubmit = (data: z.infer<typeof partSchema>) => {
    if (editingPart) {
      updatePartMutation.mutate({ id: editingPart.id, data });
    } else {
      createPartMutation.mutate(data);
    }
  };

  const parts = (partsData as any)?.data || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Parts Library</CardTitle>
            <CardDescription>Manage all parts used in BOMs</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search parts..."
                className="pl-8 w-[300px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-parts"
              />
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-part">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Part
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPart ? 'Edit Part' : 'Add New Part'}</DialogTitle>
                  <DialogDescription>
                    {editingPart ? 'Update the part details below' : 'Enter the details for the new part'}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="sku"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SKU</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-part-sku" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-part-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="uom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>UOM</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-part-uom" />
                            </FormControl>
                            <FormDescription>Unit of measure</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="stdCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Standard Cost</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} data-testid="input-part-cost" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.001" {...field} data-testid="input-part-weight" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isMake"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-part-is-make"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Make Part</FormLabel>
                            <FormDescription>
                              Check if this is a manufactured part
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsAddDialogOpen(false);
                          setEditingPart(null);
                          form.reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createPartMutation.isPending || updatePartMutation.isPending}
                        data-testid="button-submit-part"
                      >
                        {createPartMutation.isPending || updatePartMutation.isPending ? 'Saving...' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading parts...</div>
        ) : parts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-parts">
            No parts found. Click "Add Part" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((part: any) => (
                <TableRow key={part.id} data-testid={`row-part-${part.id}`}>
                  <TableCell className="font-medium">{part.sku}</TableCell>
                  <TableCell>{part.name}</TableCell>
                  <TableCell>{part.uom}</TableCell>
                  <TableCell>${Number(part.stdCost).toFixed(2)}</TableCell>
                  <TableCell>{Number(part.weight).toFixed(3)}</TableCell>
                  <TableCell>
                    <Badge variant={part.isMake ? 'default' : 'secondary'}>
                      {part.isMake ? 'Make' : 'Buy'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPart(part);
                          form.reset(part);
                          setIsAddDialogOpen(true);
                        }}
                        data-testid={`button-edit-part-${part.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this part?')) {
                            deletePartMutation.mutate(part.id);
                          }
                        }}
                        data-testid={`button-delete-part-${part.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
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

// BOMs Tab Component
function BOMsTab({ searchTerm, setSearchTerm }: { searchTerm: string; setSearchTerm: (s: string) => void }) {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: bomsData, isLoading } = useQuery({
    queryKey: ['/api/robust-boms/boms', searchTerm],
  });

  const { data: partsData } = useQuery({
    queryKey: ['/api/robust-boms/parts'],
  });

  const createBOMMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/robust-boms/boms', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/robust-boms/boms'] });
      toast({ title: 'Success', description: 'BOM created successfully' });
      setIsAddDialogOpen(false);
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

  const form = useForm({
    resolver: zodResolver(bomSchema),
    defaultValues: {
      parentPartId: '',
      code: '',
      description: '',
    },
  });

  const onSubmit = (data: z.infer<typeof bomSchema>) => {
    createBOMMutation.mutate(data);
  };

  const boms = (bomsData as any)?.data || [];
  const parts = (partsData as any)?.data || [];

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
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-bom">
                  <Plus className="mr-2 h-4 w-4" />
                  Add BOM
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New BOM</DialogTitle>
                  <DialogDescription>
                    Create a new bill of materials
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="parentPartId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parent Part</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-parent-part">
                                <SelectValue placeholder="Select a parent part" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {parts.map((part: any) => (
                                <SelectItem key={part.id} value={part.id}>
                                  {part.sku} - {part.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            The part that this BOM produces
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
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsAddDialogOpen(false);
                          form.reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createBOMMutation.isPending}
                        data-testid="button-submit-bom"
                      >
                        {createBOMMutation.isPending ? 'Creating...' : 'Create BOM'}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
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
                    {bom.parentPart ? `${bom.parentPart.sku} - ${bom.parentPart.name}` : 'N/A'}
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
                          if (confirm('Are you sure you want to delete this BOM and all its revisions?')) {
                            deleteBOMMutation.mutate(bom.id);
                          }
                        }}
                        data-testid={`button-delete-bom-${bom.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
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
