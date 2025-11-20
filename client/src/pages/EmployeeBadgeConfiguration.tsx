import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  BADGE_ACTION_TYPES,
  ACTION_TYPE_LABELS,
  P1_DEPARTMENTS,
  P2_DEPARTMENTS,
  NAVIGATION_PAGES,
  type BadgeActionType,
} from '@/lib/badgeActionTypes';
import { Badge, UserCog, Settings, Scan } from 'lucide-react';

type Employee = {
  id: number;
  name: string;
  employeeCode: string;
};

type BadgeAction = {
  id: string;
  employeeId: number;
  actionType: string;
  actionConfig: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const formSchema = z.object({
  employeeId: z.coerce.number({ required_error: 'Employee is required' }),
  actionType: z.string().min(1, 'Action type is required'),
  actionConfig: z.any(),
});

type FormValues = z.infer<typeof formSchema>;

export default function EmployeeBadgeConfiguration() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<BadgeActionType | null>(null);

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: badgeActions = [] } = useQuery<{ badgeAction: BadgeAction; employee: Employee }[]>({
    queryKey: ['/api/employee-badges/employee-badge-actions'],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      actionConfig: {},
    },
  });

  const createBadgeActionMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return await apiRequest('/api/employee-badges/employee-badge-actions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employee-badges/employee-badge-actions'] });
      toast({
        title: 'Success',
        description: 'Badge action configured successfully',
      });
      form.reset();
      setSelectedEmployee(null);
      setSelectedActionType(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to configure badge action',
        variant: 'destructive',
      });
    },
  });

  const deleteBadgeActionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/employee-badges/employee-badge-actions/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employee-badges/employee-badge-actions'] });
      toast({
        title: 'Success',
        description: 'Badge action removed successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove badge action',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    createBadgeActionMutation.mutate(data);
  };

  const renderActionConfigFields = () => {
    if (!selectedActionType) return null;

    switch (selectedActionType) {
      case BADGE_ACTION_TYPES.P1_DEPARTMENT_PROGRESS:
        return (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="actionConfig.fromDepartment"
              render={({ field }) => (
                <FormItem data-testid="field-from-department">
                  <FormLabel>From Department</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-from-department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {P1_DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="actionConfig.toDepartment"
              render={({ field }) => (
                <FormItem data-testid="field-to-department">
                  <FormLabel>To Department</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-to-department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {P1_DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case BADGE_ACTION_TYPES.P2_DEPARTMENT_PROGRESS:
        return (
          <FormField
            control={form.control}
            name="actionConfig.departmentName"
            render={({ field }) => (
              <FormItem data-testid="field-department-name">
                <FormLabel>Department</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-department-name">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {P2_DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case BADGE_ACTION_TYPES.QUICK_NAVIGATION:
        return (
          <FormField
            control={form.control}
            name="actionConfig.targetPage"
            render={({ field }) => (
              <FormItem data-testid="field-target-page">
                <FormLabel>Target Page</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-target-page">
                      <SelectValue placeholder="Select page" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {NAVIGATION_PAGES.map((page) => (
                      <SelectItem key={page.value} value={page.value}>
                        {page.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case BADGE_ACTION_TYPES.CLOCK_IN_OUT:
        return (
          <div className="text-sm text-muted-foreground">
            <p>Scanning badge will automatically clock in/out based on current status.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Badge className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Employee Badge Configuration</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configure Badge Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem data-testid="field-employee">
                      <FormLabel>Employee</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedEmployee(parseInt(value));
                        }}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-employee">
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {emp.name} ({emp.employeeCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="actionType"
                  render={({ field }) => (
                    <FormItem data-testid="field-action-type">
                      <FormLabel>Action Type</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedActionType(value as BadgeActionType);
                          form.setValue('actionConfig', {});
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-action-type">
                            <SelectValue placeholder="Select action type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {renderActionConfigFields()}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createBadgeActionMutation.isPending}
                  data-testid="button-save-action"
                >
                  {createBadgeActionMutation.isPending ? 'Saving...' : 'Save Badge Action'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Active Badge Actions List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Active Badge Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {badgeActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No badge actions configured</p>
              ) : (
                badgeActions.map(({ badgeAction, employee }) => (
                  <div
                    key={badgeAction.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`badge-action-${badgeAction.id}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{employee.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {ACTION_TYPE_LABELS[badgeAction.actionType as BadgeActionType]}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {badgeAction.actionType === BADGE_ACTION_TYPES.P1_DEPARTMENT_PROGRESS &&
                          `${badgeAction.actionConfig.fromDepartment} → ${badgeAction.actionConfig.toDepartment}`}
                        {badgeAction.actionType === BADGE_ACTION_TYPES.P2_DEPARTMENT_PROGRESS &&
                          `Department: ${badgeAction.actionConfig.departmentName}`}
                        {badgeAction.actionType === BADGE_ACTION_TYPES.QUICK_NAVIGATION &&
                          `Page: ${badgeAction.actionConfig.targetPage}`}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteBadgeActionMutation.mutate(badgeAction.id)}
                      disabled={deleteBadgeActionMutation.isPending}
                      data-testid={`button-delete-${badgeAction.id}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            1. <strong>Configure Actions:</strong> Assign a badge action to each employee above
          </p>
          <p>
            2. <strong>Print Badges:</strong> Employee codes serve as badge barcodes (format:
            EMP-CODE)
          </p>
          <p>
            3. <strong>Scan Badge:</strong> Employee scans their badge on the Badge Scanner page
          </p>
          <p>
            4. <strong>Scan Order/Item:</strong> Scan the order or item barcode to execute the
            action
          </p>
          <p>
            5. <strong>Fast Workflow:</strong> Actions execute automatically - perfect for quick
            department progression
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
