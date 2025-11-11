import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';
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
  Search, 
  ChevronLeft, 
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { format } from 'date-fns';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  modelId: string;
  currentDepartment: string;
  currentStatus: string;
  assignedTechnician: string | null;
  urgency: string | null;
  totalPrice: number;
  amountPaid: number;
  balanceDue: number;
  fbOrderNumber: string;
}

export default function AdminPanelPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  // Fetch orders
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  // Define columns
  const columns = useMemo<ColumnDef<Order>[]>(
    () => [
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
        cell: ({ row }) => (
          <Badge variant="outline" data-testid={`badge-department-${row.original.orderId}`}>
            {row.getValue('currentDepartment')}
          </Badge>
        ),
      },
      {
        accessorKey: 'currentStatus',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="secondary" data-testid={`badge-status-${row.original.orderId}`}>
            {row.getValue('currentStatus')}
          </Badge>
        ),
      },
      {
        accessorKey: 'assignedTechnician',
        header: 'Technician',
        cell: ({ row }) => (
          <div data-testid={`text-technician-${row.original.orderId}`}>
            {row.getValue('assignedTechnician') || 'Unassigned'}
          </div>
        ),
      },
      {
        accessorKey: 'urgency',
        header: 'Priority',
        cell: ({ row }) => {
          const urgency = row.getValue('urgency') as string | null;
          if (!urgency || urgency === 'none') return <span>-</span>;
          
          const variant = urgency === 'critical' || urgency === 'high' 
            ? 'destructive' 
            : urgency === 'medium' 
            ? 'default' 
            : 'secondary';
          
          return (
            <Badge variant={variant} data-testid={`badge-urgency-${row.original.orderId}`}>
              {urgency}
            </Badge>
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
    ],
    []
  );

  const table = useReactTable({
    data: orders,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const orderId = row.getValue('orderId') as string;
      const fbOrderNumber = row.getValue('fbOrderNumber') as string;
      const customerName = row.getValue('customerName') as string;
      
      return (
        orderId?.toLowerCase().includes(search) ||
        fbOrderNumber?.toLowerCase().includes(search) ||
        customerName?.toLowerCase().includes(search)
      );
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  const selectedOrders = table.getFilteredSelectedRowModel().rows;

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
                placeholder="Search orders by Order ID, FB Number, or Customer..."
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            
            <Select
              value={(table.getColumn('currentDepartment')?.getFilterValue() as string) ?? ''}
              onValueChange={(value) =>
                table.getColumn('currentDepartment')?.setFilterValue(value || undefined)
              }
            >
              <SelectTrigger className="w-[200px]" data-testid="select-department">
                <SelectValue placeholder="Filter by Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Departments</SelectItem>
                <SelectItem value="Layup">Layup</SelectItem>
                <SelectItem value="Finish">Finish</SelectItem>
                <SelectItem value="Gunsmith">Gunsmith</SelectItem>
                <SelectItem value="Paint">Paint</SelectItem>
                <SelectItem value="QC">QC</SelectItem>
                <SelectItem value="Shipping">Shipping</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={(table.getColumn('currentStatus')?.getFilterValue() as string) ?? ''}
              onValueChange={(value) =>
                table.getColumn('currentStatus')?.setFilterValue(value || undefined)
              }
            >
              <SelectTrigger className="w-[200px]" data-testid="select-status">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="In Production">In Production</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Shipped">Shipped</SelectItem>
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
                      No orders found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{' '}
              of {table.getFilteredRowModel().rows.length} orders
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
    </div>
  );
}
