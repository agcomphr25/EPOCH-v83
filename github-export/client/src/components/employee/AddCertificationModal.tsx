import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

interface AddCertificationModalProps {
  employeeId: number;
}

interface Certification {
  id: number;
  name: string;
  category: string;
  description: string;
}

export default function AddCertificationModal({ employeeId }: AddCertificationModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    certificationId: '',
    dateObtained: '',
    dateExpiry: '',
    certificateNumber: '',
    issuingAuthority: '',
    status: 'ACTIVE',
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: certifications = [], isLoading: certificationsLoading } = useQuery({
    queryKey: ['/api/certifications'],
    queryFn: async () => {
      const response = await fetch('/api/certifications');
      if (!response.ok) throw new Error('Failed to fetch certifications');
      return response.json();
    },
  });

  const createEmployeeCertificationMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/employee-certifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          employeeId,
          certificationId: parseInt(data.certificationId),
        }),
      });
      if (!response.ok) throw new Error('Failed to assign certification');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employee-certifications', { employeeId }] });
      setIsOpen(false);
      setFormData({
        certificationId: '',
        dateObtained: '',
        dateExpiry: '',
        certificateNumber: '',
        issuingAuthority: '',
        status: 'ACTIVE',
      });
      toast({
        title: "Success",
        description: "Certification assigned successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to assign certification. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.certificationId || !formData.dateObtained) {
      toast({
        title: "Validation Error",
        description: "Certification and date obtained are required fields",
        variant: "destructive",
      });
      return;
    }

    createEmployeeCertificationMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Certification
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Certification</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="certification">Certification *</Label>
            <Select value={formData.certificationId} onValueChange={(value) => handleInputChange('certificationId', value)}>
              <SelectTrigger>
                <SelectValue placeholder={certificationsLoading ? "Loading..." : "Select certification"} />
              </SelectTrigger>
              <SelectContent>
                {certifications.map((cert: Certification) => (
                  <SelectItem key={cert.id} value={cert.id.toString()}>
                    {cert.name} - {cert.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dateObtained">Date Obtained *</Label>
              <Input
                id="dateObtained"
                type="date"
                value={formData.dateObtained}
                onChange={(e) => handleInputChange('dateObtained', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="dateExpiry">Expiry Date</Label>
              <Input
                id="dateExpiry"
                type="date"
                value={formData.dateExpiry}
                onChange={(e) => handleInputChange('dateExpiry', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="certificateNumber">Certificate Number</Label>
            <Input
              id="certificateNumber"
              value={formData.certificateNumber}
              onChange={(e) => handleInputChange('certificateNumber', e.target.value)}
              placeholder="Certificate or license number"
            />
          </div>

          <div>
            <Label htmlFor="issuingAuthority">Issuing Authority</Label>
            <Input
              id="issuingAuthority"
              value={formData.issuingAuthority}
              onChange={(e) => handleInputChange('issuingAuthority', e.target.value)}
              placeholder="Organization that issued the certification"
            />
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createEmployeeCertificationMutation.isPending}>
              {createEmployeeCertificationMutation.isPending ? 'Assigning...' : 'Assign Certification'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}