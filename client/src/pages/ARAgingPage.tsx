import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, AlertTriangle, FileText, Clock } from 'lucide-react';

interface AgingSummary {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total_ar: number;
}

interface CustomerAging {
  customerId: string;
  customerName: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

function fmt(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function AgingBucketCard({
  label,
  amount,
  icon,
  variant,
}: {
  label: string;
  amount: number;
  icon: typeof DollarSign;
  variant: 'default' | 'warning' | 'danger' | 'success';
}) {
  const Icon = icon;
  const colorMap = {
    default: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <Card className={`border ${colorMap[variant]}`}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">
              {label}
            </p>
            <p className="text-xl font-bold mt-1">{fmt(amount)}</p>
          </div>
          <Icon className="h-8 w-8 opacity-40" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ARAgingPage() {
  const [, navigate] = useLocation();

  const { data: aging, isLoading: loadingAging } = useQuery<AgingSummary>({
    queryKey: ['/api/ar-invoices/aging'],
  });

  const { data: byCustomer = [], isLoading: loadingCustomers } = useQuery<CustomerAging[]>({
    queryKey: ['/api/ar-invoices/aging/by-customer'],
  });

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Accounts Receivable Aging</h1>
        <p className="text-muted-foreground mt-1">
          Outstanding invoice balances by aging period
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {loadingAging ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3 px-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))
        ) : aging ? (
          <>
            <AgingBucketCard
              label="Current"
              amount={aging.current}
              icon={DollarSign}
              variant="success"
            />
            <AgingBucketCard
              label="1-30 Days"
              amount={aging.days_1_30}
              icon={Clock}
              variant="default"
            />
            <AgingBucketCard
              label="31-60 Days"
              amount={aging.days_31_60}
              icon={Clock}
              variant="warning"
            />
            <AgingBucketCard
              label="61-90 Days"
              amount={aging.days_61_90}
              icon={AlertTriangle}
              variant="warning"
            />
            <AgingBucketCard
              label="90+ Days"
              amount={aging.days_90_plus}
              icon={AlertTriangle}
              variant="danger"
            />
            <AgingBucketCard
              label="Total AR"
              amount={aging.total_ar}
              icon={FileText}
              variant="default"
            />
          </>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aging by Customer</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCustomers ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : byCustomer.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No outstanding invoices
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">1-30</TableHead>
                  <TableHead className="text-right">31-60</TableHead>
                  <TableHead className="text-right">61-90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCustomer.map((customer) => (
                  <TableRow
                    key={customer.customerId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      navigate(`/finance/invoices?customerId=${customer.customerId}`)
                    }
                  >
                    <TableCell className="font-medium">
                      {customer.customerName || customer.customerId}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.current > 0 ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {fmt(customer.current)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.days_1_30 > 0 ? fmt(customer.days_1_30) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.days_31_60 > 0 ? (
                        <span className="text-yellow-600 font-medium">{fmt(customer.days_31_60)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.days_61_90 > 0 ? (
                        <span className="text-orange-600 font-medium">{fmt(customer.days_61_90)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.days_90_plus > 0 ? (
                        <span className="text-red-600 font-bold">{fmt(customer.days_90_plus)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(customer.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {byCustomer.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(byCustomer.reduce((s, c) => s + c.current, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(byCustomer.reduce((s, c) => s + c.days_1_30, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(byCustomer.reduce((s, c) => s + c.days_31_60, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(byCustomer.reduce((s, c) => s + c.days_61_90, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(byCustomer.reduce((s, c) => s + c.days_90_plus, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {fmt(byCustomer.reduce((s, c) => s + c.total, 0))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
