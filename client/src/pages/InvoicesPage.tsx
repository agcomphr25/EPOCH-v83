import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, FileText, DollarSign } from 'lucide-react';

type Invoice = {
  id: string;
  customerId: string;
  customerName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: string;
  status: string;
};

type Customer = {
  customerId: string;
  customerName: string;
};

type CustomerGroup = {
  customerId: string;
  customerName: string;
  invoices: Invoice[];
  total: number;
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'OPEN':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Open</Badge>;
    case 'PAID':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
    case 'OVERDUE':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>;
    case 'VOID':
      return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Void</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
}

type StatusGroup = {
  status: string;
  invoices: Invoice[];
  total: number;
};

const STATUS_ORDER = ['OVERDUE', 'OPEN', 'PAID', 'VOID'];

function groupByStatus(invoices: Invoice[]): StatusGroup[] {
  const map = new Map<string, StatusGroup>();
  for (const inv of invoices) {
    const key = inv.status;
    if (!map.has(key)) {
      map.set(key, { status: key, invoices: [], total: 0 });
    }
    const group = map.get(key)!;
    group.invoices.push(inv);
    group.total += parseFloat(inv.totalAmount) || 0;
  }
  for (const group of map.values()) {
    group.invoices.sort((a, b) => {
      const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
      const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
      return da - db;
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a.status);
    const ib = STATUS_ORDER.indexOf(b.status);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function groupByCustomer(invoices: Invoice[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const inv of invoices) {
    const key = inv.customerId;
    if (!map.has(key)) {
      map.set(key, {
        customerId: inv.customerId,
        customerName: inv.customerName || inv.customerId,
        invoices: [],
        total: 0,
      });
    }
    const group = map.get(key)!;
    group.invoices.push(inv);
    group.total += parseFloat(inv.totalAmount) || 0;
  }
  return Array.from(map.values());
}

export default function InvoicesPage() {
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const [statusFilter, setStatusFilter] = useState(urlParams.get('status') || 'all');
  const [customerFilter, setCustomerFilter] = useState(urlParams.get('customerId') || 'all');
  const [searchTerm, setSearchTerm] = useState(urlParams.get('search') || '');

  const queryParams = new URLSearchParams();
  if (statusFilter && statusFilter !== 'all') queryParams.set('status', statusFilter);
  if (customerFilter && customerFilter !== 'all') queryParams.set('customerId', customerFilter);
  if (searchTerm) queryParams.set('search', searchTerm);
  const queryString = queryParams.toString();
  const fetchUrl = '/api/ar-invoices' + (queryString ? `?${queryString}` : '');

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/ar-invoices', { status: statusFilter, customerId: customerFilter, search: searchTerm }],
    queryFn: () => fetch(fetchUrl, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const customerGroups = invoices ? groupByCustomer(invoices) : [];

  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const customerGroupKey = customerGroups.map((g) => g.customerId).join('|');

  useEffect(() => {
    if (customerGroups.length === 1) {
      setOpenAccordions([customerGroups[0].customerId]);
    } else {
      setOpenAccordions((prev) => prev.filter((id) => customerGroups.some((g) => g.customerId === id)));
    }
  }, [customerGroupKey]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Invoices</h1>
        </div>
        <Button onClick={() => setLocation('/finance/invoices/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by invoice number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers?.map((c) => (
                  <SelectItem key={c.customerId} value={c.customerId}>
                    {c.customerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : customerGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No invoices found</div>
          ) : (
            <Accordion
              type="multiple"
              value={openAccordions}
              onValueChange={setOpenAccordions}
              className="divide-y"
            >
              {customerGroups.map((group) => (
                <AccordionItem
                  key={group.customerId}
                  value={group.customerId}
                  className="border-0"
                >
                  <AccordionTrigger className="px-4 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="flex items-center gap-4 text-left">
                      <span className="font-semibold text-base">{group.customerName}</span>
                      <span className="text-sm text-muted-foreground">
                        {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatCurrency(group.total)}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <Accordion type="multiple" defaultValue={[]} className="divide-y border-t">
                      {groupByStatus(group.invoices).map((statusGroup) => (
                        <AccordionItem
                          key={statusGroup.status}
                          value={statusGroup.status}
                          className="border-0"
                        >
                          <AccordionTrigger className="px-6 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800">
                            <div className="flex items-center gap-4 text-left">
                              {getStatusBadge(statusGroup.status)}
                              <span className="text-sm text-muted-foreground">
                                {statusGroup.invoices.length} invoice{statusGroup.invoices.length !== 1 ? 's' : ''}
                              </span>
                              <span className="text-sm font-medium text-muted-foreground">
                                {formatCurrency(statusGroup.total)}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Invoice #</TableHead>
                                  <TableHead>Invoice Date</TableHead>
                                  <TableHead>Due Date</TableHead>
                                  <TableHead className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <DollarSign className="h-4 w-4" />
                                      Amount
                                    </div>
                                  </TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {statusGroup.invoices.map((invoice) => (
                                  <TableRow
                                    key={invoice.id}
                                    className="cursor-pointer hover:bg-gray-50"
                                    onClick={() => setLocation(`/finance/invoices/${invoice.id}`)}
                                  >
                                    <TableCell>{invoice.invoiceNumber}</TableCell>
                                    <TableCell>
                                      {invoice.invoiceDate
                                        ? format(new Date(invoice.invoiceDate), 'MM/dd/yyyy')
                                        : '—'}
                                    </TableCell>
                                    <TableCell>
                                      {invoice.dueDate
                                        ? format(new Date(invoice.dueDate), 'MM/dd/yyyy')
                                        : '—'}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatCurrency(invoice.totalAmount)}
                                    </TableCell>
                                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
