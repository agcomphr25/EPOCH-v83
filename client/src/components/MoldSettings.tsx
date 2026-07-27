import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Settings, RefreshCw, Search, Filter, Plus, X, Save, Pencil } from 'lucide-react';

interface Mold {
  id: number;
  moldId: string;
  modelName: string;
  stockModels: string[];
  instanceNumber: number;
  enabled: boolean;
  multiplier: number;
  isActive: boolean;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  isActive: boolean;
}

interface MoldSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NewMoldForm {
  moldId: string;
  modelName: string;
  instanceNumber: string;
  multiplier: string;
  enabled: boolean;
  stockModels: string[];
}

const emptyNewMold = (): NewMoldForm => ({
  moldId: '',
  modelName: '',
  instanceNumber: '1',
  multiplier: '1',
  enabled: true,
  stockModels: [],
});

export function MoldSettings({ open, onOpenChange }: MoldSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModel, setFilterModel] = useState('all');
  const [editingMold, setEditingMold] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ enabled: boolean; multiplier: number; stockModels: string[] }>({ enabled: false, multiplier: 1, stockModels: [] });
  const [newStockModel, setNewStockModel] = useState('');

  const [addMoldOpen, setAddMoldOpen] = useState(false);
  const [newMoldForm, setNewMoldForm] = useState<NewMoldForm>(emptyNewMold());
  const [newMoldStockModelInput, setNewMoldStockModelInput] = useState('');
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewMoldForm, string>>>({});

  const { data: moldsData, isLoading, refetch } = useQuery<Mold[]>({
    queryKey: ['/api/molds'],
    enabled: open,
  });

  const { data: stockModelsData = [], isLoading: stockModelsLoading } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    enabled: open || addMoldOpen,
  });

  const updateMoldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Mold> }) => {
      return apiRequest(`/api/molds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/molds'] });
      toast({ title: 'Mold updated', description: 'Mold settings have been saved.' });
      setEditingMold(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ modelName, data }: { modelName: string; data: Partial<Mold> }) => {
      return apiRequest('/api/molds/bulk/by-model', {
        method: 'PATCH',
        body: JSON.stringify({ modelName, ...data }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/molds'] });
      toast({ title: 'Molds updated', description: `All ${variables.modelName} molds have been updated.` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createMoldMutation = useMutation({
    mutationFn: async (data: object) => {
      return apiRequest('/api/molds', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/molds'] });
      toast({ title: 'Mold created', description: 'New mold has been added successfully.' });
      setAddMoldOpen(false);
      setNewMoldForm(emptyNewMold());
      setNewMoldStockModelInput('');
      setFormErrors({});
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to create mold';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    },
  });

  const molds = moldsData || [];
  const availableStockModels = stockModelsData
    .filter(model => model.isActive)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const uniqueModelNames = Array.from(new Set(molds.map(m => m.modelName))).sort();

  const filteredMolds = molds.filter(mold => {
    const matchesSearch = mold.moldId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mold.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (mold.stockModels || []).some(sm => sm.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterModel === 'all' || mold.modelName === filterModel;
    return matchesSearch && matchesFilter;
  });

  const moldsByModel = filteredMolds.reduce((acc, mold) => {
    if (!acc[mold.modelName]) {
      acc[mold.modelName] = [];
    }
    acc[mold.modelName].push(mold);
    return acc;
  }, {} as Record<string, Mold[]>);

  const enabledCount = molds.filter(m => m.enabled && m.isActive).length;
  const totalCount = molds.length;

  const startEditing = (mold: Mold) => {
    setEditingMold(mold.id);
    setEditValues({
      enabled: mold.enabled,
      multiplier: mold.multiplier,
      stockModels: mold.stockModels || [],
    });
    setNewStockModel('');
  };

  const cancelEditing = () => {
    setEditingMold(null);
    setEditValues({ enabled: false, multiplier: 1, stockModels: [] });
    setNewStockModel('');
  };

  const saveEditing = () => {
    if (editingMold === null) return;
    updateMoldMutation.mutate({
      id: editingMold,
      data: {
        enabled: editValues.enabled,
        isActive: editValues.enabled,
        multiplier: editValues.multiplier,
        stockModels: editValues.stockModels,
      },
    });
  };

  const addStockModel = () => {
    if (newStockModel.trim() && !editValues.stockModels.includes(newStockModel.trim())) {
      setEditValues(prev => ({
        ...prev,
        stockModels: [...prev.stockModels, newStockModel.trim()],
      }));
      setNewStockModel('');
    }
  };

  const removeStockModel = (sm: string) => {
    setEditValues(prev => ({
      ...prev,
      stockModels: prev.stockModels.filter(s => s !== sm),
    }));
  };

  const enableAllForModel = (modelName: string) => {
    bulkUpdateMutation.mutate({ modelName, data: { enabled: true, isActive: true } });
  };

  const disableAllForModel = (modelName: string) => {
    bulkUpdateMutation.mutate({ modelName, data: { enabled: false, isActive: false } });
  };

  const addNewMoldStockModel = () => {
    const trimmed = newMoldStockModelInput.trim();
    if (trimmed && !newMoldForm.stockModels.includes(trimmed)) {
      setNewMoldForm(prev => ({ ...prev, stockModels: [...prev.stockModels, trimmed] }));
      setNewMoldStockModelInput('');
    }
  };

  const removeNewMoldStockModel = (sm: string) => {
    setNewMoldForm(prev => ({ ...prev, stockModels: prev.stockModels.filter(s => s !== sm) }));
  };

  const validateNewMoldForm = (): boolean => {
    const errors: Partial<Record<keyof NewMoldForm, string>> = {};
    if (!newMoldForm.moldId.trim()) errors.moldId = 'Mold ID is required';
    if (!newMoldForm.modelName.trim()) errors.modelName = 'Model Name is required';
    const instanceNum = parseInt(newMoldForm.instanceNumber, 10);
    if (!newMoldForm.instanceNumber || isNaN(instanceNum) || instanceNum < 1) {
      errors.instanceNumber = 'Instance Number must be a positive integer';
    }
    const multiplierNum = parseInt(newMoldForm.multiplier, 10);
    if (!newMoldForm.multiplier || isNaN(multiplierNum) || multiplierNum < 1) {
      errors.multiplier = 'Capacity must be at least 1';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitNewMold = () => {
    if (!validateNewMoldForm()) return;
    createMoldMutation.mutate({
      moldId: newMoldForm.moldId.trim(),
      modelName: newMoldForm.modelName.trim(),
      instanceNumber: parseInt(newMoldForm.instanceNumber, 10),
      multiplier: parseInt(newMoldForm.multiplier, 10),
      enabled: newMoldForm.enabled,
      isActive: newMoldForm.enabled,
      stockModels: newMoldForm.stockModels,
    });
  };

  const openAddMoldDialog = () => {
    setNewMoldForm(emptyNewMold());
    setNewMoldStockModelInput('');
    setFormErrors({});
    setAddMoldOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Mold Settings
            </DialogTitle>
            <DialogDescription>
              Configure which molds can process which stock models. Click the pencil icon to edit a mold's settings.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4 py-4 border-b">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search molds or stock models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterModel}
                onChange={(e) => setFilterModel(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="all">All Models</option>
                {uniqueModelNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={openAddMoldDialog}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Mold
            </Button>
          </div>

          <div className="flex items-center gap-4 py-2 text-sm text-gray-600">
            <span>Total Molds: <strong>{totalCount}</strong></span>
            <span>Enabled: <strong>{enabledCount}</strong></span>
            <span>Showing: <strong>{filteredMolds.length}</strong></span>
          </div>

          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(moldsByModel).sort(([a], [b]) => a.localeCompare(b)).map(([modelName, modelMolds]) => (
                  <div key={modelName} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-gray-900">{modelName}</h3>
                        <Badge variant="outline" className="text-xs">
                          {modelMolds.length} mold{modelMolds.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 mr-2">
                          Auto-matches: <code className="bg-gray-200 px-1 rounded text-xs">
                            {modelName.toLowerCase().replace(/\s+/g, '_')}
                          </code>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => enableAllForModel(modelName)}
                          disabled={bulkUpdateMutation.isPending}
                        >
                          Enable All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => disableAllForModel(modelName)}
                          disabled={bulkUpdateMutation.isPending}
                        >
                          Disable All
                        </Button>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[160px]">Mold ID</TableHead>
                          <TableHead className="w-[70px]">Instance</TableHead>
                          <TableHead className="w-[100px]">Capacity</TableHead>
                          <TableHead>Stock Models (can process)</TableHead>
                          <TableHead className="w-[90px]">Enabled</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modelMolds.sort((a, b) => a.instanceNumber - b.instanceNumber).map(mold => (
                          <TableRow key={mold.id} className={editingMold === mold.id ? 'bg-blue-50' : ''}>
                            <TableCell className="font-medium">{mold.moldId}</TableCell>
                            <TableCell>{mold.instanceNumber}</TableCell>
                            <TableCell>
                              {editingMold === mold.id ? (
                                <Input
                                  type="number"
                                  min="1"
                                  value={editValues.multiplier}
                                  onChange={(e) => setEditValues(prev => ({ ...prev, multiplier: parseInt(e.target.value) || 1 }))}
                                  className="w-16 h-8"
                                />
                              ) : (
                                <Badge variant="secondary">{mold.multiplier}x</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingMold === mold.id ? (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1">
                                    {editValues.stockModels.map((sm, i) => (
                                      <Badge key={i} variant="outline" className="text-xs flex items-center gap-1">
                                        {sm}
                                        <X
                                          className="w-3 h-3 cursor-pointer hover:text-red-500"
                                          onClick={() => removeStockModel(sm)}
                                        />
                                      </Badge>
                                    ))}
                                  </div>
                                  <div className="flex gap-1">
                                    <select
                                      aria-label="Stock model to add"
                                      value={newStockModel}
                                      onChange={(e) => setNewStockModel(e.target.value)}
                                      disabled={stockModelsLoading}
                                      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs"
                                    >
                                      <option value="">
                                        {stockModelsLoading ? 'Loading stock models...' : 'Select stock model...'}
                                      </option>
                                      {availableStockModels
                                        .filter(model => !editValues.stockModels.includes(model.id))
                                        .map(model => (
                                          <option key={model.id} value={model.id}>
                                            {model.displayName} ({model.id})
                                          </option>
                                        ))}
                                    </select>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={addStockModel}
                                      disabled={!newStockModel}
                                      className="h-8"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                mold.stockModels && mold.stockModels.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {mold.stockModels.map((sm, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {sm}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm italic">
                                    Uses model name matching
                                  </span>
                                )
                              )}
                            </TableCell>
                            <TableCell>
                              {editingMold === mold.id ? (
                                <Switch
                                  checked={editValues.enabled}
                                  onCheckedChange={(checked) => setEditValues(prev => ({ ...prev, enabled: checked }))}
                                />
                              ) : (
                                mold.enabled && mold.isActive ? (
                                  <Badge className="bg-green-100 text-green-800">Yes</Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-gray-100 text-gray-600">No</Badge>
                                )
                              )}
                            </TableCell>
                            <TableCell>
                              {editingMold === mold.id ? (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={saveEditing}
                                    disabled={updateMoldMutation.isPending}
                                    className="h-8 px-2"
                                  >
                                    <Save className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEditing}
                                    className="h-8 px-2"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(mold)}
                                  className="h-8 px-2"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
                {Object.keys(moldsByModel).length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No molds found matching your search criteria.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-sm text-gray-500">
              <strong>Tip:</strong> To make a mold process a stock model like "cf_adj_alp_hunter", 
              click the pencil icon on that mold and add "cf_adj_alp_hunter" to its stock models list.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addMoldOpen} onOpenChange={(val) => { setAddMoldOpen(val); if (!val) setFormErrors({}); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Mold
            </DialogTitle>
            <DialogDescription>
              Fill in the details below to create a new mold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="new-mold-id">Mold ID <span className="text-red-500">*</span></Label>
              <Input
                id="new-mold-id"
                placeholder="e.g. MOLD-001"
                value={newMoldForm.moldId}
                onChange={(e) => setNewMoldForm(prev => ({ ...prev, moldId: e.target.value }))}
              />
              {formErrors.moldId && <p className="text-xs text-red-500">{formErrors.moldId}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-model-name">Model Name <span className="text-red-500">*</span></Label>
              <Input
                id="new-model-name"
                placeholder="e.g. Alpha Hunter"
                value={newMoldForm.modelName}
                onChange={(e) => setNewMoldForm(prev => ({ ...prev, modelName: e.target.value }))}
              />
              {formErrors.modelName && <p className="text-xs text-red-500">{formErrors.modelName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="new-instance-number">Instance Number <span className="text-red-500">*</span></Label>
                <Input
                  id="new-instance-number"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={newMoldForm.instanceNumber}
                  onChange={(e) => setNewMoldForm(prev => ({ ...prev, instanceNumber: e.target.value }))}
                />
                {formErrors.instanceNumber && <p className="text-xs text-red-500">{formErrors.instanceNumber}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-capacity">Capacity (multiplier) <span className="text-red-500">*</span></Label>
                <Input
                  id="new-capacity"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={newMoldForm.multiplier}
                  onChange={(e) => setNewMoldForm(prev => ({ ...prev, multiplier: e.target.value }))}
                />
                {formErrors.multiplier && <p className="text-xs text-red-500">{formErrors.multiplier}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="new-enabled">Enabled</Label>
              <Switch
                id="new-enabled"
                checked={newMoldForm.enabled}
                onCheckedChange={(checked) => setNewMoldForm(prev => ({ ...prev, enabled: checked }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Stock Models (optional)</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {newMoldForm.stockModels.map((sm, i) => (
                  <Badge key={i} variant="outline" className="text-xs flex items-center gap-1">
                    {sm}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-red-500"
                      onClick={() => removeNewMoldStockModel(sm)}
                    />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  aria-label="Stock model to add to new mold"
                  value={newMoldStockModelInput}
                  onChange={(e) => setNewMoldStockModelInput(e.target.value)}
                  disabled={stockModelsLoading}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">
                    {stockModelsLoading ? 'Loading stock models...' : 'Select stock model...'}
                  </option>
                  {availableStockModels
                    .filter(model => !newMoldForm.stockModels.includes(model.id))
                    .map(model => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} ({model.id})
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addNewMoldStockModel}
                  disabled={!newMoldStockModelInput}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddMoldOpen(false); setFormErrors({}); }}
              disabled={createMoldMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitNewMold}
              disabled={createMoldMutation.isPending}
            >
              {createMoldMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Mold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
