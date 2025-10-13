import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, DollarSign, Package } from "lucide-react";
import { format } from "date-fns";

interface FulfilledOrder {
  orderId: string;
  customerId: string;
  customerName?: string;
  orderDate: string;
  updatedAt: string;
  basePrice: number;
  featuresTotal: number;
  shipping: number;
  discountAmount: number;
  orderTotal: number;
  customDiscountType?: string;
  customDiscountValue?: number;
  showCustomDiscount?: boolean;
}

interface ColumnTotals {
  basePrice: number;
  featuresTotal: number;
  shipping: number;
  discountAmount: number;
  orderTotal: number;
}

interface ReportSummary {
  orderCount: number;
  totalAmountDue: number;
  columnTotals: ColumnTotals;
  orders: FulfilledOrder[];
}

const months = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const years = ["2024", "2025", "2026"];

export default function MonthlyFulfilledReport() {
  const [selectedMonth, setSelectedMonth] = useState("9");
  const [selectedYear, setSelectedYear] = useState("2025");

  const { data: reportData, isLoading } = useQuery<ReportSummary>({
    queryKey: ['/api/reports/monthly-fulfilled', selectedMonth, selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/reports/monthly-fulfilled?month=${selectedMonth}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch report');
      return response.json();
    }
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const monthName = months.find(m => m.value === selectedMonth)?.label || "September";

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{monthName} {selectedYear} FULFILLED Orders</h1>
        <p className="text-muted-foreground">
          Financial report showing all orders that were changed to FULFILLED status in {monthName} {selectedYear}
        </p>
      </div>

      {/* Month/Year Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Report Period</CardTitle>
          <CardDescription>Select the month and year to view the report</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-sm font-medium">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger data-testid="select-month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-sm font-medium">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger data-testid="select-year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-orders">{reportData?.orderCount || 0}</div>
            <p className="text-xs text-muted-foreground">Orders fulfilled in {monthName}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount Due</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-amount">
              {formatCurrency(reportData?.totalAmountDue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Combined order value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-average-order">
              {reportData?.orderCount
                ? formatCurrency((reportData.totalAmountDue || 0) / reportData.orderCount)
                : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Per order</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
          <CardDescription>
            Detailed breakdown of all orders fulfilled in {monthName} {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Fulfilled Date</TableHead>
                  <TableHead className="text-right">Base Price</TableHead>
                  <TableHead className="text-right">Features</TableHead>
                  <TableHead className="text-right">Shipping</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
                {/* Column Totals Row */}
                {reportData?.columnTotals && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={4} className="text-right">TOTALS:</TableCell>
                    <TableCell className="text-right" data-testid="total-base-price">
                      {formatCurrency(reportData.columnTotals.basePrice)}
                    </TableCell>
                    <TableCell className="text-right" data-testid="total-features">
                      {formatCurrency(reportData.columnTotals.featuresTotal)}
                    </TableCell>
                    <TableCell className="text-right" data-testid="total-shipping">
                      {formatCurrency(reportData.columnTotals.shipping)}
                    </TableCell>
                    <TableCell className="text-right" data-testid="total-discount">
                      {formatCurrency(reportData.columnTotals.discountAmount)}
                    </TableCell>
                    <TableCell className="text-right" data-testid="total-order-total">
                      {formatCurrency(reportData.columnTotals.orderTotal)}
                    </TableCell>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {reportData?.orders && reportData.orders.length > 0 ? (
                  reportData.orders.map((order) => (
                    <TableRow key={order.orderId} data-testid={`row-order-${order.orderId}`}>
                      <TableCell className="font-medium">{order.orderId}</TableCell>
                      <TableCell>{order.customerId || 'N/A'}</TableCell>
                      <TableCell>
                        {order.orderDate
                          ? format(new Date(order.orderDate), 'MMM d, yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {order.updatedAt
                          ? format(new Date(order.updatedAt), 'MMM d, yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(order.basePrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(order.featuresTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(order.shipping)}
                      </TableCell>
                      <TableCell className="text-right">
                        {order.discountAmount > 0 ? formatCurrency(order.discountAmount) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(order.orderTotal)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No orders found for {monthName} {selectedYear}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
