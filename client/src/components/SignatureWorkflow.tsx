import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import SignatureSigningInterface from './SignatureSigningInterface';
import {
  FileSignature,
  Plus,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Eye,
  Send,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from 'lucide-react';
import { format } from 'date-fns';

interface Employee {
  id: number;
  name: string;
  email: string | null;
}

interface Signer {
  id?: string;
  employeeId?: number;
  signerName: string;
  signerEmail?: string;
  signOrder: number;
  status?: string;
  signedAt?: string;
}

interface SignatureRequest {
  id: string;
  title: string;
  description?: string;
  documentType: string;
  mediaId?: string;
  originalDocumentPath?: string;
  currentDocumentPath?: string;
  status: string;
  currentSignerOrder: number;
  initiatedById?: number;
  initiatedByName: string;
  orderId?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  signers: Signer[];
}

interface SignatureWorkflowProps {
  employeeId: number;
  employeeName: string;
}

export default function SignatureWorkflow({ employeeId, employeeName }: SignatureWorkflowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<SignatureRequest | null>(null);

  const { data: requests = [], isLoading } = useQuery<SignatureRequest[]>({
    queryKey: ['/api/signature-workflow'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: stats } = useQuery<{ pending: number; completed: number; initiated: number }>({
    queryKey: ['/api/signature-workflow/stats', employeeId],
    enabled: !!employeeId,
  });

  const filteredRequests = requests.filter(req => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return req.status === 'pending' || req.status === 'in_progress';
    if (activeTab === 'completed') return req.status === 'completed';
    if (activeTab === 'my-initiated') return req.initiatedById === employeeId;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500"><Send className="h-3 w-3 mr-1" /> In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" /> Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSignerStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-xs">Waiting</Badge>;
      case 'current':
        return <Badge className="bg-blue-500 text-xs">Signing Now</Badge>;
      case 'completed':
        return <Badge className="bg-green-500 text-xs">Signed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
      case 'skipped':
        return <Badge variant="secondary" className="text-xs">Skipped</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6" />
            Signature Workflows
          </h2>
          <p className="text-muted-foreground">Manage multi-signer document approvals</p>
        </div>
        <CreateSignatureDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          employees={employees}
          employeeId={employeeId}
          employeeName={employeeName}
        />
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
              <p className="text-sm text-muted-foreground">Awaiting Your Signature</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <p className="text-sm text-muted-foreground">Signed by You</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{stats.initiated}</div>
              <p className="text-sm text-muted-foreground">Initiated by You</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Requests</TabsTrigger>
          <TabsTrigger value="pending">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="my-initiated">My Requests</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No signature requests found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Signers</TableHead>
                      <TableHead>Initiated By</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request) => (
                      <TableRow key={request.id} data-testid={`signature-request-row-${request.id}`}>
                        <TableCell className="font-medium">{request.title}</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {request.signers?.filter(s => s.status === 'completed').length || 0}/
                              {request.signers?.length || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{request.initiatedByName}</TableCell>
                        <TableCell>
                          {request.dueDate ? format(new Date(request.dueDate), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(request.createdAt), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingRequest(request)}
                            data-testid={`view-request-${request.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {viewingRequest && (
        <ViewSignatureRequestDialog
          request={viewingRequest}
          onClose={() => setViewingRequest(null)}
          employeeId={employeeId}
          employeeName={employeeName}
        />
      )}
    </div>
  );
}

function CreateSignatureDialog({
  open,
  onOpenChange,
  employees,
  employeeId,
  employeeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  employeeId: number;
  employeeName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [signers, setSigners] = useState<Signer[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/signature-workflow', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow'] });
      toast({ title: 'Signature request created successfully' });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create signature request', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setSigners([]);
    setSelectedEmployee('');
  };

  const addSigner = () => {
    if (!selectedEmployee) return;
    const emp = employees.find(e => e.id === parseInt(selectedEmployee));
    if (!emp) return;
    if (signers.some(s => s.employeeId === emp.id)) {
      toast({ title: 'This person is already added as a signer', variant: 'destructive' });
      return;
    }
    setSigners([...signers, {
      employeeId: emp.id,
      signerName: emp.name,
      signerEmail: emp.email || '',
      signOrder: signers.length + 1,
    }]);
    setSelectedEmployee('');
  };

  const removeSigner = (index: number) => {
    const newSigners = signers.filter((_, i) => i !== index);
    setSigners(newSigners.map((s, i) => ({ ...s, signOrder: i + 1 })));
  };

  const moveSigner = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === signers.length - 1) return;
    const newSigners = [...signers];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newSigners[index], newSigners[swapIndex]] = [newSigners[swapIndex], newSigners[index]];
    setSigners(newSigners.map((s, i) => ({ ...s, signOrder: i + 1 })));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (signers.length === 0) {
      toast({ title: 'At least one signer is required', variant: 'destructive' });
      return;
    }

    createMutation.mutate({
      title,
      description,
      documentType: 'generated_pdf',
      dueDate: dueDate || undefined,
      initiatedById: employeeId,
      initiatedByName: employeeName,
      signers,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="create-signature-request">
          <Plus className="h-4 w-4 mr-2" />
          New Signature Request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Signature Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title..."
              data-testid="input-title"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              data-testid="input-description"
            />
          </div>
          <div>
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="input-due-date"
            />
          </div>

          <div className="space-y-2">
            <Label>Signers (in order) *</Label>
            <div className="flex gap-2">
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="flex-1" data-testid="select-employee">
                  <SelectValue placeholder="Select an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.id !== employeeId).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addSigner} variant="secondary" data-testid="add-signer">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {signers.length > 0 && (
              <Card>
                <CardContent className="p-2">
                  <ScrollArea className="max-h-48">
                    {signers.map((signer, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted"
                        data-testid={`signer-item-${index}`}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm w-6">{signer.signOrder}.</span>
                        <span className="flex-1">{signer.signerName}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveSigner(index, 'up')}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveSigner(index, 'down')}
                            disabled={index === signers.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSigner(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="submit-signature-request">
            {createMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewSignatureRequestDialog({
  request,
  onClose,
  employeeId,
  employeeName,
}: {
  request: SignatureRequest;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSigningInterface, setShowSigningInterface] = useState(false);

  const currentSignerRecord = request.signers?.find(
    s => s.employeeId === employeeId && s.status === 'current'
  );
  const isCurrentSigner = !!currentSignerRecord;

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/signature-workflow/${request.id}/cancel`, {
        method: 'POST',
        body: { employeeId, employeeName, reason: 'Cancelled by initiator' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow'] });
      toast({ title: 'Signature request cancelled' });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to cancel', description: error.message, variant: 'destructive' });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-xs">Waiting</Badge>;
      case 'current':
        return <Badge className="bg-blue-500 text-xs">Signing Now</Badge>;
      case 'completed':
        return <Badge className="bg-green-500 text-xs">Signed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            {request.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {request.description && (
            <p className="text-muted-foreground">{request.description}</p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className="ml-2">{request.status}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Initiated by:</span>
              <span className="ml-2">{request.initiatedByName}</span>
            </div>
            {request.dueDate && (
              <div>
                <span className="text-muted-foreground">Due:</span>
                <span className="ml-2">{format(new Date(request.dueDate), 'MMM d, yyyy h:mm a')}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2">{format(new Date(request.createdAt), 'MMM d, yyyy')}</span>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Signers</h4>
            <div className="space-y-2">
              {request.signers?.map((signer, index) => (
                <div
                  key={signer.id || index}
                  className={`flex items-center justify-between p-3 rounded border ${
                    signer.status === 'current' ? 'border-blue-500 bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm w-6">{signer.signOrder}.</span>
                    <span>{signer.signerName}</span>
                    {getStatusBadge(signer.status || 'pending')}
                  </div>
                  {signer.signedAt && (
                    <span className="text-xs text-muted-foreground">
                      Signed {format(new Date(signer.signedAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isCurrentSigner && (
            <Card className="border-blue-500 bg-blue-50">
              <CardContent className="pt-4">
                <p className="font-medium text-blue-700 mb-2">It's your turn to sign!</p>
                <p className="text-sm text-blue-600 mb-4">
                  Click the button below to open the signing interface.
                </p>
                <Button 
                  className="w-full" 
                  onClick={() => setShowSigningInterface(true)}
                  data-testid="open-signing-interface"
                >
                  <FileSignature className="h-4 w-4 mr-2" />
                  Sign Document
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          {request.initiatedById === employeeId && request.status !== 'completed' && request.status !== 'cancelled' && (
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="cancel-request"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Request
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {showSigningInterface && currentSignerRecord && (
        <SignatureSigningInterface
          open={showSigningInterface}
          onClose={() => setShowSigningInterface(false)}
          requestId={request.id}
          signerId={currentSignerRecord.id}
          employeeId={employeeId}
          employeeName={employeeName}
          documentTitle={request.title}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow'] });
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
