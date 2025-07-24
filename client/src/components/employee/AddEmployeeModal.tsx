import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';

interface AddEmployeeModalProps {
  onClose: () => void;
}

export default function AddEmployeeModal({ onClose }: AddEmployeeModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    department: '',
    employmentType: 'FULL_TIME',
    hireDate: '',
    emergencyContact: '',
    emergencyPhone: '',
    address: '',
    salary: '',
    hourlyRate: '',
  });
  
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create employee');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add employee. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateCredentials = () => {
    const username = formData.name.toLowerCase().replace(/\s+/g, '.') + Math.floor(Math.random() * 1000);
    const password = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 100);
    setCredentials({ username, password });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.role) {
      toast({
        title: "Validation Error",
        description: "Name and role are required fields",
        variant: "destructive",
      });
      return;
    }

    const submissionData = {
      ...formData,
      salary: formData.salary ? parseFloat(formData.salary) : undefined,
      hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : undefined,
      hireDate: formData.hireDate || undefined,
    };

    createEmployeeMutation.mutate(submissionData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="John Doe"
            required
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="john.doe@company.com"
          />
        </div>

        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>

        <div>
          <Label htmlFor="role">Role *</Label>
          <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
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
        </div>

        <div>
          <Label htmlFor="department">Department</Label>
          <Select value={formData.department} onValueChange={(value) => handleInputChange('department', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
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
        </div>

        <div>
          <Label htmlFor="employmentType">Employment Type</Label>
          <Select value={formData.employmentType} onValueChange={(value) => handleInputChange('employmentType', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FULL_TIME">Full Time</SelectItem>
              <SelectItem value="PART_TIME">Part Time</SelectItem>
              <SelectItem value="CONTRACT">Contract</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="hireDate">Hire Date</Label>
          <Input
            id="hireDate"
            type="date"
            value={formData.hireDate}
            onChange={(e) => handleInputChange('hireDate', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="salary">Annual Salary ($)</Label>
          <Input
            id="salary"
            type="number"
            value={formData.salary}
            onChange={(e) => handleInputChange('salary', e.target.value)}
            placeholder="50000"
          />
        </div>

        <div>
          <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
          <Input
            id="hourlyRate"
            type="number"
            step="0.01"
            value={formData.hourlyRate}
            onChange={(e) => handleInputChange('hourlyRate', e.target.value)}
            placeholder="25.00"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            placeholder="123 Main St, City, State 12345"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="emergencyContact">Emergency Contact</Label>
            <Input
              id="emergencyContact"
              value={formData.emergencyContact}
              onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <Label htmlFor="emergencyPhone">Emergency Phone</Label>
            <Input
              id="emergencyPhone"
              value={formData.emergencyPhone}
              onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
              placeholder="(555) 987-6543"
            />
          </div>
        </div>
      </div>

      {/* Auto-generate credentials section */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium">System Access Credentials</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateCredentials}
            className="text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Generate
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="username" className="text-xs">Username</Label>
            <Input
              id="username"
              value={credentials.username}
              onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Auto-generated username"
              className="text-xs"
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-xs">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Auto-generated password"
                className="text-xs pr-8"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-gray-500 mt-2">
          These credentials will be used for system login and employee portal access.
        </p>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={createEmployeeMutation.isPending}>
          {createEmployeeMutation.isPending ? 'Creating...' : 'Create Employee'}
        </Button>
      </div>
    </form>
  );
}