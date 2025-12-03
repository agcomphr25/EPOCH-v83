import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar as CalendarIcon, 
  Printer,
  Search,
  Filter,
  Package,
  Clock,
  CheckCircle,
  ArrowUpDown
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
  priority: 'normal' | 'high' | 'urgent';
  status: 'pending' | 'partial' | 'scheduled';
}

interface ScheduleEntry {
  itemId: string;
  quantity: number;
  weekNumber: number;
  itemsPerDay: number;
  workDays: number;
}

export default function P2ProductionScheduler() {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [scheduleEntries, setScheduleEntries] = useState<Record<string, ScheduleEntry>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedWeek, setSelectedWeek] = useState<number>(getCurrentWeekNumber());
  const { toast } = useToast();

  const { data: schedulingList = [], isLoading, refetch } = useQuery<SchedulableItem[]>({
    queryKey: ['/api/p2/control-center/scheduling-list'],
  });

  const scheduleMutation = useMutation({
    mutationFn: async (entries: ScheduleEntry[]) => {
      const response = await apiRequest('/api/p2/schedule', {
        method: 'POST',
        body: { entries },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-layup-schedules'] });
      toast({
        title: 'Items Scheduled',
        description: 'Selected items have been scheduled for production.',
      });
      setSelectedItems(new Set());
      setScheduleEntries({});
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

  const printBarcodesMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const response = await apiRequest('/api/p2/print-barcodes', {
        method: 'POST',
        body: { itemIds },
      });
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast({
        title: 'Barcodes Generated',
        description: 'Barcode labels have been generated for printing.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate barcodes',
        variant: 'destructive',
      });
    },
  });

  const filteredItems = schedulingList.filter((item) => {
    const matchesSearch = 
      item.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      const newEntries = { ...scheduleEntries };
      delete newEntries[itemId];
      setScheduleEntries(newEntries);
    } else {
      newSelected.add(itemId);
      const item = schedulingList.find((i) => i.id === itemId);
      if (item) {
        setScheduleEntries({
          ...scheduleEntries,
          [itemId]: {
            itemId,
            quantity: item.remainingQuantity,
            weekNumber: selectedWeek,
            itemsPerDay: Math.ceil(item.remainingQuantity / 5),
            workDays: 5,
          },
        });
      }
    }
    setSelectedItems(newSelected);
  };

  const updateScheduleEntry = (itemId: string, field: keyof ScheduleEntry, value: number) => {
    const entry = scheduleEntries[itemId];
    if (!entry) return;

    const updated = { ...entry, [field]: value };
    
    if (field === 'itemsPerDay' || field === 'workDays') {
      updated.quantity = updated.itemsPerDay * updated.workDays;
    } else if (field === 'quantity') {
      updated.itemsPerDay = Math.ceil(value / updated.workDays);
    }

    setScheduleEntries({ ...scheduleEntries, [itemId]: updated });
  };

  const handleScheduleSelected = () => {
    const entries = Array.from(selectedItems).map((id) => scheduleEntries[id]).filter(Boolean);
    if (entries.length === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select items to schedule',
        variant: 'destructive',
      });
      return;
    }
    scheduleMutation.mutate(entries);
  };

  const handlePrintBarcodes = () => {
    const itemIds = Array.from(selectedItems);
    if (itemIds.length === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select items to print barcodes',
        variant: 'destructive',
      });
      return;
    }
    printBarcodesMutation.mutate(itemIds);
  };

  const selectAll = () => {
    const allIds = new Set(filteredItems.map((item) => item.id));
    setSelectedItems(allIds);
    
    const entries: Record<string, ScheduleEntry> = {};
    filteredItems.forEach((item) => {
      entries[item.id] = {
        itemId: item.id,
        quantity: item.remainingQuantity,
        weekNumber: selectedWeek,
        itemsPerDay: Math.ceil(item.remainingQuantity / 5),
        workDays: 5,
      };
    });
    setScheduleEntries(entries);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setScheduleEntries({});
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      normal: { variant: 'secondary', label: 'Normal' },
      high: { variant: 'default', label: 'High' },
      urgent: { variant: 'destructive', label: 'Urgent' },
    };
    const c = config[priority] || config.normal;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string; icon: typeof Clock }> = {
      pending: { variant: 'outline', label: 'Pending', icon: Clock },
      partial: { variant: 'secondary', label: 'Partial', icon: Clock },
      scheduled: { variant: 'default', label: 'Scheduled', icon: CheckCircle },
    };
    const c = config[status] || config.pending;
    const Icon = c.icon;
    return (
      <Badge variant={c.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {c.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Production Scheduler
            </CardTitle>
            <CardDescription>
              Schedule P2 items for weekly production
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Label>Week:</Label>
            <Select 
              value={selectedWeek.toString()} 
              onValueChange={(v) => setSelectedWeek(parseInt(v))}
            >
              <SelectTrigger className="w-32" data-testid="select-week">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getWeekOptions().map((week) => (
                  <SelectItem key={week.number} value={week.number.toString()}>
                    Week {week.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters and Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40" data-testid="select-filter-status">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>

        {/* Selection Summary */}
        {selectedItems.size > 0 && (
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Badge variant="default" className="text-lg px-3 py-1">
                    {selectedItems.size} items selected
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Total quantity: {
                      Array.from(selectedItems)
                        .map((id) => scheduleEntries[id]?.quantity || 0)
                        .reduce((a, b) => a + b, 0)
                    }
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handlePrintBarcodes}
                    disabled={printBarcodesMutation.isPending}
                    data-testid="button-print-barcodes"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print Barcodes
                  </Button>
                  <Button
                    onClick={handleScheduleSelected}
                    disabled={scheduleMutation.isPending}
                    data-testid="button-schedule-selected"
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule Selected'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 border rounded-lg border-dashed">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No items available for scheduling</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                  <TableHead className="text-center">Schedule Qty</TableHead>
                  <TableHead className="text-center">Items/Day</TableHead>
                  <TableHead className="text-center">Days</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const isSelected = selectedItems.has(item.id);
                  const entry = scheduleEntries[item.id];

                  return (
                    <TableRow 
                      key={item.id}
                      className={isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleItemSelection(item.id)}
                          data-testid={`checkbox-item-${item.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.poNumber}</TableCell>
                      <TableCell>{item.partNumber}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.description}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{item.remainingQuantity}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {isSelected ? (
                          <Input
                            type="number"
                            value={entry?.quantity || 0}
                            onChange={(e) => updateScheduleEntry(item.id, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-20 text-center"
                            max={item.remainingQuantity}
                            data-testid={`input-schedule-qty-${item.id}`}
                          />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isSelected ? (
                          <Input
                            type="number"
                            value={entry?.itemsPerDay || 0}
                            onChange={(e) => updateScheduleEntry(item.id, 'itemsPerDay', parseInt(e.target.value) || 0)}
                            className="w-16 text-center"
                            data-testid={`input-items-per-day-${item.id}`}
                          />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isSelected ? (
                          <Input
                            type="number"
                            value={entry?.workDays || 5}
                            onChange={(e) => updateScheduleEntry(item.id, 'workDays', parseInt(e.target.value) || 1)}
                            className="w-12 text-center"
                            min={1}
                            max={7}
                            data-testid={`input-work-days-${item.id}`}
                          />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {item.dueDate ? format(new Date(item.dueDate), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell>{getPriorityBadge(item.priority)}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil(diff / oneWeek);
}

function getWeekOptions(): { number: number; label: string }[] {
  const currentWeek = getCurrentWeekNumber();
  const options = [];
  for (let i = 0; i < 8; i++) {
    options.push({
      number: currentWeek + i,
      label: `Week ${currentWeek + i}`,
    });
  }
  return options;
}
