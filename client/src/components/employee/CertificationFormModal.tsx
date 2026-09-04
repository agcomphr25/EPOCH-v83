import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, CheckCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface CertificationFormModalProps {
  employeeId: number;
  employeeName: string;
}

interface RequirementsData {
  ppe: string[];
  criticalPoints: string[];
  workInstructions: string[];
}

interface Certification {
  id: number;
  name: string;
  category: string;
  description: string;
  requirements: string;
  requirementsData?: RequirementsData;
  workInstructions?: string;
  issuingOrganization: string;
  validityPeriodMonths: number;
}

export default function CertificationFormModal({
  employeeId,
  employeeName,
}: CertificationFormModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCertId, setSelectedCertId] = useState<string>('');
  const [formData, setFormData] = useState({
    trainingDate: new Date().toISOString().split('T')[0],
    trainerName: '',
    trainerSignature: '',
    notes: '',
  });
  const [criticalPointsChecked, setCriticalPointsChecked] = useState<
    Record<number, boolean>
  >({});
  const [workInstructionsCompleted, setWorkInstructionsCompleted] = useState<
    Record<number, boolean>
  >({});

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: certifications = [], isLoading: certificationsLoading } =
    useQuery({
      queryKey: ['/api/certifications'],
      queryFn: async () => {
        const response = await fetch('/api/certifications');
        if (!response.ok) throw new Error('Failed to fetch certifications');
        return response.json();
      },
    });

  const selectedCert = certifications.find(
    (c: Certification) => c.id === parseInt(selectedCertId)
  );

  // Use structured data if available, otherwise parse from requirements text
  const criticalPoints = selectedCert?.requirementsData?.criticalPoints
    ? selectedCert.requirementsData.criticalPoints.map((point: string, index: number) => ({ 
        id: index, 
        text: point 
      }))
    : selectedCert?.requirements
    ? selectedCert.requirements
        .split('\n')
        .filter((line: string) => line.trim().match(/^\d+\./))
        .map((point: string, index: number) => ({ id: index, text: point.trim() }))
    : [];

  const ppeRequirements = selectedCert?.requirementsData?.ppe
    ? selectedCert.requirementsData.ppe
    : selectedCert?.requirements
    ? selectedCert.requirements
        .split('\n')[0]
        .split(',')
        .map((item: string) => item.trim())
        .filter((item: string) => item && !item.includes('Critical Points'))
    : [];

  const workInstructions = selectedCert?.requirementsData?.workInstructions || [];

  const completeCertificationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/certifications/complete-training', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to complete certification');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/employees/certifications', { employeeId }],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/training/matrix'],
      });
      setIsOpen(false);
      resetForm();
      toast({
        title: 'Certification Completed',
        description: 'Employee has been certified and added to training matrix',
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

  const resetForm = () => {
    setSelectedCertId('');
    setFormData({
      trainingDate: new Date().toISOString().split('T')[0],
      trainerName: '',
      trainerSignature: '',
      notes: '',
    });
    setCriticalPointsChecked({});
    setWorkInstructionsCompleted({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCertId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a certification',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.trainerName || !formData.trainerSignature) {
      toast({
        title: 'Validation Error',
        description: 'Trainer name and signature are required',
        variant: 'destructive',
      });
      return;
    }

    // Check if all critical points are checked
    const allCriticalPointsChecked = criticalPoints.every(
      (point: any) => criticalPointsChecked[point.id]
    );
    if (criticalPoints.length > 0 && !allCriticalPointsChecked) {
      toast({
        title: 'Validation Error',
        description: 'All critical points must be checked',
        variant: 'destructive',
      });
      return;
    }

    // Check if all work instructions are completed
    const allWorkInstructionsCompleted = workInstructions.every(
      (_instruction: string, index: number) => workInstructionsCompleted[index]
    );
    if (workInstructions.length > 0 && !allWorkInstructionsCompleted) {
      toast({
        title: 'Validation Error',
        description: 'All work instructions must be marked as completed',
        variant: 'destructive',
      });
      return;
    }

    completeCertificationMutation.mutate({
      employeeId,
      certificationId: parseInt(selectedCertId),
      trainingDate: formData.trainingDate,
      trainerName: formData.trainerName,
      trainerSignature: formData.trainerSignature,
      notes: formData.notes,
      criticalPointsCompleted: criticalPointsChecked,
      workInstructionsCompleted: workInstructionsCompleted,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCriticalPoint = (pointId: number) => {
    setCriticalPointsChecked((prev) => ({
      ...prev,
      [pointId]: !prev[pointId],
    }));
  };

  const toggleWorkInstruction = (instructionIndex: number) => {
    setWorkInstructionsCompleted((prev) => ({
      ...prev,
      [instructionIndex]: !prev[instructionIndex],
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="w-4 h-4 mr-2" />
          Certify Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Training Certification Form</DialogTitle>
          <DialogDescription>
            Complete this form to certify {employeeName} for a training module
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Certification Selection */}
          <div>
            <Label htmlFor="certification">Select Certification *</Label>
            <select
              id="certification"
              className="w-full mt-1 p-2 border rounded-md"
              value={selectedCertId}
              onChange={(e) => setSelectedCertId(e.target.value)}
              data-testid="select-certification"
            >
              <option value="">
                {certificationsLoading
                  ? 'Loading...'
                  : 'Select a certification...'}
              </option>
              {certifications.map((cert: Certification) => (
                <option key={cert.id} value={cert.id}>
                  {cert.name} - {cert.category}
                </option>
              ))}
            </select>
          </div>

          {selectedCert && (
            <>
              {/* Certification Details */}
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <h3 className="font-semibold text-lg">{selectedCert.name}</h3>
                {selectedCert.description && (
                  <p className="text-sm text-gray-700">
                    {selectedCert.description}
                  </p>
                )}
                <div className="flex gap-2">
                  <Badge variant="secondary">{selectedCert.category}</Badge>
                  {selectedCert.validityPeriodMonths && (
                    <Badge variant="outline">
                      Valid for {selectedCert.validityPeriodMonths} months
                    </Badge>
                  )}
                </div>
              </div>

              {/* PPE Requirements */}
              {ppeRequirements.length > 0 && (
                <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <h4 className="font-semibold text-yellow-900 mb-2">
                    Required PPE
                  </h4>
                  <ul className="list-disc list-inside space-y-1">
                    {ppeRequirements.map((ppe: string, index: number) => (
                      <li key={index} className="text-sm text-yellow-800">
                        {ppe}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Work Instructions Competency Checklist */}
              {workInstructions.length > 0 && (
                <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Work Instructions - All Must Be Completed *
                  </h4>
                  <div className="space-y-3">
                    {workInstructions.map((instruction: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-start space-x-3"
                      >
                        <Checkbox
                          id={`instruction-${index}`}
                          checked={workInstructionsCompleted[index] || false}
                          onCheckedChange={() => toggleWorkInstruction(index)}
                          className="mt-1"
                          data-testid={`checkbox-instruction-${index}`}
                        />
                        <label
                          htmlFor={`instruction-${index}`}
                          className="text-sm text-blue-900 cursor-pointer flex-1"
                        >
                          <span className="font-medium">{index + 1}.</span> {instruction}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Critical Points Checklist */}
              {criticalPoints.length > 0 && (
                <div className="p-4 bg-red-50 border-l-4 border-red-400 rounded">
                  <h4 className="font-semibold text-red-900 mb-3">
                    Critical Points - All Must Be Completed *
                  </h4>
                  <div className="space-y-3">
                    {criticalPoints.map((point: any) => (
                      <div
                        key={point.id}
                        className="flex items-start space-x-3"
                      >
                        <Checkbox
                          id={`point-${point.id}`}
                          checked={criticalPointsChecked[point.id] || false}
                          onCheckedChange={() => toggleCriticalPoint(point.id)}
                          className="mt-1"
                        />
                        <label
                          htmlFor={`point-${point.id}`}
                          className="text-sm text-red-900 cursor-pointer flex-1"
                        >
                          {point.text}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Training Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="trainingDate">Training Date *</Label>
                  <Input
                    id="trainingDate"
                    type="date"
                    value={formData.trainingDate}
                    onChange={(e) =>
                      handleInputChange('trainingDate', e.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="trainerName">Trainer Name *</Label>
                  <Input
                    id="trainerName"
                    value={formData.trainerName}
                    onChange={(e) =>
                      handleInputChange('trainerName', e.target.value)
                    }
                    placeholder="Name of person conducting training"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="trainerSignature">Trainer Signature *</Label>
                <Input
                  id="trainerSignature"
                  value={formData.trainerSignature}
                  onChange={(e) =>
                    handleInputChange('trainerSignature', e.target.value)
                  }
                  placeholder="Type your full name as signature"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  By typing your name, you certify that this training was
                  completed successfully
                </p>
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Any additional notes or observations..."
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                completeCertificationMutation.isPending || !selectedCertId
              }
              className="bg-green-600 hover:bg-green-700"
            >
              {completeCertificationMutation.isPending
                ? 'Completing...'
                : 'Complete Certification'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
