import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Package,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Search,
  Printer,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';

interface POProduct {
  id: number;
  customerName: string;
  productName: string;
  poNumber: string;
  dueDate: string | null;
  quantity: number;
  stockModel: string;
  material: string;
  handedness: string;
  status: string;
}

interface GroupedPOData {
  customer: string;
  poNumber: string;
  items: POProduct[];
  earliestDueDate: string | null;
  totalQuantity: number;
}

interface MoldAvailability {
  totalCapacity: number;
  usedByScheduled: number;
  available: number;
}

export default function P1POQueuePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedPO, setSelectedPO] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch P1 PO Queue data
  const { data: groupedPOs = [], isLoading: isLoadingPOs } = useQuery<GroupedPOData[]>({
    queryKey: ['/api/p1-po-queue'],
  });

  // Fetch mold availability
  const { data: moldAvailability, isLoading: isLoadingMolds } = useQuery<MoldAvailability>({
    queryKey: ['/api/p1-po-queue/mold-availability'],
  });

  // Filter grouped POs by search query
  const filteredPOs = useMemo(() => {
    if (!searchQuery.trim()) return groupedPOs;
    
    const query = searchQuery.toLowerCase();
    return groupedPOs.filter(
      (po) =>
        po.customer.toLowerCase().includes(query) ||
        po.poNumber.toLowerCase().includes(query)
    );
  }, [groupedPOs, searchQuery]);

  // Get currently selected PO group
  const selectedPOGroup = useMemo(() => {
    if (!selectedCustomer || !selectedPO) return null;
    return filteredPOs.find(
      (po) => po.customer === selectedCustomer && po.poNumber === selectedPO
    );
  }, [filteredPOs, selectedCustomer, selectedPO]);

  // Calculate total molds required for selected items
  const moldsRequired = useMemo(() => {
    if (!selectedPOGroup) return 0;
    const selectedItemsList = selectedPOGroup.items.filter((item) =>
      selectedItems.has(item.id)
    );
    return selectedItemsList.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [selectedPOGroup, selectedItems]);

  // Handle item selection
  const toggleItemSelection = (itemId: number) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Handle select all items in current PO
  const toggleSelectAllItems = () => {
    if (!selectedPOGroup) return;
    
    const allItemIds = selectedPOGroup.items.map((item) => item.id);
    const allSelected = allItemIds.every((id) => selectedItems.has(id));

    if (allSelected) {
      // Deselect all
      setSelectedItems(new Set());
    } else {
      // Select all
      setSelectedItems(new Set(allItemIds));
    }
  };

  // Create selection batch mutation
  const createSelectionMutation = useMutation({
    mutationFn: async (selections: { poProductId: number; quantitySelected: number; selectionSource: string }[]) => {
      return await apiRequest('/api/p1-po-queue/select', {
        method: 'POST',
        body: JSON.stringify({ selections }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Selection Created',
        description: `Created selection batch with ${data.count} items`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/p1-po-queue'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Selection Failed',
        description: error.message || 'Failed to create selection batch',
        variant: 'destructive',
      });
    },
  });

  // Handle generate schedule
  const handleGenerateSchedule = () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select at least one item to schedule',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedPOGroup) return;

    // Prepare selections
    const selections = selectedPOGroup.items
      .filter((item) => selectedItems.has(item.id))
      .map((item) => ({
        poProductId: item.id,
        quantitySelected: item.quantity || 1,
        selectionSource: 'p1',
      }));

    createSelectionMutation.mutate(selections);
  };

  // Handle progress to barcode
  const handleProgressToBarcode = () => {
    if (selectedItems.size === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select at least one item to progress',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Coming Soon',
      description: 'Barcode progression will be implemented in the next phase',
    });
  };

  if (isLoadingPOs || isLoadingMolds) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading P1 PO Queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">P1 Purchase Order Queue</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage and schedule P1 PO items for production
          </p>
        </div>

        {/* Mold Availability Badge */}
        {moldAvailability && (
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Available Molds</p>
                <p className="text-2xl font-bold">
                  {moldAvailability.available} / {moldAvailability.totalCapacity}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by customer or PO number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-po"
        />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Customer/PO Sidebar */}
        <div className="col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Customers & POs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredPOs.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No P1 POs available</p>
                  </div>
                ) : (
                  filteredPOs.map((po) => (
                    <button
                      key={`${po.customer}-${po.poNumber}`}
                      onClick={() => {
                        setSelectedCustomer(po.customer);
                        setSelectedPO(po.poNumber);
                        setSelectedItems(new Set()); // Clear selections when changing PO
                      }}
                      className={`w-full text-left p-4 border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                        selectedCustomer === po.customer && selectedPO === po.poNumber
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600'
                          : ''
                      }`}
                      data-testid={`button-select-po-${po.customer}-${po.poNumber}`}
                    >
                      <div className="font-medium">{po.customer}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        PO: {po.poNumber}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="secondary">{po.totalQuantity} items</Badge>
                        {po.earliestDueDate && (
                          <div className="text-xs text-gray-500 flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(po.earliestDueDate), 'MMM dd')}
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main PO Items Table */}
        <div className="col-span-9">
          {!selectedPOGroup ? (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center p-12">
                <Package className="h-16 w-16 mx-auto mb-4 opacity-50 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Select a Purchase Order</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose a customer and PO from the sidebar to view items
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {selectedPOGroup.customer} - PO #{selectedPOGroup.poNumber}
                    </CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {selectedPOGroup.items.length} items • {selectedPOGroup.totalQuantity} total quantity
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAllItems}
                    data-testid="button-select-all-items"
                  >
                    {selectedPOGroup.items.every((item) => selectedItems.has(item.id))
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Stock Model</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Hand</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPOGroup.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id)}
                            data-testid={`checkbox-item-${item.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.stockModel || '-'}</TableCell>
                        <TableCell>{item.material || '-'}</TableCell>
                        <TableCell>{item.handedness || '-'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {item.dueDate ? (
                            <div className="flex items-center text-sm">
                              <Calendar className="h-3 w-3 mr-1" />
                              {format(new Date(item.dueDate), 'MMM dd, yyyy')}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'pending' ? 'secondary' : 'default'}>
                            {item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Selection Summary Footer */}
          {selectedItems.size > 0 && moldAvailability && (
            <Card className="mt-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    <div>
                      <p className="text-sm font-medium">Items Selected</p>
                      <p className="text-2xl font-bold text-blue-600">{selectedItems.size}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Molds Required</p>
                      <div className="flex items-center space-x-2">
                        <p className="text-2xl font-bold text-blue-600">{moldsRequired}</p>
                        {moldsRequired > moldAvailability.available && (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Molds Available</p>
                      <p className={`text-2xl font-bold ${
                        moldsRequired > moldAvailability.available
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}>
                        {moldAvailability.available}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Button
                      variant="outline"
                      onClick={handleGenerateSchedule}
                      disabled={createSelectionMutation.isPending}
                      data-testid="button-generate-schedule"
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Generate Schedule
                    </Button>
                    <Button
                      onClick={handleProgressToBarcode}
                      data-testid="button-progress-barcode"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Progress to Barcode
                    </Button>
                  </div>
                </div>

                {moldsRequired > moldAvailability.available && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        Insufficient Mold Capacity
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                        You need {moldsRequired - moldAvailability.available} more molds. 
                        Please reduce selection or adjust mold capacity.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
