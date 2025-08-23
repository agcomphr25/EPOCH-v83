import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import type { Customer, Survey } from '@shared/schema';

const surveyFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  customerName: z.string().min(1, "Customer name is required"),
  orderId: z.string().optional(),
  stockModel: z.string().optional(),
  surveyDate: z.string().min(1, "Survey date is required"),
  
  // Likert scale ratings (1-5)
  overall: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  communications: z.number().int().min(1).max(5),
  onTime: z.number().int().min(1).max(5),
  value: z.number().int().min(1).max(5),
  
  // Net Promoter Score (0-10)
  nps: z.number().int().min(0).max(10),
  
  // Issues and feedback
  issueExperienced: z.boolean().default(false),
  issueDetails: z.string().optional(),
  comments: z.string().optional(),
  
  // Survey metadata
  status: z.enum(['Completed', 'In Progress', 'Cancelled']).default('Completed'),
  csrUserId: z.string().optional(),
  followUpRequired: z.boolean().default(false),
  followUpNotes: z.string().optional(),
});

type SurveyFormData = z.infer<typeof surveyFormSchema>;

interface SurveyFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  recordToEdit?: Survey | null;
}

export default function SurveyFormModal({ open, onClose, onSaved, recordToEdit }: SurveyFormModalProps) {
  const { toast } = useToast();
  const isEdit = Boolean(recordToEdit);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const form = useForm<SurveyFormData>({
    resolver: zodResolver(surveyFormSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      orderId: '',
      stockModel: '',
      surveyDate: new Date().toISOString().split('T')[0],
      overall: 3,
      quality: 3,
      communications: 3,
      onTime: 3,
      value: 3,
      nps: 5,
      issueExperienced: false,
      issueDetails: '',
      comments: '',
      status: 'Completed',
      csrUserId: '',
      followUpRequired: false,
      followUpNotes: '',
    },
  });

  // Load form data when editing
  useEffect(() => {
    if (recordToEdit && open) {
      form.reset({
        customerId: recordToEdit.customerId,
        customerName: recordToEdit.customerName,
        orderId: recordToEdit.orderId || '',
        stockModel: recordToEdit.stockModel || '',
        surveyDate: recordToEdit.surveyDate,
        overall: recordToEdit.overall,
        quality: recordToEdit.quality,
        communications: recordToEdit.communications,
        onTime: recordToEdit.onTime,
        value: recordToEdit.value,
        nps: recordToEdit.nps,
        issueExperienced: recordToEdit.issueExperienced,
        issueDetails: recordToEdit.issueDetails || '',
        comments: recordToEdit.comments || '',
        status: recordToEdit.status as 'Completed' | 'In Progress' | 'Cancelled',
        csrUserId: recordToEdit.csrUserId || '',
        followUpRequired: recordToEdit.followUpRequired,
        followUpNotes: recordToEdit.followUpNotes || '',
      });
    } else if (!recordToEdit && open) {
      // Reset form for new survey
      form.reset({
        customerId: '',
        customerName: '',
        orderId: '',
        stockModel: '',
        surveyDate: new Date().toISOString().split('T')[0],
        overall: 3,
        quality: 3,
        communications: 3,
        onTime: 3,
        value: 3,
        nps: 5,
        issueExperienced: false,
        issueDetails: '',
        comments: '',
        status: 'Completed',
        csrUserId: '',
        followUpRequired: false,
        followUpNotes: '',
      });
      setSelectedCustomer(null);
    }
  }, [recordToEdit, open, form]);

  // Search orders for the selected customer
  const { data: customerOrders } = useQuery({
    queryKey: ['/api/orders/customer', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return [];
      return await apiRequest(`/api/orders/search?customerId=${selectedCustomer.id}`);
    },
    enabled: !!selectedCustomer,
  });

  const createSurveyMutation = useMutation({
    mutationFn: async (data: SurveyFormData) => {
      const url = isEdit ? `/api/surveys/${recordToEdit!.id}` : '/api/surveys';
      const method = isEdit ? 'PUT' : 'POST';
      return await apiRequest(url, { method, body: JSON.stringify(data) });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Survey ${isEdit ? 'updated' : 'created'} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/surveys'] });
      onSaved();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEdit ? 'update' : 'create'} survey`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SurveyFormData) => {
    createSurveyMutation.mutate(data);
  };

  const handleCustomerChange = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    if (customer) {
      form.setValue('customerId', customer.id.toString());
      form.setValue('customerName', customer.name);
    }
  };

  const watchedIssue = form.watch('issueExperienced');
  const watchedNps = form.watch('nps');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Survey' : 'New Customer Satisfaction Survey'}</DialogTitle>
          <DialogDescription>
            Collect and manage customer feedback for continuous improvement.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Selection */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer *</FormLabel>
                      <FormControl>
                        <CustomerSearchInput
                          value={selectedCustomer}
                          onValueChange={handleCustomerChange}
                          placeholder="Search and select customer..."
                          disabled={isEdit} // Don't allow changing customer when editing
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Order Selection */}
                {selectedCustomer && (
                  <FormField
                    control={form.control}
                    name="orderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select order (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">General Feedback</SelectItem>
                            {customerOrders?.map((order: any) => (
                              <SelectItem key={order.orderId} value={order.orderId}>
                                {order.orderId} - {order.stockModel || 'Custom Order'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="surveyDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Survey Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="stockModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock Model</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Standard Hunter" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Satisfaction Ratings */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium">Satisfaction Ratings (1-5 scale)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { name: 'overall', label: 'Overall Satisfaction' },
                  { name: 'quality', label: 'Product Quality' },
                  { name: 'communications', label: 'Communication' },
                  { name: 'onTime', label: 'On-Time Delivery' },
                  { name: 'value', label: 'Value for Money' },
                ].map(({ name, label }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name as keyof SurveyFormData}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <div className="space-y-2">
                          <Slider
                            value={[Number(field.value)]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={1}
                            max={5}
                            step={1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>1 - Poor</span>
                            <span className="font-medium">{field.value}</span>
                            <span>5 - Excellent</span>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Net Promoter Score */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium">Net Promoter Score</h3>
              <FormField
                control={form.control}
                name="nps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How likely are you to recommend us to others? (0-10)</FormLabel>
                    <div className="space-y-2">
                      <Slider
                        value={[Number(field.value)]}
                        onValueChange={([value]) => field.onChange(value)}
                        min={0}
                        max={10}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>0 - Not at all likely</span>
                        <span className="font-medium">
                          {field.value} - {watchedNps <= 6 ? 'Detractor' : watchedNps <= 8 ? 'Passive' : 'Promoter'}
                        </span>
                        <span>10 - Extremely likely</span>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Issues and Feedback */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium">Issues & Feedback</h3>
              
              <FormField
                control={form.control}
                name="issueExperienced"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Did you experience any issues?</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {watchedIssue && (
                <FormField
                  control={form.control}
                  name="issueDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issue Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please describe the issue you experienced..."
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="comments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Comments</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any additional feedback or suggestions..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Follow-up */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium">Follow-up</h3>
              
              <FormField
                control={form.control}
                name="followUpRequired"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Follow-up required?</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="csrUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CSR User ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Customer service representative..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSurveyMutation.isPending}>
                {createSurveyMutation.isPending ? 'Saving...' : isEdit ? 'Update Survey' : 'Create Survey'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}