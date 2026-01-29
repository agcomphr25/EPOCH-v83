import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  FileText,
  Camera,
  User,
  ClipboardList,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Lock,
} from 'lucide-react';

interface OnboardingSession {
  id: string;
  employeeId: number | null;
  pathId: string;
  adminId: number;
  status: 'in_progress' | 'paused' | 'completed';
  pathName: string;
  pathType: string;
  employeeName: string | null;
  intakeData: Record<string, any> | null;
  intakeDataSchema: any[] | null;
  currentStep: string | null;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  documents: SessionDocument[];
  captures: SessionCapture[];
}

interface SessionDocument {
  id: string;
  templateId: string;
  instanceId: string | null;
  orderIndex: number;
  status: string;
  signedAt: string | null;
}

interface SessionCapture {
  id: string;
  captureType: string;
  mediaItemId: string | null;
  capturedAt: string | null;
}

interface FormField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  mappedToField?: string;
}

const WIZARD_STEPS = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'intake', label: 'Intake Form', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'captures', label: 'Camera Captures', icon: Camera },
  { id: 'account', label: 'User Account', icon: User },
  { id: 'review', label: 'Review', icon: Eye },
];

export default function OnboardingSessionWizard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [intakeFormData, setIntakeFormData] = useState<Record<string, any>>({});
  const [accountData, setAccountData] = useState({
    username: '',
    role: 'EMPLOYEE',
    permissions: [] as string[],
    linkToEmployeeId: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  const { data: session, isLoading, error } = useQuery<OnboardingSession>({
    queryKey: ['/api/onboarding/sessions', id],
    enabled: !!id,
  });

  const isReadOnly = session?.status === 'completed';
  const currentStep = WIZARD_STEPS[currentStepIndex];

  useEffect(() => {
    if (session?.intakeData && Object.keys(intakeFormData).length === 0) {
      setIntakeFormData(session.intakeData);
    }
  }, [session?.intakeData]);

  useEffect(() => {
    if (session?.currentStep) {
      const stepIndex = WIZARD_STEPS.findIndex(s => s.id === session.currentStep);
      if (stepIndex >= 0) {
        setCurrentStepIndex(stepIndex);
      }
    }
  }, [session?.currentStep]);

  const saveIntakeDataMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest(`/api/onboarding/sessions/${id}/intake`, {
        method: 'PATCH',
        body: JSON.stringify({ intakeData: data }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', id] });
      toast({ title: 'Progress saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save', variant: 'destructive' });
    },
  });

  const updateCurrentStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      return apiRequest(`/api/onboarding/sessions/${id}/step`, {
        method: 'PATCH',
        body: JSON.stringify({ currentStep: stepId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', id] });
    },
  });

  const handleNext = () => {
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      const nextStep = WIZARD_STEPS[currentStepIndex + 1];
      setCurrentStepIndex(currentStepIndex + 1);
      updateCurrentStepMutation.mutate(nextStep.id);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      const prevStep = WIZARD_STEPS[currentStepIndex - 1];
      setCurrentStepIndex(currentStepIndex - 1);
      updateCurrentStepMutation.mutate(prevStep.id);
    }
  };

  const handleStepClick = (index: number) => {
    if (!isReadOnly) {
      setCurrentStepIndex(index);
      updateCurrentStepMutation.mutate(WIZARD_STEPS[index].id);
    }
  };

  const handleSaveIntake = async () => {
    setIsSaving(true);
    try {
      await saveIntakeDataMutation.mutateAsync(intakeFormData);
    } finally {
      setIsSaving(false);
    }
  };

  const getStepStatus = (stepId: string): 'complete' | 'current' | 'pending' => {
    if (!session) return 'pending';
    
    switch (stepId) {
      case 'overview':
        return 'complete';
      case 'intake':
        const hasIntakeData = session.intakeData && Object.keys(session.intakeData).length > 0;
        if (currentStep.id === 'intake') return 'current';
        return hasIntakeData ? 'complete' : 'pending';
      case 'documents':
        const allDocsSigned = session.documents.length === 0 || 
          session.documents.every(d => d.status === 'signed');
        if (currentStep.id === 'documents') return 'current';
        return allDocsSigned && session.documents.length > 0 ? 'complete' : 'pending';
      case 'captures':
        const allCaptured = session.captures.length === 0 ||
          session.captures.every(c => c.mediaItemId !== null);
        if (currentStep.id === 'captures') return 'current';
        return allCaptured && session.captures.length > 0 ? 'complete' : 'pending';
      case 'account':
        if (currentStep.id === 'account') return 'current';
        return accountData.username ? 'complete' : 'pending';
      case 'review':
        if (currentStep.id === 'review') return 'current';
        return session.status === 'completed' ? 'complete' : 'pending';
      default:
        return 'pending';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900">Session Not Found</h2>
            <p className="text-gray-500 mt-2">The onboarding session could not be loaded.</p>
            <Button onClick={() => navigate('/onboarding')} className="mt-4">
              Back to Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'overview':
        return <OverviewStep session={session} isReadOnly={isReadOnly} />;
      case 'intake':
        return (
          <IntakeFormStep
            session={session}
            formData={intakeFormData}
            setFormData={setIntakeFormData}
            onSave={handleSaveIntake}
            isSaving={isSaving}
            isReadOnly={isReadOnly}
          />
        );
      case 'documents':
        return <DocumentsStep session={session} isReadOnly={isReadOnly} />;
      case 'captures':
        return <CapturesStep session={session} isReadOnly={isReadOnly} />;
      case 'account':
        return (
          <AccountSetupStep
            accountData={accountData}
            setAccountData={setAccountData}
            isReadOnly={isReadOnly}
          />
        );
      case 'review':
        return (
          <ReviewStep
            session={session}
            intakeFormData={intakeFormData}
            accountData={accountData}
            isReadOnly={isReadOnly}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Onboarding Session</h1>
            <p className="text-gray-500">{session.pathName}</p>
          </div>
          <div className="flex items-center gap-2">
            {isReadOnly && (
              <Badge className="bg-blue-100 text-blue-800">
                <Lock className="h-3 w-3 mr-1" />
                Read Only
              </Badge>
            )}
            <Badge className={
              session.status === 'in_progress' ? 'bg-green-100 text-green-800' :
              session.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
              'bg-blue-100 text-blue-800'
            }>
              {session.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Steps</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <nav className="space-y-1">
                {WIZARD_STEPS.map((step, index) => {
                  const status = getStepStatus(step.id);
                  const Icon = step.icon;
                  const isActive = index === currentStepIndex;
                  
                  return (
                    <button
                      key={step.id}
                      onClick={() => handleStepClick(index)}
                      disabled={isReadOnly && index !== currentStepIndex}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`flex-shrink-0 ${
                        status === 'complete' ? 'text-green-500' :
                        status === 'current' ? 'text-blue-500' :
                        'text-gray-400'
                      }`}>
                        {status === 'complete' ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </div>
                      <Icon className="h-4 w-4" />
                      <span>{step.label}</span>
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {(() => {
                  const Icon = currentStep.icon;
                  return <Icon className="h-5 w-5" />;
                })()}
                {currentStep.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderStepContent()}
            </CardContent>
          </Card>

          <div className="flex justify-between mt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={currentStepIndex === WIZARD_STEPS.length - 1}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewStep({ session, isReadOnly }: { session: OnboardingSession; isReadOnly: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-gray-500 text-sm">Path</Label>
          <p className="font-medium">{session.pathName}</p>
        </div>
        <div>
          <Label className="text-gray-500 text-sm">Type</Label>
          <p className="font-medium">{session.pathType}</p>
        </div>
        <div>
          <Label className="text-gray-500 text-sm">Started</Label>
          <p className="font-medium">
            {new Date(session.startedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div>
          <Label className="text-gray-500 text-sm">Status</Label>
          <p className="font-medium capitalize">{session.status.replace('_', ' ')}</p>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-medium mb-3">Session Progress</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Intake Form Fields</span>
            <Badge variant="outline">
              {session.intakeDataSchema?.length || 0} fields
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Documents</span>
            <Badge variant="outline">
              {session.documents.filter(d => d.status === 'signed').length} / {session.documents.length} signed
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Camera Captures</span>
            <Badge variant="outline">
              {session.captures.filter(c => c.mediaItemId).length} / {session.captures.length} captured
            </Badge>
          </div>
        </div>
      </div>

      {isReadOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Session Completed</p>
              <p className="text-sm text-blue-700">
                This session has been finalized and is now read-only.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntakeFormStep({
  session,
  formData,
  setFormData,
  onSave,
  isSaving,
  isReadOnly,
}: {
  session: OnboardingSession;
  formData: Record<string, any>;
  setFormData: (data: Record<string, any>) => void;
  onSave: () => void;
  isSaving: boolean;
  isReadOnly: boolean;
}) {
  const fields: FormField[] = session.intakeDataSchema || [];

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No intake form configured for this onboarding path.</p>
      </div>
    );
  }

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData({ ...formData, [fieldName]: value });
  };

  const renderField = (field: FormField) => {
    const value = formData[field.name] ?? '';

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isReadOnly}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isReadOnly}
          />
        );
      case 'dropdown':
      case 'select':
        return (
          <Select
            value={value}
            onValueChange={(v) => handleFieldChange(field.name, v)}
            disabled={isReadOnly}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
              disabled={isReadOnly}
            />
            <span className="text-sm text-gray-600">{field.label}</span>
          </div>
        );
      default:
        return (
          <Input
            value={value}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isReadOnly}
          />
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.name} className="space-y-2">
            <Label className="flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-500">*</span>}
            </Label>
            {renderField(field)}
          </div>
        ))}
      </div>

      {!isReadOnly && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Progress
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentsStep({ session, isReadOnly }: { session: OnboardingSession; isReadOnly: boolean }) {
  const { toast } = useToast();

  if (session.documents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No documents configured for this onboarding session.</p>
      </div>
    );
  }

  const handleLaunchSign = (doc: SessionDocument) => {
    toast({
      title: 'Document Signing',
      description: 'Fill-and-Sign workflow will be integrated in a future phase.',
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Complete all required documents by signing them.
      </p>

      <div className="space-y-3">
        {session.documents.map((doc, index) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                doc.status === 'signed' ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {doc.status === 'signed' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <FileText className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-medium">Document {index + 1}</p>
                <p className="text-sm text-gray-500">
                  {doc.status === 'signed' 
                    ? `Signed on ${new Date(doc.signedAt!).toLocaleDateString()}`
                    : 'Pending signature'
                  }
                </p>
              </div>
            </div>
            
            {doc.status !== 'signed' && !isReadOnly ? (
              <Button size="sm" onClick={() => handleLaunchSign(doc)}>
                Sign Document
              </Button>
            ) : (
              <Badge className={doc.status === 'signed' ? 'bg-green-100 text-green-800' : ''}>
                {doc.status === 'signed' ? 'Signed' : 'Pending'}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CapturesStep({ session, isReadOnly }: { session: OnboardingSession; isReadOnly: boolean }) {
  const { toast } = useToast();

  if (session.captures.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Camera className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No camera captures required for this session.</p>
      </div>
    );
  }

  const getCaptureLabel = (type: string) => {
    switch (type) {
      case 'photo_id':
        return 'Photo ID';
      case 'employee_photo':
        return 'Employee Photo';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const handleCapture = (capture: SessionCapture) => {
    toast({
      title: 'Camera Capture',
      description: 'Camera capture component will be integrated in a future phase.',
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Capture required photos and documents using the camera.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {session.captures.map((capture) => (
          <div
            key={capture.id}
            className="flex flex-col items-center p-6 border rounded-lg text-center"
          >
            <div className={`p-4 rounded-full mb-4 ${
              capture.mediaItemId ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {capture.mediaItemId ? (
                <Check className="h-8 w-8 text-green-600" />
              ) : (
                <Camera className="h-8 w-8 text-gray-400" />
              )}
            </div>
            
            <h4 className="font-medium capitalize mb-1">
              {getCaptureLabel(capture.captureType)}
            </h4>
            
            <p className="text-sm text-gray-500 mb-4">
              {capture.mediaItemId ? 'Captured' : 'Not captured yet'}
            </p>

            {!isReadOnly && (
              <Button
                size="sm"
                variant={capture.mediaItemId ? 'outline' : 'default'}
                onClick={() => handleCapture(capture)}
              >
                {capture.mediaItemId ? 'Retake' : 'Capture'}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountSetupStep({
  accountData,
  setAccountData,
  isReadOnly,
}: {
  accountData: {
    username: string;
    role: string;
    permissions: string[];
    linkToEmployeeId: boolean;
  };
  setAccountData: (data: typeof accountData) => void;
  isReadOnly: boolean;
}) {
  const availablePermissions = [
    { id: 'view_orders', label: 'View Orders' },
    { id: 'edit_orders', label: 'Edit Orders' },
    { id: 'view_inventory', label: 'View Inventory' },
    { id: 'manage_inventory', label: 'Manage Inventory' },
    { id: 'view_reports', label: 'View Reports' },
    { id: 'employee_portal', label: 'Employee Portal Access' },
  ];

  const handlePermissionToggle = (permId: string) => {
    const current = accountData.permissions;
    if (current.includes(permId)) {
      setAccountData({
        ...accountData,
        permissions: current.filter(p => p !== permId),
      });
    } else {
      setAccountData({
        ...accountData,
        permissions: [...current, permId],
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-900">Account Preview</p>
            <p className="text-sm text-yellow-700">
              This configures the user account settings. The account will not be activated
              until onboarding is finalized.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={accountData.username}
            onChange={(e) => setAccountData({ ...accountData, username: e.target.value })}
            disabled={isReadOnly}
            placeholder="Enter username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select
            value={accountData.role}
            onValueChange={(value) => setAccountData({ ...accountData, role: value })}
            disabled={isReadOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EMPLOYEE">Employee</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="OWNER">Owner</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Permissions</Label>
          <div className="grid grid-cols-2 gap-2">
            {availablePermissions.map((perm) => (
              <div key={perm.id} className="flex items-center gap-2">
                <Checkbox
                  id={perm.id}
                  checked={accountData.permissions.includes(perm.id)}
                  onCheckedChange={() => handlePermissionToggle(perm.id)}
                  disabled={isReadOnly}
                />
                <Label htmlFor={perm.id} className="text-sm font-normal cursor-pointer">
                  {perm.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <Label htmlFor="linkEmployee">Link to Employee Record</Label>
            <p className="text-sm text-gray-500">
              Associate this account with an existing employee
            </p>
          </div>
          <Switch
            id="linkEmployee"
            checked={accountData.linkToEmployeeId}
            onCheckedChange={(checked) => 
              setAccountData({ ...accountData, linkToEmployeeId: checked })
            }
            disabled={isReadOnly}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  session,
  intakeFormData,
  accountData,
  isReadOnly,
}: {
  session: OnboardingSession;
  intakeFormData: Record<string, any>;
  accountData: {
    username: string;
    role: string;
    permissions: string[];
    linkToEmployeeId: boolean;
  };
  isReadOnly: boolean;
}) {
  const { toast } = useToast();

  const intakeComplete = session.intakeDataSchema?.length === 0 || 
    Object.keys(intakeFormData).length > 0;
  const docsComplete = session.documents.length === 0 || 
    session.documents.every(d => d.status === 'signed');
  const capturesComplete = session.captures.length === 0 || 
    session.captures.every(c => c.mediaItemId !== null);
  const accountComplete = !!accountData.username;

  const allComplete = intakeComplete && docsComplete && capturesComplete && accountComplete;

  const handleFinalize = () => {
    toast({
      title: 'Finalize Onboarding',
      description: 'Finalization will be implemented in a future phase. This will create the employee record and activate the account.',
    });
  };

  const ReviewItem = ({ 
    label, 
    complete, 
    detail 
  }: { 
    label: string; 
    complete: boolean; 
    detail: string;
  }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        {complete ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Circle className="h-5 w-5 text-gray-300" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-sm text-gray-500">{detail}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4">
        <h3 className="font-medium mb-4">Completion Checklist</h3>
        <div>
          <ReviewItem
            label="Intake Form"
            complete={intakeComplete}
            detail={intakeComplete ? 'Completed' : 'Incomplete'}
          />
          <ReviewItem
            label="Documents"
            complete={docsComplete}
            detail={`${session.documents.filter(d => d.status === 'signed').length}/${session.documents.length} signed`}
          />
          <ReviewItem
            label="Camera Captures"
            complete={capturesComplete}
            detail={`${session.captures.filter(c => c.mediaItemId).length}/${session.captures.length} captured`}
          />
          <ReviewItem
            label="User Account"
            complete={accountComplete}
            detail={accountComplete ? `Username: ${accountData.username}` : 'Not configured'}
          />
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={!allComplete}
            onClick={handleFinalize}
          >
            <Check className="h-4 w-4 mr-2" />
            Finalize Onboarding
          </Button>
        </div>
      )}

      {!allComplete && !isReadOnly && (
        <p className="text-sm text-gray-500 text-center">
          Complete all steps above before finalizing the onboarding.
        </p>
      )}
    </div>
  );
}
