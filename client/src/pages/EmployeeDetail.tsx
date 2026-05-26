import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useSearch } from 'wouter';
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
  KeyRound,
  AlertTriangle,
  Wrench,
  Plus,
  Ban,
  ClipboardCheck,
  Info,
  XCircle,
  Eye,
  EyeOff,
  Tags,
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
import { Checkbox } from '@/components/ui/checkbox';
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
  payType?: string | null;
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
  hasPin?: boolean;
  supervisorEmployeeId?: number | null;
}

interface ChargeCodeOption {
  id: number;
  code: string;
  description?: string | null;
  type: string;
  costHandling?: string | null;
  department?: string | null;
  active: boolean;
}

interface EmployeeChargeCodeAssignments {
  employeeId: number;
  assignedChargeCodeIds: number[];
  assignedChargeCodes: ChargeCodeOption[];
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

interface TrainingMatrixEntry {
  id: number;
  employeeId: number | null;
  trainingName: string;
  frequency: string | null;
  lastCompleted: string | null;
  nextDue: string | null;
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

interface TravelerAuth {
  id: number;
  employeeId: number;
  partNumber: string;
  department: string | null;
  productionLine: string | null;
  authorizedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  planId: number | null;
  planTitle?: string | null;
}

interface EmpP2Cert {
  id: number;
  employeeId: number;
  employeeName: string;
  partNumber: string;
  department: string;
  drawingKnowledge: boolean;
  specSheetUnderstanding: boolean;
  procedureCompletion: boolean;
  certifiedDate: string | null;
  certifiedBy: string | null;
  notes: string | null;
  createdAt: string;
}

interface P2PartCert {
  id: number;
  partNumber: string;
  departments: string[];
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

const VALID_TABS = ['details','permissions','charge-codes','certifications','evaluations','training','traveler','documents','badge','journal','history','qualifications'] as const;
type TabValue = typeof VALID_TABS[number];

export default function EmployeeDetail() {
  const { id } = useParams();
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const tabParam = searchParams.get('tab');
  const initialTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as TabValue) : 'details';
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  useEffect(() => {
    const sp = new URLSearchParams(search);
    const t = sp.get('tab');
    if (t && (VALID_TABS as readonly string[]).includes(t)) {
      setActiveTab(t as TabValue);
    }
  }, [search]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
    setLocation(`${location.split('?')[0]}?tab=${value}`, { replace: true });
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Employee>>({});
  const [newTimekeeperPin, setNewTimekeeperPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [portalUrl, setPortalUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [selectedAssignUserId, setSelectedAssignUserId] = useState<string>('');
  const [showAssignUser, setShowAssignUser] = useState(false);
  const [selectedChargeCodeIds, setSelectedChargeCodeIds] = useState<number[]>([]);
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

  const { data: allEmployees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: async () => {
      const response = await fetch('/api/employees');
      if (!response.ok) throw new Error('Failed to fetch employees');
      return response.json();
    },
  });

  const supervisorOptions = allEmployees
    .filter((emp) => emp.isActive !== false && String(emp.id) !== String(id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const assignedSupervisor = allEmployees.find((emp) => emp.id === employee?.supervisorEmployeeId);

  const { data: allChargeCodes = [] } = useQuery<ChargeCodeOption[]>({
    queryKey: ['/api/charge-codes'],
    queryFn: async () => {
      const response = await fetch('/api/charge-codes');
      if (!response.ok) throw new Error('Failed to fetch charge codes');
      return response.json();
    },
  });

  const { data: employeeChargeCodes } = useQuery<EmployeeChargeCodeAssignments>({
    queryKey: ['/api/employees', id, 'charge-codes'],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${id}/charge-codes`);
      if (!response.ok) throw new Error('Failed to fetch employee charge codes');
      return response.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (employeeChargeCodes) {
      setSelectedChargeCodeIds(employeeChargeCodes.assignedChargeCodeIds);
    }
  }, [employeeChargeCodes]);

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

  const { data: employeeTrainingMatrix = [], isLoading: isLoadingTraining } = useQuery<TrainingMatrixEntry[]>({
    queryKey: ['/api/employees', id, 'training-matrix'],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${id}/training-matrix`);
      if (!response.ok) throw new Error('Failed to fetch employee training matrix');
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

  const { data: machineQualifications = [], isLoading: isLoadingQuals } = useQuery<any[]>({
    queryKey: ['/api/employees', id, 'qualifications'],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${id}/qualifications`);
      if (!response.ok) throw new Error('Failed to fetch qualifications');
      return response.json();
    },
    enabled: !!id,
  });

  const [showAddQualDialog, setShowAddQualDialog] = useState(false);
  const [newQual, setNewQual] = useState({ machineClass: '', operationType: '', department: '', expiresAt: '', notes: '' });

  const createQualMutation = useMutation({
    mutationFn: async (data: typeof newQual) => {
      const response = await fetch(`/api/employees/${id}/qualifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineClass: data.machineClass || null,
          operationType: (data.operationType && data.operationType !== 'none') ? data.operationType : null,
          department: data.department || null,
          expiresAt: data.expiresAt || null,
          notes: data.notes || null,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create qualification');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id, 'qualifications'] });
      setShowAddQualDialog(false);
      setNewQual({ machineClass: '', operationType: '', department: '', expiresAt: '', notes: '' });
      toast({ title: 'Qualification added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deactivateQualMutation = useMutation({
    mutationFn: async (qualId: number) => {
      const response = await fetch(`/api/employees/${id}/qualifications/${qualId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to deactivate qualification');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id, 'qualifications'] });
      toast({ title: 'Qualification removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const completedTrainings = employeeTrainingMatrix.filter(
    (entry) => entry.status === 'COMPLETED' || entry.status === 'EXPIRING_SOON'
  ).length;
  const totalTrainings = employeeTrainingMatrix.length;

  const updateEmployeeMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
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

  const updateChargeCodesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/employees/${id}/charge-codes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeCodeIds: selectedChargeCodeIds }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update charge code assignments');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id, 'charge-codes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/charge-codes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/kiosk/charge-codes'] });
      toast({ title: 'Success', description: 'Charge code assignments updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const activeChargeCodes = allChargeCodes
    .filter((code) => code.active !== false)
    .sort((a, b) => a.code.localeCompare(b.code));

  const toggleChargeCode = (chargeCodeId: number) => {
    setSelectedChargeCodeIds((current) =>
      current.includes(chargeCodeId)
        ? current.filter((id) => id !== chargeCodeId)
        : [...current, chargeCodeId].sort((a, b) => a - b)
    );
  };

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

  const { data: linkedUser } = useQuery<{
    id: number;
    username: string;
    role: string;
    isActive: boolean;
    lastLogin: string | null;
    passwordChangedAt: string | null;
  } | null>({
    queryKey: ['/api/employees', id, 'user-account'],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${id}/user-account`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
  });

  const { data: allUsers = [] } = useQuery<{
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    employeeId: number | null;
  }[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.rows ?? []);
    },
    enabled: !linkedUser,
  });

  const unlinkedUsers = allUsers.filter(u => u.isActive && u.employeeId == null);

  const assignUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const employeeId = parseInt(id as string);
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign login account');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id, 'user-account'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setSelectedAssignUserId('');
      setShowAssignUser(false);
      toast({ title: 'Login account linked', description: 'The employee can now sign in on the kiosk.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ password, username }: { password: string; username?: string }) => {
      const res = await fetch(`/api/employees/${id}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set password');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', id, 'user-account'] });
      setNewPassword('');
      setConfirmPassword('');
      setNewUsername('');
      setShowPasswordForm(false);
      toast({ title: 'Password updated', description: 'The employee can now log in with the new password.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSetPassword = () => {
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (!linkedUser && !newUsername) {
      toast({ title: 'Error', description: 'Enter a username to create a login account.', variant: 'destructive' });
      return;
    }
    setPasswordMutation.mutate({ password: newPassword, username: newUsername || undefined });
  };

  // CBAC queries — wired to the real permission enforcement layer
  const { data: cbacCapabilities = [] } = useQuery<{ id: number; key: string; description: string; category: string }[]>({
    queryKey: ['/api/permissions/capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/permissions/capabilities');
      if (!res.ok) throw new Error('Failed to fetch CBAC capabilities');
      return res.json();
    },
  });

  const { data: userOverrides = [] } = useQuery<{ id: number; capabilityKey: string; effect: string }[]>({
    queryKey: ['/api/permissions/user-overrides', linkedUser?.id],
    queryFn: async () => {
      if (!linkedUser?.id) return [];
      const res = await fetch(`/api/permissions/user-overrides?userId=${linkedUser.id}`);
      if (!res.ok) throw new Error('Failed to fetch user overrides');
      return res.json();
    },
    enabled: !!linkedUser?.id,
  });

  const { data: allRoles = [] } = useQuery<{ id: number; name: string; capabilities: string[] }[]>({
    queryKey: ['/api/permissions/roles'],
    queryFn: async () => {
      const res = await fetch('/api/permissions/roles');
      if (!res.ok) throw new Error('Failed to fetch roles');
      return res.json();
    },
  });

  const roleCapabilities: string[] = (() => {
    const role = allRoles.find(r => r.name === (employee?.userRole || 'EMPLOYEE'));
    return role?.capabilities || [];
  })();

  const grantCbacMutation = useMutation({
    mutationFn: async (capabilityKey: string) => {
      if (!linkedUser?.id) throw new Error('No linked user account');
      const res = await fetch('/api/permissions/user-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: linkedUser.id, capabilityKey, effect: 'allow' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to grant capability');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/user-overrides', linkedUser?.id] });
      toast({ title: 'Capability granted', description: 'The override is now active.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const denyCbacMutation = useMutation({
    mutationFn: async (capabilityKey: string) => {
      if (!linkedUser?.id) throw new Error('No linked user account');
      const res = await fetch('/api/permissions/user-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: linkedUser.id, capabilityKey, effect: 'deny' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to deny capability');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/user-overrides', linkedUser?.id] });
      toast({ title: 'Capability denied', description: 'The deny override is now active.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const revokeCbacMutation = useMutation({
    mutationFn: async (overrideId: number) => {
      const res = await fetch(`/api/permissions/user-overrides/${overrideId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke capability');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permissions/user-overrides', linkedUser?.id] });
      toast({ title: 'Override removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Traveler Access state
  const [showAddAuthDialog, setShowAddAuthDialog] = useState(false);
  const [newAuthPartNumber, setNewAuthPartNumber] = useState('');
  const [newAuthDepartment, setNewAuthDepartment] = useState('');
  const [newAuthProductionLine, setNewAuthProductionLine] = useState('');
  const [newAuthExpiresAt, setNewAuthExpiresAt] = useState('');

  const [showAddP2CertDialog, setShowAddP2CertDialog] = useState(false);
  const [p2PartNumber, setP2PartNumber] = useState('');
  const [p2Department, setP2Department] = useState('');
  const [p2DrawingKnowledge, setP2DrawingKnowledge] = useState(false);
  const [p2SpecSheet, setP2SpecSheet] = useState(false);
  const [p2ProcedureCompletion, setP2ProcedureCompletion] = useState(false);

  const { data: travelerAuths = [], isLoading: isLoadingAuths } = useQuery<TravelerAuth[]>({
    queryKey: ['/api/training/epoch/traveler-authorizations', id],
    queryFn: async () => {
      const res = await fetch(`/api/training/epoch/traveler-authorizations/${id}`);
      if (!res.ok) throw new Error('Failed to fetch traveler authorizations');
      return res.json();
    },
    enabled: !!id,
  });

  const { data: empP2Certs = [], isLoading: isLoadingP2Certs } = useQuery<EmpP2Cert[]>({
    queryKey: ['/api/training/p2-employee-certifications/employee', id],
    queryFn: async () => {
      const res = await fetch(`/api/training/p2-employee-certifications/employee/${id}`);
      if (!res.ok) throw new Error('Failed to fetch P2 certifications');
      return res.json();
    },
    enabled: !!id,
  });

  const { data: partNumbers = [] } = useQuery<Array<{ partNumber: string; partName: string }>>({
    queryKey: ['/api/training/p2-certifications/part-numbers'],
    queryFn: async () => {
      const res = await fetch('/api/training/p2-certifications/part-numbers');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createAuthMutation = useMutation({
    mutationFn: async (data: { partNumber: string; department?: string; productionLine?: string; expiresAt?: string }) => {
      const res = await fetch('/api/training/epoch/traveler-authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: parseInt(id!), ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create authorization');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/epoch/traveler-authorizations', id] });
      setShowAddAuthDialog(false);
      setNewAuthPartNumber('');
      setNewAuthDepartment('');
      setNewAuthProductionLine('');
      setNewAuthExpiresAt('');
      toast({ title: 'Authorization added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deactivateAuthMutation = useMutation({
    mutationFn: async (authId: number) => {
      const res = await fetch(`/api/training/epoch/traveler-authorizations/${authId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error('Failed to deactivate authorization');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/epoch/traveler-authorizations', id] });
      toast({ title: 'Authorization deactivated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteAuthMutation = useMutation({
    mutationFn: async (authId: number) => {
      const res = await fetch(`/api/training/epoch/traveler-authorizations/${authId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete authorization');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/epoch/traveler-authorizations', id] });
      toast({ title: 'Authorization removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const createP2CertMutation = useMutation({
    mutationFn: async (data: {
      partNumber: string; department: string;
      drawingKnowledge: boolean; specSheetUnderstanding: boolean; procedureCompletion: boolean;
    }) => {
      const partCertsRes = await fetch('/api/training/p2-certifications');
      const partCerts: P2PartCert[] = partCertsRes.ok ? await partCertsRes.json() : [];
      const partCert = partCerts.find((pc) => pc.partNumber === data.partNumber && pc.departments?.includes(data.department));
      if (!partCert) {
        throw new Error(`No P2 certification record found for part "${data.partNumber}" in department "${data.department}". Verify the part number and department are registered in the P2 Control Center.`);
      }
      const res = await fetch('/api/training/p2-employee-certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partCertificationId: partCert.id,
          partNumber: data.partNumber,
          employeeId: parseInt(id!),
          employeeName: employee?.name || '',
          department: data.department,
          drawingKnowledge: data.drawingKnowledge,
          specSheetUnderstanding: data.specSheetUnderstanding,
          procedureCompletion: data.procedureCompletion,
          notes: null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create P2 certification');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-employee-certifications/employee', id] });
      setShowAddP2CertDialog(false);
      setP2PartNumber('');
      setP2Department('');
      setP2DrawingKnowledge(false);
      setP2SpecSheet(false);
      setP2ProcedureCompletion(false);
      toast({ title: 'P2 certification added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const toggleP2FlagMutation = useMutation({
    mutationFn: async ({ certId, field, value }: { certId: number; field: string; value: boolean }) => {
      const res = await fetch(`/api/training/p2-employee-certifications/${certId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to update P2 certification');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-employee-certifications/employee', id] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteP2CertMutation = useMutation({
    mutationFn: async (certId: number) => {
      const res = await fetch(`/api/training/p2-employee-certifications/${certId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete P2 certification');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/p2-employee-certifications/employee', id] });
      toast({ title: 'P2 certification removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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
    const hasExistingCode = !!(employee?.employeeCode);
    const editedCode = editData.employeeCode?.trim() ?? '';

    if (hasExistingCode && !editedCode) {
      toast({
        title: 'Employee code required',
        description:
          'This employee already has a code assigned. It cannot be removed — enter the existing code or a replacement.',
        variant: 'destructive',
      });
      return;
    }

    if (!editedCode) {
      toast({
        title: 'No employee code set',
        description:
          'A code will be auto-generated when saved. You can also enter one manually (e.g. EMP001).',
      });
    }

    if (newTimekeeperPin && !/^\d{4}$/.test(newTimekeeperPin)) {
      toast({
        title: 'Invalid PIN',
        description: 'Kiosk PIN must be exactly 4 digits.',
        variant: 'destructive',
      });
      return;
    }

    // Never send hasPin (derived boolean) back to the server; only include timekeeperPin when explicitly set
    const { hasPin: _hasPin, ...editDataSafe } = editData;
    const payload: Record<string, unknown> = {
      ...editDataSafe,
      ...(newTimekeeperPin ? { timekeeperPin: newTimekeeperPin } : {}),
    };

    updateEmployeeMutation.mutate(payload);
  };

  const handleCancel = () => {
    setEditData(employee || {});
    setNewTimekeeperPin('');
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
                          <SelectItem value="DOCUMENT_MANAGER">Document Manager</SelectItem>
                          <SelectItem value="FLOOR_OPERATOR">Floor Operator</SelectItem>
                          <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
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
                              : employee.userRole === 'DOCUMENT_MANAGER'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : employee.userRole === 'FLOOR_OPERATOR'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : employee.userRole === 'SUPERVISOR'
                                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                        }
                      >
                        {employee.userRole}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Label className="text-xs text-gray-500">
                      Reports To:
                    </Label>
                    {isEditing ? (
                      <Select
                        value={
                          editData.supervisorEmployeeId == null
                            ? 'none'
                            : String(editData.supervisorEmployeeId)
                        }
                        onValueChange={(value) =>
                          setEditData((prev) => ({
                            ...prev,
                            supervisorEmployeeId: value === 'none' ? null : Number(value),
                          }))
                        }
                      >
                        <SelectTrigger className="w-full" data-testid="select-supervisor-employee">
                          <SelectValue placeholder="Assign supervisor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No supervisor assigned</SelectItem>
                          {supervisorOptions.map((sup) => (
                            <SelectItem key={sup.id} value={String(sup.id)}>
                              {sup.name}{sup.department ? ` - ${sup.department}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span>
                        {assignedSupervisor
                          ? `${assignedSupervisor.name}${assignedSupervisor.department ? ` - ${assignedSupervisor.department}` : ''}`
                          : 'No supervisor assigned'}
                      </span>
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

              {/* System Login Password Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">System Login</Label>
                  {linkedUser && (
                    <span className="text-xs text-gray-500">
                      @{linkedUser.username}
                    </span>
                  )}
                </div>

                {linkedUser ? (
                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                    {linkedUser.lastLogin && (
                      <p>Last login: {new Date(linkedUser.lastLogin).toLocaleDateString()}</p>
                    )}
                    {linkedUser.passwordChangedAt && (
                      <p>Password set: {new Date(linkedUser.passwordChangedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">No login account linked yet.</p>
                )}

                {/* Assign existing user account when no user is linked */}
                {!linkedUser && !showPasswordForm && (
                  <div className="mt-2">
                    {showAssignUser ? (
                      <div className="space-y-2">
                        <Select
                          value={selectedAssignUserId}
                          onValueChange={setSelectedAssignUserId}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Select login account…" />
                          </SelectTrigger>
                          <SelectContent>
                            {unlinkedUsers.length === 0 ? (
                              <SelectItem value="__none__" disabled>No unlinked accounts available</SelectItem>
                            ) : (
                              unlinkedUsers.map(u => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                  @{u.username}{u.firstName || u.lastName ? ` (${[u.firstName, u.lastName].filter(Boolean).join(' ')})` : ''}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={!selectedAssignUserId || assignUserMutation.isPending}
                            onClick={() => {
                              if (selectedAssignUserId) assignUserMutation.mutate(parseInt(selectedAssignUserId));
                            }}
                          >
                            {assignUserMutation.isPending ? 'Linking…' : 'Link Account'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setShowAssignUser(false); setSelectedAssignUserId(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowAssignUser(true)}
                      >
                        <Link2 className="w-3 h-3 mr-1" />
                        Assign Login Account
                      </Button>
                    )}
                  </div>
                )}

                {showPasswordForm ? (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => { e.preventDefault(); handleSetPassword(); }}
                  >
                    {!linkedUser && (
                      <Input
                        placeholder="Username"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="text-sm"
                      />
                    )}
                    <Input
                      type="password"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="text-sm"
                      autoComplete="new-password"
                    />
                    <Input
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="text-sm"
                      autoComplete="new-password"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        className="flex-1"
                        disabled={setPasswordMutation.isPending}
                      >
                        {setPasswordMutation.isPending ? 'Saving...' : 'Set Password'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowPasswordForm(false);
                          setNewPassword('');
                          setConfirmPassword('');
                          setNewUsername('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    <KeyRound className="w-3 h-3 mr-1" />
                    {linkedUser ? 'Reset Password' : 'Set Password'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="grid w-full grid-cols-12">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="charge-codes">Codes</TabsTrigger>
              <TabsTrigger value="certifications">Certs</TabsTrigger>
              <TabsTrigger value="evaluations">Reviews</TabsTrigger>
              <TabsTrigger value="training">Training</TabsTrigger>
              <TabsTrigger value="traveler">Traveler</TabsTrigger>
              <TabsTrigger value="documents">Docs</TabsTrigger>
              <TabsTrigger value="badge">Badge</TabsTrigger>
              <TabsTrigger value="journal">Journal</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="qualifications">Quals</TabsTrigger>
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
                        <div className="space-y-1">
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
                              className={`flex-1 ${!editData.employeeCode ? 'border-amber-400 focus-visible:ring-amber-400' : ''}`}
                            />
                            {!employee?.employeeCode && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
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
                            )}
                          </div>
                          {!editData.employeeCode && employee?.employeeCode && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Code cannot be removed once assigned. Enter the existing code or a replacement.
                            </p>
                          )}
                          {!editData.employeeCode && !employee?.employeeCode && (
                            <p className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              A code will be auto-generated on save. Required for time-clock charge code matching.
                            </p>
                          )}
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
                      <Label>Pay Type</Label>
                      {isEditing ? (
                        <Select
                          value={editData.payType ?? employee?.payType ?? ''}
                          onValueChange={(value) =>
                            setEditData((prev) => ({
                              ...prev,
                              payType: value || null,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select pay type…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HOURLY">Hourly</SelectItem>
                            <SelectItem value="SALARY">Salary</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-gray-600">
                          {employee.payType === 'SALARY'
                            ? 'Salary'
                            : employee.payType === 'HOURLY'
                            ? 'Hourly'
                            : 'Not specified'}
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

                  {/* Kiosk PIN */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound className="w-4 h-4 text-gray-500" />
                      <Label className="text-sm font-medium">Kiosk PIN</Label>
                      {employee.hasPin && (
                        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-2 py-0.5">PIN set</span>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="max-w-xs space-y-1">
                        <Label htmlFor="timekeeperPin" className="text-xs text-gray-500">
                          New 4-digit PIN {employee.hasPin ? '(leave blank to keep current)' : '(leave blank to skip)'}
                        </Label>
                        <div className="relative">
                          <Input
                            id="timekeeperPin"
                            type={showPin ? 'text' : 'password'}
                            inputMode="numeric"
                            maxLength={4}
                            value={newTimekeeperPin}
                            onChange={(e) => setNewTimekeeperPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="e.g. 1234"
                            className="text-sm pr-8"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-2"
                            onClick={() => setShowPin(s => !s)}
                          >
                            {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600">
                        {employee.hasPin ? 'PIN is set (hidden)' : 'No PIN assigned'}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions">
              <Card>
                <CardHeader>
                  <CardTitle>Permissions</CardTitle>
                  <CardDescription>
                    Capabilities inherited from {employee.name}'s role and individual overrides applied on top.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Guard: no linked user account */}
                  {!linkedUser && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">No system login linked</p>
                        <p className="text-xs text-amber-700 mt-1">
                          A system login must be created for {employee.name} before individual capability overrides can be assigned.
                          Use the "Set Password" section on the left to create one.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Missing traveler access callout */}
                  {(() => {
                    const hasTravelerCaps = roleCapabilities.some(k => k.startsWith('P2_CERT_') || k.includes('TRAVELER')) ||
                      userOverrides.some(ov => ov.effect === 'allow' && (ov.capabilityKey.startsWith('P2_CERT_') || ov.capabilityKey.includes('TRAVELER')));
                    const missingAuths = travelerAuths.length === 0;
                    const missingP2Certs = empP2Certs.length === 0;
                    if (!hasTravelerCaps) return null;
                    if (!missingAuths && !missingP2Certs) return null;
                    return (
                      <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
                        <Info className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-orange-800">Traveler gate may still block this employee</p>
                          <p className="text-xs text-orange-700 mt-1 mb-2">
                            {employee.name} has traveler-related capabilities but is missing required records. The traveler gate checks these independently — capabilities alone are not enough.
                          </p>
                          <div className="flex flex-col gap-1">
                            {missingAuths && (
                              <div className="flex items-center gap-2 text-xs text-orange-800">
                                <XCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                No traveler authorizations — add them in the <span className="font-semibold">Traveler</span> tab
                              </div>
                            )}
                            {missingP2Certs && (
                              <div className="flex items-center gap-2 text-xs text-orange-800">
                                <XCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                No P2 competency records — add them in the <span className="font-semibold">Traveler</span> tab
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* From Role section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-medium text-gray-700">From Role</h3>
                      <Badge variant="secondary" className="text-xs">{employee.userRole || 'EMPLOYEE'}</Badge>
                      <span className="text-xs text-gray-400">— read-only, inherited automatically</span>
                    </div>
                    {roleCapabilities.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">No capabilities assigned to this role yet</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5">
                        {roleCapabilities.map((capKey) => {
                          const cap = cbacCapabilities.find(c => c.key === capKey);
                          return (
                            <div key={capKey} className="flex items-center gap-2 rounded-md border border-green-100 bg-green-50 px-3 py-2">
                              <Shield className="w-3.5 h-3.5 text-green-600 shrink-0" />
                              <span className="text-xs font-mono font-medium text-green-800">{capKey}</span>
                              {cap && <span className="text-xs text-green-700 truncate">— {cap.description}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Individual Overrides section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-medium text-gray-700">Individual Overrides</h3>
                      <span className="text-xs text-gray-400">— applied on top of role, affect enforcement immediately</span>
                    </div>
                    {userOverrides.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg">
                        <Shield className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No individual overrides</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {userOverrides.map((ov) => {
                          const cap = cbacCapabilities.find(c => c.key === ov.capabilityKey);
                          const isDeny = ov.effect === 'deny';
                          return (
                            <div
                              key={ov.id}
                              className={`flex items-center justify-between rounded-md border px-3 py-2 ${isDeny ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isDeny ? (
                                  <Ban className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                ) : (
                                  <Shield className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                )}
                                <Badge
                                  variant={isDeny ? 'destructive' : 'default'}
                                  className={`text-xs shrink-0 ${isDeny ? '' : 'bg-green-600 hover:bg-green-700'}`}
                                >
                                  {ov.effect}
                                </Badge>
                                <span className={`text-xs font-mono font-medium truncate ${isDeny ? 'text-red-900' : 'text-green-900'}`}>{ov.capabilityKey}</span>
                                {cap && <span className={`text-xs truncate hidden sm:inline ${isDeny ? 'text-red-700' : 'text-green-700'}`}>— {cap.description}</span>}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeCbacMutation.mutate(ov.id)}
                                disabled={revokeCbacMutation.isPending}
                                className="text-gray-500 hover:text-red-700 shrink-0 ml-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add capability override section */}
                  {linkedUser && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Add Capability Override</h3>
                      <div className="space-y-2">
                        {cbacCapabilities
                          .filter(cap => !userOverrides.some(ov => ov.capabilityKey === cap.key))
                          .map(cap => (
                            <div key={cap.id} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 hover:bg-gray-50">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-medium text-gray-900">{cap.key}</span>
                                  <Badge variant="outline" className="text-xs shrink-0">{cap.category}</Badge>
                                  {roleCapabilities.includes(cap.key) && (
                                    <Badge variant="secondary" className="text-xs shrink-0">from role</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 truncate">{cap.description}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => grantCbacMutation.mutate(cap.key)}
                                  disabled={grantCbacMutation.isPending || denyCbacMutation.isPending}
                                  className="text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300"
                                  data-testid={`button-grant-cbac-${cap.id}`}
                                >
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  Grant
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => denyCbacMutation.mutate(cap.key)}
                                  disabled={grantCbacMutation.isPending || denyCbacMutation.isPending}
                                  className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
                                  data-testid={`button-deny-cbac-${cap.id}`}
                                >
                                  <Ban className="w-3.5 h-3.5 mr-1" />
                                  Deny
                                </Button>
                              </div>
                            </div>
                          ))}
                        {cbacCapabilities.filter(cap => !userOverrides.some(ov => ov.capabilityKey === cap.key)).length === 0 && (
                          <div className="text-center py-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-500">All capabilities have overrides</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="charge-codes">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Tags className="w-5 h-5" />
                      Charge Codes
                    </CardTitle>
                    <CardDescription>
                      Checked codes are added to the all-employee codes this employee can already use.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => updateChargeCodesMutation.mutate()}
                    disabled={updateChargeCodesMutation.isPending}
                  >
                    {updateChargeCodesMutation.isPending && <Clock className="w-4 h-4 mr-2 animate-spin" />}
                    Save Codes
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Employees can always use codes set to all employees. Check codes here when a code is restricted to selected employees and this employee should be included.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {activeChargeCodes.map((code) => (
                      <label
                        key={code.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedChargeCodeIds.includes(code.id)}
                          onCheckedChange={() => toggleChargeCode(code.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-mono font-medium">{code.code}</span>
                            <Badge variant="outline">{code.type}</Badge>
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {code.description || code.department || 'No description'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {activeChargeCodes.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No active charge codes found.
                    </div>
                  )}
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
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle>Training Summary</CardTitle>
                      <CardDescription>
                        Per-employee compliance posture — all training and certification records
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
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
                            {Math.round((completedTrainings / totalTrainings) * 100)}% Current
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {completedTrainings}/{totalTrainings} current
                          </span>
                        </div>
                      )}
                      <Link href={`/skill-matrix?employee=${encodeURIComponent(employee?.name ?? '')}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Full Skill Matrix
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingTraining ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Loading training records…</p>
                    </div>
                  ) : employeeTrainingMatrix.length === 0 ? (
                    <div className="text-center py-8">
                      <GraduationCap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No training records found</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Training data can be imported from the Training Matrix Import page
                      </p>
                      <Link href={`/skill-matrix?employee=${encodeURIComponent(employee?.name ?? '')}`} className="mt-4 inline-block">
                        <Button variant="outline" size="sm" className="gap-1.5 mt-3">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Go to Skill Matrix
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {employeeTrainingMatrix.map((training) => {
                        const formatDate = (dateStr: string | null) => {
                          if (!dateStr) return null;
                          try {
                            return new Date(dateStr).toLocaleDateString('en-US', {
                              month: 'numeric',
                              day: 'numeric',
                              year: 'numeric',
                            });
                          } catch {
                            return dateStr;
                          }
                        };

                        const statusConfig: Record<string, { bg: string; border: string; icon: JSX.Element; badgeClass: string; label: string }> = {
                          COMPLETED: {
                            bg: 'bg-green-50',
                            border: 'border-green-200',
                            icon: <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />,
                            badgeClass: 'bg-green-100 text-green-800 border-green-300',
                            label: 'Completed',
                          },
                          EXPIRING_SOON: {
                            bg: 'bg-orange-50',
                            border: 'border-orange-200',
                            icon: <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />,
                            badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
                            label: 'Expiring Soon',
                          },
                          OVERDUE: {
                            bg: 'bg-red-50',
                            border: 'border-red-200',
                            icon: <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />,
                            badgeClass: 'bg-red-100 text-red-800 border-red-300',
                            label: 'Overdue',
                          },
                          PENDING: {
                            bg: 'bg-yellow-50',
                            border: 'border-yellow-200',
                            icon: <Circle className="h-5 w-5 text-yellow-500 shrink-0" />,
                            badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                            label: 'Pending',
                          },
                        };

                        const cfg = statusConfig[training.status] ?? {
                          bg: 'bg-gray-50',
                          border: 'border-gray-200',
                          icon: <Circle className="h-5 w-5 text-gray-400 shrink-0" />,
                          badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',
                          label: training.status,
                        };

                        return (
                          <div
                            key={training.id}
                            className={`border rounded-lg p-4 ${cfg.bg} ${cfg.border}`}
                            data-testid={`training-${training.trainingName.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {cfg.icon}
                                  <h4 className="font-medium text-gray-900 truncate">
                                    {training.trainingName}
                                  </h4>
                                </div>
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                  {training.lastCompleted && (
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                                      <span>Completed: {formatDate(training.lastCompleted)}</span>
                                    </div>
                                  )}
                                  {training.nextDue && (
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="h-3.5 w-3.5 shrink-0" />
                                      <span>Due: {formatDate(training.nextDue)}</span>
                                    </div>
                                  )}
                                  {training.frequency && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-muted-foreground">Frequency: {training.frequency}</span>
                                    </div>
                                  )}
                                  {!training.lastCompleted && training.status === 'PENDING' && (
                                    <p className="text-yellow-700">Not yet completed</p>
                                  )}
                                  {training.notes && (
                                    <p className="text-xs text-blue-600">Note: {training.notes}</p>
                                  )}
                                </div>
                              </div>
                              <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}>
                                {cfg.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Traveler Access Tab */}
            <TabsContent value="traveler">
              <div className="space-y-6">
                {/* Traveler Authorizations */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5" />
                        Traveler Authorizations
                      </CardTitle>
                      <CardDescription>
                        Part numbers this employee is authorized to work on
                      </CardDescription>
                    </div>
                    <Dialog open={showAddAuthDialog} onOpenChange={setShowAddAuthDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="flex items-center gap-1">
                          <Plus className="w-4 h-4" />
                          Add Authorization
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Traveler Authorization</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div>
                            <Label>Part Number *</Label>
                            <Select value={newAuthPartNumber} onValueChange={setNewAuthPartNumber}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select part number" />
                              </SelectTrigger>
                              <SelectContent>
                                {partNumbers.map((p) => (
                                  <SelectItem key={p.partNumber} value={p.partNumber}>
                                    {p.partNumber}{p.partName ? ` — ${p.partName}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {partNumbers.length === 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                You can also type a part number directly below
                              </p>
                            )}
                            {partNumbers.length === 0 && (
                              <Input
                                className="mt-2"
                                placeholder="Or enter part number manually"
                                value={newAuthPartNumber}
                                onChange={(e) => setNewAuthPartNumber(e.target.value)}
                              />
                            )}
                          </div>
                          <div>
                            <Label>Department (optional)</Label>
                            <Input
                              value={newAuthDepartment}
                              onChange={(e) => setNewAuthDepartment(e.target.value)}
                              placeholder="e.g. Assembly"
                            />
                          </div>
                          <div>
                            <Label>Production Line (optional)</Label>
                            <Select value={newAuthProductionLine} onValueChange={setNewAuthProductionLine}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select line" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="P1">P1</SelectItem>
                                <SelectItem value="P2">P2</SelectItem>
                                <SelectItem value="P3">P3</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Expires At (optional)</Label>
                            <Input
                              type="date"
                              value={newAuthExpiresAt}
                              onChange={(e) => setNewAuthExpiresAt(e.target.value)}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowAddAuthDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={() => createAuthMutation.mutate({
                                partNumber: newAuthPartNumber,
                                department: newAuthDepartment || undefined,
                                productionLine: newAuthProductionLine || undefined,
                                expiresAt: newAuthExpiresAt || undefined,
                              })}
                              disabled={!newAuthPartNumber || createAuthMutation.isPending}
                            >
                              {createAuthMutation.isPending ? 'Saving…' : 'Add Authorization'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent>
                    {isLoadingAuths ? (
                      <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto" />
                      </div>
                    ) : travelerAuths.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg">
                        <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No traveler authorizations on record</p>
                        <p className="text-xs text-gray-400 mt-1">The traveler gate will block this employee if authorizations are configured for a part</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {travelerAuths.map((auth) => {
                          const isExpired = auth.expiresAt ? new Date(auth.expiresAt) < new Date() : false;
                          return (
                            <div
                              key={auth.id}
                              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                                isExpired ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
                              }`}
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                {isExpired ? (
                                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{auth.partNumber}</p>
                                  <div className="flex flex-wrap gap-2 mt-0.5">
                                    {auth.department && (
                                      <span className="text-xs text-muted-foreground">{auth.department}</span>
                                    )}
                                    {auth.productionLine && (
                                      <Badge variant="outline" className="text-xs">{auth.productionLine}</Badge>
                                    )}
                                    {auth.planTitle && (
                                      <span className="text-xs text-muted-foreground">via {auth.planTitle}</span>
                                    )}
                                  </div>
                                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                    {auth.authorizedAt && (
                                      <span>Authorized: {new Date(auth.authorizedAt).toLocaleDateString()}</span>
                                    )}
                                    {auth.expiresAt && (
                                      <span className={isExpired ? 'text-red-600 font-medium' : ''}>
                                        {isExpired ? 'Expired: ' : 'Expires: '}
                                        {new Date(auth.expiresAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deactivateAuthMutation.mutate(auth.id)}
                                  disabled={deactivateAuthMutation.isPending || deleteAuthMutation.isPending}
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  title="Deactivate this authorization"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm('Remove this authorization permanently?')) {
                                      deleteAuthMutation.mutate(auth.id);
                                    }
                                  }}
                                  disabled={deactivateAuthMutation.isPending || deleteAuthMutation.isPending}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete this authorization"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* P2 Competency Certifications */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Award className="w-5 h-5" />
                        P2 Competency Certifications
                      </CardTitle>
                      <CardDescription>
                        Part-level competency flags required by the P2 traveler gate
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href="/p2-control-center">
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Bulk Manager
                        </Button>
                      </Link>
                      <Dialog open={showAddP2CertDialog} onOpenChange={setShowAddP2CertDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                            Add P2 Cert
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add P2 Competency Certification</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div>
                              <Label>Part Number *</Label>
                              <Select value={p2PartNumber} onValueChange={setP2PartNumber}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select part number" />
                                </SelectTrigger>
                                <SelectContent>
                                  {partNumbers.map((p) => (
                                    <SelectItem key={p.partNumber} value={p.partNumber}>
                                      {p.partNumber}{p.partName ? ` — ${p.partName}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Department *</Label>
                              <Input
                                value={p2Department}
                                onChange={(e) => setP2Department(e.target.value)}
                                placeholder="e.g. Assembly"
                              />
                            </div>
                            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                              <p className="text-sm font-medium">Competency Flags</p>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="p2-drawing"
                                  checked={p2DrawingKnowledge}
                                  onCheckedChange={(v) => setP2DrawingKnowledge(v as boolean)}
                                />
                                <label htmlFor="p2-drawing" className="text-sm cursor-pointer">Drawing knowledge and department standards</label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="p2-spec"
                                  checked={p2SpecSheet}
                                  onCheckedChange={(v) => setP2SpecSheet(v as boolean)}
                                />
                                <label htmlFor="p2-spec" className="text-sm cursor-pointer">Spec sheet understanding</label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="p2-proc"
                                  checked={p2ProcedureCompletion}
                                  onCheckedChange={(v) => setP2ProcedureCompletion(v as boolean)}
                                />
                                <label htmlFor="p2-proc" className="text-sm cursor-pointer">Procedure completion after training</label>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                              <Button variant="outline" onClick={() => setShowAddP2CertDialog(false)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={() => createP2CertMutation.mutate({
                                  partNumber: p2PartNumber,
                                  department: p2Department,
                                  drawingKnowledge: p2DrawingKnowledge,
                                  specSheetUnderstanding: p2SpecSheet,
                                  procedureCompletion: p2ProcedureCompletion,
                                })}
                                disabled={!p2PartNumber || !p2Department || createP2CertMutation.isPending}
                              >
                                {createP2CertMutation.isPending ? 'Saving…' : 'Add Certification'}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoadingP2Certs ? (
                      <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto" />
                      </div>
                    ) : empP2Certs.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg">
                        <Award className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No P2 competency certifications on record</p>
                        <p className="text-xs text-gray-400 mt-1">The P2 gate requires all three competency flags to be set for the relevant part and department</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {empP2Certs.map((cert) => {
                          const isFullyCertified = cert.drawingKnowledge && cert.specSheetUnderstanding && cert.procedureCompletion;
                          return (
                            <div
                              key={cert.id}
                              className={`rounded-lg border p-4 ${isFullyCertified ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {isFullyCertified ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                  )}
                                  <div>
                                    <p className="text-sm font-semibold">{cert.partNumber}</p>
                                    <p className="text-xs text-muted-foreground">{cert.department}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isFullyCertified && (
                                    <Badge className="text-xs bg-green-100 text-green-800 border-green-300">Fully Certified</Badge>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm('Remove this P2 certification record?')) {
                                        deleteP2CertMutation.mutate(cert.id);
                                      }
                                    }}
                                    disabled={deleteP2CertMutation.isPending}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                <label className={`flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-xs ${cert.drawingKnowledge ? 'border-green-300 bg-green-100' : 'border-gray-200 bg-white'}`}>
                                  <Checkbox
                                    checked={cert.drawingKnowledge}
                                    onCheckedChange={(v) => toggleP2FlagMutation.mutate({ certId: cert.id, field: 'drawingKnowledge', value: v as boolean })}
                                    disabled={toggleP2FlagMutation.isPending}
                                  />
                                  <span>Drawing</span>
                                </label>
                                <label className={`flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-xs ${cert.specSheetUnderstanding ? 'border-green-300 bg-green-100' : 'border-gray-200 bg-white'}`}>
                                  <Checkbox
                                    checked={cert.specSheetUnderstanding}
                                    onCheckedChange={(v) => toggleP2FlagMutation.mutate({ certId: cert.id, field: 'specSheetUnderstanding', value: v as boolean })}
                                    disabled={toggleP2FlagMutation.isPending}
                                  />
                                  <span>Spec Sheet</span>
                                </label>
                                <label className={`flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-xs ${cert.procedureCompletion ? 'border-green-300 bg-green-100' : 'border-gray-200 bg-white'}`}>
                                  <Checkbox
                                    checked={cert.procedureCompletion}
                                    onCheckedChange={(v) => toggleP2FlagMutation.mutate({ certId: cert.id, field: 'procedureCompletion', value: v as boolean })}
                                    disabled={toggleP2FlagMutation.isPending}
                                  />
                                  <span>Procedure</span>
                                </label>
                              </div>
                              {cert.certifiedDate && (
                                <p className="text-xs text-green-700 mt-2">
                                  Certified on {new Date(cert.certifiedDate).toLocaleDateString()}
                                  {cert.certifiedBy ? ` by ${cert.certifiedBy}` : ''}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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
            <TabsContent value="qualifications">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Wrench className="w-5 h-5" />
                        Machine &amp; Process Qualifications
                      </CardTitle>
                      <CardDescription>
                        Machine-class and operation-type qualifications that gate CNC and special-process traveler steps
                      </CardDescription>
                    </div>
                    <Dialog open={showAddQualDialog} onOpenChange={setShowAddQualDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="w-4 h-4 mr-1" />
                          Add Qualification
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Qualification</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div>
                            <Label>Machine Class</Label>
                            <Input
                              placeholder="e.g. 3-Axis Mill, Lathe, EDM"
                              value={newQual.machineClass}
                              onChange={e => setNewQual(q => ({ ...q, machineClass: e.target.value }))}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Leave blank if this is an operation-type-only qualification.</p>
                          </div>
                          <div>
                            <Label>Operation Type</Label>
                            <Select
                              value={newQual.operationType}
                              onValueChange={v => setNewQual(q => ({ ...q, operationType: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="None (machine class only)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="SETUP">SETUP</SelectItem>
                                <SelectItem value="RUN">RUN</SelectItem>
                                <SelectItem value="INSPECT">INSPECT</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Department (optional)</Label>
                            <Input
                              placeholder="e.g. CNC, Weld, Paint"
                              value={newQual.department}
                              onChange={e => setNewQual(q => ({ ...q, department: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>Expiration Date (optional)</Label>
                            <Input
                              type="date"
                              value={newQual.expiresAt}
                              onChange={e => setNewQual(q => ({ ...q, expiresAt: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>Notes (optional)</Label>
                            <Input
                              placeholder="Any notes about this qualification"
                              value={newQual.notes}
                              onChange={e => setNewQual(q => ({ ...q, notes: e.target.value }))}
                            />
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <Button variant="outline" onClick={() => setShowAddQualDialog(false)}>Cancel</Button>
                            <Button
                              onClick={() => createQualMutation.mutate(newQual)}
                              disabled={createQualMutation.isPending || (!newQual.machineClass && (!newQual.operationType || newQual.operationType === 'none'))}
                            >
                              {createQualMutation.isPending ? 'Saving...' : 'Add Qualification'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingQuals ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                      <p className="text-gray-500">Loading qualifications...</p>
                    </div>
                  ) : machineQualifications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No qualifications on record.</p>
                      <p className="text-sm mt-1">Add machine-class or operation-type qualifications to gate traveler steps.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {machineQualifications.map((q: any) => (
                        <div key={q.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {q.machineClass && (
                                <Badge variant="secondary" className="font-mono text-xs">
                                  {q.machineClass}
                                </Badge>
                              )}
                              {q.operationType && (
                                <Badge variant="outline" className="font-mono text-xs">
                                  {q.operationType}
                                </Badge>
                              )}
                              {q.department && (
                                <Badge variant="outline" className="text-xs">
                                  <Building2 className="w-3 h-3 mr-1" />
                                  {q.department}
                                </Badge>
                              )}
                              {q.expiresAt && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Expires {new Date(q.expiresAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {q.notes && <p className="text-xs text-muted-foreground">{q.notes}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deactivateQualMutation.mutate(q.id)}
                            disabled={deactivateQualMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
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
