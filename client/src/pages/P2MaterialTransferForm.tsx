import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface P2Customer {
  customerId: string;
  customerName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  shippingCompanyName: string | null;
  shippingContactName: string | null;
  shippingAddress: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shipToAddress: string | null;
}

interface TransferItem {
  quantity: string;
  description: string;
  partNumber: string;
  serialNumber: string;
  customerAssetId: string;
  condition: string;
  notes: string;
}

const blankItem = (): TransferItem => ({
  quantity: '1',
  description: '',
  partNumber: '',
  serialNumber: '',
  customerAssetId: '',
  condition: '',
  notes: '',
});

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function defaultFormNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `MTF-${yy}${mm}${dd}-${hh}${min}`;
}

function customerShipTo(customer: P2Customer) {
  if (customer.shipToAddress?.trim()) return customer.shipToAddress.trim();
  return [
    customer.shippingCompanyName || customer.customerName,
    customer.shippingContactName,
    customer.shippingAddress,
    customer.shippingAddress2,
    [[customer.shippingCity, customer.shippingState].filter(Boolean).join(', '), customer.shippingZip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}

export default function P2MaterialTransferForm() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [form, setForm] = useState({
    formNumber: defaultFormNumber(),
    transferDate: todayInputValue(),
    customerName: '',
    customerContact: '',
    customerPhone: '',
    customerEmail: '',
    shipToAddress: '',
    returnReason: 'Return customer-owned equipment',
    carrier: '',
    trackingNumber: '',
    freightTerms: 'Prepaid',
    preparedBy: '',
    authorizedBy: '',
    notes: '',
  });
  const [items, setItems] = useState<TransferItem[]>([blankItem()]);

  const { data: customers = [] } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.customerName.localeCompare(b.customerName)),
    [customers]
  );

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateItem = (index: number, key: keyof TransferItem, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const applyCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customers.find((c) => c.customerId === customerId);
    if (!customer) return;
    setForm((prev) => ({
      ...prev,
      customerName: customer.customerName,
      customerContact: customer.shippingContactName || '',
      customerPhone: customer.contactPhone || '',
      customerEmail: customer.contactEmail || '',
      shipToAddress: customerShipTo(customer),
    }));
  };

  const validate = () => {
    if (!form.transferDate) return 'Transfer date is required.';
    if (!form.customerName.trim()) return 'Customer name is required.';
    if (!form.shipToAddress.trim()) return 'Ship-to address is required.';
    if (!form.returnReason.trim()) return 'Reason for transfer is required.';
    if (!form.preparedBy.trim()) return 'Prepared by is required.';
    const validItems = items.filter((item) => item.description.trim() && Number(item.quantity) > 0);
    if (validItems.length === 0) return 'Add at least one item with a quantity and description.';
    return '';
  };

  const generatePdf = async () => {
    const error = validate();
    if (error) {
      toast({ title: 'Missing information', description: error, variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      const storedToken = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
      const response = await fetch('/api/p2/material-transfer/pdf', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          items: items
            .filter((item) => item.description.trim() && Number(item.quantity) > 0)
            .map((item) => ({ ...item, quantity: Number(item.quantity) })),
        }),
      });

      if (!response.ok) {
        let message = 'Unable to generate material transfer form.';
        try {
          const data = await response.json();
          message = data?.error || message;
        } catch {
          message = await response.text();
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast({ title: 'Material transfer form generated' });
    } catch (err: any) {
      toast({
        title: 'Generation failed',
        description: err?.message || 'Unable to generate material transfer form.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/p2-control-center?tab=shipping">
              <ArrowLeft className="h-4 w-4 mr-2" />
              P2 Shipping
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Material Transfer Form</h1>
            <p className="text-sm text-muted-foreground">Return customer-owned equipment with a fully manual transfer record.</p>
          </div>
        </div>
        <Button onClick={generatePdf} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
          Generate PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer Details</CardTitle>
          <CardDescription>Choose a customer to prefill shipping details, or type everything manually.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Customer Lookup</Label>
              <Select value={selectedCustomerId} onValueChange={applyCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional customer lookup" />
                </SelectTrigger>
                <SelectContent>
                  {sortedCustomers.map((customer) => (
                    <SelectItem key={customer.customerId} value={customer.customerId}>
                      {customer.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="formNumber">Form #</Label>
              <Input id="formNumber" value={form.formNumber} onChange={(e) => updateForm('formNumber', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transferDate">Transfer Date *</Label>
              <Input id="transferDate" type="date" value={form.transferDate} onChange={(e) => updateForm('transferDate', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input id="customerName" value={form.customerName} onChange={(e) => updateForm('customerName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerContact">Customer Contact</Label>
              <Input id="customerContact" value={form.customerContact} onChange={(e) => updateForm('customerContact', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone</Label>
              <Input id="customerPhone" value={form.customerPhone} onChange={(e) => updateForm('customerPhone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input id="customerEmail" value={form.customerEmail} onChange={(e) => updateForm('customerEmail', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shipToAddress">Ship To / Return Destination *</Label>
            <Textarea id="shipToAddress" rows={4} value={form.shipToAddress} onChange={(e) => updateForm('shipToAddress', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="returnReason">Reason for Transfer *</Label>
              <Textarea id="returnReason" rows={3} value={form.returnReason} onChange={(e) => updateForm('returnReason', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="carrier">Carrier</Label>
                <Input id="carrier" value={form.carrier} onChange={(e) => updateForm('carrier', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trackingNumber">Tracking #</Label>
                <Input id="trackingNumber" value={form.trackingNumber} onChange={(e) => updateForm('trackingNumber', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freightTerms">Freight Terms</Label>
                <Input id="freightTerms" value={form.freightTerms} onChange={(e) => updateForm('freightTerms', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preparedBy">Prepared By *</Label>
                <Input id="preparedBy" value={form.preparedBy} onChange={(e) => updateForm('preparedBy', e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Equipment</CardTitle>
              <CardDescription>Enter each customer-owned item being returned.</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setItems((prev) => [...prev, blankItem()])}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="rounded-md border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Item {index + 1}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((prev) => prev.length === 1 ? [blankItem()] : prev.filter((_, i) => i !== index))}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label>Qty *</Label>
                  <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description *</Label>
                  <Input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Part #</Label>
                  <Input value={item.partNumber} onChange={(e) => updateItem(index, 'partNumber', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Serial #</Label>
                  <Input value={item.serialNumber} onChange={(e) => updateItem(index, 'serialNumber', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Asset ID</Label>
                  <Input value={item.customerAssetId} onChange={(e) => updateItem(index, 'customerAssetId', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Input value={item.condition} onChange={(e) => updateItem(index, 'condition', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Item Notes</Label>
                  <Input value={item.notes} onChange={(e) => updateItem(index, 'notes', e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="authorizedBy">Authorized By / Received By</Label>
              <Input id="authorizedBy" value={form.authorizedBy} onChange={(e) => updateForm('authorizedBy', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Transfer Notes</Label>
              <Input id="notes" value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
