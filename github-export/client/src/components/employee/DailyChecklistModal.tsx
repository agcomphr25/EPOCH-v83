import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckSquare, AlertCircle, CheckCircle, X, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ChecklistItem {
  id: number;
  department: string;
  item: string;
  required: boolean;
  inputType: 'checkbox' | 'text' | 'number' | 'select';
  options?: string[];
  value?: string | boolean;
  completed: boolean;
}

interface DailyChecklistModalProps {
  employeeId: number;
  department: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DailyChecklistModal({ employeeId, department, isOpen, onClose }: DailyChecklistModalProps) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const today = new Date().toISOString().split('T')[0];

  const { data: checklist = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/checklist', employeeId, today],
    queryFn: async () => {
      const response = await fetch(`/api/checklist?employeeId=${employeeId}&date=${today}`);
      if (!response.ok) {
        // If no checklist exists yet, return default items based on department
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
    enabled: isOpen,
  });

  const updateChecklistMutation = useMutation({
    mutationFn: async (updates: { itemId: number; value: string | boolean }[]) => {
      const response = await fetch('/api/checklist/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employeeId.toString(),
          date: today,
          items: updates,
        }),
      });
      if (!response.ok) throw new Error('Failed to update checklist');
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: 'Checklist updated successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to update checklist', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (checklist.length > 0) {
      setChecklistItems(checklist);
    }
  }, [checklist]);

  const handleItemUpdate = (itemId: number, value: string | boolean) => {
    setChecklistItems(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, value, completed: Boolean(value) }
          : item
      )
    );
  };

  const handleSave = () => {
    const updates = checklistItems.map(item => ({
      itemId: item.id,
      value: item.value || false,
    }));
    
    updateChecklistMutation.mutate(updates);
  };

  const stats = {
    total: checklistItems.length,
    completed: checklistItems.filter(item => item.completed).length,
    required: checklistItems.filter(item => item.required).length,
    requiredCompleted: checklistItems.filter(item => item.required && item.completed).length,
  };

  const allRequiredComplete = stats.required === stats.requiredCompleted;
  const completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const getDepartmentItems = () => {
    const departmentSpecificItems = {
      'Human Resources': [
        { item: 'Review employee records', required: true, type: 'checkbox' },
        { item: 'Process new hire paperwork', required: true, type: 'checkbox' },
        { item: 'Update policy documents', required: false, type: 'text' },
        { item: 'Conduct safety briefings', required: true, type: 'checkbox' },
      ],
      'Production': [
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
      'Warehouse': [
        { item: 'Inventory count verification', required: true, type: 'checkbox' },
        { item: 'Shipping dock inspection', required: true, type: 'checkbox' },
        { item: 'Equipment maintenance check', required: true, type: 'checkbox' },
        { item: 'Safety walkthrough', required: true, type: 'checkbox' },
      ],
      'Maintenance': [
        { item: 'Equipment inspection rounds', required: true, type: 'checkbox' },
        { item: 'Preventive maintenance tasks', required: true, type: 'number' },
        { item: 'Safety system checks', required: true, type: 'checkbox' },
        { item: 'Work order completions', required: false, type: 'number' },
      ],
      'General': [
        { item: 'Safety inspection', required: true, type: 'checkbox' },
        { item: 'Equipment check', required: true, type: 'checkbox' },
        { item: 'Work area cleanliness', required: true, type: 'checkbox' },
        { item: 'Daily tasks review', required: false, type: 'text' },
      ],
    };

    return departmentSpecificItems[department as keyof typeof departmentSpecificItems] || departmentSpecificItems['General'];
  };

  const renderChecklistItem = (item: ChecklistItem) => {
    const baseProps = {
      key: item.id,
      className: "flex items-center justify-between p-3 border rounded-lg"
    };

    return (
      <div {...baseProps}>
        <div className="flex items-center space-x-3 flex-1">
          <div className="flex items-center space-x-2">
            {item.required && <span className="text-red-500 text-sm">*</span>}
            <Label className="font-medium">{item.item}</Label>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {item.inputType === 'checkbox' && (
            <Checkbox
              checked={Boolean(item.value)}
              onCheckedChange={(checked) => handleItemUpdate(item.id, checked)}
            />
          )}
          
          {item.inputType === 'text' && (
            <Input
              value={String(item.value || '')}
              onChange={(e) => handleItemUpdate(item.id, e.target.value)}
              placeholder="Enter details..."
              className="w-32"
            />
          )}
          
          {item.inputType === 'number' && (
            <Input
              type="number"
              value={String(item.value || '')}
              onChange={(e) => handleItemUpdate(item.id, e.target.value)}
              placeholder="0"
              className="w-20"
            />
          )}
          
          {item.inputType === 'select' && (
            <Select 
              value={String(item.value || '')} 
              onValueChange={(value) => handleItemUpdate(item.id, value)}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {item.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {item.completed && (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckSquare className="w-5 h-5" />
              <span>Daily Checklist - {department}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.completed}/{stats.total}
                  </div>
                  <div className="text-sm text-blue-700">Total Completed</div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-green-50">
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {stats.requiredCompleted}/{stats.required}
                  </div>
                  <div className="text-sm text-green-700">Required Completed</div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-yellow-50">
              <CardContent className="pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {completionPercentage}%
                  </div>
                  <div className="text-sm text-yellow-700">Progress</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status Alert */}
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

          {/* Checklist Items */}
          <div className="space-y-3">
            <h3 className="font-semibold flex items-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>Today's Tasks</span>
            </h3>
            
            {checklistItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No checklist items found for {department}</p>
                <p className="text-sm">Items will be automatically generated based on your department.</p>
              </div>
            ) : (
              checklistItems.map(renderChecklistItem)
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateChecklistMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateChecklistMutation.isPending ? 'Saving...' : 'Save Progress'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}