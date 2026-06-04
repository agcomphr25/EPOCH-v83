import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  User, 
  FileText, 
  Package, 
  ClipboardCheck,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface P2ProductItem {
  id: string;
  sku: string;
  revision: string | null;
  description: string;
  unitPrice: string;
  internalName: string | null;
  inventoryItemId?: number | null;
}

interface P2InternalName {
  id: string;
  name: string;
}

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  customerName?: string | null;
}

interface EmployeeOption {
  id: number | string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  employeeCode?: string | null;
  isActive?: boolean | null;
}

interface P2POCreationWizardProps {
  onComplete: (poId: number) => void;
  onCancel: () => void;
  initialProjectId?: string | null;
  initialCustomerId?: string | null;
}

const NO_PROJECT_VALUE = '__no_project__';

const steps = [
  { id: 'customer', title: 'Customer', icon: User },
  { id: 'details', title: 'PO Details', icon: FileText },
  { id: 'items', title: 'Line Items', icon: Package },
  { id: 'review', title: 'Review', icon: ClipboardCheck },
];

const customerSchema = z.object({
  customerId: z.string().min(1, 'Please select a customer'),
});

const detailsSchema = z.object({
  customerPONumber: z.string().min(1, 'Customer PO number is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  toleranceAuthorizer: z.string().min(1, 'Tolerance authorizer is required for quality control'),
  assignedTo: z.string().optional(), // Who is responsible for this PO
  productionLead: z.string().optional(), // Production lead for this PO
  notes: z.string().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(), // Optional project association
});

interface LineItem {
  id: string;
  sku: string;
  revision: string;
  description: string;
  quantity: number;
  unitPrice: number;
  internalName: string;
  inventoryItemId?: number | null;
}

export default function P2POCreationWizard({
  onComplete,
  onCancel,
  initialProjectId,
  initialCustomerId,
}: P2POCreationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [poDetails, setPODetails] = useState<z.infer<typeof detailsSchema> | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<LineItem>>({});
  const [showCreateProductDialog, setShowCreateProductDialog] = useState(false);
  const [isCustomInternalName, setIsCustomInternalName] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    sku: '',
    revision: 'A',
    description: '',
    unitPrice: '',
    internalName: '',
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: p2Customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });

  const { data: productItems = [] } = useQuery<P2ProductItem[]>({
    queryKey: ['/api/p2/product-items'],
  });

  const { data: internalNames = [] } = useQuery<P2InternalName[]>({
    queryKey: ['/api/p2/internal-names'],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const openProjects = projects.filter((project) =>
    !['completed', 'cancelled', 'closed'].includes(String(project.status || '').toLowerCase())
  );

  const selectedInitialProject = initialProjectId
    ? projects.find((project) => project.id === initialProjectId)
    : null;
  const projectOptions = selectedInitialProject && !openProjects.some((project) => project.id === selectedInitialProject.id)
    ? [selectedInitialProject, ...openProjects]
    : openProjects;

  const renderProjectLabel = (project: Project) =>
    `${project.projectCode} - ${project.projectName}${project.customerName ? ` (${project.customerName})` : ''}`;

  const employeeOptions = employees.filter((emp: EmployeeOption) => emp.isActive !== false);
  const getEmployeeName = (emp: EmployeeOption | null | undefined) =>
    emp
      ? emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.employeeCode || `Employee ${emp.id}`
      : null;
  const findEmployeeById = (employeeId: string | undefined) =>
    employeeId && employeeId !== 'none'
      ? employeeOptions.find((emp: EmployeeOption) => String(emp.id) === employeeId)
      : null;

  const createProductMutation = useMutation({
    mutationFn: async (data: typeof newProductForm) => {
      return apiRequest('/api/p2/product-items', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (newProduct: P2ProductItem) => {
      qc.invalidateQueries({ queryKey: ['/api/p2/product-items'] });
      qc.invalidateQueries({ queryKey: ['/api/p2/internal-names'] });
      toast({ title: 'Product item created successfully' });
      setNewItem({
        sku: newProduct.sku,
        revision: newProduct.revision || 'A',
        description: newProduct.description,
        unitPrice: parseFloat(newProduct.unitPrice),
        internalName: newProduct.internalName || '',
      });
      setShowCreateProductDialog(false);
      setNewProductForm({ sku: '', revision: 'A', description: '', unitPrice: '', internalName: '' });
      setIsCustomInternalName(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create product item', description: error.message, variant: 'destructive' });
    },
  });

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { customerId: '' },
  });

  const detailsForm = useForm<z.infer<typeof detailsSchema>>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      customerPONumber: '',
      dueDate: '',
      toleranceAuthorizer: '',
      assignedTo: '',
      productionLead: '',
      notes: '',
      projectId: initialProjectId || NO_PROJECT_VALUE,
      projectName: '',
    },
  });

  useEffect(() => {
    if (!initialProjectId) return;
    detailsForm.setValue('projectId', initialProjectId);
  }, [detailsForm, initialProjectId]);

  useEffect(() => {
    if (!initialCustomerId || p2Customers.length === 0) return;
    const customer = p2Customers.find((candidate: any) => candidate.customerId === initialCustomerId);
    if (!customer) return;
    customerForm.setValue('customerId', customer.id.toString());
    setSelectedCustomer((current: any) => current || customer);
  }, [customerForm, initialCustomerId, p2Customers]);

  const createPOMutation = useMutation({
    mutationFn: async (data: any) => {
      // Create the PO
      const po = await apiRequest('/api/p2-purchase-orders-bypass', {
        method: 'POST',
        body: data,
      });
      
      // Lock the PO immediately after creation to prevent edits
      await apiRequest(`/api/p2-purchase-orders/${po.id}/lock`, {
        method: 'POST',
        body: { employeeId: data.toleranceAuthorizerId || null },
      });
      
      return po;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center'] });
      toast({
        title: 'P2 Order Created & Locked',
        description: `Order ${data.poNumber} has been created and locked for production.`,
      });
      onComplete(data.id);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create P2 order',
        variant: 'destructive',
      });
    },
  });

  const handleCustomerSubmit = (data: z.infer<typeof customerSchema>) => {
    const customer = p2Customers.find((c: any) => c.id.toString() === data.customerId);
    setSelectedCustomer(customer);
    setCurrentStep(1);
  };

  const handleDetailsSubmit = (data: z.infer<typeof detailsSchema>) => {
    const selectedProject = data.projectId && data.projectId !== NO_PROJECT_VALUE
      ? projects.find((project) => project.id === data.projectId)
      : null;
    setPODetails({
      ...data,
      projectId: selectedProject?.id || '',
      projectName: selectedProject ? renderProjectLabel(selectedProject) : '',
    });
    setCurrentStep(2);
  };

  const addLineItem = () => {
    if (!newItem.sku || !newItem.quantity) {
      toast({
        title: 'Missing Information',
        description: 'Please select a product item and enter quantity',
        variant: 'destructive',
      });
      return;
    }

    const item: LineItem = {
      id: Date.now().toString(),
      sku: newItem.sku || '',
      revision: newItem.revision || 'A',
      description: newItem.description || '',
      quantity: newItem.quantity || 1,
      unitPrice: newItem.unitPrice || 0,
      internalName: newItem.internalName || '',
      inventoryItemId: newItem.inventoryItemId ?? null,
    };

    setLineItems([...lineItems, item]);
    setNewItem({});
  };

  const handleProductSelect = (value: string) => {
    if (value === 'create-new') {
      setShowCreateProductDialog(true);
    } else {
      const product = productItems.find(p => p.id === value);
      if (product) {
        setNewItem({
          sku: product.sku,
          revision: product.revision || 'A',
          description: product.description,
          unitPrice: parseFloat(product.unitPrice),
          internalName: product.internalName || '',
          inventoryItemId: product.inventoryItemId ?? null,
        });
      }
    }
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const handleItemsNext = () => {
    if (lineItems.length === 0) {
      toast({
        title: 'No Items',
        description: 'Please add at least one line item',
        variant: 'destructive',
      });
      return;
    }
    setCurrentStep(3);
  };

  const handleCreateOrder = () => {
    // Find the selected tolerance authorizer employee
    const selectedAuthorizer = findEmployeeById(poDetails?.toleranceAuthorizer);

    // Find assigned employee and production lead for ownership fields
    const assignedEmployee = findEmployeeById(poDetails?.assignedTo);
    const productionLeadEmployee = findEmployeeById(poDetails?.productionLead);

    const orderData = {
      customerId: selectedCustomer.customerId,
      customerPONumber: poDetails?.customerPONumber,
      dueDate: poDetails?.dueDate,
      // Properly map tolerance authorizer fields
      toleranceAuthorizerId: selectedAuthorizer?.id || null,
      toleranceAuthorizerName: getEmployeeName(selectedAuthorizer),
      toleranceNotes: poDetails?.notes,
      notes: poDetails?.notes,
      // Ownership fields for accountability
      assignedToId: assignedEmployee?.id || null,
      assignedToName: getEmployeeName(assignedEmployee),
      productionLeadId: productionLeadEmployee?.id || null,
      productionLeadName: getEmployeeName(productionLeadEmployee),
      projectId: poDetails?.projectId && poDetails.projectId !== NO_PROJECT_VALUE ? poDetails.projectId : null,
      projectName: poDetails?.projectName || null,
      lineItems: lineItems.map((item) => ({
        partNumber: `${item.sku}${item.revision ? ` Rev ${item.revision}` : ''}`,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        inventoryItemId: item.inventoryItemId ?? null,
      })),
    };

    createPOMutation.mutate(orderData);
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Create New P2 Order</CardTitle>
            <CardDescription>
              Step {currentStep + 1} of {steps.length}: {steps[currentStep].title}
            </CardDescription>
          </div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mt-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    isCompleted
                      ? 'bg-green-600 border-green-600 text-white'
                      : isCurrent
                      ? 'border-blue-600 text-blue-600'
                      : 'border-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span
                  className={`ml-2 text-sm ${
                    isCurrent ? 'font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {step.title}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className={`w-16 h-0.5 mx-4 ${
                      isCompleted ? 'bg-green-600' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="min-h-[400px]">
        {/* Step 1: Customer Selection */}
        {currentStep === 0 && (
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCustomerSubmit)} className="space-y-6">
              <FormField
                control={customerForm.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Customer</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-customer">
                          <SelectValue placeholder="Choose a customer..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {p2Customers.map((customer: any) => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            {customer.customerName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" data-testid="button-next-customer">
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* Step 2: PO Details */}
        {currentStep === 1 && (
          <Form {...detailsForm}>
            <form onSubmit={detailsForm.handleSubmit(handleDetailsSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={detailsForm.control}
                  name="customerPONumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer PO Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., PO-2024-001" data-testid="input-customer-po" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={detailsForm.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-due-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={detailsForm.control}
                name="toleranceAuthorizer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tolerance Authorizer <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-authorizer">
                          <SelectValue placeholder="Select authorizer for tolerance decisions..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employeeOptions
                          .map((emp: EmployeeOption) => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {getEmployeeName(emp)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator className="my-4" />
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Ownership & Accountability</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={detailsForm.control}
                    name="assignedTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assigned To (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-assigned-to">
                              <SelectValue placeholder="Who is responsible..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {employeeOptions
                              .map((emp: EmployeeOption) => (
                                <SelectItem key={emp.id} value={emp.id.toString()}>
                                  {getEmployeeName(emp)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={detailsForm.control}
                    name="productionLead"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Production Lead (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-production-lead">
                              <SelectValue placeholder="Production lead..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {employeeOptions
                              .map((emp: EmployeeOption) => (
                                <SelectItem key={emp.id} value={emp.id.toString()}>
                                  {getEmployeeName(emp)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={detailsForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Any special instructions..." data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={detailsForm.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || NO_PROJECT_VALUE}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Select project..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_PROJECT_VALUE}>No linked project</SelectItem>
                        {projectOptions.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {renderProjectLabel(project)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button type="submit" data-testid="button-next-details">
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* Step 3: Line Items */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-6 gap-2 items-end">
              <div className="col-span-2">
                <Label>P2 Product Item</Label>
                <Select onValueChange={handleProductSelect} value="">
                  <SelectTrigger data-testid="select-product-item">
                    <SelectValue placeholder={newItem.sku ? `${newItem.sku}${newItem.revision ? ` Rev ${newItem.revision}` : ''}` : "Select product..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create-new" className="text-primary font-medium">
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Create New Item
                      </span>
                    </SelectItem>
                    {productItems.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.sku} Rev {product.revision || 'A'} - {product.internalName || product.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={newItem.description || ''}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Description"
                  data-testid="input-description"
                  disabled={!newItem.sku}
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={newItem.quantity || ''}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                  placeholder="Qty"
                  data-testid="input-quantity"
                />
              </div>
              <div>
                <Label>Unit Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newItem.unitPrice || ''}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="$0.00"
                  data-testid="input-unit-price"
                  disabled={!newItem.sku}
                />
              </div>
              <Button onClick={addLineItem} data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            <Separator />

            {lineItems.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No line items added yet</p>
                <p className="text-sm text-muted-foreground">Add parts above to continue</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU / Rev</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.sku} Rev {item.revision}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">${item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        ${(item.quantity * item.unitPrice).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLineItem(item.id)}
                          data-testid={`button-remove-item-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleItemsNext} data-testid="button-next-items">
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">Ready to Create Order</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Once created, the order will be locked and you'll be prompted to set up BOMs for each part.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Customer</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{selectedCustomer?.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedCustomer?.company}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Order Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p><span className="text-muted-foreground">Customer PO:</span> {poDetails?.customerPONumber}</p>
                  <p><span className="text-muted-foreground">Due Date:</span> {poDetails?.dueDate}</p>
                  {poDetails?.toleranceAuthorizer && (
                    <p><span className="text-muted-foreground">Authorizer:</span> Set</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Line Items ({lineItems.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU / Rev</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.sku} Rev {item.revision}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          ${(item.quantity * item.unitPrice).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end mt-4 pt-4 border-t">
                  <p className="text-lg font-semibold">
                    Grand Total: $
                    {lineItems
                      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
                      .toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button 
                onClick={handleCreateOrder} 
                disabled={createPOMutation.isPending}
                data-testid="button-create-order"
              >
                {createPOMutation.isPending ? 'Creating...' : 'Create Order & Setup BOMs'}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Create New Product Item Dialog */}
      <Dialog open={showCreateProductDialog} onOpenChange={setShowCreateProductDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New P2 Product Item</DialogTitle>
            <DialogDescription>
              Add a new reusable product item for P2 purchase orders
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU # *</Label>
                <Input
                  id="sku"
                  value={newProductForm.sku}
                  onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                  placeholder="e.g., GTC-1001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revision">Rev</Label>
                <Input
                  id="revision"
                  value={newProductForm.revision}
                  onChange={(e) => setNewProductForm({ ...newProductForm, revision: e.target.value })}
                  placeholder="A"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={newProductForm.description}
                onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                placeholder="Description from drawing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit Price *</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                value={newProductForm.unitPrice}
                onChange={(e) => setNewProductForm({ ...newProductForm, unitPrice: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalName">Internal Name</Label>
              <Select
                value={isCustomInternalName ? 'custom' : newProductForm.internalName}
                onValueChange={(value) => {
                  if (value === 'custom') {
                    setIsCustomInternalName(true);
                    setNewProductForm({ ...newProductForm, internalName: '' });
                  } else {
                    setIsCustomInternalName(false);
                    setNewProductForm({ ...newProductForm, internalName: value });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select or type new..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Type custom name...</SelectItem>
                  {internalNames.map((name) => (
                    <SelectItem key={name.id} value={name.name}>
                      {name.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className={`mt-2 ${isCustomInternalName ? '' : 'hidden'}`}
                value={newProductForm.internalName}
                onChange={(e) => setNewProductForm({ ...newProductForm, internalName: e.target.value })}
                placeholder="Enter custom internal name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateProductDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createProductMutation.mutate(newProductForm)}
              disabled={!newProductForm.sku || !newProductForm.description || !newProductForm.unitPrice || createProductMutation.isPending}
            >
              {createProductMutation.isPending ? 'Creating...' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
