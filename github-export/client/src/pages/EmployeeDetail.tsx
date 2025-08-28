import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Mail, Phone, Calendar, Shield, FileText, Award, ExternalLink, Copy, Edit, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import AddCertificationModal from '@/components/employee/AddCertificationModal';
import AddEvaluationModal from '@/components/employee/AddEvaluationModal';

interface Employee {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  employmentType: string;
  hireDate: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  salary: number;
  hourlyRate: number;
  isActive: boolean;
  portalToken: string;
  portalTokenExpiry: string;
  createdAt: string;
}

interface Certification {
  id: number;
  employeeId: number;
  certificationId: number;
  dateObtained: string;
  dateExpiry: string;
  certificateNumber: string;
  issuingAuthority: string;
  status: string;
  certification: {
    name: string;
    category: string;
  };
}

interface Evaluation {
  id: number;
  employeeId: number;
  evaluatorId: number;
  evaluationPeriodStart: string;
  evaluationPeriodEnd: string;
  overallRating: number;
  status: string;
  submittedAt: string;
  reviewedAt: string;
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Employee>>({});
  const [portalUrl, setPortalUrl] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ['/api/employees', id],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${id}`);
      if (!response.ok) throw new Error('Failed to fetch employee');
      return response.json();
    },
    enabled: !!id,
  });

  const { data: certifications = [] } = useQuery({
    queryKey: ['/api/employee-certifications', { employeeId: id }],
    queryFn: async () => {
      const response = await fetch(`/api/employee-certifications?employeeId=${id}`);
      if (!response.ok) throw new Error('Failed to fetch certifications');
      return response.json();
    },
    enabled: !!id,
  });

  const { data: evaluations = [] } = useQuery({
    queryKey: ['/api/evaluations', { employeeId: id }],
    queryFn: async () => {
      const response = await fetch(`/api/evaluations?employeeId=${id}`);
      if (!response.ok) throw new Error('Failed to fetch evaluations');
      return response.json();
    },
    enabled: !!id,
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: Partial<Employee>) => {
      const response = await fetch(`/api/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update employee');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id] });
      setIsEditing(false);
      toast({ title: "Success", description: "Employee updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update employee", variant: "destructive" });
    },
  });

  const generatePortalTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/employees/${id}/portal-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to generate portal token');
      return response.json();
    },
    onSuccess: (data) => {
      setPortalUrl(data.portalUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id] });
      toast({ title: "Success", description: "Portal link generated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate portal link", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (employee) {
      setEditData(employee);
      if (employee.portalToken) {
        setPortalUrl(`${window.location.origin}/employee-portal/${employee.portalToken}`);
      }
    }
  }, [employee]);

  const handleSave = () => {
    updateEmployeeMutation.mutate(editData);
  };

  const handleCancel = () => {
    setEditData(employee || {});
    setIsEditing(false);
  };

  const copyPortalUrl = () => {
    navigator.clipboard.writeText(portalUrl);
    toast({ title: "Copied", description: "Portal URL copied to clipboard" });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      ACTIVE: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-red-100 text-red-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      DRAFT: 'bg-gray-100 text-gray-800',
      SUBMITTED: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-green-100 text-green-800',
    };
    
    return (
      <Badge className={statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">Employee not found or failed to load.</p>
            <Link href="/employee">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Employees
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/employee">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{employee.name}</h1>
            <p className="text-gray-600">{employee.role} • {employee.department}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateEmployeeMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateEmployeeMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Profile Card */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Profile</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-10 h-10 text-white" />
                </div>
                <Badge className={employee.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {employee.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {isEditing ? (
                    <Input
                      value={editData.email || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Email"
                    />
                  ) : (
                    <span>{employee.email || 'Not specified'}</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {isEditing ? (
                    <Input
                      value={editData.phone || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Phone"
                    />
                  ) : (
                    <span>{employee.phone || 'Not specified'}</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>Hired {formatDate(employee.hireDate)}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-gray-400" />
                  {isEditing ? (
                    <Select value={editData.role || ''} onValueChange={(value) => setEditData(prev => ({ ...prev, role: value }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HR Manager">HR Manager</SelectItem>
                        <SelectItem value="Production Manager">Production Manager</SelectItem>
                        <SelectItem value="Quality Control">Quality Control</SelectItem>
                        <SelectItem value="Technician">Technician</SelectItem>
                        <SelectItem value="Operator">Operator</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Supervisor">Supervisor</SelectItem>
                        <SelectItem value="Administrator">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{employee.role}</span>
                  )}
                </div>
              </div>

              {/* Portal Link Section */}
              <div className="border-t pt-4">
                <Label className="text-sm font-medium">Employee Portal</Label>
                {portalUrl ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Input value={portalUrl} readOnly className="text-xs" />
                      <Button size="sm" variant="outline" onClick={copyPortalUrl}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="w-full">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Open Portal
                      </Button>
                    </a>
                  </div>
                ) : (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full mt-2"
                    onClick={() => generatePortalTokenMutation.mutate()}
                    disabled={generatePortalTokenMutation.isPending}
                  >
                    {generatePortalTokenMutation.isPending ? 'Generating...' : 'Generate Portal Link'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="details" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="certifications">Certifications</TabsTrigger>
              <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Employee Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Employment Type</Label>
                      {isEditing ? (
                        <Select value={editData.employmentType || ''} onValueChange={(value) => setEditData(prev => ({ ...prev, employmentType: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FULL_TIME">Full Time</SelectItem>
                            <SelectItem value="PART_TIME">Part Time</SelectItem>
                            <SelectItem value="CONTRACT">Contract</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-gray-600">{employee.employmentType || 'Not specified'}</p>
                      )}
                    </div>

                    <div>
                      <Label>Department</Label>
                      {isEditing ? (
                        <Select value={editData.department || ''} onValueChange={(value) => setEditData(prev => ({ ...prev, department: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Human Resources">Human Resources</SelectItem>
                            <SelectItem value="Production">Production</SelectItem>
                            <SelectItem value="Quality Control">Quality Control</SelectItem>
                            <SelectItem value="Maintenance">Maintenance</SelectItem>
                            <SelectItem value="Administration">Administration</SelectItem>
                            <SelectItem value="Warehouse">Warehouse</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-gray-600">{employee.department || 'Not specified'}</p>
                      )}
                    </div>

                    <div>
                      <Label>Gate Card #</Label>
                      {isEditing ? (
                        <Input
                          value={editData.gateCardNumber || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, gateCardNumber: e.target.value }))}
                          placeholder="Gate card number"
                        />
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.gateCardNumber || 'Not specified'}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Vehicle Type</Label>
                      {isEditing ? (
                        <Input
                          value={editData.vehicleType || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, vehicleType: e.target.value }))}
                          placeholder="Vehicle type"
                        />
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.vehicleType || 'Not specified'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Address</Label>
                    {isEditing ? (
                      <Input
                        value={editData.address || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Address"
                      />
                    ) : (
                      <p className="text-sm text-gray-600">{employee.address || 'Not specified'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Emergency Contact</Label>
                      {isEditing ? (
                        <Input
                          value={editData.emergencyContact || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, emergencyContact: e.target.value }))}
                          placeholder="Emergency contact name"
                        />
                      ) : (
                        <p className="text-sm text-gray-600">{employee.emergencyContact || 'Not specified'}</p>
                      )}
                    </div>

                    <div>
                      <Label>Emergency Phone</Label>
                      {isEditing ? (
                        <Input
                          value={editData.emergencyPhone || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, emergencyPhone: e.target.value }))}
                          placeholder="Emergency contact phone"
                        />
                      ) : (
                        <p className="text-sm text-gray-600">{employee.emergencyPhone || 'Not specified'}</p>
                      )}
                    </div>
                  </div>

                  {/* Access Control Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Building Key Access</Label>
                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={editData.buildingKeyAccess || false}
                            onChange={(e) => setEditData(prev => ({ ...prev, buildingKeyAccess: e.target.checked }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm">Has building key access</span>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.buildingKeyAccess ? 'Yes' : 'No'}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>TCI Access</Label>
                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={editData.tciAccess || false}
                            onChange={(e) => setEditData(prev => ({ ...prev, tciAccess: e.target.checked }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm">Has TCI access</span>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.tciAccess ? 'Yes' : 'No'}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="certifications">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Certifications</CardTitle>
                    <CardDescription>Employee training and certification records</CardDescription>
                  </div>
                  <AddCertificationModal employeeId={parseInt(id)} />
                </CardHeader>
                <CardContent>
                  {certifications.length === 0 ? (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No certifications on record</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {certifications.map((cert: Certification) => (
                        <div key={cert.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{cert.certification?.name || 'Unknown Certification'}</h4>
                              <p className="text-sm text-gray-600">{cert.issuingAuthority}</p>
                              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                <span>Obtained: {formatDate(cert.dateObtained)}</span>
                                {cert.dateExpiry && (
                                  <span>Expires: {formatDate(cert.dateExpiry)}</span>
                                )}
                                {cert.certificateNumber && (
                                  <span>#{cert.certificateNumber}</span>
                                )}
                              </div>
                            </div>
                            {getStatusBadge(cert.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evaluations">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Performance Evaluations</CardTitle>
                    <CardDescription>Employee performance review history</CardDescription>
                  </div>
                  <AddEvaluationModal employeeId={parseInt(id)} />
                </CardHeader>
                <CardContent>
                  {evaluations.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No evaluations on record</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {evaluations.map((evaluation: Evaluation) => (
                        <div key={evaluation.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">
                                {formatDate(evaluation.evaluationPeriodStart)} - {formatDate(evaluation.evaluationPeriodEnd)}
                              </h4>
                              {evaluation.overallRating && (
                                <p className="text-sm text-gray-600">Overall Rating: {evaluation.overallRating}/5.0</p>
                              )}
                              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                {evaluation.submittedAt && (
                                  <span>Submitted: {formatDate(evaluation.submittedAt)}</span>
                                )}
                                {evaluation.reviewedAt && (
                                  <span>Reviewed: {formatDate(evaluation.reviewedAt)}</span>
                                )}
                              </div>
                            </div>
                            {getStatusBadge(evaluation.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Employee documents and files</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">Document management coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}