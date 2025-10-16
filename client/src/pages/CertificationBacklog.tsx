import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, Circle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

type Employee = {
  id: number;
  name: string;
  jobTitle: string | null;
  department: string | null;
  isActive: boolean;
};

type Certification = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
};

type EmployeeCertification = {
  id: number;
  employeeId: number;
  certificationId: number;
  dateObtained: string | null;
  expiryDate: string | null;
  isActive: boolean;
};

export default function CertificationBacklog() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: number;
    employeeName: string;
    certificationId: number;
    certificationName: string;
    currentDate: string | null;
    existingId: number | null;
  } | null>(null);
  const [dateValue, setDateValue] = useState('');

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: certifications = [], isLoading: certsLoading } = useQuery<Certification[]>({
    queryKey: ['/api/certifications'],
  });

  const { data: employeeCerts = [], isLoading: empCertsLoading } = useQuery<EmployeeCertification[]>({
    queryKey: ['/api/employees/certifications-matrix'],
  });

  const toggleCertMutation = useMutation({
    mutationFn: async (data: {
      employeeId: number;
      certificationId: number;
      dateObtained: string | null;
      existingId: number | null;
    }) => {
      if (data.existingId) {
        // Update existing
        return apiRequest('/api/employees/certifications/' + data.existingId, 'PATCH', {
          dateObtained: data.dateObtained,
          isActive: !!data.dateObtained,
        });
      } else {
        // Create new
        return apiRequest('/api/employees/certifications', 'POST', {
          employeeId: data.employeeId,
          certificationId: data.certificationId,
          dateObtained: data.dateObtained,
          isActive: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees/certifications-matrix'] });
      toast({
        title: 'Success',
        description: 'Certification updated successfully',
      });
      setSelectedCell(null);
      setDateValue('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update certification',
        variant: 'destructive',
      });
    },
  });

  const handleCellClick = (
    employeeId: number,
    employeeName: string,
    certificationId: number,
    certificationName: string
  ) => {
    const existing = employeeCerts.find(
      ec => ec.employeeId === employeeId && ec.certificationId === certificationId && ec.isActive
    );
    
    setSelectedCell({
      employeeId,
      employeeName,
      certificationId,
      certificationName,
      currentDate: existing?.dateObtained || null,
      existingId: existing?.id || null,
    });
    setDateValue(existing?.dateObtained ? new Date(existing.dateObtained).toISOString().split('T')[0] : '');
  };

  const handleSave = () => {
    if (!selectedCell) return;
    
    toggleCertMutation.mutate({
      employeeId: selectedCell.employeeId,
      certificationId: selectedCell.certificationId,
      dateObtained: dateValue || null,
      existingId: selectedCell.existingId,
    });
  };

  const handleRemove = () => {
    if (!selectedCell) return;
    
    toggleCertMutation.mutate({
      employeeId: selectedCell.employeeId,
      certificationId: selectedCell.certificationId,
      dateObtained: null,
      existingId: selectedCell.existingId,
    });
  };

  const hasCertification = (employeeId: number, certificationId: number) => {
    return employeeCerts.find(
      ec => ec.employeeId === employeeId && ec.certificationId === certificationId && ec.isActive
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  // Filter to department certifications (show all employees, active or inactive)
  const departmentCerts = certifications.filter(c => c.category === 'DEPARTMENT');

  if (employeesLoading || certsLoading || empCertsLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/training-matrix')}
                data-testid="button-back-to-matrix"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Training Matrix
              </Button>
              <CardTitle>Certification Backlog</CardTitle>
            </div>
            <Badge variant="secondary" data-testid="badge-cert-count">
              {employees.length} Employees × {departmentCerts.length} Certifications
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-4">
            Click on any cell to add or update certification date. Click again to remove.
          </div>
          
          <div className="border rounded-lg overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-20 bg-muted/50 p-3 text-left font-semibold border-r border-b min-w-[180px]">
                    Employee
                  </th>
                  {departmentCerts.map(cert => (
                    <th
                      key={cert.id}
                      className="p-3 text-left font-semibold border-b min-w-[140px]"
                      data-testid={`header-cert-${cert.id}`}
                    >
                      <div className="flex flex-col">
                        <span>{cert.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map(employee => (
                  <tr key={employee.id} className="border-b hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-background p-3 border-r font-medium">
                      <div className="flex flex-col">
                        <span data-testid={`employee-name-${employee.id}`}>{employee.name}</span>
                        {employee.department && (
                          <span className="text-xs text-muted-foreground">{employee.department}</span>
                        )}
                      </div>
                    </td>
                    {departmentCerts.map(cert => {
                      const empCert = hasCertification(employee.id, cert.id);
                      return (
                        <td
                          key={`${employee.id}-${cert.id}`}
                          className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => handleCellClick(employee.id, employee.name, cert.id, cert.name)}
                          data-testid={`cell-${employee.id}-${cert.id}`}
                        >
                          <div className="flex items-center gap-2">
                            {empCert ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                {empCert.dateObtained && (
                                  <span className="text-sm text-muted-foreground">
                                    {formatDate(empCert.dateObtained)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <Circle className="h-5 w-5 text-gray-300" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent data-testid="dialog-edit-certification">
          <DialogHeader>
            <DialogTitle>
              {selectedCell?.employeeName} - {selectedCell?.certificationName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date Obtained</Label>
              <Input
                id="date"
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                data-testid="input-cert-date"
              />
            </div>
            <div className="flex gap-2 justify-end">
              {selectedCell?.existingId && (
                <Button
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={toggleCertMutation.isPending}
                  data-testid="button-remove-cert"
                >
                  Remove
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setSelectedCell(null)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={toggleCertMutation.isPending}
                data-testid="button-save-cert"
              >
                {toggleCertMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
