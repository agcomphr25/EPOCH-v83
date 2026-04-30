import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { RequirementDrawer } from '@/components/RequirementDrawer';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
  MoreHorizontal,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Settings2,
  Info,
  Unlock,
} from 'lucide-react';
import { ReturnsRepairsSection } from '@/components/ReturnsRepairsSection';

type CoreQueueItem = {
  id: number;
  inventoryItemId: number | null;
  department: string;
  parentProductionOrderId: number | null;
  quantityRequested: number;
  quantityCompleted: number | null;
  priority: number | null;
  status: string;
  dueDate: string | null;
  requestedBy: string | null;
  assignedTo: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  releasedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  queueType: string | null;
  readinessStatus: string | null;
  percentReady: string | null;
  blockedReason: string | null;
  inventoryItem: {
    id: number;
    agPartNumber: string | null;
    name: string;
    sku: string | null;
    type: string;
    manufacturedCategory: string | null;
    manufacturingDepartment: string | null;
    notes: string | null;
  } | null;
};

type EvaluateReadinessResponse = {
  readinessStatus: string;
  percentReady: string | number | null;
  blockedReason: string | null;
};

const READINESS_ORDER: Record<string, number> = {
  BLOCKED: 0,
  PARTIAL: 1,
  NOT_READY: 2,
  READY: 3,
};

function sortByReadiness(items: CoreQueueItem[]): CoreQueueItem[] {
  return [...items].sort((a, b) => {
    const aOrder = READINESS_ORDER[a.readinessStatus ?? 'NOT_READY'] ?? 2;
    const bOrder = READINESS_ORDER[b.readinessStatus ?? 'NOT_READY'] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return aDate - bDate;
  });
}

function ReadinessBadge({ status, percent }: { status: string | null; percent: string | null }) {
  const pct = percent ? Math.round(parseFloat(percent)) : 0;
  switch (status) {
    case 'READY':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          READY · {pct}%
        </Badge>
      );
    case 'PARTIAL':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700">
          <AlertCircle className="w-3 h-3 mr-1" />
          PARTIAL · {pct}%
        </Badge>
      );
    case 'BLOCKED':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700">
          <XCircle className="w-3 h-3 mr-1" />
          BLOCKED · {pct}%
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600">
          <AlertTriangle className="w-3 h-3 mr-1" />
          NOT READY · {pct}%
        </Badge>
      );
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Clock className="w-3 h-3 mr-1" />Pending
        </Badge>
      );
    case 'IN_PROGRESS':
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <PlayCircle className="w-3 h-3 mr-1" />In Progress
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />Completed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <XCircle className="w-3 h-3 mr-1" />Cancelled
        </Badge>
      );
    case 'RELEASED':
      return (
        <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          <Unlock className="w-3 h-3 mr-1" />Released
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPriorityColor(priority: number) {
  if (priority <= 25) return 'text-red-600 dark:text-red-400 font-bold';
  if (priority <= 50) return 'text-orange-600 dark:text-orange-400 font-semibold';
  if (priority <= 75) return 'text-blue-600 dark:text-blue-400';
  return 'text-gray-600 dark:text-gray-400';
}

export default function CoreQueue() {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedReadiness, setSelectedReadiness] = useState<string>('ALL');
  const [drawerItem, setDrawerItem] = useState<CoreQueueItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: rawItems = [], isLoading } = useQuery<CoreQueueItem[]>({
    queryKey: ['/api/manufacturing-queue', 'CORE', selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams({ queueType: 'CORE' });
      if (selectedStatus && selectedStatus !== 'ALL') params.append('status', selectedStatus);
      return apiRequest(`/api/manufacturing-queue?${params.toString()}`);
    },
  });

  const filteredItems = (() => {
    let items = rawItems;
    if (selectedReadiness !== 'ALL') {
      items = items.filter((i) => (i.readinessStatus ?? 'NOT_READY') === selectedReadiness);
    }
    return sortByReadiness(items);
  })();

  const reEvaluateMutation = useMutation<EvaluateReadinessResponse, Error, number>({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/manufacturing-queue/${id}/evaluate-readiness`, { method: 'POST' });
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/allocation-requirements/by-queue', id] });
      toast({ title: 'Readiness evaluated', description: 'Readiness status has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to evaluate readiness.', variant: 'destructive' });
    },
  });

  const generateRequirementsMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/manufacturing-queue/${id}/generate-requirements`, { method: 'POST' });
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/allocation-requirements/by-queue', id] });
      toast({ title: 'Requirements generated', description: 'Allocation requirements have been generated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate requirements.', variant: 'destructive' });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/manufacturing-queue/${id}/release`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
      toast({ title: 'Core released', description: 'The core job has been released to the floor.' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to release core job.';
      toast({ title: 'Release failed', description: message, variant: 'destructive' });
    },
  });

  const openDrawer = (item: CoreQueueItem) => {
    setDrawerItem(item);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto py-6 px-4 dark:bg-gray-950 dark:text-white">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 dark:text-white">Core Queue</h1>
          <p className="text-muted-foreground dark:text-gray-400">
            Readiness gating for core prep jobs — confirm honeycomb/foam core stock, adhesive film, and consumables are allocated before release.
          </p>
        </div>

        <ReturnsRepairsSection repairDepartment="Core" />

        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div>
                <CardTitle className="dark:text-white">Core Queue Items</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Sorted by urgency: Blocked → Partial → Not Ready → Ready, then by due date
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={selectedReadiness} onValueChange={setSelectedReadiness}>
                  <SelectTrigger className="w-[160px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                    <SelectValue placeholder="Readiness" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="ALL">All Readiness</SelectItem>
                    <SelectItem value="BLOCKED">Blocked</SelectItem>
                    <SelectItem value="PARTIAL">Partial</SelectItem>
                    <SelectItem value="NOT_READY">Not Ready</SelectItem>
                    <SelectItem value="READY">Ready</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-[150px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="RELEASED">Released</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground dark:text-gray-400">Loading core queue...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
                No core items found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-800">
                      <TableHead className="dark:text-gray-300">Priority</TableHead>
                      <TableHead className="dark:text-gray-300">Part Number</TableHead>
                      <TableHead className="dark:text-gray-300">Item Name</TableHead>
                      <TableHead className="dark:text-gray-300">Department</TableHead>
                      <TableHead className="dark:text-gray-300">Readiness</TableHead>
                      <TableHead className="dark:text-gray-300">Quantity</TableHead>
                      <TableHead className="dark:text-gray-300">Status</TableHead>
                      <TableHead className="dark:text-gray-300">Due Date</TableHead>
                      <TableHead className="dark:text-gray-300">Assigned To</TableHead>
                      <TableHead className="dark:text-gray-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow
                        key={item.id}
                        className="dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        onClick={() => openDrawer(item)}
                      >
                        <TableCell className={getPriorityColor(item.priority ?? 50)}>
                          {item.priority ?? 50}
                        </TableCell>
                        <TableCell className="font-mono text-sm dark:text-gray-300">
                          {item.inventoryItem?.agPartNumber ?? '-'}
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          {item.inventoryItem?.name ?? 'Unknown'}
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          {item.department}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ReadinessBadge status={item.readinessStatus} percent={item.percentReady} />
                            {item.blockedReason && (item.readinessStatus === 'BLOCKED' || item.readinessStatus === 'PARTIAL' || item.readinessStatus === 'NOT_READY') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help ml-1" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{item.blockedReason}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <span className="font-semibold">{item.quantityCompleted ?? 0}</span>
                          {' / '}
                          {item.quantityRequested}
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="dark:text-gray-300">
                          {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="dark:text-gray-300">{item.assignedTo ?? '-'}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                              <DropdownMenuItem
                                onClick={() => releaseMutation.mutate(item.id)}
                                disabled={item.readinessStatus !== 'READY' || item.status === 'RELEASED' || releaseMutation.isPending}
                                className="dark:text-gray-200 dark:focus:bg-gray-700"
                              >
                                <Unlock className="w-4 h-4 mr-2" />
                                Release Core Job
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="dark:border-gray-700" />
                              <DropdownMenuItem
                                onClick={() => reEvaluateMutation.mutate(item.id)}
                                disabled={reEvaluateMutation.isPending}
                                className="dark:text-gray-200 dark:focus:bg-gray-700"
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Re-evaluate Readiness
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => generateRequirementsMutation.mutate(item.id)}
                                disabled={generateRequirementsMutation.isPending}
                                className="dark:text-gray-200 dark:focus:bg-gray-700"
                              >
                                <Settings2 className="w-4 h-4 mr-2" />
                                Generate Requirements
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

        <RequirementDrawer
          kit={drawerItem}
          open={drawerOpen}
          onClose={closeDrawer}
          onQueueRefetch={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
          }}
        />
      </div>
    </TooltipProvider>
  );
}
