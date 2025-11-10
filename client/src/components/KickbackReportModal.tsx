import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { insertKickbackSchema } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

const kickbackFormSchema = insertKickbackSchema.extend({
  kickbackDate: z.date(),
  resolvedAt: z.date().optional().nullable(),
});

type KickbackFormData = z.infer<typeof kickbackFormSchema>;

interface KickbackReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: string;
  department?: string;
  reportedBy?: string;
}

export default function KickbackReportModal({
  open,
  onOpenChange,
  orderId = '',
  department = '',
  reportedBy = '',
}: KickbackReportModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<KickbackFormData>({
    resolver: zodResolver(kickbackFormSchema),
    defaultValues: {
      orderId,
      kickbackDept: department,
      reportedBy,
      kickbackDate: new Date(),
      status: 'OPEN',
      priority: 'MEDIUM',
      impactedDepartments: [],
    },
  });

  // Reset form when modal opens with new order context
  useEffect(() => {
    if (open) {
      form.reset({
        orderId,
        kickbackDept: department,
        reportedBy,
        kickbackDate: new Date(),
        status: 'OPEN',
        priority: 'MEDIUM',
        impactedDepartments: [],
        reasonText: '',
        reasonCode: undefined,
      });
    }
  }, [open, orderId, department, reportedBy, form]);

  const createKickbackMutation = useMutation({
    mutationFn: (data: KickbackFormData) =>
      fetch('/api/kickbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((res) => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks/analytics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      onOpenChange(false);
      toast({ title: 'Success', description: 'Kickback created successfully' });
      form.reset();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create kickback',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: KickbackFormData) => {
    createKickbackMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Report New Kickback</DialogTitle>
          <DialogDescription>
            Report a production issue that requires attention
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order ID</FormLabel>
                    <FormControl>
                      <Input placeholder="AG001" {...field} data-testid="input-kickback-order-id" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="kickbackDept"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-kickback-department">
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Layup">Layup</SelectItem>
                        <SelectItem value="Plugging">Plugging</SelectItem>
                        <SelectItem value="CNC">CNC</SelectItem>
                        <SelectItem value="Finish">Finish</SelectItem>
                        <SelectItem value="Gunsmith">Gunsmith</SelectItem>
                        <SelectItem value="Paint">Paint</SelectItem>
                        <SelectItem value="QC">QC</SelectItem>
                        <SelectItem value="Shipping">Shipping</SelectItem>
                        <SelectItem value="Barcode">Barcode</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reasonCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason Code</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-kickback-reason">
                          <SelectValue placeholder="Select reason" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MATERIAL_DEFECT">
                          Material Defect
                        </SelectItem>
                        <SelectItem value="MACHINE_FAILURE">
                          Machine Failure
                        </SelectItem>
                        <SelectItem value="QUALITY_ISSUE">
                          Quality Issue
                        </SelectItem>
                        <SelectItem value="PROCESS_ERROR">
                          Process Error
                        </SelectItem>
                        <SelectItem value="DESIGN_ISSUE">
                          Design Issue
                        </SelectItem>
                        <SelectItem value="SUPPLIER_ISSUE">
                          Supplier Issue
                        </SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-kickback-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="kickbackDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Kickback Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            data-testid="button-kickback-date"
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date('1900-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reportedBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reported By</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} data-testid="input-kickback-reporter" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reasonText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detailed description of the issue..."
                      className="resize-none"
                      {...field}
                      value={field.value || ''}
                      data-testid="textarea-kickback-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-kickback"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createKickbackMutation.isPending}
                data-testid="button-submit-kickback"
              >
                {createKickbackMutation.isPending
                  ? 'Creating...'
                  : 'Create Kickback'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
