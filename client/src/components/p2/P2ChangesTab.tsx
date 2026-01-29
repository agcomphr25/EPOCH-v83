import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle2, Clock, FileWarning, Plus, RefreshCw, XCircle, AlertTriangle, Wrench, ClipboardList, GitBranch } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const productionChangeSchema = z.object({
  changeType: z.string().min(1, 'Change type is required'),
  scope: z.string().default('PO'),
  partNumber: z.string().optional(),
  proposedChange: z.string().min(1, 'Proposed change description is required'),
  reason: z.string().min(1, 'Reason is required'),
  riskAssessment: z.string().optional(),
  requiresCustomerApproval: z.boolean().default(false),
});

const travelerChangeSchema = z.object({
  travelerId: z.string().min(1, 'Traveler ID is required'),
  changeCategory: z.string().min(1, 'Change category is required'),
  description: z.string().min(1, 'Description is required'),
  justification: z.string().min(1, 'Justification is required'),
  qualityImpact: z.string().optional(),
  blocksTraveler: z.boolean().default(false),
});

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500',
  SUBMITTED: 'bg-blue-500',
  PENDING: 'bg-yellow-500',
  APPROVED: 'bg-green-500',
  REJECTED: 'bg-red-500',
  IMPLEMENTED: 'bg-purple-500',
};

const CHANGE_TYPE_ICONS: Record<string, any> = {
  PROCESS: Wrench,
  MATERIAL: AlertCircle,
  ROUTING: GitBranch,
  BOM: ClipboardList,
  INSPECTION: CheckCircle2,
};

export default function P2ChangesTab() {
  const [activeSection, setActiveSection] = useState('production');
  const [showNewPCFDialog, setShowNewPCFDialog] = useState(false);
  const [showNewDeviationDialog, setShowNewDeviationDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [showAuthorizeDeviationDialog, setShowAuthorizeDeviationDialog] = useState<any | null>(null);
  const [selectedApprover, setSelectedApprover] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const { toast } = useToast();

  const { data: productionChanges = [], isLoading: loadingPCFs } = useQuery<any[]>({
    queryKey: ['/api/p2/changes'],
  });

  const { data: travelerChanges = [], isLoading: loadingDeviations } = useQuery<any[]>({
    queryKey: ['/api/p2/traveler-changes'],
  });

  const { data: impactData, isLoading: loadingImpact } = useQuery<any>({
    queryKey: ['/api/p2/changes/impact'],
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });

  const pcfForm = useForm({
    resolver: zodResolver(productionChangeSchema),
    defaultValues: {
      changeType: '',
      scope: 'PO',
      partNumber: '',
      proposedChange: '',
      reason: '',
      riskAssessment: '',
      requiresCustomerApproval: false,
    },
  });

  const deviationForm = useForm({
    resolver: zodResolver(travelerChangeSchema),
    defaultValues: {
      travelerId: '',
      changeCategory: '',
      description: '',
      justification: '',
      qualityImpact: '',
      blocksTraveler: false,
    },
  });

  const submitDeviation = () => {
    deviationForm.handleSubmit((data) => {
      createDeviationMutation.mutate(data);
    })();
  };

  const createPCFMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/p2/changes', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes/impact'] });
      toast({ title: 'Production Change Created', description: 'The PCF has been created and is pending review.' });
      setShowNewPCFDialog(false);
      pcfForm.reset();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create production change', variant: 'destructive' });
    },
  });

  const approvePCFMutation = useMutation({
    mutationFn: ({ id, approvedById, approvedByName }: any) => 
      apiRequest(`/api/p2/changes/${id}/approve`, { method: 'POST', body: { approvedById, approvedByName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes/impact'] });
      toast({ title: 'Change Approved', description: 'The production change has been approved.' });
    },
  });

  const createDeviationMutation = useMutation({
    mutationFn: (data: { travelerId: string; changeCategory: string; description: string; justification: string; qualityImpact?: string; blocksTraveler: boolean }) => 
      apiRequest(`/api/travelers/${data.travelerId}/changes`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/traveler-changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes/impact'] });
      toast({ title: 'Deviation Created', description: 'The traveler deviation has been created and is pending authorization.' });
      setShowNewDeviationDialog(false);
      deviationForm.reset();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create traveler deviation', variant: 'destructive' });
    },
  });

  const authorizeDeviationMutation = useMutation({
    mutationFn: ({ changeId, travelerId, authorizedById, authorizedByName }: { changeId: string; travelerId: string; authorizedById: string; authorizedByName: string }) =>
      apiRequest(`/api/travelers/${travelerId}/changes/${changeId}/authorize`, { method: 'POST', body: { authorizedById, authorizedByName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/traveler-changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes/impact'] });
      toast({ title: 'Deviation Authorized', description: 'The traveler deviation has been authorized.' });
      setShowAuthorizeDeviationDialog(null);
      setSelectedApprover('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to authorize deviation', variant: 'destructive' });
    },
  });

  const rejectPCFMutation = useMutation({
    mutationFn: ({ id, rejectedById, rejectedByName, rejectionReason }: any) => 
      apiRequest(`/api/p2/changes/${id}/reject`, { method: 'POST', body: { rejectedById, rejectedByName, rejectionReason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/changes/impact'] });
      toast({ title: 'Change Rejected', description: 'The production change has been rejected.' });
    },
  });

  const submitPCF = () => {
    pcfForm.handleSubmit((data) => {
      createPCFMutation.mutate({
        ...data,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      });
    })();
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="production" className="flex items-center gap-2">
            <FileWarning className="h-4 w-4" />
            Production Changes (PCF)
            {impactData?.summary?.pendingProductionChanges > 0 && (
              <Badge variant="secondary" className="ml-1">{impactData.summary.pendingProductionChanges}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="traveler" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Traveler Deviations
            {impactData?.summary?.pendingTravelerChanges > 0 && (
              <Badge variant="secondary" className="ml-1">{impactData.summary.pendingTravelerChanges}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="impact" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Change Impact
            {impactData?.summary?.blockingChanges > 0 && (
              <Badge variant="destructive" className="ml-1">{impactData.summary.blockingChanges}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Production Change Forms (PCF)</CardTitle>
                <CardDescription>Changes to routing, BOM, process, materials, or inspection requirements</CardDescription>
              </div>
              <Dialog open={showNewPCFDialog} onOpenChange={setShowNewPCFDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New PCF
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Production Change Form</DialogTitle>
                    <DialogDescription>
                      Document a proposed change to production processes, materials, or quality requirements.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...pcfForm}>
                    <form className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={pcfForm.control}
                          name="changeType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Change Type *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="PROCESS">Process Change</SelectItem>
                                  <SelectItem value="MATERIAL">Material Substitution</SelectItem>
                                  <SelectItem value="ROUTING">Routing Change</SelectItem>
                                  <SelectItem value="BOM">BOM Modification</SelectItem>
                                  <SelectItem value="INSPECTION">Inspection Change</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={pcfForm.control}
                          name="scope"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Scope</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="GLOBAL">Global (All Parts)</SelectItem>
                                  <SelectItem value="PO">Specific PO</SelectItem>
                                  <SelectItem value="PART">Specific Part Number</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={pcfForm.control}
                        name="partNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Part Number (if applicable)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter part number..." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={pcfForm.control}
                        name="proposedChange"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Proposed Change *</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Describe the proposed change in detail..." rows={3} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={pcfForm.control}
                        name="reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reason for Change *</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Explain why this change is needed..." rows={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={pcfForm.control}
                        name="riskAssessment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Risk Assessment</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Describe any risks or impacts..." rows={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={pcfForm.control}
                        name="requiresCustomerApproval"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="!mt-0">Requires Customer Approval</FormLabel>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewPCFDialog(false)}>Cancel</Button>
                    <Button onClick={submitPCF} disabled={createPCFMutation.isPending}>
                      {createPCFMutation.isPending ? 'Creating...' : 'Submit PCF'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loadingPCFs ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : productionChanges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileWarning className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No production changes recorded</p>
                  <p className="text-sm">Create a PCF when you need to change processes, materials, or requirements</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PCF #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productionChanges.map((change: any) => {
                      const TypeIcon = CHANGE_TYPE_ICONS[change.changeType] || FileWarning;
                      return (
                        <TableRow key={change.id}>
                          <TableCell className="font-mono font-medium">{change.changeNumber}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <TypeIcon className="h-4 w-4 text-muted-foreground" />
                              {change.changeType}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{change.proposedChange}</TableCell>
                          <TableCell>{change.scope}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[change.status]}>{change.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {change.submittedAt ? new Date(change.submittedAt).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>
                            {change.status === 'SUBMITTED' && (
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedApprover('');
                                    setShowApproveDialog(change.id);
                                  }}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setRejectionReason('');
                                    setSelectedApprover('');
                                    setShowRejectDialog(change.id);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traveler" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Traveler Deviations</CardTitle>
                <CardDescription>Changes affecting specific travelers only - routing stays intact</CardDescription>
              </div>
              <Dialog open={showNewDeviationDialog} onOpenChange={setShowNewDeviationDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Deviation
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Traveler Deviation</DialogTitle>
                    <DialogDescription>
                      Document a deviation that affects a specific traveler. The routing stays intact.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...deviationForm}>
                    <form className="space-y-4">
                      <FormField
                        control={deviationForm.control}
                        name="travelerId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Traveler ID *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter traveler UUID..." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={deviationForm.control}
                        name="changeCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="DEVIATION">Deviation</SelectItem>
                                <SelectItem value="REWORK">Rework</SelectItem>
                                <SelectItem value="REPAIR">Repair</SelectItem>
                                <SelectItem value="TEMPORARY">Temporary Allowance</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={deviationForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description *</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Describe the deviation..." rows={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={deviationForm.control}
                        name="justification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Justification *</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Why is this deviation necessary..." rows={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={deviationForm.control}
                        name="qualityImpact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quality Impact</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Describe any quality implications..." rows={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={deviationForm.control}
                        name="blocksTraveler"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="!mt-0">Block Traveler Until Authorized</FormLabel>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewDeviationDialog(false)}>Cancel</Button>
                    <Button onClick={submitDeviation} disabled={createDeviationMutation.isPending}>
                      {createDeviationMutation.isPending ? 'Creating...' : 'Create Deviation'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loadingDeviations ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : travelerChanges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No traveler deviations recorded</p>
                  <p className="text-sm">Deviations are created from within traveler workflows when exceptions occur</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DEV #</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Traveler</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Blocking</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {travelerChanges.map((change: any) => (
                      <TableRow key={change.id}>
                        <TableCell className="font-mono font-medium">{change.changeNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{change.changeCategory}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{change.description}</TableCell>
                        <TableCell className="font-mono">{change.travelerId?.substring(0, 8)}...</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[change.status]}>{change.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {change.blocksTraveler ? (
                            <Badge variant="destructive">Blocking</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {change.status === 'PENDING' && (
                            <Button size="sm" variant="outline" onClick={() => setShowAuthorizeDeviationDialog(change)}>
                              Authorize
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact" className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total PCFs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{impactData?.summary?.totalProductionChanges || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{impactData?.summary?.pendingProductionChanges || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Traveler Deviations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{impactData?.summary?.totalTravelerChanges || 0}</div>
              </CardContent>
            </Card>
            <Card className={impactData?.summary?.blockingChanges > 0 ? 'border-red-500' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Blocking Production</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${impactData?.summary?.blockingChanges > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {impactData?.summary?.blockingChanges || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Production Impact Summary</CardTitle>
              <CardDescription>
                Overview of changes affecting production and their current status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingImpact ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : impactData?.summary?.productionBlocked ? (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-semibold">Production Blocked</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    There are {impactData.summary.blockingChanges} blocking deviation(s) that must be authorized before production can continue.
                  </p>
                </div>
              ) : (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">Production Clear</span>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                    No blocking changes. Production can proceed normally.
                  </p>
                </div>
              )}

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Pending Production Changes</h4>
                  {impactData?.pendingProductionChanges?.length > 0 ? (
                    <ul className="space-y-2">
                      {impactData.pendingProductionChanges.map((change: any) => (
                        <li key={change.id} className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-yellow-500" />
                          <span className="font-mono">{change.changeNumber}</span>
                          <span className="text-muted-foreground truncate">{change.proposedChange}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No pending production changes</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium mb-2">Pending Traveler Deviations</h4>
                  {impactData?.pendingTravelerChanges?.length > 0 ? (
                    <ul className="space-y-2">
                      {impactData.pendingTravelerChanges.map((change: any) => (
                        <li key={change.id} className="flex items-center gap-2 text-sm">
                          {change.blocksTraveler ? (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          ) : (
                            <Clock className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className="font-mono">{change.changeNumber}</span>
                          <span className="text-muted-foreground truncate">{change.description}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No pending traveler deviations</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approval Dialog */}
      <Dialog open={!!showApproveDialog} onOpenChange={() => setShowApproveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Production Change</DialogTitle>
            <DialogDescription>Select the approving authority for this change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Approver *</label>
              <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                <SelectTrigger>
                  <SelectValue placeholder="Select approver..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter((e: any) => e.isActive !== false).map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(null)}>Cancel</Button>
            <Button 
              disabled={!selectedApprover || approvePCFMutation.isPending}
              onClick={() => {
                const emp = employees.find((e: any) => e.id.toString() === selectedApprover);
                approvePCFMutation.mutate({
                  id: showApproveDialog,
                  approvedById: parseInt(selectedApprover),
                  approvedByName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Unknown',
                });
                setShowApproveDialog(null);
              }}
            >
              {approvePCFMutation.isPending ? 'Approving...' : 'Approve Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={!!showRejectDialog} onOpenChange={() => setShowRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Production Change</DialogTitle>
            <DialogDescription>Provide a reason for rejection and select the rejecting authority.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Rejected By *</label>
              <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                <SelectTrigger>
                  <SelectValue placeholder="Select authority..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter((e: any) => e.isActive !== false).map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Rejection Reason *</label>
              <Textarea 
                value={rejectionReason} 
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this change is being rejected..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(null)}>Cancel</Button>
            <Button 
              variant="destructive"
              disabled={!selectedApprover || !rejectionReason || rejectPCFMutation.isPending}
              onClick={() => {
                const emp = employees.find((e: any) => e.id.toString() === selectedApprover);
                rejectPCFMutation.mutate({
                  id: showRejectDialog,
                  rejectedById: parseInt(selectedApprover),
                  rejectedByName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Unknown',
                  rejectionReason,
                });
                setShowRejectDialog(null);
              }}
            >
              {rejectPCFMutation.isPending ? 'Rejecting...' : 'Reject Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deviation Authorization Dialog */}
      <Dialog open={!!showAuthorizeDeviationDialog} onOpenChange={() => { setShowAuthorizeDeviationDialog(null); setSelectedApprover(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorize Traveler Deviation</DialogTitle>
            <DialogDescription>
              Select an authorized person to approve this deviation: {showAuthorizeDeviationDialog?.changeNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Authorized By *</label>
              <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                <SelectTrigger>
                  <SelectValue placeholder="Select authorizing employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.firstName || ''} {emp.lastName || ''} {emp.department ? `(${emp.department})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              <p><strong>Category:</strong> {showAuthorizeDeviationDialog?.changeCategory}</p>
              <p><strong>Description:</strong> {showAuthorizeDeviationDialog?.description}</p>
              {showAuthorizeDeviationDialog?.blocksTraveler && (
                <p className="text-red-600 font-medium mt-2">This deviation is currently blocking the traveler.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAuthorizeDeviationDialog(null); setSelectedApprover(''); }}>Cancel</Button>
            <Button
              disabled={!selectedApprover || authorizeDeviationMutation.isPending}
              onClick={() => {
                const emp = employees.find((e: any) => e.id.toString() === selectedApprover);
                authorizeDeviationMutation.mutate({
                  changeId: showAuthorizeDeviationDialog?.id,
                  travelerId: showAuthorizeDeviationDialog?.travelerId,
                  authorizedById: selectedApprover,
                  authorizedByName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Unknown',
                });
              }}
            >
              {authorizeDeviationMutation.isPending ? 'Authorizing...' : 'Authorize Deviation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
