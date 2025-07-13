import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { UserCheck, ClipboardList, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TimeClock from './TimeClock';
import OnboardingDocs from './OnboardingDocs';
import type { ChecklistItem } from '@shared/schema';

interface EmployeePortalProps {
  employeeId: string;
}

export default function EmployeePortal({ employeeId }: EmployeePortalProps) {
  const [activeTab, setActiveTab] = useState("checklist");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().substr(0, 10); // YYYY-MM-DD

  // Load daily checklist
  const { data: checklist = [], isLoading: checklistLoading } = useQuery({
    queryKey: ['/api/checklist', employeeId, today],
    queryFn: async () => {
      const response = await fetch(`/api/checklist?employeeId=${employeeId}&date=${today}`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      return response.json() as Promise<ChecklistItem[]>;
    }
  });

  // Save checklist mutation
  const saveChecklistMutation = useMutation({
    mutationFn: async (items: ChecklistItem[]) => {
      const response = await fetch('/api/checklist/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          date: today,
          items,
        }),
      });
      if (!response.ok) throw new Error('Failed to save checklist');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklist', employeeId, today] });
      toast({ title: 'Checklist saved successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Failed to save checklist', variant: 'destructive' });
    },
  });

  // Update checklist item
  const updateItem = (id: number, value: string | boolean) => {
    queryClient.setQueryData(['/api/checklist', employeeId, today], (old: ChecklistItem[] | undefined) => {
      if (!old) return [];
      return old.map((item) =>
        item.id === id ? { ...item, value: String(value) } : item
      );
    });
  };

  // Check if all required fields are complete
  const allComplete = checklist.every((item) =>
    item.required ? Boolean(item.value) : true
  );

  const handleSaveChecklist = () => {
    saveChecklistMutation.mutate(checklist);
  };

  const getCompletionStats = () => {
    const completed = checklist.filter(item => Boolean(item.value)).length;
    const total = checklist.length;
    const required = checklist.filter(item => item.required).length;
    const requiredCompleted = checklist.filter(item => item.required && Boolean(item.value)).length;
    
    return { completed, total, required, requiredCompleted };
  };

  const stats = getCompletionStats();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employee Portal</h1>
          <p className="text-gray-600 mt-2">Employee ID: {employeeId}</p>
        </div>
        <TimeClock employeeId={employeeId} disableClockOut={!allComplete} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="checklist" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Daily Checklist
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Onboarding Docs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Daily Checklist
              </CardTitle>
              <CardDescription>
                Complete your daily tasks and requirements
              </CardDescription>
              
              {/* Progress Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.completed}/{stats.total}
                  </div>
                  <div className="text-sm text-blue-700">Total Completed</div>
                </div>
                
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {stats.requiredCompleted}/{stats.required}
                  </div>
                  <div className="text-sm text-green-700">Required Completed</div>
                </div>
                
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {allComplete ? '100%' : Math.round((stats.requiredCompleted / stats.required) * 100) + '%'}
                  </div>
                  <div className="text-sm text-yellow-700">Progress</div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {checklistLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : checklist.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No checklist items found for today</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Label className="flex-1 font-medium">
                          {item.label}
                          {item.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {item.type === 'checkbox' && (
                          <Checkbox
                            checked={Boolean(item.value)}
                            onCheckedChange={(checked) => updateItem(item.id, checked)}
                          />
                        )}
                        
                        {item.type === 'dropdown' && (
                          <Select 
                            value={item.value || ''} 
                            onValueChange={(value) => updateItem(item.id, value)}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(item.options as string[] || []).map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {item.type === 'text' && (
                          <Input
                            value={item.value || ''}
                            onChange={(e) => updateItem(item.id, e.target.value)}
                            placeholder="Enter value..."
                            className="w-48"
                          />
                        )}
                        
                        {Boolean(item.value) && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                        
                        {item.required && !Boolean(item.value) && (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex justify-center pt-4">
                    <Button
                      onClick={handleSaveChecklist}
                      disabled={!allComplete || saveChecklistMutation.isPending}
                      className={`px-6 py-3 ${
                        allComplete
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : 'bg-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {saveChecklistMutation.isPending ? 'Saving...' : 'Save Checklist'}
                    </Button>
                  </div>
                  
                  {!allComplete && (
                    <div className="text-center text-sm text-gray-500">
                      Complete all required items to save and enable clock out
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding" className="mt-6">
          <OnboardingDocs employeeId={employeeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}