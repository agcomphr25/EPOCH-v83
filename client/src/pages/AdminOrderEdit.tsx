import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface OverrideChanges {
  due_date?: string;
  status?: string;
  current_department?: string;
  notes?: string;
}

export default function AdminOrderEdit() {
  const [orderId, setOrderId] = useState('');
  const [changes, setChanges] = useState<OverrideChanges>({});
  const [reason, setReason] = useState('');
  const { toast } = useToast();

  const handleChange = (field: keyof OverrideChanges, value: string) => {
    setChanges(prev => {
      const next = { ...prev };
      if (value === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/admin/orders/override', { orderId, changes, reason }),
    onSuccess: (data: any) => {
      toast({ title: 'Override applied', description: `${data.updated?.length ?? 0} order(s) updated.` });
    },
    onError: (err: any) => {
      toast({ title: 'Override failed', description: err.message, variant: 'destructive' });
    },
  });

  const canSubmit = orderId.trim() !== '' && Object.keys(changes).length > 0 && reason.trim() !== '';

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Order Edit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="orderId">Order ID</Label>
            <Input
              id="orderId"
              placeholder="e.g. AG-2024-001"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Editable Fields</p>

            <div className="space-y-1">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                onChange={e => handleChange('due_date', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                placeholder="e.g. IN_PROGRESS"
                onChange={e => handleChange('status', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="current_department">Department</Label>
              <Input
                id="current_department"
                placeholder="e.g. Layup/Plugging"
                onChange={e => handleChange('current_department', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Order notes"
                onChange={e => handleChange('notes', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="reason">Reason (required)</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this override is necessary"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending ? 'Submitting…' : 'Submit Override'}
          </Button>

          {mutation.data && (
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(mutation.data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
