import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/queryClient';

type Scope = 'P1' | 'P2';
type Customer = {
  id: number;
  reference: string | null;
  name: string;
  generalEmail: string | null;
};
type Recipient = {
  id: string;
  recipientName: string;
  email: string;
  deliveryRole: 'TO' | 'CC';
  receivesInvoices: boolean;
  receivesStatements: boolean;
  receivesCreditMemos: boolean;
  active: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

const today = new Date().toISOString().slice(0, 10);

export default function FinanceBillingRecipientsPage() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('P2');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'TO' | 'CC'>('TO');
  const [reason, setReason] = useState('Initial invoice recipient setup');
  const [message, setMessage] = useState('');

  const customers = useQuery<Customer[]>({
    queryKey: ['/api/finance-operations/billing-customers', scope],
    queryFn: () =>
      apiRequest(
        `/api/finance-operations/billing-customers?customerScope=${scope}`
      ),
  });
  const selectedCustomer = useMemo(
    () =>
      customers.data?.find((customer) => String(customer.id) === customerId),
    [customers.data, customerId]
  );
  const recipients = useQuery<Recipient[]>({
    queryKey: ['/api/finance-operations/billing-recipients', scope, customerId],
    queryFn: () =>
      apiRequest(
        `/api/finance-operations/billing-recipients?customerScope=${scope}&customerId=${customerId}`
      ),
    enabled: Boolean(customerId),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest('/api/finance-operations/billing-recipients', {
        method: 'POST',
        body: {
          customerScope: scope,
          customerId: Number(customerId),
          recipientName: name,
          email,
          deliveryRole: role,
          receivesInvoices: true,
          receivesStatements: false,
          receivesCreditMemos: false,
          active: true,
          effectiveFrom: today,
          effectiveUntil: null,
          changeReason: reason,
        },
      }),
    onSuccess: async () => {
      setName('');
      setEmail('');
      setMessage('Recipient saved.');
      await queryClient.invalidateQueries({
        queryKey: [
          '/api/finance-operations/billing-recipients',
          scope,
          customerId,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ['/api/finance-operations/p2-candidates'],
      });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  async function toggleActive(recipient: Recipient) {
    setMessage('');
    try {
      await apiRequest(
        `/api/finance-operations/billing-recipients/${recipient.id}`,
        {
          method: 'PATCH',
          body: {
            recipientName: recipient.recipientName,
            email: recipient.email,
            deliveryRole: recipient.deliveryRole,
            receivesInvoices: recipient.receivesInvoices,
            receivesStatements: recipient.receivesStatements,
            receivesCreditMemos: recipient.receivesCreditMemos,
            active: !recipient.active,
            effectiveFrom: recipient.effectiveFrom,
            effectiveUntil: recipient.effectiveUntil,
            changeReason: recipient.active
              ? 'Invoice recipient deactivated'
              : 'Invoice recipient reactivated',
          },
        }
      );
      setMessage(
        recipient.active ? 'Recipient deactivated.' : 'Recipient reactivated.'
      );
      await recipients.refetch();
      await queryClient.invalidateQueries({
        queryKey: ['/api/finance-operations/p2-candidates'],
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to update recipient.'
      );
    }
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href="/finance/p2-observation"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to P2 observation
        </Link>
        <h1 className="text-2xl font-bold">Invoice Billing Recipients</h1>
        <p className="mt-1 text-muted-foreground">
          Designate multiple To and CC recipients for P1 and P2 invoices.
          General contacts are never promoted automatically.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Select customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Production line</Label>
            <Select
              value={scope}
              onValueChange={(value: Scope) => {
                setScope(value);
                setCustomerId('');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="P1">P1</SelectItem>
                <SelectItem value="P2">P2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.data?.map((customer) => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name}
                    {customer.reference ? ` — ${customer.reference}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      {selectedCustomer && (
        <Card>
          <CardHeader>
            <CardTitle>
              Add invoice recipient for {selectedCustomer.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedCustomer.generalEmail && (
              <p className="text-sm text-muted-foreground">
                General contact on file: {selectedCustomer.generalEmail}. It
                will not receive invoices unless added below.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div>
                <Label>Delivery role</Label>
                <Select
                  value={role}
                  onValueChange={(value: 'TO' | 'CC') => setRole(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TO">To</SelectItem>
                    <SelectItem value="CC">CC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Reason for configuration</Label>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={!name || !email || !reason || create.isPending}
            >
              <Plus className="mr-2 h-4 w-4" /> Add recipient
            </Button>
            {message && <p className="text-sm">{message}</p>}
          </CardContent>
        </Card>
      )}
      {customerId && (
        <Card>
          <CardHeader>
            <CardTitle>Configured invoice recipients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recipients.data?.length === 0 && (
              <p className="text-muted-foreground">
                No designated recipients yet. At least one active To recipient
                is required.
              </p>
            )}
            {recipients.data?.map((recipient) => (
              <div
                key={recipient.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {recipient.recipientName}
                    <Badge variant="outline">{recipient.deliveryRole}</Badge>
                    {!recipient.active && (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {recipient.email}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${recipient.id}`}>Active</Label>
                  <Switch
                    id={`active-${recipient.id}`}
                    checked={recipient.active}
                    onCheckedChange={() => toggleActive(recipient)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card className="border-blue-300">
        <CardContent className="flex gap-3 p-4 text-sm">
          <Save className="h-5 w-5 text-blue-700" />
          <span>
            Every change requires a reason and is recorded in the append-only
            finance evidence ledger. Removing a recipient is handled by
            deactivation, preserving history.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
