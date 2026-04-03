import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckSquare, AlertCircle, CheckCircle, X, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface InstanceItem {
  id: number;
  templateItemId: number;
  label: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  frequency: string;
  sortOrder: number;
  value: string | null;
  completed: boolean;
  completedAt: string | null;
  completedByDisplayName: string | null;
}

interface ActiveInstance {
  instanceId: number;
  templateId: number;
  templateName: string;
  status: string;
  contextDate: string;
  items: InstanceItem[];
  completedAt: string | null;
  reviewedAt: string | null;
  isLegacy: false;
}

interface TemplateItemData {
  id: number;
  label: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  frequency: string;
  sort_order: number;
}

interface ActiveTemplate {
  id: number;
  name: string;
  enforceClockOut: boolean;
  items: TemplateItemData[] | null;
  periodDate: string;
  existingResponse: {
    id: number;
    completedAt: string | null;
    response_items: Array<{
      id: number;
      templateItemId: number;
      value: string | null;
      completed: boolean;
    }> | null;
  } | null;
}

interface ItemState {
  templateItemId: number;
  label: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  value: string | boolean;
  completed: boolean;
}

interface DailyChecklistModalProps {
  employeeId: number;
  department: string;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  reviewed: 'bg-purple-100 text-purple-800',
};

export default function DailyChecklistModal({
  employeeId,
  department,
  isOpen,
  onClose,
}: DailyChecklistModalProps) {
  const [templateStates, setTemplateStates] = useState<Record<number, ItemState[]>>({});
  const [dirtyTemplates, setDirtyTemplates] = useState<Set<number>>(new Set());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [legacyItems, setLegacyItems] = useState<any[]>([]);
  const { toast } = useToast();
  const pendingCloseRef = useRef(false);

  const {
    data: activeInstances = [],
    isLoading: instancesLoading,
    refetch: refetchInstances,
  } = useQuery<ActiveInstance[]>({
    queryKey: ['/api/checklist-instances/active', employeeId],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instances/active?employeeId=${employeeId}`);
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) return [];
        throw new Error('Failed to fetch checklist instances');
      }
      return response.json();
    },
    enabled: isOpen && employeeId > 0,
  });

  const {
    data: activeTemplates = [],
    isLoading: templatesLoading,
    refetch: refetchTemplates,
  } = useQuery<ActiveTemplate[]>({
    queryKey: ['/api/checklist-management/active', employeeId],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-management/active?employeeId=${employeeId}`);
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) return [];
        throw new Error('Failed to fetch checklists');
      }
      return response.json();
    },
    enabled: isOpen && employeeId > 0,
  });

  const isLoading = instancesLoading || templatesLoading;
  const hasInstances = activeInstances.length > 0;
  const hasTemplates = activeTemplates.length > 0;
  const useLegacy = !hasInstances && !hasTemplates && !isLoading;
  const useInstanceMode = hasInstances;
  const useLegacyTemplateMode = !hasInstances && hasTemplates;

  const {
    data: legacyChecklist = [],
    isLoading: legacyLoading,
  } = useQuery({
    queryKey: ['/api/checklist', employeeId, new Date().toISOString().split('T')[0]],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/checklist?employeeId=${employeeId}&date=${today}`);
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          return getDepartmentItems().map((item, index) => ({
            id: index + 1,
            department,
            item: item.item,
            required: item.required,
            inputType: item.type as 'checkbox' | 'text' | 'number' | 'select',
            options: item.options,
            value: item.type === 'checkbox' ? false : '',
            completed: false,
          }));
        }
        throw new Error('Failed to fetch checklist');
      }
      return response.json();
    },
    enabled: isOpen && useLegacy,
  });

  useEffect(() => {
    if (useLegacy && legacyChecklist.length > 0) {
      setLegacyItems(legacyChecklist);
    }
  }, [legacyChecklist, useLegacy]);

  useEffect(() => {
    if (useLegacyTemplateMode && activeTemplates.length > 0) {
      const states: Record<number, ItemState[]> = {};
      for (const tmpl of activeTemplates) {
        const items = tmpl.items || [];
        states[tmpl.id] = items.map((item) => {
          const existing = tmpl.existingResponse?.response_items?.find(
            (ri) => ri.templateItemId === item.id
          );
          return {
            templateItemId: item.id,
            label: item.label,
            type: item.type,
            options: item.options,
            required: item.required,
            value: existing ? (item.type === 'checkbox' ? existing.completed : (existing.value || '')) : (item.type === 'checkbox' ? false : ''),
            completed: existing?.completed || false,
          };
        });
      }
      setTemplateStates(states);
    }
  }, [activeTemplates, useLegacyTemplateMode]);

  const toggleInstanceItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const response = await fetch(`/api/checklist-instances/items/${itemId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to toggle item');
      return response.json();
    },
    onSuccess: () => {
      setLastSaved(new Date());
      refetchInstances();
    },
    onError: () => {
      toast({ title: 'Failed to save item', variant: 'destructive' });
    },
  });

  const updateInstanceItemMutation = useMutation({
    mutationFn: async ({ itemId, value }: { itemId: number; value: string }) => {
      const response = await fetch(`/api/checklist-instances/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, completed: Boolean(value) }),
      });
      if (!response.ok) throw new Error('Failed to update item');
      return response.json();
    },
    onSuccess: () => {
      setLastSaved(new Date());
      refetchInstances();
    },
    onError: () => {
      toast({ title: 'Failed to save item', variant: 'destructive' });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async ({ templateId, periodDate, items }: { templateId: number; periodDate: string; items: any[] }) => {
      const response = await fetch('/api/checklist-management/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, employeeId, periodDate, items }),
      });
      if (!response.ok) throw new Error('Failed to submit');
      return response.json();
    },
    onSuccess: (_data, variables) => {
      refetchTemplates();
      setDirtyTemplates(prev => {
        const next = new Set(prev);
        next.delete(variables.templateId);
        return next;
      });
      setLastSaved(new Date());
      toast({ title: 'Checklist saved successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to save checklist', variant: 'destructive' });
    },
  });

  const legacySubmitMutation = useMutation({
    mutationFn: async (updates: { itemId: number; value: string | boolean }[]) => {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch('/api/checklist/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employeeId.toString(), date: today, items: updates }),
      });
      if (!response.ok) throw new Error('Failed to update checklist');
      return response.json();
    },
    onSuccess: () => {
      setLastSaved(new Date());
      toast({ title: 'Checklist updated successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to update checklist', variant: 'destructive' });
    },
  });

  const handleInstanceItemChange = (item: InstanceItem, value: string | boolean) => {
    if (item.type === 'checkbox') {
      toggleInstanceItemMutation.mutate(item.id);
    } else {
      updateInstanceItemMutation.mutate({ itemId: item.id, value: String(value) });
    }
  };

  const handleItemUpdate = (templateId: number, templateItemId: number, value: string | boolean) => {
    setTemplateStates(prev => ({
      ...prev,
      [templateId]: (prev[templateId] || []).map(item =>
        item.templateItemId === templateItemId
          ? { ...item, value, completed: Boolean(value) }
          : item
      ),
    }));
    setDirtyTemplates(prev => new Set(prev).add(templateId));
  };

  const handleSaveTemplate = (template: ActiveTemplate) => {
    const items = templateStates[template.id] || [];
    submitMutation.mutate({
      templateId: template.id,
      periodDate: template.periodDate,
      items: items.map(i => ({
        templateItemId: i.templateItemId,
        value: typeof i.value === 'boolean' ? String(i.value) : i.value,
        completed: i.completed,
        required: i.required,
      })),
    });
  };

  const handleLegacyItemUpdate = (itemId: number, value: string | boolean) => {
    setLegacyItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, value, completed: Boolean(value) } : item
      )
    );
    setDirtyTemplates(prev => new Set(prev).add(-1));
  };

  const handleLegacySave = () => {
    const updates = legacyItems.map(item => ({ itemId: item.id, value: item.value || false }));
    legacySubmitMutation.mutate(updates);
    setDirtyTemplates(new Set());
  };

  const handleClose = () => {
    if (dirtyTemplates.size > 0 && !useInstanceMode) {
      setShowUnsavedWarning(true);
      pendingCloseRef.current = true;
    } else {
      onClose();
    }
  };

  const getOverallStats = () => {
    if (useInstanceMode) {
      let total = 0, completed = 0, required = 0, requiredCompleted = 0;
      for (const instance of activeInstances) {
        for (const item of instance.items) {
          total++;
          if (item.completed) completed++;
          if (item.required) required++;
          if (item.required && item.completed) requiredCompleted++;
        }
      }
      return { total, completed, required, requiredCompleted };
    }
    if (useLegacy) {
      const items = legacyItems;
      return {
        total: items.length,
        completed: items.filter(i => i.completed).length,
        required: items.filter(i => i.required).length,
        requiredCompleted: items.filter(i => i.required && i.completed).length,
      };
    }
    let total = 0, completed = 0, required = 0, requiredCompleted = 0;
    for (const items of Object.values(templateStates)) {
      for (const item of items) {
        total++;
        if (item.completed) completed++;
        if (item.required) required++;
        if (item.required && item.completed) requiredCompleted++;
      }
    }
    return { total, completed, required, requiredCompleted };
  };

  const stats = getOverallStats();
  const allRequiredComplete = stats.required === stats.requiredCompleted;
  const completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const getDepartmentItems = () => {
    const departmentSpecificItems: Record<string, Array<{ item: string; required: boolean; type: string; options?: string[] }>> = {
      'Human Resources': [
        { item: 'Review employee records', required: true, type: 'checkbox' },
        { item: 'Process new hire paperwork', required: true, type: 'checkbox' },
        { item: 'Update policy documents', required: false, type: 'text' },
        { item: 'Conduct safety briefings', required: true, type: 'checkbox' },
      ],
      Production: [
        { item: 'Safety equipment check', required: true, type: 'checkbox' },
        { item: 'Machine calibration verification', required: true, type: 'checkbox' },
        { item: 'Quality control inspection', required: true, type: 'checkbox' },
        { item: 'Material inventory check', required: false, type: 'text' },
        { item: 'Work area cleanliness', required: true, type: 'select', options: ['Excellent', 'Good', 'Needs Improvement'] },
      ],
      'Quality Control': [
        { item: 'Test equipment calibration', required: true, type: 'checkbox' },
        { item: 'Sample inspection completion', required: true, type: 'number' },
        { item: 'Documentation review', required: true, type: 'checkbox' },
        { item: 'Non-conformance reports', required: false, type: 'text' },
      ],
      Warehouse: [
        { item: 'Inventory count verification', required: true, type: 'checkbox' },
        { item: 'Shipping dock inspection', required: true, type: 'checkbox' },
        { item: 'Equipment maintenance check', required: true, type: 'checkbox' },
        { item: 'Safety walkthrough', required: true, type: 'checkbox' },
      ],
      Maintenance: [
        { item: 'Equipment inspection rounds', required: true, type: 'checkbox' },
        { item: 'Preventive maintenance tasks', required: true, type: 'number' },
        { item: 'Safety system checks', required: true, type: 'checkbox' },
        { item: 'Work order completions', required: false, type: 'number' },
      ],
      General: [
        { item: 'Safety inspection', required: true, type: 'checkbox' },
        { item: 'Equipment check', required: true, type: 'checkbox' },
        { item: 'Work area cleanliness', required: true, type: 'checkbox' },
        { item: 'Daily tasks review', required: false, type: 'text' },
      ],
    };
    return departmentSpecificItems[department] || departmentSpecificItems['General'];
  };

  const renderInputForItem = (
    item: { type: string; options?: string[] | null; value: string | boolean; completed: boolean },
    onUpdate: (value: string | boolean) => void
  ) => {
    switch (item.type) {
      case 'checkbox':
        return (
          <Checkbox
            checked={Boolean(item.value)}
            onCheckedChange={(checked) => onUpdate(Boolean(checked))}
          />
        );
      case 'text':
        return (
          <Input
            value={String(item.value || '')}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder="Enter details..."
            className="w-32"
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={String(item.value || '')}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder="0"
            className="w-20"
          />
        );
      case 'select':
        return (
          <Select
            value={String(item.value || '')}
            onValueChange={(value) => onUpdate(value)}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(item.options || []).map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  if (isLoading || (useLegacy && legacyLoading)) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CheckSquare className="w-5 h-5" />
              <span>Daily Checklist</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <CheckSquare className="w-5 h-5" />
                <span>Checklists - {department}</span>
                {useLegacy && (
                  <Badge variant="outline" className="border-orange-400 text-orange-700 text-xs">
                    Legacy mode — no templates assigned
                  </Badge>
                )}
                {useLegacyTemplateMode && (
                  <Badge variant="outline" className="border-yellow-500 text-yellow-700 text-xs">
                    Legacy mode
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {lastSaved && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Last saved: {format(lastSaved, 'h:mm:ss a')}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-blue-50">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.completed}/{stats.total}</div>
                    <div className="text-sm text-blue-700">Total Completed</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-green-50">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.requiredCompleted}/{stats.required}</div>
                    <div className="text-sm text-green-700">Required Completed</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-yellow-50">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{completionPercentage}%</div>
                    <div className="text-sm text-yellow-700">Progress</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {allRequiredComplete ? (
              <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-800 font-medium">All required tasks completed!</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-yellow-800">
                  Complete all required tasks before clocking out ({stats.required - stats.requiredCompleted} remaining)
                </span>
              </div>
            )}

            {useInstanceMode ? (
              <div className="space-y-6">
                {activeInstances.map((instance) => {
                  const instanceCompleted = instance.items.filter(i => i.completed).length;
                  const instanceTotal = instance.items.length;

                  return (
                    <div key={instance.instanceId} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {instance.templateName}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {instanceCompleted}/{instanceTotal}
                          </span>
                          <Badge className={`text-xs ${STATUS_COLORS[instance.status] || 'bg-gray-100 text-gray-700'}`}>
                            {instance.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      {instance.completedAt && (
                        <p className="text-xs text-muted-foreground">
                          Completed at {format(new Date(instance.completedAt), 'h:mm a')}
                        </p>
                      )}

                      {instance.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              {item.required && <span className="text-red-500 text-sm">*</span>}
                              <Label className="font-medium truncate">{item.label}</Label>
                            </div>
                            {item.completedAt && item.completedByDisplayName && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                By {item.completedByDisplayName} at {format(new Date(item.completedAt), 'h:mm a')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 ml-2 shrink-0">
                            {renderInputForItem(
                              { type: item.type, options: item.options, value: item.type === 'checkbox' ? item.completed : (item.value || ''), completed: item.completed },
                              (value) => handleInstanceItemChange(item, value)
                            )}
                            {item.completed && <CheckCircle className="w-4 h-4 text-green-500" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : useLegacy ? (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span>Today's Tasks</span>
                </h3>
                {legacyItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No checklist items found for {department}</p>
                  </div>
                ) : (
                  <>
                    {legacyItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-2">
                          {item.required && <span className="text-red-500 text-sm">*</span>}
                          <Label className="font-medium">{item.item}</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          {renderInputForItem(
                            { type: item.inputType, options: item.options, value: item.value, completed: item.completed },
                            (value) => handleLegacyItemUpdate(item.id, value)
                          )}
                          {item.completed && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-4 border-t">
                      <Button onClick={handleLegacySave} disabled={legacySubmitMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                        {legacySubmitMutation.isPending ? 'Saving...' : 'Save Progress'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {activeTemplates.map((template) => {
                  const items = templateStates[template.id] || [];
                  const templateCompleted = items.filter(i => i.completed).length;
                  const templateTotal = items.length;
                  const isDirty = dirtyTemplates.has(template.id);

                  return (
                    <div key={template.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {template.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {templateCompleted}/{templateTotal}
                          </span>
                          {isDirty && (
                            <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">
                              Unsaved
                            </Badge>
                          )}
                        </div>
                      </div>

                      {items.map((item) => (
                        <div key={item.templateItemId} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            {item.required && <span className="text-red-500 text-sm">*</span>}
                            <Label className="font-medium">{item.label}</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            {renderInputForItem(
                              item,
                              (value) => handleItemUpdate(template.id, item.templateItemId, value)
                            )}
                            {item.completed && <CheckCircle className="w-4 h-4 text-green-500" />}
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleSaveTemplate(template)}
                          disabled={submitMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {submitMutation.isPending ? 'Saving...' : 'Save Progress'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={handleClose}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved checklist changes. If you close now, your progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowUnsavedWarning(false);
              pendingCloseRef.current = false;
            }}>
              Stay & Save
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                setShowUnsavedWarning(false);
                setDirtyTemplates(new Set());
                onClose();
              }}
            >
              Discard & Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
