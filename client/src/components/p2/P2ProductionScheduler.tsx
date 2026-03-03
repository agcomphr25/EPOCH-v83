import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Calendar as CalendarIcon, 
  Search,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface SchedulableItem {
  id: string;
  poNumber: string;
  partNumber: string;
  description: string;
  totalQuantity: number;
  scheduledQuantity: number;
  remainingQuantity: number;
  dueDate: string;
  priority: string;
  status: string;
}

interface GroupedPart {
  key: string;
  poNumber: string;
  partNumber: string;
  description: string;
  dueDate: string;
  pendingCount: number;
  scheduledCount: number;
  totalCount: number;
  itemIds: string[];
}

export default function P2ProductionScheduler() {
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleAmounts, setScheduleAmounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const { data: schedulingList = [], isLoading, refetch } = useQuery<SchedulableItem[]>({
    queryKey: ['/api/p2/control-center/scheduling-list'],
  });

  // Group items by PO + Part Number
  const groupedParts = useMemo(() => {
    const groups: Record<string, GroupedPart> = {};
    
    schedulingList.forEach((item) => {
      const key = `${item.poNumber}-${item.partNumber}`;
      
      if (!groups[key]) {
        groups[key] = {
          key,
          poNumber: item.poNumber,
          partNumber: item.partNumber,
          description: item.description,
          dueDate: item.dueDate,
          pendingCount: 0,
          scheduledCount: 0,
          totalCount: 0,
          itemIds: [],
        };
      }
      
      groups[key].totalCount++;
      groups[key].itemIds.push(item.id);
      
      if (item.status === 'pending') {
        groups[key].pendingCount++;
      } else {
        groups[key].scheduledCount++;
      }
    });
    
    return Object.values(groups).sort((a, b) => {
      // Sort by due date, then by PO number
      if (a.dueDate && b.dueDate) {
        const dateComp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dateComp !== 0) return dateComp;
      }
      return a.poNumber.localeCompare(b.poNumber);
    });
  }, [schedulingList]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groupedParts;
    const term = searchTerm.toLowerCase();
    return groupedParts.filter(
      (g) =>
        g.poNumber.toLowerCase().includes(term) ||
        g.partNumber.toLowerCase().includes(term) ||
        g.description.toLowerCase().includes(term)
    );
  }, [groupedParts, searchTerm]);

  // Count totals
  const totalPending = groupedParts.reduce((sum, g) => sum + g.pendingCount, 0);
  const totalScheduled = groupedParts.reduce((sum, g) => sum + g.scheduledCount, 0);
  const totalToSchedule = Object.values(scheduleAmounts).reduce((sum, amt) => sum + (amt || 0), 0);

  const scheduleMutation = useMutation({
    mutationFn: async (data: { groupKey: string; quantity: number; itemIds: string[] }) => {
      // Get the first N pending item IDs to schedule
      const pendingItems = schedulingList.filter(
        (item) => 
          data.itemIds.includes(item.id) && 
          item.status === 'pending'
      );
      
      const itemsToSchedule = pendingItems.slice(0, data.quantity);
      
      if (itemsToSchedule.length === 0) {
        throw new Error('No pending items to schedule');
      }

      // Update items to move to Layup department (scheduled)
      const result = await apiRequest('/api/p2/schedule-items', {
        method: 'POST',
        body: { 
          itemIds: itemsToSchedule.map(i => i.id),
        },
      });
      return result;
    },
    onSuccess: (result: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue'] });
      const cuttingMsg = result?.cuttingTableDemands > 0 ? ` ${result.cuttingTableDemands} cutting table stock packet demand(s) created.` : '';
      toast({
        title: 'Items Scheduled',
        description: `${variables.quantity} items have been scheduled for production.${cuttingMsg}`,
      });
      setScheduleAmounts(prev => ({ ...prev, [variables.groupKey]: 0 }));
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule items',
        variant: 'destructive',
      });
    },
  });

  const scheduleAllMutation = useMutation({
    mutationFn: async () => {
      // Collect all items to schedule based on amounts entered
      const allItemsToSchedule: string[] = [];
      
      for (const group of groupedParts) {
        const amount = scheduleAmounts[group.key] || 0;
        if (amount > 0) {
          const pendingItems = schedulingList.filter(
            (item) => 
              group.itemIds.includes(item.id) && 
              item.status === 'pending'
          );
          const itemsToAdd = pendingItems.slice(0, amount).map(i => i.id);
          allItemsToSchedule.push(...itemsToAdd);
        }
      }
      
      if (allItemsToSchedule.length === 0) {
        throw new Error('No items to schedule. Enter quantities first.');
      }

      const result = await apiRequest('/api/p2/schedule-items', {
        method: 'POST',
        body: { itemIds: allItemsToSchedule },
      });
      return result;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue'] });
      const cuttingMsg = result?.cuttingTableDemands > 0 ? ` ${result.cuttingTableDemands} cutting table stock packet demand(s) created.` : '';
      toast({
        title: 'Items Scheduled',
        description: `${totalToSchedule} items have been scheduled for production.${cuttingMsg}`,
      });
      setScheduleAmounts({});
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule items',
        variant: 'destructive',
      });
    },
  });

  const handleScheduleGroup = (group: GroupedPart) => {
    const amount = scheduleAmounts[group.key] || 0;
    if (amount <= 0) {
      toast({
        title: 'Enter Quantity',
        description: 'Please enter the number of items to schedule.',
        variant: 'destructive',
      });
      return;
    }
    if (amount > group.pendingCount) {
      toast({
        title: 'Invalid Quantity',
        description: `Only ${group.pendingCount} items are pending. Cannot schedule ${amount}.`,
        variant: 'destructive',
      });
      return;
    }
    scheduleMutation.mutate({
      groupKey: group.key,
      quantity: amount,
      itemIds: group.itemIds,
    });
  };

  const updateAmount = (key: string, value: number) => {
    setScheduleAmounts(prev => ({ ...prev, [key]: Math.max(0, value) }));
  };

  const setMaxAmount = (group: GroupedPart) => {
    setScheduleAmounts(prev => ({ ...prev, [group.key]: group.pendingCount }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Production Scheduling
        </CardTitle>
        <CardDescription>
          Schedule parts for production. Enter quantities and click Schedule to move items to production.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{totalPending}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Scheduled</span>
              </div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{totalScheduled}</div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-muted-foreground">To Schedule</span>
              </div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{totalToSchedule}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO, part number, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>

          {totalToSchedule > 0 && (
            <Button
              onClick={() => scheduleAllMutation.mutate()}
              disabled={scheduleAllMutation.isPending}
              data-testid="button-schedule-all"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {scheduleAllMutation.isPending ? 'Scheduling...' : `Schedule All (${totalToSchedule})`}
            </Button>
          )}
        </div>

        {/* Parts Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-12 border rounded-lg border-dashed">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No items available for scheduling</p>
            <p className="text-sm text-muted-foreground mt-1">
              Configure BOMs to generate schedulable items
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Pending</TableHead>
                  <TableHead className="text-center">Scheduled</TableHead>
                  <TableHead className="text-center w-32">Qty to Schedule</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => {
                  const amount = scheduleAmounts[group.key] || 0;
                  const hasAmount = amount > 0;
                  
                  return (
                    <TableRow 
                      key={group.key}
                      className={hasAmount ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    >
                      <TableCell className="font-medium text-blue-600">{group.poNumber}</TableCell>
                      <TableCell className="font-mono">{group.partNumber}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={group.description}>
                        {group.description}
                      </TableCell>
                      <TableCell className="text-center">
                        {group.pendingCount > 0 ? (
                          <Badge 
                            variant="outline" 
                            className="bg-amber-50 text-amber-700 border-amber-300 cursor-pointer hover:bg-amber-100"
                            onClick={() => setMaxAmount(group)}
                            title="Click to schedule all"
                          >
                            {group.pendingCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {group.scheduledCount > 0 ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            {group.scheduledCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <Input
                            type="number"
                            min={0}
                            max={group.pendingCount}
                            value={amount || ''}
                            onChange={(e) => updateAmount(group.key, parseInt(e.target.value) || 0)}
                            placeholder="0"
                            className="w-20 text-center"
                            disabled={group.pendingCount === 0}
                            data-testid={`input-qty-${group.key}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {group.dueDate ? (
                          <span className="text-sm">
                            {format(new Date(group.dueDate), 'MMM d, yyyy')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={hasAmount ? 'default' : 'outline'}
                          onClick={() => handleScheduleGroup(group)}
                          disabled={!hasAmount || scheduleMutation.isPending || group.pendingCount === 0}
                          data-testid={`button-schedule-${group.key}`}
                        >
                          Schedule
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Help Text */}
        <div className="text-sm text-muted-foreground flex items-start gap-2 bg-muted/50 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Tip:</strong> Click on the pending count badge to auto-fill the quantity. 
            Enter quantities for multiple parts and click "Schedule All" to schedule them together.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
