import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  Clock,
  PlayCircle,
  Printer,
  Package,
} from 'lucide-react';
import type { ManufacturingQueue } from '@shared/schema';

type QueueItemWithInventory = ManufacturingQueue & {
  partNumber: string | null;
  partName: string | null;
};

export default function CuttingTableManufacturingQueue() {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>('PENDING');
  const [selectedItem, setSelectedItem] = useState<QueueItemWithInventory | null>(null);
  const [isProductionDialogOpen, setIsProductionDialogOpen] = useState(false);
  const [isLabelsDialogOpen, setIsLabelsDialogOpen] = useState(false);

  // Get current user
  const { data: currentUser } = useQuery<{ username: string }>({
    queryKey: ['currentUser'],
  });

  // Production form state
  const [quantityCompleted, setQuantityCompleted] = useState('');
  const [fabricLot, setFabricLot] = useState('');
  const [fabricBatch, setFabricBatch] = useState('');
  const [fabricRoll, setFabricRoll] = useState('');
  const [materialDetails, setMaterialDetails] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completedBy, setCompletedBy] = useState('');

  // Fetch queue items
  const { data: queueItems = [], isLoading } = useQuery<QueueItemWithInventory[]>({
    queryKey: ['/api/cutting-table-mfg-queue/cutting-table', selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'ALL') {
        params.append('status', selectedStatus);
      }
      return apiRequest(`/api/cutting-table-mfg-queue/cutting-table?${params.toString()}`);
    },
  });

  // Start item mutation
  const startItemMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo: currentUser?.username || 'unknown' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/cutting-table-mfg-queue/cutting-table'],
        exact: false 
      });
      toast({
        title: 'Item started',
        description: 'Manufacturing item has been marked as in progress.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to start item. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Complete item mutation
  const completeItemMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      quantityCompleted: number;
      fabricLot?: string;
      fabricBatch?: string;
      fabricRoll?: string;
      materialDetails?: string;
      completionNotes?: string;
      completedBy?: string;
    }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${data.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/cutting-table-mfg-queue/cutting-table'],
        exact: false 
      });
      setIsProductionDialogOpen(false);
      resetProductionForm();
      toast({
        title: 'Production recorded',
        description: 'Item has been marked as completed with traceability data.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to record production. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Generate labels mutation
  const generateLabelsMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${id}/generate-labels`, {
        method: 'POST',
        body: JSON.stringify({ quantityToLabel: quantity }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Labels generated',
        description: `Generated ${data.count} barcode labels. Ready to print.`,
      });
      // In a real implementation, this would trigger the actual label printing
      console.log('Label data:', data.labels);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate labels. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const resetProductionForm = () => {
    setQuantityCompleted('');
    setFabricLot('');
    setFabricBatch('');
    setFabricRoll('');
    setMaterialDetails('');
    setCompletionNotes('');
    setCompletedBy('');
    setSelectedItem(null);
  };

  const handleOpenProductionDialog = (item: QueueItemWithInventory) => {
    setSelectedItem(item);
    setQuantityCompleted(item.quantityRequested.toString());
    setCompletedBy(currentUser?.username || '');
    setIsProductionDialogOpen(true);
  };

  const handleOpenLabelsDialog = (item: QueueItemWithInventory) => {
    setSelectedItem(item);
    setIsLabelsDialogOpen(true);
  };

  const handleCompleteProduction = () => {
    if (!selectedItem || !quantityCompleted) {
      toast({
        title: 'Validation Error',
        description: 'Please enter the quantity completed.',
        variant: 'destructive',
      });
      return;
    }

    if (!completedBy) {
      toast({
        title: 'Validation Error',
        description: 'Please enter who completed this production.',
        variant: 'destructive',
      });
      return;
    }

    completeItemMutation.mutate({
      id: selectedItem.id,
      quantityCompleted: parseInt(quantityCompleted),
      fabricLot: fabricLot || undefined,
      fabricBatch: fabricBatch || undefined,
      fabricRoll: fabricRoll || undefined,
      materialDetails: materialDetails || undefined,
      completionNotes: completionNotes || undefined,
      completedBy: completedBy,
    });
  };

  const handleGenerateLabels = () => {
    if (!selectedItem) return;
    
    const quantity = selectedItem.quantityCompleted || selectedItem.quantityRequested;
    generateLabelsMutation.mutate({ id: selectedItem.id, quantity });
    setIsLabelsDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="default" className="flex items-center gap-1 bg-blue-600"><PlayCircle className="h-3 w-3" /> In Progress</Badge>;
      case 'COMPLETED':
        return <Badge variant="default" className="flex items-center gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="cutting-table-mfg-queue">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cutting Table Manufacturing Queue</h1>
          <p className="text-muted-foreground mt-1">
            Manage manufacturing work orders for cutting table operations
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Manufacturing Queue</CardTitle>
              <CardDescription>
                Track and manage cutting table production work
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading queue items...</div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in queue for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueItems.map((item) => (
                  <TableRow key={item.id} data-testid={`queue-item-${item.id}`}>
                    <TableCell className="font-mono">{item.partNumber || 'N/A'}</TableCell>
                    <TableCell>{item.partName || 'Unknown Part'}</TableCell>
                    <TableCell>
                      {item.quantityCompleted !== null && item.quantityCompleted !== undefined
                        ? `${item.quantityCompleted}/${item.quantityRequested}`
                        : item.quantityRequested}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.priority || 50}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'Not set'}
                    </TableCell>
                    <TableCell>
                      {item.p2PoId ? (
                        <Badge variant="secondary">P2 PO #{item.p2PoId}</Badge>
                      ) : item.vendorPoId ? (
                        <Badge variant="secondary">Vendor PO #{item.vendorPoId}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Direct</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startItemMutation.mutate(item.id)}
                            data-testid={`button-start-${item.id}`}
                          >
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {item.status === 'IN_PROGRESS' && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenProductionDialog(item)}
                            data-testid={`button-complete-${item.id}`}
                          >
                            <Package className="h-4 w-4 mr-1" />
                            Record Production
                          </Button>
                        )}
                        {item.status === 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenLabelsDialog(item)}
                            data-testid={`button-labels-${item.id}`}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print Labels
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Production Entry Dialog */}
      <Dialog open={isProductionDialogOpen} onOpenChange={setIsProductionDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-production-entry">
          <DialogHeader>
            <DialogTitle>Record Production & Traceability</DialogTitle>
            <DialogDescription>
              Enter production quantity and material traceability information for{' '}
              {selectedItem?.partNumber} - {selectedItem?.partName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity Completed*</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={quantityCompleted}
                  onChange={(e) => setQuantityCompleted(e.target.value)}
                  placeholder="Enter quantity"
                  data-testid="input-quantity-completed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="completedBy">Completed By*</Label>
                <Input
                  id="completedBy"
                  value={completedBy}
                  onChange={(e) => setCompletedBy(e.target.value)}
                  placeholder="Operator name"
                  data-testid="input-completed-by"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fabricLot">Fabric Lot Number</Label>
                <Input
                  id="fabricLot"
                  value={fabricLot}
                  onChange={(e) => setFabricLot(e.target.value)}
                  placeholder="e.g., LOT-2023-001"
                  data-testid="input-fabric-lot"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fabricBatch">Fabric Batch Number</Label>
                <Input
                  id="fabricBatch"
                  value={fabricBatch}
                  onChange={(e) => setFabricBatch(e.target.value)}
                  placeholder="e.g., BATCH-456"
                  data-testid="input-fabric-batch"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fabricRoll">Fabric Roll Number</Label>
              <Input
                id="fabricRoll"
                value={fabricRoll}
                onChange={(e) => setFabricRoll(e.target.value)}
                placeholder="e.g., ROLL-789"
                data-testid="input-fabric-roll"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="materialDetails">Material Details</Label>
              <Input
                id="materialDetails"
                value={materialDetails}
                onChange={(e) => setMaterialDetails(e.target.value)}
                placeholder="Material type, supplier, etc."
                data-testid="input-material-details"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completionNotes">Completion Notes</Label>
              <Textarea
                id="completionNotes"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Any notes about the production run..."
                rows={3}
                data-testid="input-completion-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsProductionDialogOpen(false);
                resetProductionForm();
              }}
              data-testid="button-cancel-production"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteProduction}
              disabled={completeItemMutation.isPending}
              data-testid="button-submit-production"
            >
              {completeItemMutation.isPending ? 'Saving...' : 'Complete Production'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Label Generation Dialog */}
      <Dialog open={isLabelsDialogOpen} onOpenChange={setIsLabelsDialogOpen}>
        <DialogContent data-testid="dialog-print-labels">
          <DialogHeader>
            <DialogTitle>Generate Barcode Labels</DialogTitle>
            <DialogDescription>
              Print barcode labels for completed items: {selectedItem?.partNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will generate {selectedItem?.quantityCompleted || selectedItem?.quantityRequested} barcode labels
              for the completed items.
            </p>
            {selectedItem?.fabricLot && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Traceability Information:</p>
                <ul className="text-sm mt-2 space-y-1">
                  {selectedItem.fabricLot && <li>Lot: {selectedItem.fabricLot}</li>}
                  {selectedItem.fabricBatch && <li>Batch: {selectedItem.fabricBatch}</li>}
                  {selectedItem.fabricRoll && <li>Roll: {selectedItem.fabricRoll}</li>}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsLabelsDialogOpen(false)}
              data-testid="button-cancel-labels"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateLabels}
              disabled={generateLabelsMutation.isPending}
              data-testid="button-print-labels"
            >
              <Printer className="h-4 w-4 mr-2" />
              {generateLabelsMutation.isPending ? 'Generating...' : 'Print Labels'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
