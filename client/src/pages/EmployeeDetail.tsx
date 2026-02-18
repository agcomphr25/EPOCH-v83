import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  Shield,
  FileText,
  Award,
  ExternalLink,
  Copy,
  Edit,
  Save,
  X,
  GraduationCap,
  CheckCircle2,
  Circle,
  Upload,
  Download,
  Trash2,
  File,
  Briefcase,
  Clock,
  Building2,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import AddCertificationModal from '@/components/employee/AddCertificationModal';
import CertificationFormModal from '@/components/employee/CertificationFormModal';
import AddEvaluationModal from '@/components/employee/AddEvaluationModal';
import EmployeeBadgeBarcode from '@/components/EmployeeBadgeBarcode';

interface Employee {
  id: number;
  employeeCode?: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  userRole: string;
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
  gateCardNumber?: string;
  vehicleType?: string;
  buildingKeyAccess?: boolean;
  tciAccess?: boolean;
}

interface CertificationFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
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
  uploadedFiles?: CertificationFile[];
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

interface Capability {
  id: number;
  name: string;
  displayName: string;
  category: string;
  description: string;
}

interface EmployeeCapability {
  id: number;
  employeeId: number;
  capabilityId: number;
  useHardcoded: boolean;
  capability: Capability;
}

interface TrainingMatrixEntry {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  trainingName: string;
  lastCompleted: string | null;
  status: string;
  notes: string | null;
}

interface EmploymentPeriod {
  id: string;
  employeeId: number;
  startDate: string;
  endDate: string | null;
  employmentType: string;
  department: string | null;
  jobTitle: string | null;
  status: 'ACTIVE' | 'ENDED';
  startedViaSessionId: string | null;
  endedViaSessionId: string | null;
  createdAt: string;
  startedViaPathName: string | null;
  startedViaPathPurpose: string | null;
  endedViaPathName: string | null;
  endedViaPathPurpose: string | null;
  startBundlePath: string | null;
  endBundlePath: string | null;
}

function CertificationCard({ 
  cert, 
  formatDate, 
  getStatusBadge 
}: { 
  cert: Certification; 
  formatDate: (date: string) => string;
  getStatusBadge: (status: string) => JSX.Element;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/certifications/${cert.id}/upload-file`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload file');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employee-certifications'] });
      setSelectedFile(null);
      toast({
        title: 'Success',
        description: 'File uploaded successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(
        `/api/certifications/${cert.id}/delete-file/${fileId}`,
        {
          method: 'DELETE',
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete file');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employee-certifications'] });
      toast({
        title: 'Success',
        description: 'File deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteCertificationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/employees/certifications/${cert.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete certification');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employee-certifications'] });
      setShowDeleteConfirm(false);
      toast({
        title: 'Success',
        description: 'Certification deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      uploadFileMutation.mutate(selectedFile);
    }
  };

  const handleDownload = (fileId: string) => {
    window.open(`/api/certifications/${cert.id}/download-file/${fileId}`, '_blank');
  };

  const handleDelete = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      deleteFileMutation.mutate(fileId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium">
            {cert.certification?.name || 'Unknown Certification'}
          </h4>
          <p className="text-sm text-gray-600">
            {cert.issuingAuthority}
          </p>
          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
            <span>
              Obtained: {formatDate(cert.dateObtained)}
            </span>
            {cert.dateExpiry && (
              <span>
                Expires: {formatDate(cert.dateExpiry)}
              </span>
            )}
            {cert.certificateNumber && (
              <span>#{cert.certificateNumber}</span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusBadge(cert.status)}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            data-testid={`button-delete-cert-${cert.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="border-t pt-4 bg-red-50 rounded p-3">
          <p className="text-sm text-red-900 mb-3">
            Are you sure you want to delete this certification? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteCertificationMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteCertificationMutation.mutate()}
              disabled={deleteCertificationMutation.isPending}
              data-testid="button-confirm-delete-cert"
            >
              {deleteCertificationMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <div className="border-t pt-4">
        <h5 className="text-sm font-medium mb-2 flex items-center">
          <File className="w-4 h-4 mr-2" />
          Supporting Documents
        </h5>

        {/* Uploaded Files List */}
        {cert.uploadedFiles && cert.uploadedFiles.length > 0 && (
          <div className="space-y-2 mb-3">
            {cert.uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded border"
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(file.id)}
                    data-testid={`button-download-${file.id}`}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(file.id)}
                    disabled={deleteFileMutation.isPending}
                    data-testid={`button-delete-${file.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload New File */}
        <div className="flex items-center space-x-2">
          <Input
            type="file"
            onChange={handleFileSelect}
            className="flex-1"
            data-testid="input-upload-file"
          />
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || uploadFileMutation.isPending}
            data-testid="button-upload-file"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploadFileMutation.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Employee>>({});
  const [portalUrl, setPortalUrl] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: employee,
    isLoading,
    error,
  } = useQuery({
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
      const response = await fetch(
        `/api/employee-certifications?employeeId=${id}`
      );
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

  const { data: allCapabilities = [] } = useQuery({
    queryKey: ['/api/employees/capabilities'],
    queryFn: async () => {
      const response = await fetch('/api/employees/capabilities');
      if (!response.ok) throw new Error('Failed to fetch capabilities');
      return response.json();
    },
  });

  const { data: employeeCapabilities = [] } = useQuery({
    queryKey: ['/api/employees', id, 'capabilities'],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${id}/capabilities`);
      if (!response.ok)
        throw new Error('Failed to fetch employee capabilities');
      return response.json();
    },
    enabled: !!id,
  });

  const { data: trainingMatrix = [] } = useQuery<TrainingMatrixEntry[]>({
    queryKey: ['/api/training/matrix'],
    queryFn: async () => {
      const response = await fetch('/api/training/matrix');
      if (!response.ok) throw new Error('Failed to fetch training matrix');
      return response.json();
    },
    enabled: !!id,
  });

  const { data: employmentPeriods = [], isLoading: isLoadingPeriods } = useQuery<EmploymentPeriod[]>({
    queryKey: ['/api/employees', id, 'employment-periods'],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${id}/employment-periods`);
      if (!response.ok) throw new Error('Failed to fetch employment periods');
      return response.json();
    },
    enabled: !!id,
  });

  // Filter training matrix data for this employee
  const employeeTraining = id
    ? trainingMatrix.filter((entry) => entry.employeeId === parseInt(id))
    : [];
  const completedTrainings = employeeTraining.filter(
    (entry) => entry.status === 'COMPLETED'
  ).length;
  const totalTrainings = employeeTraining.length;

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
      toast({ title: 'Success', description: 'Employee updated successfully' });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update employee',
        variant: 'destructive',
      });
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
      toast({
        title: 'Success',
        description: 'Portal link generated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate portal link',
        variant: 'destructive',
      });
    },
  });

  const grantCapabilityMutation = useMutation({
    mutationFn: async ({ capabilityId }: { capabilityId: number }) => {
      const response = await fetch(`/api/employees/${id}/capabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilityId, useHardcoded: true }),
      });
      if (!response.ok) throw new Error('Failed to grant capability');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/employees', id, 'capabilities'],
      });
      toast({
        title: 'Success',
        description: 'Capability granted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to grant capability',
        variant: 'destructive',
      });
    },
  });

  const revokeCapabilityMutation = useMutation({
    mutationFn: async (employeeCapabilityId: number) => {
      const response = await fetch(
        `/api/employees/employee-capabilities/${employeeCapabilityId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) throw new Error('Failed to revoke capability');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/employees', id, 'capabilities'],
      });
      toast({
        title: 'Success',
        description: 'Capability revoked successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to revoke capability',
        variant: 'destructive',
      });
    },
  });

  const toggleHardcodedMutation = useMutation({
    mutationFn: async ({
      employeeCapabilityId,
      useHardcoded,
    }: {
      employeeCapabilityId: number;
      useHardcoded: boolean;
    }) => {
      const response = await fetch(
        `/api/employees/employee-capabilities/${employeeCapabilityId}/toggle`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useHardcoded }),
        }
      );
      if (!response.ok)
        throw new Error('Failed to toggle hardcoded capability');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/employees', id, 'capabilities'],
      });
      toast({ title: 'Success', description: 'Capability setting updated' });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update capability setting',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (employee) {
      setEditData(employee);
      if (employee.portalToken) {
        setPortalUrl(
          `${window.location.origin}/employee-portal/${employee.portalToken}`
        );
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
    toast({ title: 'Copied', description: 'Portal URL copied to clipboard' });
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
      <Badge
        className={
          statusColors[status as keyof typeof statusColors] ||
          'bg-gray-100 text-gray-800'
        }
      >
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
            <p className="text-red-700">
              Employee not found or failed to load.
            </p>
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
            <h1 className="text-3xl font-bold text-gray-900">
              {employee.name}
            </h1>
            <p className="text-gray-600">
              {employee.jobTitle || 'No Title'} • {employee.department}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateEmployeeMutation.isPending}
              >
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
                <Badge
                  className={
                    employee.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }
                >
                  {employee.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {isEditing ? (
                    <Input
                      value={editData.email || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
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
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
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

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-gray-400" />
                    {isEditing ? (
                      <Select
                        value={editData.jobTitle || ''}
                        onValueChange={(value) =>
                          setEditData((prev) => ({ ...prev, jobTitle: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select job title" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HR Manager">HR Manager</SelectItem>
                          <SelectItem value="Production Manager">
                            Production Manager
                          </SelectItem>
                          <SelectItem value="Quality Control">
                            Quality Control
                          </SelectItem>
                          <SelectItem value="Technician">Technician</SelectItem>
                          <SelectItem value="Operator">Operator</SelectItem>
                          <SelectItem value="Maintenance">
                            Maintenance
                          </SelectItem>
                          <SelectItem value="Supervisor">Supervisor</SelectItem>
                          <SelectItem value="Administrator">
                            Administrator
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span>{employee.jobTitle || 'No Title'}</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Label className="text-xs text-gray-500">
                      System Access:
                    </Label>
                    {isEditing ? (
                      <Select
                        value={editData.userRole || ''}
                        onValueChange={(value) =>
                          setEditData((prev) => ({ ...prev, userRole: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select system role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMPLOYEE">Employee</SelectItem>
                          <SelectItem value="ADMIN">Administrator</SelectItem>
                          <SelectItem value="OWNER">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          employee.userRole === 'ADMIN'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : employee.userRole === 'OWNER'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                        }
                      >
                        {employee.userRole}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Portal Link Section */}
              <div className="border-t pt-4">
                <Label className="text-sm font-medium">Employee Portal</Label>
                {portalUrl ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Input value={portalUrl} readOnly className="text-xs" />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyPortalUrl}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <a
                      href={portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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
                    {generatePortalTokenMutation.isPending
                      ? 'Generating...'
                      : 'Generate Portal Link'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="details" className="space-y-4">
            <TabsList className="grid w-full grid-cols-9">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="certifications">Certifications</TabsTrigger>
              <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
              <TabsTrigger value="training">Training</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="badge">Badge</TabsTrigger>
              <TabsTrigger value="journal">Journal</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Employee Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Employee Code</Label>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Input
                            value={editData.employeeCode || ''}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                employeeCode: e.target.value,
                              }))
                            }
                            placeholder="e.g., EMP001, TM001"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Clear field to trigger auto-generation on save
                              setEditData((prev) => ({
                                ...prev,
                                employeeCode: '',
                              }));
                              toast({
                                title: "Auto-Generate Enabled",
                                description: "Next sequential code (e.g., EMP001) will be generated when you save.",
                              });
                            }}
                            data-testid="button-auto-generate-code"
                            title="Clear field and auto-generate next sequential code on save"
                          >
                            Generate
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900 mt-2">
                          {employee.employeeCode || (
                            <span className="text-yellow-600">⚠️ Not assigned (required for badge)</span>
                          )}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Employment Type</Label>
                      {isEditing ? (
                        <Select
                          value={editData.employmentType || ''}
                          onValueChange={(value) =>
                            setEditData((prev) => ({
                              ...prev,
                              employmentType: value,
                            }))
                          }
                        >
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
                        <p className="text-sm text-gray-600">
                          {employee.employmentType || 'Not specified'}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Department</Label>
                      {isEditing ? (
                        <Select
                          value={editData.department || ''}
                          onValueChange={(value) =>
                            setEditData((prev) => ({
                              ...prev,
                              department: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Human Resources">
                              Human Resources
                            </SelectItem>
                            <SelectItem value="Production">
                              Production
                            </SelectItem>
                            <SelectItem value="Quality Control">
                              Quality Control
                            </SelectItem>
                            <SelectItem value="Maintenance">
                              Maintenance
                            </SelectItem>
                            <SelectItem value="Administration">
                              Administration
                            </SelectItem>
                            <SelectItem value="Warehouse">Warehouse</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.department || 'Not specified'}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Gate Card #</Label>
                      {isEditing ? (
                        <Input
                          value={editData.gateCardNumber || ''}
                          onChange={(e) =>
                            setEditData((prev) => ({
                              ...prev,
                              gateCardNumber: e.target.value,
                            }))
                          }
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
                          onChange={(e) =>
                            setEditData((prev) => ({
                              ...prev,
                              vehicleType: e.target.value,
                            }))
                          }
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
                        onChange={(e) =>
                          setEditData((prev) => ({
                            ...prev,
                            address: e.target.value,
                          }))
                        }
                        placeholder="Address"
                      />
                    ) : (
                      <p className="text-sm text-gray-600">
                        {employee.address || 'Not specified'}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Emergency Contact</Label>
                      {isEditing ? (
                        <Input
                          value={editData.emergencyContact || ''}
                          onChange={(e) =>
                            setEditData((prev) => ({
                              ...prev,
                              emergencyContact: e.target.value,
                            }))
                          }
                          placeholder="Emergency contact name"
                        />
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.emergencyContact || 'Not specified'}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label>Emergency Phone</Label>
                      {isEditing ? (
                        <Input
                          value={editData.emergencyPhone || ''}
                          onChange={(e) =>
                            setEditData((prev) => ({
                              ...prev,
                              emergencyPhone: e.target.value,
                            }))
                          }
                          placeholder="Emergency contact phone"
                        />
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.emergencyPhone || 'Not specified'}
                        </p>
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
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                buildingKeyAccess: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm">
                            Has building key access
                          </span>
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
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                tciAccess: e.target.checked,
                              }))
                            }
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

            <TabsContent value="permissions">
              <Card>
                <CardHeader>
                  <CardTitle>Individual Capabilities</CardTitle>
                  <CardDescription>
                    Assign specific permissions to {employee.name} based on
                    their actual responsibilities
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Granted Capabilities */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Granted Capabilities
                    </h3>
                    {employeeCapabilities.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <Shield className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          No capabilities assigned yet
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {employeeCapabilities.map(
                          (empCap: any) => {
                            if (!empCap.capability) {
                              return null;
                            }
                            return (
                            <div
                              key={empCap.id}
                              className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-gray-900">
                                      {empCap.capability.displayName}
                                    </h4>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {empCap.capability.category}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {empCap.capability.description}
                                  </p>
                                  <div className="flex items-center gap-4 mt-3">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs text-gray-500">
                                        Use Hardcoded:
                                      </Label>
                                      <input
                                        type="checkbox"
                                        checked={empCap.useHardcoded}
                                        onChange={(e) => {
                                          toggleHardcodedMutation.mutate({
                                            employeeCapabilityId: empCap.id,
                                            useHardcoded: e.target.checked,
                                          });
                                        }}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        data-testid={`toggle-hardcoded-${empCap.id}`}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    revokeCapabilityMutation.mutate(empCap.id)
                                  }
                                  disabled={revokeCapabilityMutation.isPending}
                                  className="text-red-600 hover:text-red-700"
                                  data-testid={`button-revoke-${empCap.id}`}
                                >
                                  Revoke
                                </Button>
                              </div>
                            </div>
                          );
                          }
                        )}
                      </div>
                    )}
                  </div>

                  {/* Available Capabilities */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Available Capabilities
                    </h3>
                    <div className="space-y-2">
                      {allCapabilities
                        .filter(
                          (cap: Capability) =>
                            !employeeCapabilities.some(
                              (empCap: EmployeeCapability) =>
                                empCap.capabilityId === cap.id
                            )
                        )
                        .map((cap: Capability) => (
                          <div
                            key={cap.id}
                            className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    {cap.displayName}
                                  </h4>
                                  <Badge variant="outline" className="text-xs">
                                    {cap.category}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  {cap.description}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  grantCapabilityMutation.mutate({
                                    capabilityId: cap.id,
                                  })
                                }
                                disabled={grantCapabilityMutation.isPending}
                                className="text-blue-600 hover:text-blue-700"
                                data-testid={`button-grant-${cap.id}`}
                              >
                                Grant
                              </Button>
                            </div>
                          </div>
                        ))}
                      {allCapabilities.filter(
                        (cap: Capability) =>
                          !employeeCapabilities.some(
                            (empCap: EmployeeCapability) =>
                              empCap.capabilityId === cap.id
                          )
                      ).length === 0 && (
                        <div className="text-center py-6 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-500">
                            All capabilities have been granted
                          </p>
                        </div>
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
                    <CardDescription>
                      Employee training and certification records
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <CertificationFormModal 
                      employeeId={parseInt(id || '0')} 
                      employeeName={employee.name}
                    />
                    <AddCertificationModal employeeId={parseInt(id || '0')} />
                  </div>
                </CardHeader>
                <CardContent>
                  {certifications.length === 0 ? (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">
                        No certifications on record
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {certifications.map((cert: Certification) => (
                        <CertificationCard 
                          key={cert.id} 
                          cert={cert} 
                          formatDate={formatDate}
                          getStatusBadge={getStatusBadge}
                        />
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
                    <CardDescription>
                      Employee performance review history
                    </CardDescription>
                  </div>
                  <AddEvaluationModal employeeId={parseInt(id || '0')} />
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
                        <div
                          key={evaluation.id}
                          className="border rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">
                                {formatDate(evaluation.evaluationPeriodStart)} -{' '}
                                {formatDate(evaluation.evaluationPeriodEnd)}
                              </h4>
                              {evaluation.overallRating && (
                                <p className="text-sm text-gray-600">
                                  Overall Rating: {evaluation.overallRating}/5.0
                                </p>
                              )}
                              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                {evaluation.submittedAt && (
                                  <span>
                                    Submitted:{' '}
                                    {formatDate(evaluation.submittedAt)}
                                  </span>
                                )}
                                {evaluation.reviewedAt && (
                                  <span>
                                    Reviewed:{' '}
                                    {formatDate(evaluation.reviewedAt)}
                                  </span>
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

            <TabsContent value="training">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Training Completion Status</CardTitle>
                      <CardDescription>
                        Employee training matrix and completion records
                      </CardDescription>
                    </div>
                    {totalTrainings > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            completedTrainings === totalTrainings
                              ? 'default'
                              : completedTrainings > totalTrainings / 2
                                ? 'secondary'
                                : 'destructive'
                          }
                          className="text-sm"
                        >
                          {totalTrainings > 0
                            ? Math.round(
                                (completedTrainings / totalTrainings) * 100
                              )
                            : 0}
                          % Complete
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {completedTrainings}/{totalTrainings} trainings
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {employeeTraining.length === 0 ? (
                    <div className="text-center py-8">
                      <GraduationCap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No training records found</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Training data can be imported from the Training Matrix
                        Import page
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {employeeTraining
                        .sort((a, b) => {
                          // Sort: completed items last, alphabetically within each group
                          if (
                            a.status === 'COMPLETED' &&
                            b.status !== 'COMPLETED'
                          )
                            return 1;
                          if (
                            a.status !== 'COMPLETED' &&
                            b.status === 'COMPLETED'
                          )
                            return -1;
                          return a.trainingName.localeCompare(b.trainingName);
                        })
                        .map((training) => {
                          const isCompleted = training.status === 'COMPLETED';
                          const formatDate = (dateStr: string | null) => {
                            if (!dateStr) return null;
                            try {
                              const date = new Date(dateStr);
                              return date.toLocaleDateString('en-US', {
                                month: 'numeric',
                                day: 'numeric',
                                year: 'numeric',
                              });
                            } catch {
                              return dateStr;
                            }
                          };

                          return (
                            <div
                              key={training.id}
                              className={`border rounded-lg p-4 ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                              data-testid={`training-${training.trainingName.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    {isCompleted ? (
                                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    ) : (
                                      <Circle className="h-5 w-5 text-red-400" />
                                    )}
                                    <h4 className="font-medium text-gray-900">
                                      {training.trainingName}
                                    </h4>
                                  </div>
                                  {isCompleted && training.lastCompleted && (
                                    <div className="mt-2 text-sm text-gray-600">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        <span>
                                          Completed:{' '}
                                          {formatDate(training.lastCompleted)}
                                        </span>
                                      </div>
                                      {training.notes && (
                                        <p className="mt-1 text-xs text-blue-600">
                                          Note: {training.notes}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {!isCompleted && (
                                    <p className="mt-2 text-sm text-gray-600">
                                      Not yet completed
                                    </p>
                                  )}
                                </div>
                                <Badge
                                  variant={
                                    isCompleted ? 'default' : 'destructive'
                                  }
                                  className="ml-2"
                                >
                                  {training.status}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>
                    Employee documents and files
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">
                      Document management coming soon
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="badge">
              <Card>
                <CardHeader>
                  <CardTitle>Employee Badge Barcode</CardTitle>
                  <CardDescription>
                    Print or download this employee's badge barcode for scanner access
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmployeeBadgeBarcode
                    badgeScanCode={employee.badgeScanCode}
                    employeeName={employee.name}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="journal">
              <Card>
                <CardHeader>
                  <CardTitle>Employee Journal</CardTitle>
                  <CardDescription>
                    Notes, observations, and records for this employee
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">
                      Journal entries coming soon
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Employment History
                  </CardTitle>
                  <CardDescription>
                    Timeline of employment periods for this employee
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingPeriods ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-gray-500">Loading employment history...</p>
                    </div>
                  ) : employmentPeriods.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Briefcase className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-800">Legacy Employee</h4>
                          <p className="text-sm text-amber-700 mt-1">
                            Employment history not yet recorded. This employee was added before the employment tracking system was implemented.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {employmentPeriods.map((period, index) => (
                        <div 
                          key={period.id} 
                          className={`relative pl-8 pb-4 ${index !== employmentPeriods.length - 1 ? 'border-l-2 border-gray-200 ml-2' : ''}`}
                        >
                          <div className={`absolute left-0 top-0 w-4 h-4 rounded-full ${period.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'} -translate-x-1/2`}></div>
                          
                          <div className={`rounded-lg border p-4 ${period.status === 'ACTIVE' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-lg">
                                    {period.jobTitle || 'Position Not Specified'}
                                  </span>
                                  <Badge variant={period.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                    {period.status}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    {new Date(period.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {' → '}
                                    {period.endDate 
                                      ? new Date(period.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                      : 'Present'
                                    }
                                  </span>
                                </div>
                              </div>
                              <Badge variant="outline">{period.employmentType}</Badge>
                            </div>
                            
                            {period.department && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                                <Building2 className="w-4 h-4" />
                                <span>{period.department}</span>
                              </div>
                            )}
                            
                            <div className="space-y-2 text-sm">
                              {period.startedViaSessionId && (
                                <div className="flex items-center gap-2 text-blue-600">
                                  <Link2 className="w-4 h-4" />
                                  <span>
                                    Started via {period.startedViaPathPurpose === 'REHIRE' ? 'Re-Hire' : 'Onboarding'}
                                    {period.startedViaPathName && ` (${period.startedViaPathName})`}
                                  </span>
                                  <Link to={`/admin/onboarding/sessions/${period.startedViaSessionId}`}>
                                    <Button variant="link" size="sm" className="h-auto p-0 text-blue-600">
                                      View Session
                                    </Button>
                                  </Link>
                                  {period.startBundlePath && (
                                    <a 
                                      href={`/api/object-storage/download?path=${encodeURIComponent(period.startBundlePath)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Button variant="link" size="sm" className="h-auto p-0 text-blue-600">
                                        <Download className="w-3 h-3 mr-1" />
                                        Bundle PDF
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              )}
                              
                              {period.endedViaSessionId && (
                                <div className="flex items-center gap-2 text-orange-600">
                                  <Link2 className="w-4 h-4" />
                                  <span>
                                    Ended via {period.endedViaPathPurpose === 'REHIRE' ? 'Re-Hire' : 'Transition'}
                                    {period.endedViaPathName && ` (${period.endedViaPathName})`}
                                  </span>
                                  <Link to={`/admin/onboarding/sessions/${period.endedViaSessionId}`}>
                                    <Button variant="link" size="sm" className="h-auto p-0 text-orange-600">
                                      View Session
                                    </Button>
                                  </Link>
                                  {period.endBundlePath && (
                                    <a 
                                      href={`/api/object-storage/download?path=${encodeURIComponent(period.endBundlePath)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Button variant="link" size="sm" className="h-auto p-0 text-orange-600">
                                        <Download className="w-3 h-3 mr-1" />
                                        Bundle PDF
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
