import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft,
  Plus,
  FileText,
  Edit,
  Trash2,
  AlertTriangle,
  Shield,
  CheckCircle,
  Clock,
  Search,
} from 'lucide-react';

interface WorkInstruction {
  id: number;
  title: string;
  department: string;
  processArea: string | null;
  documentNumber: string | null;
  version: number;
  status: string;
  objective: string | null;
  prerequisites: string[] | null;
  ppeRequired: string[] | null;
  tools: string[] | null;
  steps: {
    stepNumber: number;
    instruction: string;
    criticalPoint?: string;
    safetyNote?: string;
  }[] | null;
  criticalPoints: string[] | null;
  safetyConsiderations: string[] | null;
  qualityCheckpoints: string[] | null;
  estimatedMinutes: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkInstructionStep {
  stepNumber: number;
  instruction: string;
  criticalPoint?: string;
  safetyNote?: string;
}

const DEPARTMENTS = [
  'Manufacturing',
  'Layup',
  'CNC',
  'Paint',
  'Finish',
  'QC',
  'Shipping',
  'Assembly',
  'All',
];

export default function WorkInstructionsPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<WorkInstruction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [formData, setFormData] = useState({
    title: '',
    department: '',
    processArea: '',
    objective: '',
    estimatedMinutes: 30,
    prerequisites: [''],
    ppeRequired: [''],
    tools: [''],
    steps: [{ stepNumber: 1, instruction: '', criticalPoint: '', safetyNote: '' }] as WorkInstructionStep[],
    criticalPoints: [''],
    safetyConsiderations: [''],
    qualityCheckpoints: [''],
  });

  const { data: instructions = [], isLoading } = useQuery<WorkInstruction[]>({
    queryKey: ['/api/training/work-instructions', filterDepartment, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterDepartment !== 'all') params.append('department', filterDepartment);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      const res = await fetch(`/api/training/work-instructions?${params}`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('/api/training/work-instructions', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          prerequisites: data.prerequisites.filter(p => p.trim()),
          ppeRequired: data.ppeRequired.filter(p => p.trim()),
          tools: data.tools.filter(t => t.trim()),
          steps: data.steps.filter(s => s.instruction.trim()),
          criticalPoints: data.criticalPoints.filter(c => c.trim()),
          safetyConsiderations: data.safetyConsiderations.filter(s => s.trim()),
          qualityCheckpoints: data.qualityCheckpoints.filter(q => q.trim()),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/work-instructions'] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: 'Work Instruction Created' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest(`/api/training/work-instructions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...data,
          prerequisites: data.prerequisites.filter(p => p.trim()),
          ppeRequired: data.ppeRequired.filter(p => p.trim()),
          tools: data.tools.filter(t => t.trim()),
          steps: data.steps.filter(s => s.instruction.trim()),
          criticalPoints: data.criticalPoints.filter(c => c.trim()),
          safetyConsiderations: data.safetyConsiderations.filter(s => s.trim()),
          qualityCheckpoints: data.qualityCheckpoints.filter(q => q.trim()),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/work-instructions'] });
      setEditingInstruction(null);
      resetForm();
      toast({ title: 'Work Instruction Updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/work-instructions/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/work-instructions'] });
      toast({ title: 'Work Instruction Deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      department: '',
      processArea: '',
      objective: '',
      estimatedMinutes: 30,
      prerequisites: [''],
      ppeRequired: [''],
      tools: [''],
      steps: [{ stepNumber: 1, instruction: '', criticalPoint: '', safetyNote: '' }],
      criticalPoints: [''],
      safetyConsiderations: [''],
      qualityCheckpoints: [''],
    });
  };

  const openEditDialog = (instruction: WorkInstruction) => {
    setFormData({
      title: instruction.title,
      department: instruction.department,
      processArea: instruction.processArea || '',
      objective: instruction.objective || '',
      estimatedMinutes: instruction.estimatedMinutes || 30,
      prerequisites: instruction.prerequisites?.length ? instruction.prerequisites : [''],
      ppeRequired: instruction.ppeRequired?.length ? instruction.ppeRequired : [''],
      tools: instruction.tools?.length ? instruction.tools : [''],
      steps: instruction.steps?.length ? instruction.steps : [{ stepNumber: 1, instruction: '', criticalPoint: '', safetyNote: '' }],
      criticalPoints: instruction.criticalPoints?.length ? instruction.criticalPoints : [''],
      safetyConsiderations: instruction.safetyConsiderations?.length ? instruction.safetyConsiderations : [''],
      qualityCheckpoints: instruction.qualityCheckpoints?.length ? instruction.qualityCheckpoints : [''],
    });
    setEditingInstruction(instruction);
  };

  const addArrayItem = (field: 'prerequisites' | 'ppeRequired' | 'tools' | 'criticalPoints' | 'safetyConsiderations' | 'qualityCheckpoints') => {
    setFormData(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const updateArrayItem = (field: 'prerequisites' | 'ppeRequired' | 'tools' | 'criticalPoints' | 'safetyConsiderations' | 'qualityCheckpoints', index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  const removeArrayItem = (field: 'prerequisites' | 'ppeRequired' | 'tools' | 'criticalPoints' | 'safetyConsiderations' | 'qualityCheckpoints', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const addStep = () => {
    setFormData(prev => ({
      ...prev,
      steps: [...prev.steps, { stepNumber: prev.steps.length + 1, instruction: '', criticalPoint: '', safetyNote: '' }],
    }));
  };

  const updateStep = (index: number, field: keyof WorkInstructionStep, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, [field]: value } : step)),
    }));
  };

  const removeStep = (index: number) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNumber: i + 1 })),
    }));
  };

  const filteredInstructions = instructions.filter(
    (wi) =>
      wi.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wi.documentNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case 'draft':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Draft</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const WorkInstructionForm = () => (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto p-1">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Title *</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Layup Preparation Procedure"
          />
        </div>
        <div>
          <Label>Department *</Label>
          <Select value={formData.department} onValueChange={(v) => setFormData(prev => ({ ...prev, department: v }))}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Process Area</Label>
          <Input
            value={formData.processArea}
            onChange={(e) => setFormData(prev => ({ ...prev, processArea: e.target.value }))}
            placeholder="e.g., Material Prep Station"
          />
        </div>
        <div>
          <Label>Estimated Minutes</Label>
          <Input
            type="number"
            value={formData.estimatedMinutes}
            onChange={(e) => setFormData(prev => ({ ...prev, estimatedMinutes: parseInt(e.target.value) || 30 }))}
          />
        </div>
      </div>

      <div>
        <Label>Objective</Label>
        <Textarea
          value={formData.objective}
          onChange={(e) => setFormData(prev => ({ ...prev, objective: e.target.value }))}
          placeholder="What the trainee will learn from this work instruction"
        />
      </div>

      <div>
        <Label className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          PPE Required
        </Label>
        {formData.ppeRequired.map((item, i) => (
          <div key={i} className="flex gap-2 mt-2">
            <Input
              value={item}
              onChange={(e) => updateArrayItem('ppeRequired', i, e.target.value)}
              placeholder="e.g., Safety glasses"
            />
            <Button variant="ghost" size="sm" onClick={() => removeArrayItem('ppeRequired', i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem('ppeRequired')}>
          <Plus className="h-4 w-4 mr-1" />Add PPE
        </Button>
      </div>

      <div className="border-t pt-4">
        <Label className="text-lg font-semibold">Procedural Steps</Label>
        <p className="text-sm text-muted-foreground mb-2">Add critical points and safety notes for each step</p>
        {formData.steps.map((step, i) => (
          <Card key={i} className="mb-3">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Badge>Step {step.stepNumber}</Badge>
                <Button variant="ghost" size="sm" onClick={() => removeStep(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <div>
                  <Label>Instruction</Label>
                  <Textarea
                    value={step.instruction}
                    onChange={(e) => updateStep(i, 'instruction', e.target.value)}
                    placeholder="Step-by-step instruction"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="flex items-center gap-1 text-orange-600">
                      <AlertTriangle className="h-3 w-3" />Critical Point
                    </Label>
                    <Input
                      value={step.criticalPoint || ''}
                      onChange={(e) => updateStep(i, 'criticalPoint', e.target.value)}
                      placeholder="Quality/compliance checkpoint"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1 text-red-600">
                      <Shield className="h-3 w-3" />Safety Note
                    </Label>
                    <Input
                      value={step.safetyNote || ''}
                      onChange={(e) => updateStep(i, 'safetyNote', e.target.value)}
                      placeholder="Safety consideration"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button variant="outline" onClick={addStep}>
          <Plus className="h-4 w-4 mr-1" />Add Step
        </Button>
      </div>

      <div>
        <Label className="flex items-center gap-2 text-orange-600">
          <AlertTriangle className="h-4 w-4" />
          Critical Points Summary
        </Label>
        {formData.criticalPoints.map((item, i) => (
          <div key={i} className="flex gap-2 mt-2">
            <Input
              value={item}
              onChange={(e) => updateArrayItem('criticalPoints', i, e.target.value)}
              placeholder="Key quality/compliance point"
            />
            <Button variant="ghost" size="sm" onClick={() => removeArrayItem('criticalPoints', i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem('criticalPoints')}>
          <Plus className="h-4 w-4 mr-1" />Add Critical Point
        </Button>
      </div>

      <div>
        <Label className="flex items-center gap-2 text-red-600">
          <Shield className="h-4 w-4" />
          Safety Considerations
        </Label>
        {formData.safetyConsiderations.map((item, i) => (
          <div key={i} className="flex gap-2 mt-2">
            <Input
              value={item}
              onChange={(e) => updateArrayItem('safetyConsiderations', i, e.target.value)}
              placeholder="Safety requirement"
            />
            <Button variant="ghost" size="sm" onClick={() => removeArrayItem('safetyConsiderations', i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => addArrayItem('safetyConsiderations')}>
          <Plus className="h-4 w-4 mr-1" />Add Safety Item
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingInstruction(null);
            resetForm();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (editingInstruction) {
              updateMutation.mutate({ id: editingInstruction.id, data: formData });
            } else {
              createMutation.mutate(formData);
            }
          }}
          disabled={!formData.title || !formData.department}
        >
          {editingInstruction ? 'Update' : 'Create'} Work Instruction
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading work instructions...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/training/programs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Programs
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Work Instructions
            </h1>
            <p className="text-muted-foreground">
              Task-specific procedures with critical points and safety considerations
            </p>
          </div>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              New Work Instruction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create Work Instruction</DialogTitle>
              <DialogDescription>
                Define procedural steps with critical points and safety notes
              </DialogDescription>
            </DialogHeader>
            <WorkInstructionForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by title or document number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterDepartment} onValueChange={setFilterDepartment}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filteredInstructions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No work instructions found</p>
              <p className="text-sm text-muted-foreground mt-2">Create your first work instruction to get started</p>
            </CardContent>
          </Card>
        ) : (
          filteredInstructions.map((wi) => (
            <Card key={wi.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {wi.documentNumber && (
                        <Badge variant="outline" className="font-mono">{wi.documentNumber}</Badge>
                      )}
                      {getStatusBadge(wi.status)}
                      <Badge variant="secondary">{wi.department}</Badge>
                    </div>
                    <CardTitle className="text-lg">{wi.title}</CardTitle>
                    {wi.objective && (
                      <CardDescription className="mt-1">{wi.objective}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(wi)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Delete this work instruction?')) {
                          deleteMutation.mutate(wi.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {wi.estimatedMinutes} min
                  </span>
                  {wi.steps && wi.steps.length > 0 && (
                    <span>{wi.steps.length} steps</span>
                  )}
                  {wi.criticalPoints && wi.criticalPoints.length > 0 && (
                    <span className="text-orange-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {wi.criticalPoints.length} critical points
                    </span>
                  )}
                  {wi.safetyConsiderations && wi.safetyConsiderations.length > 0 && (
                    <span className="text-red-600 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {wi.safetyConsiderations.length} safety items
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!editingInstruction} onOpenChange={(open) => !open && setEditingInstruction(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Work Instruction</DialogTitle>
            <DialogDescription>
              Update procedural steps, critical points, and safety notes
            </DialogDescription>
          </DialogHeader>
          <WorkInstructionForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}
