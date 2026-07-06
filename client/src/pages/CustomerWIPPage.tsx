import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Calendar, ExternalLink, PackageSearch, Printer, Search } from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type WipCustomer = {
  customerId: string;
  customerName: string;
  wipCount: number;
};

type CustomerWipItem = {
  orderId: string;
  fbOrderNumber: string | null;
  customerId: string;
  customerName: string;
  poNumber: string | null;
  stockOrderIdentifier: string;
  stockModel: string;
  currentDepartment: string;
  dueDate: string;
};

type GroupedWip = Record<string, Record<string, CustomerWipItem[]>>;

const EMPTY_WIP_ITEMS: CustomerWipItem[] = [];

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function getGroupLabel(item: CustomerWipItem) {
  return item.poNumber || item.fbOrderNumber || item.orderId;
}

function dateOnly(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function CustomerWIPPage() {
  const [, setLocation] = useLocation();
  const [customerSearch, setCustomerSearch] = React.useState('');
  const [selectedCustomerId, setSelectedCustomerId] = React.useState('');
  const [departmentFilter, setDepartmentFilter] = React.useState('all');
  const [stockModelFilter, setStockModelFilter] = React.useState('all');
  const [dueStart, setDueStart] = React.useState('');
  const [dueEnd, setDueEnd] = React.useState('');

  const { data: customers = [], isLoading: customersLoading } = useQuery<WipCustomer[]>({
    queryKey: ['/api/orders/customer-wip/customers'],
    queryFn: () => apiRequest('/api/orders/customer-wip/customers'),
  });

  const selectedCustomer = customers.find((customer) => customer.customerId === selectedCustomerId) || null;

  const { data: wipResponse, isLoading: wipLoading } = useQuery<{ customerId: string; items: CustomerWipItem[] }>({
    queryKey: ['/api/orders/customer-wip', selectedCustomerId],
    queryFn: () => apiRequest(`/api/orders/customer-wip?customerId=${encodeURIComponent(selectedCustomerId)}`),
    enabled: !!selectedCustomerId,
  });

  const allItems = wipResponse?.items || EMPTY_WIP_ITEMS;

  React.useEffect(() => {
    setDepartmentFilter('all');
    setStockModelFilter('all');
    setDueStart('');
    setDueEnd('');
  }, [selectedCustomerId]);

  const filteredCustomers = React.useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      `${customer.customerName} ${customer.customerId}`.toLowerCase().includes(term)
    );
  }, [customers, customerSearch]);

  const departments = React.useMemo(
    () => Array.from(new Set(allItems.map((item) => item.currentDepartment).filter(Boolean))).sort(),
    [allItems]
  );

  const stockModels = React.useMemo(
    () => Array.from(new Set(allItems.map((item) => item.stockModel).filter(Boolean))).sort(),
    [allItems]
  );

  const filteredItems = React.useMemo(() => {
    return allItems.filter((item) => {
      if (departmentFilter !== 'all' && item.currentDepartment !== departmentFilter) return false;
      if (stockModelFilter !== 'all' && item.stockModel !== stockModelFilter) return false;

      const due = dateOnly(item.dueDate);
      if (dueStart && (!due || due < dueStart)) return false;
      if (dueEnd && (!due || due > dueEnd)) return false;

      return true;
    });
  }, [allItems, departmentFilter, dueEnd, dueStart, stockModelFilter]);

  const departmentCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    filteredItems.forEach((item) => {
      counts.set(item.currentDepartment, (counts.get(item.currentDepartment) || 0) + 1);
    });
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const groupedItems = React.useMemo(() => {
    return filteredItems.reduce<GroupedWip>((acc, item) => {
      const group = getGroupLabel(item);
      const department = item.currentDepartment || 'Unknown Department';
      acc[group] ||= {};
      acc[group][department] ||= [];
      acc[group][department].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const openOrder = (orderId: string) => {
    setLocation(`/order-entry?draft=${encodeURIComponent(orderId)}`);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <style>{`
        @media print {
          body { background: white !important; }
          .customer-wip-print-hide { display: none !important; }
          .customer-wip-print-page { padding: 0 !important; }
          .customer-wip-print-card { border: 0 !important; box-shadow: none !important; }
          .customer-wip-print-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between customer-wip-print-hide">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Customer WIP</h1>
          <p className="text-sm text-muted-foreground">
            P1 unfinished production work by customer, PO, and current department.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.print()}
          disabled={!selectedCustomerId || filteredItems.length === 0}
          className="gap-2"
          data-testid="button-print-customer-wip"
        >
          <Printer className="h-4 w-4" />
          Print / PDF
        </Button>
      </div>

      <Card className="customer-wip-print-hide">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackageSearch className="h-5 w-5" />
            Customer
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(220px,360px)_minmax(260px,520px)]">
          <div className="space-y-2">
            <Label htmlFor="customer-search">Search Customers</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="customer-search"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Type customer name..."
                className="pl-9"
                data-testid="input-customer-wip-search"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Select Customer With Active WIP</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger data-testid="select-customer-wip-customer">
                <SelectValue placeholder={customersLoading ? 'Loading customers...' : 'Select customer...'} />
              </SelectTrigger>
              <SelectContent>
                {filteredCustomers.map((customer) => (
                  <SelectItem key={customer.customerId} value={customer.customerId}>
                    {customer.customerName} ({customer.wipCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedCustomerId ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground customer-wip-print-hide">
          Select a customer to view unfinished P1 work in process.
        </div>
      ) : (
        <div className="space-y-6 customer-wip-print-page">
          <div className="flex flex-col gap-2 print:block">
            <div className="hidden print:block">
              <h1 className="text-2xl font-bold">Customer WIP</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold">{selectedCustomer?.customerName || 'Selected Customer'}</h2>
              <Badge variant="secondary">{filteredItems.length} unfinished P1 items</Badge>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              {departmentCounts.map(([department, count]) => (
                <span key={department} className="rounded border px-2 py-1">
                  {department}: <span className="font-medium text-foreground">{count}</span>
                </span>
              ))}
            </div>
          </div>

          <Card className="customer-wip-print-hide">
            <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger data-testid="select-customer-wip-department">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stock Model</Label>
                <Select value={stockModelFilter} onValueChange={setStockModelFilter}>
                  <SelectTrigger data-testid="select-customer-wip-stock-model">
                    <SelectValue placeholder="Stock model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock Models</SelectItem>
                    {stockModels.map((stockModel) => (
                      <SelectItem key={stockModel} value={stockModel}>
                        {stockModel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-start">Due From</Label>
                <Input
                  id="due-start"
                  type="date"
                  value={dueStart}
                  onChange={(event) => setDueStart(event.target.value)}
                  data-testid="input-customer-wip-due-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-end">Due Through</Label>
                <Input
                  id="due-end"
                  type="date"
                  value={dueEnd}
                  onChange={(event) => setDueEnd(event.target.value)}
                  data-testid="input-customer-wip-due-end"
                />
              </div>
            </CardContent>
          </Card>

          {wipLoading ? (
            <div className="rounded-lg border p-8 text-center text-muted-foreground">Loading customer WIP...</div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-muted-foreground">
              No unfinished P1 WIP matches the current filters.
            </div>
          ) : (
            Object.entries(groupedItems).map(([groupLabel, departmentsForGroup]) => (
              <Card key={groupLabel} className="customer-wip-print-card customer-wip-print-break">
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                    <span>{groupLabel}</span>
                    <Badge variant="outline">
                      {Object.values(departmentsForGroup).reduce((sum, rows) => sum + rows.length, 0)} items
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {Object.entries(departmentsForGroup).map(([department, rows]) => (
                    <div key={`${groupLabel}-${department}`} className="space-y-2 customer-wip-print-break">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{department}</h3>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>PO</TableHead>
                            <TableHead>Stock / Order</TableHead>
                            <TableHead>Stock Model</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="w-10 customer-wip-print-hide" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((item) => (
                            <TableRow
                              key={item.orderId}
                              interactive
                              onClick={() => openOrder(item.orderId)}
                              data-testid={`row-customer-wip-${item.orderId}`}
                            >
                              <TableCell>{item.poNumber || '-'}</TableCell>
                              <TableCell className="font-medium">{item.stockOrderIdentifier}</TableCell>
                              <TableCell>{item.stockModel}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground customer-wip-print-hide" />
                                  {formatDate(item.dueDate)}
                                </span>
                              </TableCell>
                              <TableCell className="customer-wip-print-hide">
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
