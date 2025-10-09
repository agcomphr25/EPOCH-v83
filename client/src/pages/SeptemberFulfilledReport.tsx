import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, DollarSign, Package, Calendar } from "lucide-react";
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
  orderTotal: number;
  customDiscountType?: string;
  customDiscountValue?: number;
  showCustomDiscount?: boolean;
}

interface ReportSummary {
  orderCount: number;
  totalAmountDue: number;
  orders: FulfilledOrder[];
}

export default function SeptemberFulfilledReport() {
  const { data: reportData, isLoading } = useQuery<ReportSummary>({
    queryKey: ['/api/reports/september-fulfilled-2025'],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-96" />
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
        <h1 className="text-3xl font-bold tracking-tight">September 2025 FULFILLED Orders</h1>
        <p className="text-muted-foreground">
          Financial report showing all orders that were changed to FULFILLED status in September 2025
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData?.orderCount || 0}</div>
            <p className="text-xs text-muted-foreground">Orders fulfilled in September</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount Due</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
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
            <div className="text-2xl font-bold">
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
            Detailed breakdown of all orders fulfilled in September 2025
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
              </TableHeader>
              <TableBody>
                {reportData?.orders && reportData.orders.length > 0 ? (
                  reportData.orders.map((order) => (
                    <TableRow key={order.orderId}>
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
                        {order.showCustomDiscount && order.customDiscountValue
                          ? order.customDiscountType === 'percent'
                            ? `${order.customDiscountValue}%`
                            : formatCurrency(order.customDiscountValue)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(order.orderTotal)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No orders found for September 2025
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
