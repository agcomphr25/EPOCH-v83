import { useMemo, useState } from 'react';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
  MoreHorizontal,
  Plus,
  Check,
  ChevronsUpDown,
  ShieldAlert,
} from 'lucide-react';
import { ReturnsRepairsSection } from '@/components/ReturnsRepairsSection';
import type { ManufacturingQueue } from '@shared/schema';

type StockBuildPart = {
  id: number;
  agPartNumber: string;
  name: string;
  description?: string | null;
  manufacturedCategory?: string | null;
  manufacturingLevel?: string | null;
  productionSystem: 'P1' | 'P2' | null;
  defaultDepartmentName?: string | null;
  availableQuantity: number;
  releasedBomCount: number;
  activeRoutingCount: number;
  releasedTraceabilityPolicyCount: number;
  readyForStockBuildPreview: boolean;
  blockers: string[];
};

type SharedManufacturingDepartment = {
  id: number;
  name: string;
  isActive?: boolean;
  productionEnabled?: boolean;
  sortOrder?: number;
};

const ALL_MANUFACTURING_QUEUES = '__ALL__';
const LEGACY_MANUFACTURING_QUEUES = [
  'Cutting Table',
  'CNC',
  'Cores',
  'Assembly',
];

type QueueItemWithInventory = ManufacturingQueue & {
  inventoryItem: {
    id: number;
    agPartNumber: string | null;
    name: string;
    sku: string | null;
    type: string;
    manufacturingDepartment: string | null;
    notes: string | null;
  } | null;
};

export default function ManufacturingQueue() {
  const { toast } = useToast();
  const [selectedDepartment, setSelectedDepartment] = useState<string>(
    ALL_MANUFACTURING_QUEUES
  );
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { data: sharedDepartments = [] } = useQuery<
    SharedManufacturingDepartment[]
  >({
    queryKey: ['/api/shared-departments', 'manufacturing-queue-filter'],
    queryFn: () => apiRequest('/api/shared-departments'),
  });
  const manufacturingQueues = useMemo(() => {
    const departments = sharedDepartments
      .filter(
        (department) =>
          department.isActive !== false &&
          department.productionEnabled !== false &&
          department.name.trim().length > 0
      )
      .sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
          left.name.localeCompare(right.name)
      )
      .map((department) => department.name.trim());
    return Array.from(
      new Set([...LEGACY_MANUFACTURING_QUEUES, ...departments])
    );
  }, [sharedDepartments]);

  // Fetch queue items
  const { data: queueItems = [], isLoading } = useQuery<
    QueueItemWithInventory[]
  >({
    queryKey: ['/api/manufacturing-queue', selectedDepartment, selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedDepartment !== ALL_MANUFACTURING_QUEUES)
        params.append('department', selectedDepartment);
      if (selectedStatus && selectedStatus !== 'ALL')
        params.append('status', selectedStatus);
      return apiRequest(`/api/manufacturing-queue?${params.toString()}`);
    },
    enabled: true,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest(`/api/manufacturing-queue/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      toast({
        title: 'Status updated',
        description: 'The queue item status has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description:
          error.message || 'Failed to update status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/manufacturing-queue/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      toast({
        title: 'Item deleted',
        description: 'The queue item has been removed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description:
          error.message || 'Failed to delete item. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = (id: number, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this item from the queue?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge
            variant="outline"
            className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          >
            <PlayCircle className="w-3 h-3 mr-1" />
            In Progress
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge
            variant="outline"
            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge
            variant="outline"
            className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
          >
            <XCircle className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority <= 25) return 'text-red-600 dark:text-red-400 font-bold';
    if (priority <= 50)
      return 'text-orange-600 dark:text-orange-400 font-semibold';
    if (priority <= 75) return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  return (
    <div className="container mx-auto py-6 px-4 dark:bg-gray-950 dark:text-white">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 dark:text-white">
            Manufacturing Queue
          </h1>
          <p className="text-muted-foreground dark:text-gray-400">
            Track and manage items that need to be manufactured
          </p>
        </div>
        <AddQueueItemDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
        />
      </div>

      <ReturnsRepairsSection repairDepartment="P1 Production Queue" />

      <Card className="dark:bg-gray-900 dark:border-gray-800">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div>
              <CardTitle className="dark:text-white">Queue Items</CardTitle>
              <CardDescription className="dark:text-gray-400">
                View and manage items in the manufacturing queue
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger
                  className="w-[200px] dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  data-testid="select-department"
                >
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value={ALL_MANUFACTURING_QUEUES}>
                    All Queues
                  </SelectItem>
                  {manufacturingQueues.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger
                  className="w-[150px] dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  data-testid="select-status"
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
              Loading queue items...
            </div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
              No items found in the queue for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-800">
                    <TableHead className="dark:text-gray-300">
                      Priority
                    </TableHead>
                    <TableHead className="dark:text-gray-300">
                      Part Number
                    </TableHead>
                    <TableHead className="dark:text-gray-300">
                      Item Name
                    </TableHead>
                    <TableHead className="dark:text-gray-300">
                      Department
                    </TableHead>
                    <TableHead className="dark:text-gray-300">
                      Quantity
                    </TableHead>
                    <TableHead className="dark:text-gray-300">Status</TableHead>
                    <TableHead className="dark:text-gray-300">
                      Due Date
                    </TableHead>
                    <TableHead className="dark:text-gray-300">
                      Assigned To
                    </TableHead>
                    <TableHead className="dark:text-gray-300">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className="dark:border-gray-800"
                      data-testid={`row-queue-${item.id}`}
                    >
                      <TableCell
                        className={getPriorityColor(item.priority || 50)}
                      >
                        {item.priority || 50}
                      </TableCell>
                      <TableCell className="font-mono text-sm dark:text-gray-300">
                        {item.inventoryItem?.agPartNumber || '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.inventoryItem?.name || 'Unknown'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.department}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <span className="font-semibold">
                          {item.quantityCompleted || 0}
                        </span>{' '}
                        / {item.quantityRequested}
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.dueDate
                          ? new Date(item.dueDate).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.assignedTo || '-'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-actions-${item.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="dark:bg-gray-800 dark:border-gray-700"
                          >
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(item.id, 'IN_PROGRESS')
                              }
                              disabled={item.status === 'IN_PROGRESS'}
                              className="dark:text-gray-200 dark:focus:bg-gray-700"
                            >
                              Mark In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(item.id, 'COMPLETED')
                              }
                              disabled={item.status === 'COMPLETED'}
                              className="dark:text-gray-200 dark:focus:bg-gray-700"
                            >
                              Mark Completed
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(item.id, 'CANCELLED')
                              }
                              disabled={item.status === 'CANCELLED'}
                              className="dark:text-gray-200 dark:focus:bg-gray-700"
                            >
                              Cancel
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(item.id)}
                              className="text-red-600 dark:text-red-400 dark:focus:bg-gray-700"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddQueueItemDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState(50);
  const [dueDate, setDueDate] = useState('');
  const [targetStockLocation, setTargetStockLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [draftIdempotencyKey] = useState(() => crypto.randomUUID());
  const [savedDraft, setSavedDraft] = useState<any>(null);
  const stockBuildWritesEnabled =
    import.meta.env.VITE_STOCK_BUILD_REQUEST_WRITES_ENABLED === 'true';
  const releaseReadinessWritesEnabled =
    import.meta.env.VITE_STOCK_BUILD_RELEASE_READINESS_WRITES_ENABLED ===
    'true';
  const { data, isLoading, isError } = useQuery<{ parts: StockBuildPart[] }>({
    queryKey: ['/api/stock-build-readiness/parts'],
    queryFn: () => apiRequest('/api/stock-build-readiness/parts'),
    enabled: isOpen,
  });
  const parts = data?.parts ?? [];
  const selectedPart = parts.find((part) => part.id === selectedPartId);
  const createDraft = useMutation({
    mutationFn: () =>
      apiRequest('/api/stock-build-readiness/drafts', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: selectedPartId,
          requestedQuantity: quantity,
          priority,
          dueDate: dueDate || undefined,
          targetStockLocation: targetStockLocation || undefined,
          notes: notes || undefined,
          idempotencyKey: draftIdempotencyKey,
        }),
      }),
    onSuccess: (result: any) => {
      setSavedDraft(result.request);
      toast({
        title: 'Stock-build draft saved',
        description:
          'The controlled request was saved. It has not released work or changed inventory.',
      });
    },
    onError: (error: Error) =>
      toast({
        title: 'Unable to save stock-build draft',
        description: error.message,
        variant: 'destructive',
      }),
  });
  const { data: releaseReadiness, isFetching: isCheckingReleaseReadiness } =
    useQuery<any>({
      queryKey: [
        '/api/stock-build-readiness/requests',
        savedDraft?.id,
        'release-readiness',
      ],
      queryFn: () =>
        apiRequest(
          `/api/stock-build-readiness/requests/${savedDraft.id}/release-readiness`
        ),
      enabled: Boolean(savedDraft?.id),
    });
  const authorizeReleaseReadiness = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/stock-build-readiness/requests/${savedDraft.id}/release-readiness/authorize`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedConcurrencyVersion: Number(savedDraft.concurrency_version),
            idempotencyKey: crypto.randomUUID(),
            signatureMeaning:
              'I authorize this controlled stock-build request as ready for work-order release.',
          }),
        }
      ),
    onSuccess: () =>
      toast({
        title: 'Release readiness authorized',
        description:
          'The signed decision is recorded. No work order or inventory transaction was created.',
      }),
    onError: (error: Error) =>
      toast({
        title: 'Unable to authorize release readiness',
        description: error.message,
        variant: 'destructive',
      }),
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-queue-item">
          <Plus className="w-4 h-4 mr-2" />
          Add to Queue
        </Button>
      </DialogTrigger>
      <DialogContent className="dark:bg-gray-900 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            Create Stock-Build Request
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Select any active manufactured P1 or P2 part. The controlled draft
            and signed release-readiness decision do not create production or
            inventory records.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="dark:text-gray-300">
              Active manufactured part
            </Label>
            <Popover open={partPickerOpen} onOpenChange={setPartPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="mt-1 w-full justify-between"
                  data-testid="stock-build-part-picker"
                >
                  {selectedPart
                    ? `${selectedPart.agPartNumber} — ${selectedPart.name}`
                    : isLoading
                      ? 'Loading manufactured parts…'
                      : 'Search part number or name…'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[520px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search active manufactured parts…" />
                  <CommandList>
                    <CommandEmpty>
                      {isError
                        ? 'Unable to load manufactured parts.'
                        : 'No active manufactured part found.'}
                    </CommandEmpty>
                    <CommandGroup>
                      {parts.map((part) => (
                        <CommandItem
                          key={part.id}
                          value={`${part.agPartNumber} ${part.name} ${part.productionSystem ?? 'unclassified'}`}
                          onSelect={() => {
                            setSelectedPartId(part.id);
                            setPartPickerOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${selectedPartId === part.id ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <div className="flex-1">
                            <div className="font-medium">
                              {part.agPartNumber} — {part.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {part.productionSystem ?? 'P1/P2 not assigned'} ·{' '}
                              {part.defaultDepartmentName ??
                                'Department missing'}{' '}
                              · Available {part.availableQuantity}
                            </div>
                          </div>
                          {!part.readyForStockBuildPreview && (
                            <ShieldAlert className="h-4 w-4 text-amber-600" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="quantityRequested" className="dark:text-gray-300">
                Quantity Requested
              </Label>
              <Input
                id="quantityRequested"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Number(e.target.value)))
                }
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                data-testid="input-quantity-requested"
              />
            </div>
            <div>
              <Label htmlFor="priority" className="dark:text-gray-300">
                Priority (1-100, lower = higher priority)
              </Label>
              <Input
                id="priority"
                type="number"
                min="1"
                max="100"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                data-testid="input-priority"
              />
            </div>
            <div>
              <Label htmlFor="dueDate" className="dark:text-gray-300">
                Due Date (optional)
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                data-testid="input-due-date"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="targetStockLocation">Target stock location</Label>
              <Input
                id="targetStockLocation"
                value={targetStockLocation}
                onChange={(event) => setTargetStockLocation(event.target.value)}
                placeholder="Optional inventory location"
              />
            </div>
            <div>
              <Label htmlFor="stockBuildNotes">Notes</Label>
              <Textarea
                id="stockBuildNotes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional request notes"
                rows={2}
              />
            </div>
          </div>
          {selectedPart && (
            <Card
              className={
                selectedPart.readyForStockBuildPreview
                  ? 'border-green-300'
                  : 'border-amber-300'
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {selectedPart.productionSystem ?? 'Unclassified'} stock-build
                  readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  {selectedPart.defaultDepartmentName ?? 'No department'} · BOM{' '}
                  {selectedPart.releasedBomCount} · Routing{' '}
                  {selectedPart.activeRoutingCount} · Traceability policy{' '}
                  {selectedPart.releasedTraceabilityPolicyCount}
                </div>
                {selectedPart.blockers.length === 0 ? (
                  <div className="text-green-700">
                    Authority prerequisites are present. Work-order release
                    remains disabled until the stock-work materialization gate
                    is implemented.
                  </div>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-amber-800">
                    {selectedPart.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {savedDraft && (
            <Card className="border-blue-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Controlled release decision
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {isCheckingReleaseReadiness ? (
                  <div>Re-evaluating current authority and stock…</div>
                ) : releaseReadiness?.evaluation ? (
                  <>
                    <div>
                      Requested {releaseReadiness.evaluation.requestedQuantity}{' '}
                      · Available{' '}
                      {releaseReadiness.evaluation.availableInventoryQuantity} ·
                      Net build {releaseReadiness.evaluation.netBuildQuantity}
                    </div>
                    <div className="text-muted-foreground">
                      Open WIP is excluded until controlled work-order linkage
                      is authoritative.
                    </div>
                    {releaseReadiness.evaluation.blockers?.length > 0 && (
                      <ul className="list-disc pl-5 text-amber-800">
                        {releaseReadiness.evaluation.blockers.map(
                          (blocker: string) => (
                            <li key={blocker}>{blocker}</li>
                          )
                        )}
                      </ul>
                    )}
                    <Button
                      type="button"
                      disabled={
                        !releaseReadinessWritesEnabled ||
                        !releaseReadiness.evaluation.readyForRelease ||
                        authorizeReleaseReadiness.isPending
                      }
                      onClick={() => authorizeReleaseReadiness.mutate()}
                      data-testid="button-authorize-stock-build-release-readiness"
                    >
                      Authorize Ready for Release
                    </Button>
                  </>
                ) : (
                  <div>Release readiness could not be evaluated.</div>
                )}
              </CardContent>
            </Card>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={
                !stockBuildWritesEnabled ||
                Boolean(savedDraft) ||
                !selectedPart?.readyForStockBuildPreview ||
                createDraft.isPending
              }
              onClick={() => createDraft.mutate()}
              data-testid="button-save-stock-work-draft"
            >
              {createDraft.isPending
                ? 'Saving Draft…'
                : 'Save Controlled Draft'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
