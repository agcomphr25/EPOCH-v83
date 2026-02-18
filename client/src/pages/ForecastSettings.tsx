import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Save, Settings, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface DepartmentSetting {
  department: string;
  avgDays: number;
}

export default function ForecastSettings() {
  const { toast } = useToast();
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<DepartmentSetting[]>({
    queryKey: ['/api/forecast/settings/departments'],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ department, avgDays }: { department: string; avgDays: number }) => {
      await apiRequest(`/api/forecast/settings/departments/${encodeURIComponent(department)}`, {
        method: 'PUT',
        body: JSON.stringify({ avgDays }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/forecast/settings/departments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forecast/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forecast/weekly'] });
      setEditingValues(prev => {
        const next = { ...prev };
        delete next[variables.department];
        return next;
      });
      toast({ title: 'Saved', description: `Updated ${variables.department} avg days` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save setting', variant: 'destructive' });
    },
  });

  const handleSave = (department: string) => {
    const raw = editingValues[department];
    if (raw === undefined) return;
    const avgDays = parseFloat(raw);
    if (isNaN(avgDays) || avgDays < 0) {
      toast({ title: 'Invalid', description: 'Days must be a number >= 0', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({ department, avgDays });
  };

  const isEdited = (dept: string, current: number) => {
    const val = editingValues[dept];
    return val !== undefined && parseFloat(val) !== current;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Forecast Calibration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Adjust average processing days per department to calibrate forecast accuracy
          </p>
        </div>
        <Link href="/production-forecast">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Forecast
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Department Processing Times</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="w-[160px]">Avg Days</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((dept) => (
                <TableRow key={dept.department}>
                  <TableCell className="font-medium">{dept.department}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={editingValues[dept.department] ?? dept.avgDays}
                      onChange={(e) =>
                        setEditingValues(prev => ({ ...prev, [dept.department]: e.target.value }))
                      }
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      disabled={!isEdited(dept.department, dept.avgDays) || updateMutation.isPending}
                      onClick={() => handleSave(dept.department)}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-1" />
                      )}
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
