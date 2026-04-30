import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { 
  ClipboardList, 
  UserCheck, 
  Plus, 
  Trash2, 
  Award,
  CheckCircle2,
  Wrench,
  ExternalLink
} from 'lucide-react';
import type { 
  P2PartCertification, 
  P2EmployeePartCertification,
  Employee 
} from '../../../server/schema';


export default function P2CertificationsManager() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<'requirements' | 'employees'>('requirements');

  // Part Certification Form State
  const [partNumber, setPartNumber] = useState('');
  const [partName, setPartName] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Employee Certification Form State
  const [empPartCertId, setEmpPartCertId] = useState<number | null>(null);
  const [empPartNumber, setEmpPartNumber] = useState('');
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [empDepartment, setEmpDepartment] = useState('');
  const [drawingKnowledge, setDrawingKnowledge] = useState(false);
  const [specSheetUnderstanding, setSpecSheetUnderstanding] = useState(false);
  const [procedureCompletion, setProcedureCompletion] = useState(false);
  const [empNotes, setEmpNotes] = useState('');

  // Current user for admin checks
  const { data: currentUser } = useQuery<{ username: string; role: string }>({
    queryKey: ['/api/auth/me'],
  });
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';

  // Fetch data
  const { data: partNumbers = [] } = useQuery<Array<{ partNumber: string; partName: string }>>({
    queryKey: ['/api/training/p2-certifications/part-numbers'],
  });

  const { data: partRouting } = useQuery<{ departmentSequence: string[] }>({
    queryKey: ['/api/part-routings/by-part', partNumber],
    enabled: !!partNumber,
    queryFn: async () => {
      const res = await fetch(`/api/part-routings/by-part/${encodeURIComponent(partNumber)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch part routing');
      }
      return res.json();
    },
  });

  const { data: routingDepartments = [] } = useQuery<Array<{ id: string; name: string; isActive: boolean }>>({
    queryKey: ['/api/part-routings/departments/list'],
  });

  const availableRoutingDepts = partRouting?.departmentSequence 
    || routingDepartments.map(d => d.name);

  const { data: partCertifications = [], isLoading: loadingPartCerts } = useQuery<P2PartCertification[]>({
    queryKey: ['/api/training/p2-certifications'],
  });

  const { data: employeeCertifications = [], isLoading: loadingEmpCerts } = useQuery<P2EmployeePartCertification[]>({
    queryKey: ['/api/training/p2-employee-certifications'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Create Part Certification Mutation
  const createPartCertMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/training/p2-certifications', { method: 'POST', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-certifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-certifications/part-numbers'] });
      toast({ title: 'Success', description: 'Part certification requirement created' });
      // Reset form
      setPartNumber('');
      setPartName('');
      setDepartments([]);
      setNotes('');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create certification',
        variant: 'destructive'
      });
    },
  });

  // Delete Part Certification Mutation
  const deletePartCertMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/p2-certifications/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-certifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-certifications/part-numbers'] });
      toast({ title: 'Success', description: 'Part certification deleted' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete certification',
        variant: 'destructive'
      });
    },
  });

  // Create Employee Certification Mutation
  const createEmpCertMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/training/p2-employee-certifications', { method: 'POST', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-employee-certifications'] });
      toast({ title: 'Success', description: 'Employee certification created' });
      // Reset form
      resetEmpForm();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create employee certification',
        variant: 'destructive'
      });
    },
  });

  // Update Employee Certification Mutation
  const updateEmpCertMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/training/p2-employee-certifications/${id}`, { method: 'PATCH', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-employee-certifications'] });
      toast({ title: 'Success', description: 'Employee certification updated' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update certification',
        variant: 'destructive'
      });
    },
  });

  // Delete Employee Certification Mutation
  const deleteEmpCertMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/p2-employee-certifications/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-employee-certifications'] });
      toast({ title: 'Success', description: 'Employee certification deleted' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete certification',
        variant: 'destructive'
      });
    },
  });

  // Repair Capabilities Mutation (admin action)
  const repairCapabilitiesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/p2-certifications/repair-capabilities', { method: 'POST', body: {} });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Repair Complete',
        description: `Ensured capabilities for ${data.granted ?? 0} of ${data.total ?? 0} certified employee(s).${data.errors?.length ? ` ${data.errors.length} error(s) encountered.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Repair Failed',
        description: error.message || 'Failed to repair capabilities',
        variant: 'destructive',
      });
    },
  });

  const handleCreatePartCert = () => {
    if (!partNumber || departments.length === 0) {
      toast({ 
        title: 'Validation Error', 
        description: 'Part Number and at least one Department are required',
        variant: 'destructive'
      });
      return;
    }

    createPartCertMutation.mutate({
      partNumber,
      partName,
      departments,
      notes,
    });
  };

  const toggleDepartment = (dept: string) => {
    setDepartments(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  const handleCreateEmpCert = () => {
    if (!empPartNumber || !employeeId || !empDepartment) {
      toast({ 
        title: 'Validation Error', 
        description: 'Part Number, Employee, and Department are required',
        variant: 'destructive'
      });
      return;
    }

    // Find the part certification for this part and department
    const partCert = partCertifications.find(
      pc => pc.partNumber === empPartNumber && pc.departments?.includes(empDepartment)
    );

    if (!partCert) {
      toast({ 
        title: 'Validation Error', 
        description: 'No certification requirement exists for this part and department combination',
        variant: 'destructive'
      });
      return;
    }

    const selectedEmployee = employees.find(e => e.id === employeeId);

    createEmpCertMutation.mutate({
      partCertificationId: partCert.id,
      partNumber: empPartNumber,
      employeeId,
      employeeName: selectedEmployee?.name || '',
      department: empDepartment,
      drawingKnowledge,
      specSheetUnderstanding,
      procedureCompletion,
      notes: empNotes,
    });
  };

  const resetEmpForm = () => {
    setEmpPartCertId(null);
    setEmpPartNumber('');
    setEmployeeId(null);
    setEmpDepartment('');
    setDrawingKnowledge(false);
    setSpecSheetUnderstanding(false);
    setProcedureCompletion(false);
    setEmpNotes('');
  };

  const handleCheckboxChange = (certId: number, field: string, value: boolean) => {
    const cert = employeeCertifications.find(c => c.id === certId);
    if (!cert) return;

    updateEmpCertMutation.mutate({
      id: certId,
      data: { [field]: value },
    });
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Award className="h-8 w-8 text-primary" />
          P2 Certifications Manager
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage certification requirements for P2 parts and track employee competency
        </p>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2 mb-6">
        <Button
          onClick={() => setSelectedTab('requirements')}
          variant={selectedTab === 'requirements' ? 'default' : 'outline'}
          className="flex items-center gap-2"
          data-testid="button-tab-requirements"
        >
          <ClipboardList className="h-4 w-4" />
          Certification Requirements
        </Button>
        <Button
          onClick={() => setSelectedTab('employees')}
          variant={selectedTab === 'employees' ? 'default' : 'outline'}
          className="flex items-center gap-2"
          data-testid="button-tab-employees"
        >
          <UserCheck className="h-4 w-4" />
          Employee Certifications
        </Button>
      </div>

      {/* Certification Requirements Tab */}
      {selectedTab === 'requirements' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Create Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Certification Requirement
              </CardTitle>
              <CardDescription>
                Define which parts require certifications by department
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="part-number">Composite # (Part Number)</Label>
                <Select value={partNumber} onValueChange={(val) => {
                  setPartNumber(val);
                  setDepartments([]);
                  const selected = partNumbers.find((p: any) => p.partNumber === val);
                  if (selected) setPartName(selected.partName || '');
                }}>
                  <SelectTrigger id="part-number" data-testid="select-part-number">
                    <SelectValue placeholder="Select part number" />
                  </SelectTrigger>
                  <SelectContent>
                    {partNumbers.map((part: any) => (
                      <SelectItem key={part.partNumber} value={part.partNumber}>
                        {part.partNumber} - {part.partName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Departments (Select one or more)</Label>
                {!partNumber ? (
                  <p className="text-sm text-muted-foreground mt-2 p-3 border rounded-md bg-muted/30">
                    Select a part number first to see available departments from its routing configuration.
                  </p>
                ) : availableRoutingDepts.length === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 p-3 border rounded-md bg-amber-50 dark:bg-amber-950/30">
                    No routing configuration found for this part. Set up a Part Routing first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-md max-h-64 overflow-y-auto">
                    {availableRoutingDepts.map((dept) => (
                      <div key={dept} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dept-${dept}`}
                          checked={departments.includes(dept)}
                          onCheckedChange={() => toggleDepartment(dept)}
                          data-testid={`checkbox-department-${dept}`}
                        />
                        <label
                          htmlFor={`dept-${dept}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {dept}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {departments.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {departments.join(', ')}
                  </p>
                )}
                {partRouting?.departmentSequence && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Departments loaded from part routing configuration
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  data-testid="input-notes"
                />
              </div>

              <Button 
                onClick={handleCreatePartCert} 
                className="w-full"
                disabled={createPartCertMutation.isPending}
                data-testid="button-create-requirement"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Requirement
              </Button>
            </CardContent>
          </Card>

          {/* Requirements List */}
          <Card>
            <CardHeader>
              <CardTitle>Certification Requirements</CardTitle>
              <CardDescription>
                {partCertifications.length} requirement(s) defined
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPartCerts ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : partCertifications.length === 0 ? (
                <p className="text-muted-foreground">No requirements defined yet</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {partCertifications.map((cert) => (
                    <div
                      key={cert.id}
                      className="p-4 border rounded-lg flex items-start justify-between hover:bg-muted/50"
                      data-testid={`card-requirement-${cert.id}`}
                    >
                      <div className="flex-1">
                        <div className="font-semibold">{cert.partNumber}</div>
                        <div className="text-sm text-muted-foreground">{cert.partName}</div>
                        <div className="text-sm mt-1">
                          <span className="font-medium">Departments:</span>{' '}
                          <span className="inline-flex gap-1 flex-wrap">
                            {cert.departments?.map((dept: string) => (
                              <span key={dept} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                                {dept}
                              </span>
                            ))}
                          </span>
                        </div>
                        {cert.notes && (
                          <div className="text-sm text-muted-foreground mt-1">{cert.notes}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePartCertMutation.mutate(cert.id)}
                        disabled={deletePartCertMutation.isPending}
                        data-testid={`button-delete-requirement-${cert.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee Certifications Tab */}
      {selectedTab === 'employees' && (
        <div className="space-y-6">
          {/* Create Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Employee Certification
              </CardTitle>
              <CardDescription>
                Track employee competency for specific parts and departments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label htmlFor="emp-part-number">Composite # (Part Number)</Label>
                  <Select value={empPartNumber} onValueChange={setEmpPartNumber}>
                    <SelectTrigger id="emp-part-number" data-testid="select-emp-part-number">
                      <SelectValue placeholder="Select part number" />
                    </SelectTrigger>
                    <SelectContent>
                      {partNumbers.map((part: any) => (
                        <SelectItem key={part.partNumber} value={part.partNumber}>
                          {part.partNumber} - {part.partName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="emp-employee">Employee Name</Label>
                  <Select 
                    value={employeeId?.toString() || ''} 
                    onValueChange={(val) => setEmployeeId(parseInt(val))}
                  >
                    <SelectTrigger id="emp-employee" data-testid="select-employee">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="emp-department">Department</Label>
                  <Select value={empDepartment} onValueChange={setEmpDepartment}>
                    <SelectTrigger id="emp-department" data-testid="select-emp-department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const selectedPartCert = partCertifications.find(
                          pc => pc.partNumber === empPartNumber
                        );
                        const availableDepts = selectedPartCert?.departments || [];
                        
                        if (availableDepts.length === 0 && empPartNumber) {
                          return (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No certification requirements defined for this part
                            </div>
                          );
                        }
                        
                        return availableDepts.map((dept: string) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  {empPartNumber && !partCertifications.find(pc => pc.partNumber === empPartNumber) && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                      ⚠️ Please create a certification requirement for this part first
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3 mb-4 p-4 border rounded-lg bg-muted/30">
                <p className="font-medium text-sm">Competency Checkboxes</p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="drawing-knowledge"
                    checked={drawingKnowledge}
                    onCheckedChange={(checked) => setDrawingKnowledge(checked as boolean)}
                    data-testid="checkbox-drawing-knowledge"
                  />
                  <label htmlFor="drawing-knowledge" className="text-sm cursor-pointer">
                    Knowledge of drawing and department standards to uphold
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="spec-sheet"
                    checked={specSheetUnderstanding}
                    onCheckedChange={(checked) => setSpecSheetUnderstanding(checked as boolean)}
                    data-testid="checkbox-spec-sheet"
                  />
                  <label htmlFor="spec-sheet" className="text-sm cursor-pointer">
                    Spec Sheet Understanding
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="procedure-completion"
                    checked={procedureCompletion}
                    onCheckedChange={(checked) => setProcedureCompletion(checked as boolean)}
                    data-testid="checkbox-procedure"
                  />
                  <label htmlFor="procedure-completion" className="text-sm cursor-pointer">
                    Completion of the procedure after proper training
                  </label>
                </div>
              </div>

              <div className="mb-4">
                <Label htmlFor="emp-notes">Notes (Optional)</Label>
                <Textarea
                  id="emp-notes"
                  value={empNotes}
                  onChange={(e) => setEmpNotes(e.target.value)}
                  placeholder="Additional notes..."
                  data-testid="input-emp-notes"
                />
              </div>

              <Button 
                onClick={handleCreateEmpCert} 
                className="w-full"
                disabled={createEmpCertMutation.isPending}
                data-testid="button-create-emp-certification"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Employee Certification
              </Button>
            </CardContent>
          </Card>

          {/* Employee Certifications Table */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Employee Certifications</CardTitle>
                  <CardDescription>
                    {employeeCertifications.length} certification(s) recorded
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => repairCapabilitiesMutation.mutate()}
                    disabled={repairCapabilitiesMutation.isPending}
                    className="flex items-center gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950"
                    data-testid="button-repair-capabilities"
                    title="Re-grant shop floor capabilities for all fully certified employees. Safe to run multiple times."
                  >
                    <Wrench className="h-4 w-4" />
                    {repairCapabilitiesMutation.isPending ? 'Repairing...' : 'Repair Capabilities'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingEmpCerts ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : employeeCertifications.length === 0 ? (
                <p className="text-muted-foreground">No employee certifications yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-center">Drawing Knowledge</TableHead>
                        <TableHead className="text-center">Spec Sheet</TableHead>
                        <TableHead className="text-center">Procedure</TableHead>
                        <TableHead className="text-center">Certified</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeCertifications.map((cert) => {
                        const isFullyCertified = cert.drawingKnowledge && cert.specSheetUnderstanding && cert.procedureCompletion;
                        return (
                          <TableRow key={cert.id} data-testid={`row-emp-cert-${cert.id}`}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{cert.employeeName}</span>
                                <Link href={`/employee-detail/${cert.employeeId}?tab=traveler`}>
                                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-primary" title="View employee traveler access">
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell>{cert.partNumber}</TableCell>
                            <TableCell>{cert.department}</TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={cert.drawingKnowledge || false}
                                onCheckedChange={(checked) => 
                                  handleCheckboxChange(cert.id, 'drawingKnowledge', checked as boolean)
                                }
                                data-testid={`checkbox-drawing-${cert.id}`}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={cert.specSheetUnderstanding || false}
                                onCheckedChange={(checked) => 
                                  handleCheckboxChange(cert.id, 'specSheetUnderstanding', checked as boolean)
                                }
                                data-testid={`checkbox-spec-${cert.id}`}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={cert.procedureCompletion || false}
                                onCheckedChange={(checked) => 
                                  handleCheckboxChange(cert.id, 'procedureCompletion', checked as boolean)
                                }
                                data-testid={`checkbox-proc-${cert.id}`}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              {isFullyCertified && (
                                <CheckCircle2 className="h-5 w-5 text-green-600 inline" />
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteEmpCertMutation.mutate(cert.id)}
                                disabled={deleteEmpCertMutation.isPending}
                                data-testid={`button-delete-emp-cert-${cert.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
