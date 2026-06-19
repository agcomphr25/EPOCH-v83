import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw, AlertTriangle, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface AddEmployeeModalProps {
  onClose: () => void;
}

type InventoryDepartment = {
  id: number;
  name: string;
};

type NewEmployeeFormData = {
  name: string;
  employeeCode: string;
  email: string;
  phone: string;
  jobTitle: string;
  userRole: string;
  department: string;
  partsRequestDepartmentId: number | null;
  employmentType: string;
  hireDate: string;
  emergencyContact: string;
  emergencyPhone: string;
  address: string;
  gateCardNumber: string;
  vehicleType: string;
  buildingKeyAccess: boolean;
  tciAccess: boolean;
  timekeeperPin?: string;
};

export default function AddEmployeeModal({ onClose }: AddEmployeeModalProps) {
  const [formData, setFormData] = useState<NewEmployeeFormData>({
    name: '',
    employeeCode: '',
    email: '',
    phone: '',
    jobTitle: '',
    userRole: 'EMPLOYEE',
    department: '',
    partsRequestDepartmentId: null,
    employmentType: 'FULL_TIME',
    hireDate: '',
    emergencyContact: '',
    emergencyPhone: '',
    address: '',
    gateCardNumber: '',
    vehicleType: '',
    buildingKeyAccess: false,
    tciAccess: false,
    timekeeperPin: '',
  });

  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: inventoryDepartments = [] } = useQuery<InventoryDepartment[]>({
    queryKey: ['/api/inventory/departments'],
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: NewEmployeeFormData) => {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        let detail = 'Something went wrong. Please check the form and try again.';
        if (body?.error) {
          try {
            const parsed = JSON.parse(body.error);
            if (Array.isArray(parsed)) {
              detail = parsed.map((e: any) => `${e.path?.join(' → ') || 'Field'}: ${e.message}`).join('. ');
            } else {
              detail = body.error;
            }
          } catch {
            detail = body.error;
          }
        }
        throw new Error(detail);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({
        title: 'Success',
        description: 'Employee added successfully',
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not create employee',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const generateCredentials = () => {
    const username =
      formData.name.toLowerCase().replace(/\s+/g, '.') +
      Math.floor(Math.random() * 1000);
    const password =
      Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 100);
    setCredentials({ username, password });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.jobTitle) {
      toast({
        title: 'Validation Error',
        description: 'Name and job title are required fields',
        variant: 'destructive',
      });
      return;
    }

    if (formData.timekeeperPin && !/^\d{4}$/.test(formData.timekeeperPin)) {
      toast({
        title: 'Validation Error',
        description: 'Kiosk PIN must be exactly 4 digits',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      ...formData,
      isActive: true,
      ...(formData.timekeeperPin ? {} : { timekeeperPin: undefined }),
    };
    createEmployeeMutation.mutate(payload);
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'buildingKeyAccess' || field === 'tciAccess') {
      setFormData((prev) => ({ ...prev, [field]: value === 'true' }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  return (
    <ScrollArea className="max-h-[70vh] pr-4">
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
          <Label htmlFor="employeeCode">
            Employee Code
            <span className="ml-1 text-xs font-normal text-muted-foreground">(required for time-clock matching)</span>
          </Label>
          <Input
            id="employeeCode"
            value={formData.employeeCode}
            onChange={(e) => handleInputChange('employeeCode', e.target.value)}
            placeholder="e.g. EMP001 — auto-generated if blank"
          />
          {!formData.employeeCode && (
            <p className="flex items-center gap-1 mt-1 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Leave blank to auto-generate a sequential code. A code is required for charge code lookup and payroll export.
            </p>
          )}
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
          <Label htmlFor="jobTitle">Job Title *</Label>
          <Select
            value={formData.jobTitle}
            onValueChange={(value) => handleInputChange('jobTitle', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select job title" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HR Manager">HR Manager</SelectItem>
              <SelectItem value="Production Manager">
                Production Manager
              </SelectItem>
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
          <Label htmlFor="userRole">System Access Level</Label>
          <Select
            value={formData.userRole}
            onValueChange={(value) => handleInputChange('userRole', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select system role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EMPLOYEE">Employee</SelectItem>
              <SelectItem value="ADMIN">Administrator</SelectItem>
              <SelectItem value="OWNER">Owner</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            System access level determines basic permissions
          </p>
        </div>

        <div>
          <Label htmlFor="department">Department</Label>
          <Select
            value={formData.department}
            onValueChange={(value) => handleInputChange('department', value)}
          >
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
          <Label htmlFor="partsRequestDepartmentId">Parts Request Department</Label>
          <Select
            value={formData.partsRequestDepartmentId == null ? 'none' : String(formData.partsRequestDepartmentId)}
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                partsRequestDepartmentId: value === 'none' ? null : Number(value),
              }))
            }
          >
            <SelectTrigger id="partsRequestDepartmentId">
              <SelectValue placeholder="Select inventory department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No parts request access</SelectItem>
              {inventoryDepartments.map((dept) => (
                <SelectItem key={dept.id} value={String(dept.id)}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Controls which inventory parts this employee can request.
          </p>
        </div>

        <div>
          <Label htmlFor="employmentType">Employment Type</Label>
          <Select
            value={formData.employmentType}
            onValueChange={(value) =>
              handleInputChange('employmentType', value)
            }
          >
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
          <Label htmlFor="gateCardNumber">Gate Card #</Label>
          <Input
            id="gateCardNumber"
            value={formData.gateCardNumber}
            onChange={(e) =>
              handleInputChange('gateCardNumber', e.target.value)
            }
            placeholder="Card number"
          />
        </div>

        <div>
          <Label htmlFor="vehicleType">Vehicle Type</Label>
          <Input
            id="vehicleType"
            value={formData.vehicleType}
            onChange={(e) => handleInputChange('vehicleType', e.target.value)}
            placeholder="e.g., Sedan, Truck, SUV"
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
              onChange={(e) =>
                handleInputChange('emergencyContact', e.target.value)
              }
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <Label htmlFor="emergencyPhone">Emergency Phone</Label>
            <Input
              id="emergencyPhone"
              value={formData.emergencyPhone}
              onChange={(e) =>
                handleInputChange('emergencyPhone', e.target.value)
              }
              placeholder="(555) 987-6543"
            />
          </div>
        </div>

        {/* Access permissions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="buildingKeyAccess"
              checked={formData.buildingKeyAccess}
              onChange={(e) =>
                handleInputChange(
                  'buildingKeyAccess',
                  e.target.checked.toString()
                )
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <Label htmlFor="buildingKeyAccess">Building Key Access</Label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="tciAccess"
              checked={formData.tciAccess}
              onChange={(e) =>
                handleInputChange('tciAccess', e.target.checked.toString())
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <Label htmlFor="tciAccess">TCI Access</Label>
          </div>
        </div>
      </div>

      {/* Auto-generate credentials section */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium">
            System Access Credentials
          </Label>
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
            <Label htmlFor="username" className="text-xs">
              Username
            </Label>
            <Input
              id="username"
              value={credentials.username}
              onChange={(e) =>
                setCredentials((prev) => ({
                  ...prev,
                  username: e.target.value,
                }))
              }
              placeholder="Auto-generated username"
              className="text-xs"
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={(e) =>
                  setCredentials((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
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
                {showPassword ? (
                  <EyeOff className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          These credentials will be used for system login and employee portal
          access.
        </p>
      </div>

      {/* Kiosk PIN section */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-gray-500" />
          <Label className="text-sm font-medium">Kiosk PIN</Label>
          <span className="text-xs text-muted-foreground">(optional)</span>
        </div>
        <div className="max-w-xs">
          <Label htmlFor="timekeeperPin" className="text-xs">4-Digit PIN</Label>
          <div className="relative">
            <Input
              id="timekeeperPin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={4}
              value={formData.timekeeperPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                handleInputChange('timekeeperPin', val);
              }}
              placeholder="e.g. 1234"
              className="text-xs pr-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-2"
              onClick={() => setShowPin(!showPin)}
            >
              {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Used to clock in/out at the kiosk terminal. Leave blank to skip.
          </p>
        </div>
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
    </ScrollArea>
  );
}
