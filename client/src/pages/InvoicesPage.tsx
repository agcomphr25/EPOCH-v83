import { useState } from 'react';
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
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
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : invoices && invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setLocation(`/finance/invoices/${invoice.id}`)}
                  >
                    <TableCell className="font-medium">
                      {invoice.customerName || invoice.customerId}
                    </TableCell>
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
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No invoices found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
