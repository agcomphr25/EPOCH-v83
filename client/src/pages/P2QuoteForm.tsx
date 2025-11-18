import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Save, FileText, Printer } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface QuoteLineItem {
  id: string;
  lineNumber: number;
  quantity: number;
  description: string;
  unitPrice: number;
  totalPrice: number;
}

interface RFQAssessment {
  id: number;
  rfqNumber: string;
  customerId: string;
  customerName: string;
  description: string | null;
  status: string;
  submittedBy: string | null;
  submittedAt: string | null;
}

export default function P2QuoteForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [quoteDate, setQuoteDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [quoteNumber, setQuoteNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [fromName, setFromName] = useState('Dave Tandy');
  const [fromEmail, setFromEmail] = useState('dave@agcomposites.com');
  const [fromPhone, setFromPhone] = useState('256-723-8381');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [notes, setNotes] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([
    {
      id: crypto.randomUUID(),
      lineNumber: 1,
      quantity: 1,
      description: '',
      unitPrice: 0,
      totalPrice: 0,
    },
  ]);

  // Fetch P2 customers for autocomplete
  const { data: p2Customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  // Fetch RFQ Risk Assessments
  const { data: rfqAssessments = [] } = useQuery<RFQAssessment[]>({
    queryKey: ['/api/customers/rfq-assessments'],
  });

  // Filter for submitted RFQs only (case-insensitive)
  const submittedRFQs = rfqAssessments.filter(
    (rfq) => rfq.status?.toLowerCase() === 'submitted'
  );

  // Calculate grand total
  const grandTotal = lineItems.reduce(
    (sum, item) => sum + item.totalPrice,
    0
  );

  const addLineItem = () => {
    const newLineNumber = lineItems.length + 1;
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        lineNumber: newLineNumber,
        quantity: 1,
        description: '',
        unitPrice: 0,
        totalPrice: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    const filtered = lineItems.filter((item) => item.id !== id);
    // Renumber remaining items
    const renumbered = filtered.map((item, index) => ({
      ...item,
      lineNumber: index + 1,
    }));
    setLineItems(renumbered);
  };

  const updateLineItem = (
    id: string,
    field: keyof QuoteLineItem,
    value: string | number
  ) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // Recalculate total price when quantity or unit price changes
        if (field === 'quantity' || field === 'unitPrice') {
          // Default to 0 for NaN/empty values
          const qty = Number(updated.quantity) || 0;
          const price = Number(updated.unitPrice) || 0;
          updated.totalPrice = Math.max(0, qty * price);
        }

        return updated;
      })
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSave = () => {
    // TODO: Implement backend persistence
    toast({
      title: 'Coming Soon',
      description: 'Quote saving will be available after backend integration.',
      variant: 'default',
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Navigation */}
      <div className="mb-6 no-print">
        <Link href="/p2-forms">
          <Button variant="outline" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to P2 Forms
          </Button>
        </Link>
      </div>

      {/* Quote Form */}
      <Card className="print:shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-bold">Job Quote</CardTitle>
              <CardDescription className="mt-2">
                Generate professional quotes for P2 customers
              </CardDescription>
            </div>
            <div className="flex gap-2 no-print">
              <Button
                variant="outline"
                onClick={handlePrint}
                data-testid="button-print"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button onClick={handleSave} data-testid="button-save">
                <Save className="h-4 w-4 mr-2" />
                Save Quote
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-8">
          {/* Company Header */}
          <div className="flex justify-between mb-8 pb-6 border-b">
            <div>
              <h2 className="font-bold text-lg">AG Composites, LLC</h2>
              <p className="text-sm">dba AG Advanced Technologies</p>
              <p className="text-sm">230 Hamer Road</p>
              <p className="text-sm">Owens Cross Roads, AL 35763</p>
            </div>
            <div className="text-right">
              <Label className="text-sm font-semibold">Quote Number (RFQ)</Label>
              <Select value={quoteNumber} onValueChange={setQuoteNumber}>
                <SelectTrigger
                  className="w-48 mt-1 text-right font-mono"
                  data-testid="select-quote-number"
                >
                  <SelectValue placeholder="Select RFQ..." />
                </SelectTrigger>
                <SelectContent data-testid="select-quote-number-content">
                  {submittedRFQs.length === 0 ? (
                    <SelectItem value="none" disabled data-testid="option-no-rfqs">
                      No submitted RFQs
                    </SelectItem>
                  ) : (
                    submittedRFQs.map((rfq) => (
                      <SelectItem
                        key={rfq.id}
                        value={rfq.rfqNumber}
                        data-testid={`option-rfq-${rfq.rfqNumber}`}
                      >
                        {rfq.rfqNumber} - {rfq.customerName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quote Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  data-testid="input-date"
                />
              </div>
              <div>
                <Label>To</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                  data-testid="input-customer-name"
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  list="p2-customers-list"
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder="Select or enter company name"
                  data-testid="input-customer-company"
                />
                <datalist id="p2-customers-list">
                  {p2Customers.map((customer: any) => (
                    <option key={customer.id} value={customer.customerName}>
                      {customer.customerName}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger data-testid="select-payment-terms">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-testid="select-payment-terms-content">
                    <SelectItem value="Net 30" data-testid="option-net-30">Net 30</SelectItem>
                    <SelectItem value="Net 60" data-testid="option-net-60">Net 60</SelectItem>
                    <SelectItem value="Due on Receipt" data-testid="option-due-on-receipt">Due on Receipt</SelectItem>
                    <SelectItem value="50% Deposit" data-testid="option-50-deposit">50% Deposit</SelectItem>
                    <SelectItem value="Custom" data-testid="option-custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <Label>From</Label>
                <Input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  data-testid="input-from-name"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  data-testid="input-from-email"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={fromPhone}
                  onChange={(e) => setFromPhone(e.target.value)}
                  data-testid="input-from-phone"
                />
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Line Items</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={addLineItem}
                className="no-print"
                data-testid="button-add-line"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Line Item
              </Button>
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead className="w-32">Quantity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-32">Unit Price</TableHead>
                    <TableHead className="w-32">Total Price</TableHead>
                    <TableHead className="w-16 no-print"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.lineNumber}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'quantity',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full"
                          data-testid={`input-quantity-${item.lineNumber}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'description',
                              e.target.value
                            )
                          }
                          rows={2}
                          className="w-full"
                          placeholder="Enter detailed description..."
                          data-testid={`input-description-${item.lineNumber}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <span className="mr-1">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateLineItem(
                                item.id,
                                'unitPrice',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full"
                            data-testid={`input-unit-price-${item.lineNumber}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        ${item.totalPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="no-print">
                        {lineItems.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(item.id)}
                            className="text-red-600 hover:text-red-800"
                            data-testid={`button-delete-${item.lineNumber}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="flex justify-end mt-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-8">
                  <span className="text-lg font-semibold">Total</span>
                  <span
                    className="text-2xl font-bold"
                    data-testid="text-grand-total"
                  >
                    ${grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="mb-8">
            <Label className="text-lg font-semibold mb-2 block">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Enter detailed notes about materials, delivery schedule, lead times, etc..."
              className="w-full"
              data-testid="textarea-notes"
            />
          </div>

          {/* Footer */}
          <div className="border-t pt-6 space-y-4">
            <p className="text-center text-sm">
              Thank you for the opportunity to provide this quotation.
            </p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-center text-sm font-semibold">
                This quote has a validity period of
              </p>
              <Input
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-20 text-center"
                data-testid="input-validity-days"
              />
              <span className="text-sm font-semibold">days.</span>
            </div>
          </div>

          {/* Form Footer */}
          <div className="mt-8 text-center text-xs text-gray-500 border-t pt-4">
            FO Form 7 - Version 1.4 07/15/2024
          </div>
        </CardContent>
      </Card>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </div>
  );
}
