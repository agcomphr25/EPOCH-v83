import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Search,
  Download,
  Save,
  Trash2,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  Package2,
} from 'lucide-react';
import { format } from 'date-fns';

interface FilterOptions {
  stockModels: { id: string; name: string; displayName: string }[];
  barrelInlets: { value: string; label: string }[];
  paintOptions: {
    category: string;
    displayName: string;
    options: { value: string; label: string; price?: number }[];
  }[];
  railAccessories: { value: string; label: string }[];
  departments: string[];
  statuses: string[];
}

interface Filters {
  stockModels: string[];
  barrelInlets: string[];
  paintOptions: string[];
  railAccessories: string[];
  departments: string[];
  statuses: string[];
  dateRange: { start: string; end: string };
  logicMode: 'AND' | 'OR';
}

interface Preset {
  id: number;
  name: string;
  description?: string;
  filters: Filters;
  createdBy: string;
  isShared: boolean;
  createdAt: string;
}

export default function OrderReports() {
  const { toast } = useToast();
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    stockModels: [],
    barrelInlets: [],
    paintOptions: [],
    railAccessories: [],
    departments: [],
    statuses: [],
    dateRange: { start: '', end: '' },
    logicMode: 'AND',
  });
  const [results, setResults] = useState<any[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [deletePresetId, setDeletePresetId] = useState<number | null>(null);

  // Fetch filter options
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ['/api/reports/filter-options'],
  });

  // Fetch saved presets
  const { data: presets, refetch: refetchPresets } = useQuery<Preset[]>({
    queryKey: ['/api/reports/presets'],
  });

  // Execute query mutation
  const queryMutation = useMutation({
    mutationFn: async (filterData: Filters) => {
      return apiRequest('/api/reports/query', {
        method: 'POST',
        body: JSON.stringify(filterData),
      });
    },
    onSuccess: (data) => {
      setResults(data.orders || []);
      toast({
        title: 'Query Executed',
        description: `Found ${data.orders?.length || 0} orders matching your criteria.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Query Failed',
        description: error.message || 'Failed to execute query',
        variant: 'destructive',
      });
    },
  });

  // Save preset mutation
  const savePresetMutation = useMutation({
    mutationFn: async (presetData: {
      name: string;
      description?: string;
      filters: Filters;
      createdBy: string;
    }) => {
      return apiRequest('/api/reports/presets', {
        method: 'POST',
        body: JSON.stringify(presetData),
      });
    },
    onSuccess: () => {
      refetchPresets();
      setSaveDialogOpen(false);
      setPresetName('');
      setPresetDescription('');
      toast({
        title: 'Preset Saved',
        description: 'Your filter preset has been saved successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save preset',
        variant: 'destructive',
      });
    },
  });

  // Delete preset mutation
  const deletePresetMutation = useMutation({
    mutationFn: async (presetId: number) => {
      return apiRequest(`/api/reports/presets/${presetId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      refetchPresets();
      setDeletePresetId(null);
      toast({
        title: 'Preset Deleted',
        description: 'Filter preset deleted successfully.',
      });
    },
  });

  const handleRunQuery = () => {
    setIsQuerying(true);
    queryMutation.mutate(filters);
    setIsQuerying(false);
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/reports/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: results }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export Successful',
        description: `Exported ${results.length} orders to CSV.`,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export orders to CSV',
        variant: 'destructive',
      });
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for this preset',
        variant: 'destructive',
      });
      return;
    }

    savePresetMutation.mutate({
      name: presetName,
      description: presetDescription,
      filters,
      createdBy: 'Admin', // TODO: Get from auth context
    });
  };

  const handleLoadPreset = (preset: Preset) => {
    setFilters(preset.filters);
    toast({
      title: 'Preset Loaded',
      description: `Filter preset "${preset.name}" has been applied.`,
    });
  };

  const handleClearFilters = () => {
    setFilters({
      stockModels: [],
      barrelInlets: [],
      paintOptions: [],
      railAccessories: [],
      departments: [],
      statuses: [],
      dateRange: { start: '', end: '' },
      logicMode: 'AND',
    });
    setResults([]);
  };

  const toggleArrayValue = (array: string[], value: string): string[] => {
    if (array.includes(value)) {
      return array.filter((v) => v !== value);
    }
    return [...array, value];
  };

  const hasActiveFilters =
    filters.stockModels.length > 0 ||
    filters.barrelInlets.length > 0 ||
    filters.paintOptions.length > 0 ||
    filters.railAccessories.length > 0 ||
    filters.departments.length > 0 ||
    filters.statuses.length > 0 ||
    filters.dateRange.start ||
    filters.dateRange.end;

  return (
    <div className="p-6 space-y-6 max-w-[95%] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Advanced Order Reports
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Build custom queries to find and export specific orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4" />
            {showFilters ? 'Hide' : 'Show'} Filters
            {showFilters ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Filter Builder</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="logic-mode" className="text-sm font-normal">
                    Logic Mode:
                  </Label>
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md">
                    <span
                      className={`text-sm ${filters.logicMode === 'AND' ? 'font-bold text-blue-600' : 'text-gray-500'}`}
                    >
                      AND
                    </span>
                    <Switch
                      id="logic-mode"
                      checked={filters.logicMode === 'OR'}
                      onCheckedChange={(checked) =>
                        setFilters({ ...filters, logicMode: checked ? 'OR' : 'AND' })
                      }
                      data-testid="switch-logic-mode"
                    />
                    <span
                      className={`text-sm ${filters.logicMode === 'OR' ? 'font-bold text-blue-600' : 'text-gray-500'}`}
                    >
                      OR
                    </span>
                  </div>
                </div>
                {hasActiveFilters && (
                  <Button
                    onClick={handleClearFilters}
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    data-testid="button-clear-filters"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Stock Models */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Stock Models</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {filterOptions?.stockModels.map((model) => (
                    <label
                      key={model.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={filters.stockModels.includes(model.id)}
                        onChange={() =>
                          setFilters({
                            ...filters,
                            stockModels: toggleArrayValue(filters.stockModels, model.id),
                          })
                        }
                        className="rounded"
                        data-testid={`checkbox-model-${model.id}`}
                      />
                      <span className="text-sm">{model.displayName}</span>
                    </label>
                  ))}
                </div>
                {filters.stockModels.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {filters.stockModels.length} selected
                  </div>
                )}
              </div>

              {/* Barrel Inlets */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Barrel Inlets</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {filterOptions?.barrelInlets.map((barrel) => (
                    <label
                      key={barrel.value}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={filters.barrelInlets.includes(barrel.value)}
                        onChange={() =>
                          setFilters({
                            ...filters,
                            barrelInlets: toggleArrayValue(
                              filters.barrelInlets,
                              barrel.value
                            ),
                          })
                        }
                        className="rounded"
                        data-testid={`checkbox-barrel-${barrel.value}`}
                      />
                      <span className="text-sm">{barrel.label}</span>
                    </label>
                  ))}
                </div>
                {filters.barrelInlets.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {filters.barrelInlets.length} selected
                  </div>
                )}
              </div>

              {/* Rail Accessories */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Rail Accessories</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {filterOptions?.railAccessories.map((rail) => (
                    <label
                      key={rail.value}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={filters.railAccessories.includes(rail.value)}
                        onChange={() =>
                          setFilters({
                            ...filters,
                            railAccessories: toggleArrayValue(
                              filters.railAccessories,
                              rail.value
                            ),
                          })
                        }
                        className="rounded"
                        data-testid={`checkbox-rail-${rail.value}`}
                      />
                      <span className="text-sm">{rail.label}</span>
                    </label>
                  ))}
                </div>
                {filters.railAccessories.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {filters.railAccessories.length} selected
                  </div>
                )}
              </div>

              {/* Paint Options */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Paint Options</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-3">
                  {filterOptions?.paintOptions.map((category) => (
                    <div key={category.category}>
                      <div className="text-xs font-semibold text-gray-700 mb-1">
                        {category.displayName}
                      </div>
                      <div className="space-y-1 ml-2">
                        {category.options.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={filters.paintOptions.includes(option.value)}
                              onChange={() =>
                                setFilters({
                                  ...filters,
                                  paintOptions: toggleArrayValue(
                                    filters.paintOptions,
                                    option.value
                                  ),
                                })
                              }
                              className="rounded"
                              data-testid={`checkbox-paint-${option.value}`}
                            />
                            <span className="text-sm">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {filters.paintOptions.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {filters.paintOptions.length} selected
                  </div>
                )}
              </div>

              {/* Departments */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Departments</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {filterOptions?.departments.map((dept) => (
                    <label
                      key={dept}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={filters.departments.includes(dept)}
                        onChange={() =>
                          setFilters({
                            ...filters,
                            departments: toggleArrayValue(filters.departments, dept),
                          })
                        }
                        className="rounded"
                        data-testid={`checkbox-dept-${dept}`}
                      />
                      <span className="text-sm">{dept}</span>
                    </label>
                  ))}
                </div>
                {filters.departments.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {filters.departments.length} selected
                  </div>
                )}
              </div>

              {/* Statuses */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Statuses</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {filterOptions?.statuses.map((status) => (
                    <label
                      key={status}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={filters.statuses.includes(status)}
                        onChange={() =>
                          setFilters({
                            ...filters,
                            statuses: toggleArrayValue(filters.statuses, status),
                          })
                        }
                        className="rounded"
                        data-testid={`checkbox-status-${status}`}
                      />
                      <span className="text-sm">{status}</span>
                    </label>
                  ))}
                </div>
                {filters.statuses.length > 0 && (
                  <div className="text-xs text-gray-600">
                    {filters.statuses.length} selected
                  </div>
                )}
              </div>
            </div>

            {/* Date Range */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-3 block">
                <Calendar className="inline h-4 w-4 mr-1" />
                Order Date Range
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date" className="text-sm text-gray-600">
                    Start Date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={filters.dateRange.start}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        dateRange: { ...filters.dateRange, start: e.target.value },
                      })
                    }
                    data-testid="input-date-start"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date" className="text-sm text-gray-600">
                    End Date
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={filters.dateRange.end}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        dateRange: { ...filters.dateRange, end: e.target.value },
                      })
                    }
                    data-testid="input-date-end"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleRunQuery}
                  className="flex items-center gap-2"
                  disabled={!hasActiveFilters || isQuerying}
                  data-testid="button-run-query"
                >
                  <Search className="h-4 w-4" />
                  Run Query
                </Button>
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                      disabled={!hasActiveFilters}
                      data-testid="button-save-preset"
                    >
                      <Save className="h-4 w-4" />
                      Save as Preset
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Filter Preset</DialogTitle>
                      <DialogDescription>
                        Save your current filter combination for quick access later
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="preset-name">Preset Name *</Label>
                        <Input
                          id="preset-name"
                          value={presetName}
                          onChange={(e) => setPresetName(e.target.value)}
                          placeholder="e.g., All AG Pic Rails"
                          data-testid="input-preset-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="preset-description">Description</Label>
                        <Textarea
                          id="preset-description"
                          value={presetDescription}
                          onChange={(e) => setPresetDescription(e.target.value)}
                          placeholder="Optional description of this filter combination"
                          data-testid="input-preset-description"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setSaveDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSavePreset}
                        data-testid="button-confirm-save-preset"
                      >
                        Save Preset
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Presets */}
      {presets && presets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saved Presets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="border rounded-lg p-3 hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer relative group"
                  onClick={() => handleLoadPreset(preset)}
                  data-testid={`preset-${preset.id}`}
                >
                  <div className="font-medium text-sm">{preset.name}</div>
                  {preset.description && (
                    <div className="text-xs text-gray-600 mt-1">
                      {preset.description}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    {format(new Date(preset.createdAt), 'MMM d, yyyy')}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-600 h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletePresetId(preset.id);
                    }}
                    data-testid={`button-delete-preset-${preset.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package2 className="h-5 w-5" />
                <span>Query Results ({results.length} orders)</span>
              </div>
              <Button
                onClick={handleExportCSV}
                className="flex items-center gap-2"
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4" />
                Export to CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Barrel</TableHead>
                    <TableHead>Rail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((order) => (
                    <TableRow key={order.id} data-testid={`order-row-${order.orderId}`}>
                      <TableCell className="font-medium">{order.orderId}</TableCell>
                      <TableCell>
                        {order.orderDate
                          ? format(new Date(order.orderDate), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>{order.customer || order.customerId || '-'}</TableCell>
                      <TableCell>
                        {order.modelDisplayName || order.modelId || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.currentDepartment}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {order.features?.barrel_inlet || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {Array.isArray(order.features?.rail_accessory)
                          ? order.features.rail_accessory.join(', ')
                          : order.features?.rail_accessory || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Results Message */}
      {hasActiveFilters && results.length === 0 && !isQuerying && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Search className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>
              No results found. Click "Run Query" to search with your current filters.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Preset Confirmation */}
      <AlertDialog
        open={deletePresetId !== null}
        onOpenChange={() => setDeletePresetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this filter preset? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePresetId && deletePresetMutation.mutate(deletePresetId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-preset"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
