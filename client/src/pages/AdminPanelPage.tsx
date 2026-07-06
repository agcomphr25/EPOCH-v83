import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit,
  Calendar,
  User,
  Flag,
  FileText,
  Package,
  CreditCard,
  DollarSign,
  Truck,
  Users,
  Clock,
  Shuffle,
} from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { adminFieldConfigs, getFieldsByCategory, canEditField, fieldCategories } from '@shared/adminConfig';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  modelId: string;
  currentDepartment: string;
  status: string | null; // Raw database value for status
  assignedTechnician: string | null; // Raw database value (username)
  urgency: string | null; // Raw database value (lowercase)
  totalPrice: number;
  amountPaid: number;
  balanceDue: number;
  fbOrderNumber: string;
}

interface PaginatedOrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ADMIN_ORDER_PAGE_SIZE = 25;
const ADMIN_ORDER_SORT_BY: Record<string, string> = {
  orderId: 'orderId',
  customerName: 'customer',
  modelId: 'model',
  currentDepartment: 'department',
  orderDate: 'orderDate',
  dueDate: 'dueDate',
};

export default function AdminPanelPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: ADMIN_ORDER_PAGE_SIZE,
  });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, any>>({});
  const { toast } = useToast();

  const departmentFilter = (columnFilters.find((filter) => filter.id === 'currentDepartment')?.value as string | undefined) || 'all';
  const statusFilter = (columnFilters.find((filter) => filter.id === 'status')?.value as string | undefined) || 'all';
  const primarySort = sorting[0];

  const ordersQueryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
      sortBy: ADMIN_ORDER_SORT_BY[primarySort?.id || ''] || 'orderDate',
      sortOrder: primarySort?.desc === false ? 'asc' : 'desc',
    });

    if (globalFilter.trim()) {
      params.set('search', globalFilter.trim());
    }

    if (departmentFilter !== 'all') {
      params.set('department', departmentFilter);
    }

    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }

    return params.toString();
  }, [departmentFilter, globalFilter, pagination.pageIndex, pagination.pageSize, primarySort?.desc, primarySort?.id, statusFilter]);

  // Fetch orders from the full server-side result set, not just the first 100 rows.
  const { data: ordersResponse, isLoading } = useQuery<PaginatedOrdersResponse>({
    queryKey: ['/api/orders/with-payment-status/paginated', ordersQueryParams],
    queryFn: () => apiRequest(`/api/orders/with-payment-status/paginated?${ordersQueryParams}`),
  });
  const orders = ordersResponse?.orders ?? [];
  const totalOrders = ordersResponse?.total ?? 0;
  const totalPages = ordersResponse?.totalPages ?? 0;

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setRowSelection({});
  }, [columnFilters, globalFilter, sorting]);

  // Fetch reference data for inline editing
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });

  const { data: statusTypes = [] } = useQuery<any[]>({
    queryKey: ['/api/orders/reference/status-types'],
  });

  const { data: departmentTypes = [] } = useQuery<any[]>({
    queryKey: ['/api/orders/reference/department-types'],
  });

  // Get the order ID string from the selected row
  const selectedOrderIdString = orders.find(o => o.id === selectedOrderId)?.orderId;

  // Fetch full order details when panel is opened
  const { data: fullOrderData, isLoading: isLoadingOrder } = useQuery<any>({
    queryKey: [`/api/orders/${selectedOrderIdString}`],
    enabled: !!selectedOrderIdString && isPanelOpen,
  });

  // Use full order data if available, otherwise fall back to summary
  const selectedOrder = fullOrderData || orders.find(o => o.id === selectedOrderId);

  // Fetch audit history for selected order
  const { data: auditHistory = [] } = useQuery<any[]>({
    queryKey: [`/api/orders/audit-logs/${selectedOrderIdString}`],
    enabled: !!selectedOrderIdString && isPanelOpen,
  });

  // Mutation for updating individual fields
  const updateFieldMutation = useMutation({
    mutationFn: async ({ orderId, fieldName, value }: { orderId: string; fieldName: string; value: any }) => {
      return await apiRequest(`/api/orders/${orderId}/field`, {
        method: 'PATCH',
        body: { fieldName, value },
      });
    },
    onSuccess: async () => {
      // Force refetch instead of just invalidating
      await queryClient.refetchQueries({ queryKey: ['/api/orders/with-payment-status'] });
      await queryClient.refetchQueries({ queryKey: ['/api/orders/with-payment-status/paginated'] });
      toast({
        title: 'Success',
        description: 'Order field updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update order field',
        variant: 'destructive',
      });
    },
  });

  // NOTE: Columns are intentionally NOT memoized.
  // Editable tables with mutations can cause stale closures when using useMemo.
  // After PATCH + refetch, memoized column renderers may reference old data.
  // This is an intentional EPOCH convention for mutation-driven tables.
  const columns: ColumnDef<Order>[] = [
    {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            data-testid="checkbox-select-all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            data-testid={`checkbox-select-${row.original.orderId}`}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'orderId',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              data-testid="header-orderId"
            >
              Order ID
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <div className="font-medium" data-testid={`text-orderId-${row.original.orderId}`}>
            {row.getValue('orderId')}
          </div>
        ),
      },
      {
        accessorKey: 'fbOrderNumber',
        header: 'FB Order #',
        cell: ({ row }) => (
          <div data-testid={`text-fbOrderNumber-${row.original.orderId}`}>
            {row.getValue('fbOrderNumber') || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              data-testid="header-customerName"
            >
              Customer
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
      },
      {
        accessorKey: 'modelId',
        header: 'Model',
        cell: ({ row }) => (
          <div data-testid={`text-model-${row.original.orderId}`}>
            {row.getValue('modelId')}
          </div>
        ),
      },
      {
        accessorKey: 'currentDepartment',
        header: 'Department',
        cell: ({ row }) => {
          const deptValue = row.getValue('currentDepartment') as string;
          return (
            <Select
              value={deptValue || ''}
              onValueChange={(value) => {
                updateFieldMutation.mutate({
                  orderId: row.original.orderId,
                  fieldName: 'currentDepartment',
                  value: value,
                });
              }}
              disabled={updateFieldMutation.isPending}
              data-testid={`select-department-${row.original.orderId}`}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departmentTypes.map((dept: any) => (
                  <SelectItem key={dept.name} value={dept.name}>
                    {dept.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const statusValue = row.original.status; // Use raw database value
          return (
            <Select
              value={statusValue || ''}
              onValueChange={(value) => {
                console.log('Status change:', { orderId: row.original.orderId, oldValue: statusValue, newValue: value });
                updateFieldMutation.mutate({
                  orderId: row.original.orderId,
                  fieldName: 'status',
                  value,
                });
              }}
              disabled={updateFieldMutation.isPending}
            >
              <SelectTrigger 
                className="w-[150px] h-8" 
                data-testid={`select-status-${row.original.orderId}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusTypes.map((status: any) => (
                  <SelectItem key={status.id} value={status.name}>
                    {status.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'assignedTechnician',
        header: 'Technician',
        cell: ({ row }) => {
          const technicianValue = row.original.assignedTechnician; // Use raw database value (username)
          return (
            <Select
              value={technicianValue || 'unassigned'}
              onValueChange={(value) =>
                updateFieldMutation.mutate({
                  orderId: row.original.orderId,
                  fieldName: 'assignedTechnician',
                  value: value === 'unassigned' ? null : value,
                })
              }
              disabled={updateFieldMutation.isPending}
            >
              <SelectTrigger 
                className="w-[150px] h-8" 
                data-testid={`select-technician-${row.original.orderId}`}
              >
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {employees.map((employee: any) => (
                  <SelectItem key={employee.id} value={employee.username}>
                    {employee.firstName} {employee.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'urgency',
        header: 'Priority',
        cell: ({ row }) => {
          const urgencyValue = row.original.urgency; // Use raw database value (lowercase)
          return (
            <Select
              value={urgencyValue || 'none'}
              onValueChange={(value) =>
                updateFieldMutation.mutate({
                  orderId: row.original.orderId,
                  fieldName: 'urgency',
                  value: value === 'none' ? null : value,
                })
              }
              disabled={updateFieldMutation.isPending}
            >
              <SelectTrigger 
                className="w-[130px] h-8" 
                data-testid={`select-urgency-${row.original.orderId}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: 'dueDate',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              data-testid="header-dueDate"
            >
              Due Date
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const date = row.getValue('dueDate') as string;
          return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
        },
      },
      {
        accessorKey: 'balanceDue',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              data-testid="header-balanceDue"
            >
              Balance Due
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const amount = parseFloat(row.getValue('balanceDue'));
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(amount);
          
          return (
            <div className={amount > 0 ? 'text-red-600 font-medium' : ''} data-testid={`text-balance-${row.original.orderId}`}>
              {formatted}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedOrderId(row.original.id);
                setIsPanelOpen(true);
                setEditedFields({});
              }}
              data-testid={`button-edit-${row.original.orderId}`}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          );
        },
      },
  ];

  const table = useReactTable({
    data: orders,
    columns,
    pageCount: Math.max(totalPages, 1),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination,
    },
  });

  const selectedOrders = table.getSelectedRowModel().rows;
  const firstVisibleOrder = totalOrders === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastVisibleOrder = Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalOrders);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Admin Panel - Order Management</CardTitle>
          <p className="text-sm text-muted-foreground">
            View and manage all orders with advanced filtering and bulk operations
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Order ID, FB #, Customer, Customer PO, Customer ID, or Model..."
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            
            <Select
              value={(table.getColumn('currentDepartment')?.getFilterValue() as string) ?? 'ALL'}
              onValueChange={(value) =>
                table.getColumn('currentDepartment')?.setFilterValue(value === 'ALL' ? undefined : value)
              }
            >
              <SelectTrigger className="w-[200px]" data-testid="select-department">
                <SelectValue placeholder="Filter by Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                <SelectItem value="Layup">Layup</SelectItem>
                <SelectItem value="Finish">Finish</SelectItem>
                <SelectItem value="Gunsmith">Gunsmith</SelectItem>
                <SelectItem value="Paint">Paint</SelectItem>
                <SelectItem value="QC">QC</SelectItem>
                <SelectItem value="Shipping">Shipping</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={(table.getColumn('status')?.getFilterValue() as string) ?? 'ALL'}
              onValueChange={(value) =>
                table.getColumn('status')?.setFilterValue(value === 'ALL' ? undefined : value)
              }
            >
              <SelectTrigger className="w-[200px]" data-testid="select-status">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {statusTypes.map((status: any) => (
                  <SelectItem key={status.id} value={status.name}>
                    {status.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions */}
          {selectedOrders.length > 0 && (
            <div className="bg-muted p-3 rounded-md flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedOrders.length} order(s) selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" data-testid="button-bulk-assign">
                  Bulk Assign Technician
                </Button>
                <Button variant="outline" size="sm" data-testid="button-bulk-status">
                  Bulk Update Status
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => table.resetRowSelection()}
                  data-testid="button-clear-selection"
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      Loading orders...
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      data-testid={`row-order-${row.original.orderId}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span>No orders found.</span>
                        {globalFilter && (
                          <Link
                            href={`/order-department-transfer?orderId=${encodeURIComponent(globalFilter)}`}
                            className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 underline underline-offset-2"
                          >
                            <Shuffle className="h-3 w-3" />
                            Can't find this order? Try the Department Transfer tool
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {firstVisibleOrder} to {lastVisibleOrder} of {totalOrders} orders
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                data-testid="button-first-page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                data-testid="button-last-page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Side Panel for Detailed Editing */}
      <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Order {selectedOrder?.orderId || ''}</SheetTitle>
            <SheetDescription>
              Make changes to order details. Changes are saved immediately when you click Update.
            </SheetDescription>
          </SheetHeader>

          {isLoadingOrder ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground">Loading order details...</p>
              </div>
            </div>
          ) : selectedOrder ? (
            <div className="space-y-6 mt-6">
              {/* Customer & Order Info Summary */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Customer:</span>
                  <span className="text-sm">{orders.find(o => o.id === selectedOrderId)?.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Model:</span>
                  <span className="text-sm">{selectedOrder.modelId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Order Date:</span>
                  <span className="text-sm">{selectedOrder.orderDate ? format(new Date(selectedOrder.orderDate), 'MMM dd, yyyy') : '-'}</span>
                </div>
              </div>

              {/* Editable Fields by Category */}
              <ScrollArea className="h-[500px] pr-4">
                {fieldCategories.map((category) => {
                  const fieldsInCategory = Object.entries(adminFieldConfigs)
                    .filter(([_, config]) => config.category === category.id)
                    .map(([key, config]) => ({ key, ...config }));

                  if (fieldsInCategory.length === 0) return null;

                  return (
                    <div key={category.id} className="mb-6">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <span>{category.label}</span>
                      </h3>
                      <div className="space-y-4">
                        {fieldsInCategory.map((field) => {
                          const orderData = selectedOrder as any;
                          const currentValue = editedFields[field.key] ?? orderData?.[field.dbField] ?? orderData?.[field.key];
                          
                          return (
                            <div key={field.key} className="space-y-2">
                              <Label htmlFor={field.key} className="text-sm">
                                {field.label}
                                {field.description && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({field.description})
                                  </span>
                                )}
                              </Label>
                              
                              {/* Render field based on type */}
                              {field.type === 'text' && (
                                <Input
                                  id={field.key}
                                  value={currentValue ?? ''}
                                  onChange={(e) => setEditedFields({ ...editedFields, [field.key]: e.target.value })}
                                  data-testid={`input-${field.key}`}
                                />
                              )}

                              {field.type === 'textarea' && (
                                <Textarea
                                  id={field.key}
                                  value={currentValue ?? ''}
                                  onChange={(e) => setEditedFields({ ...editedFields, [field.key]: e.target.value })}
                                  rows={3}
                                  data-testid={`textarea-${field.key}`}
                                />
                              )}

                              {field.type === 'number' && (
                                <Input
                                  id={field.key}
                                  type="number"
                                  value={currentValue ?? ''}
                                  onChange={(e) => setEditedFields({ ...editedFields, [field.key]: parseFloat(e.target.value) || 0 })}
                                  data-testid={`input-${field.key}`}
                                />
                              )}

                              {field.type === 'boolean' && (
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={field.key}
                                    checked={currentValue ?? false}
                                    onCheckedChange={(checked) => setEditedFields({ ...editedFields, [field.key]: checked })}
                                    data-testid={`switch-${field.key}`}
                                  />
                                </div>
                              )}

                              {field.type === 'date' && (
                                <Input
                                  id={field.key}
                                  type="date"
                                  value={editedFields[field.key] ?? (currentValue ? new Date(currentValue).toISOString().split('T')[0] : '')}
                                  onChange={(e) => setEditedFields({ ...editedFields, [field.key]: e.target.value })}
                                  data-testid={`input-${field.key}`}
                                />
                              )}

                              {field.type === 'select' && Array.isArray(field.options) && (
                                <Select
                                  value={currentValue ?? ''}
                                  onValueChange={(value) => setEditedFields({ ...editedFields, [field.key]: value })}
                                >
                                  <SelectTrigger data-testid={`select-${field.key}`}>
                                    <SelectValue placeholder="Select option..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {field.options.map((option: string) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}

                              {field.type === 'select' && field.options === 'statuses' && (
                                <Select
                                  value={currentValue ?? ''}
                                  onValueChange={(value) => setEditedFields({ ...editedFields, [field.key]: value })}
                                >
                                  <SelectTrigger data-testid={`select-${field.key}`}>
                                    <SelectValue placeholder="Select status..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {statusTypes.map((status: any) => (
                                      <SelectItem key={status.id} value={status.name}>
                                        {status.displayName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}

                              {field.type === 'select' && field.options === 'departments' && (
                                <Select
                                  value={currentValue ?? ''}
                                  onValueChange={(value) => setEditedFields({ ...editedFields, [field.key]: value })}
                                >
                                  <SelectTrigger data-testid={`select-${field.key}`}>
                                    <SelectValue placeholder="Select department..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {departmentTypes.map((dept: any) => (
                                      <SelectItem key={dept.id} value={dept.name}>
                                        {dept.displayName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}

                              {field.type === 'technician-select' && (
                                <Select
                                  value={currentValue ?? 'unassigned'}
                                  onValueChange={(value) => setEditedFields({ ...editedFields, [field.key]: value === 'unassigned' ? null : value })}
                                >
                                  <SelectTrigger data-testid={`select-${field.key}`}>
                                    <SelectValue placeholder="Select technician..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {employees.map((employee: any) => (
                                      <SelectItem key={employee.id} value={employee.username}>
                                        {employee.firstName} {employee.lastName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <Separator className="mt-6" />
                    </div>
                  );
                })}

                {/* Audit History */}
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Audit History
                  </h3>
                  {auditHistory.length > 0 ? (
                    <div className="space-y-3">
                      {auditHistory.map((log: any) => (
                        <div key={log.id} className="border rounded-lg p-3 space-y-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-medium text-sm">{log.fieldLabel || log.fieldName}</span>
                              <div className="text-xs text-muted-foreground">
                                Changed by {log.changedBy} on {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm')}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 text-xs">
                            <div className="flex-1">
                              <span className="text-muted-foreground">Old:</span>
                              <div className="font-mono bg-muted/50 p-1 rounded">
                                {JSON.stringify(log.oldValue)}
                              </div>
                            </div>
                            <div className="flex-1">
                              <span className="text-muted-foreground">New:</span>
                              <div className="font-mono bg-muted/50 p-1 rounded">
                                {JSON.stringify(log.newValue)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
                  )}
                </div>
              </ScrollArea>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={async () => {
                    try {
                      // Update all edited fields
                      for (const [fieldKey, value] of Object.entries(editedFields)) {
                        await updateFieldMutation.mutateAsync({
                          orderId: selectedOrderIdString!,
                          fieldName: fieldKey,
                          value,
                        });
                      }
                      
                      // Force refresh the order list and full order data
                      await queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
                      await queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status/paginated'] });
                      await queryClient.invalidateQueries({ queryKey: [`/api/orders/${selectedOrderIdString}`] });
                      
                      setIsPanelOpen(false);
                      setEditedFields({});
                    } catch (error) {
                      // Error already handled by mutation onError
                      console.error('Save failed:', error);
                    }
                  }}
                  disabled={Object.keys(editedFields).length === 0 || updateFieldMutation.isPending}
                  data-testid="button-save-changes"
                >
                  {updateFieldMutation.isPending ? 'Saving...' : `Save ${Object.keys(editedFields).length} Change(s)`}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsPanelOpen(false);
                    setEditedFields({});
                  }}
                  data-testid="button-cancel-changes"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No order selected</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
