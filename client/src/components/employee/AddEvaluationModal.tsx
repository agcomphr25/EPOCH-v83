import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

interface AddEvaluationModalProps {
  employeeId: number;
}

export default function AddEvaluationModal({ employeeId }: AddEvaluationModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    evaluationPeriodStart: '',
    evaluationPeriodEnd: '',
    overallRating: '',
    status: 'DRAFT',
    comments: '',
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createEvaluationMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          employeeId,
          evaluatorId: 1, // TODO: Get from current user session
          overallRating: data.overallRating ? parseFloat(data.overallRating) : null,
        }),
      });
      if (!response.ok) throw new Error('Failed to create evaluation');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/evaluations', { employeeId }] });
      setIsOpen(false);
      setFormData({
        evaluationPeriodStart: '',
        evaluationPeriodEnd: '',
        overallRating: '',
        status: 'DRAFT',
        comments: '',
      });
      toast({
        title: "Success",
        description: "Evaluation created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create evaluation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.evaluationPeriodStart || !formData.evaluationPeriodEnd) {
      toast({
        title: "Validation Error",
        description: "Evaluation period start and end dates are required",
        variant: "destructive",
      });
      return;
    }

    if (new Date(formData.evaluationPeriodStart) >= new Date(formData.evaluationPeriodEnd)) {
      toast({
        title: "Validation Error",
        description: "End date must be after start date",
        variant: "destructive",
      });
      return;
    }

    createEvaluationMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Evaluation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Performance Evaluation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="evaluationPeriodStart">Period Start *</Label>
              <Input
                id="evaluationPeriodStart"
                type="date"
                value={formData.evaluationPeriodStart}
                onChange={(e) => handleInputChange('evaluationPeriodStart', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="evaluationPeriodEnd">Period End *</Label>
              <Input
                id="evaluationPeriodEnd"
                type="date"
                value={formData.evaluationPeriodEnd}
                onChange={(e) => handleInputChange('evaluationPeriodEnd', e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="overallRating">Overall Rating (1-5)</Label>
            <Select value={formData.overallRating} onValueChange={(value) => handleInputChange('overallRating', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Needs Improvement</SelectItem>
                <SelectItem value="2">2 - Below Expectations</SelectItem>
                <SelectItem value="3">3 - Meets Expectations</SelectItem>
                <SelectItem value="4">4 - Exceeds Expectations</SelectItem>
                <SelectItem value="5">5 - Outstanding</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={formData.comments}
              onChange={(e) => handleInputChange('comments', e.target.value)}
              placeholder="Enter evaluation comments and feedback..."
              rows={4}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createEvaluationMutation.isPending}>
              {createEvaluationMutation.isPending ? 'Creating...' : 'Create Evaluation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}