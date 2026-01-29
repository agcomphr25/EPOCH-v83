import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
} from '@tanstack/react-table';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  QrCode,
  Copy,
  ExternalLink,
  Ban,
  RotateCcw,
  History,
  Check,
  X,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';

interface QRCode {
  id: string;
  publicCode: string;
  entityType: string;
  entityIdentifier: string;
  label: string | null;
  description: string | null;
  isActive: boolean;
  expiresAt: string | null;
  environment: string;
  resolveUrl: string | null;
  metadata: Record<string, any> | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  disabledByUserId: number | null;
  disabledReason: string | null;
  createdByUser?: { id: number; username: string } | null;
}

interface QRScanLog {
  id: string;
  qrCodeId: string;
  publicCode: string;
  scannedByUserId: number | null;
  scanResult: string;
  resolvedUrl: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  scannedAt: string;
  scannedByUser?: { id: number; username: string } | null;
}

interface Stats {
  totalQRCodes: number;
  activeQRCodes: number;
  totalScans: number;
  successfulScans: number;
}

const ENTITY_TYPES = [
  { value: 'order', label: 'Order' },
  { value: 'inventory_item', label: 'Inventory Item' },
  { value: 'employee', label: 'Employee' },
  { value: 'mandrel', label: 'Mandrel' },
  { value: 'oven', label: 'Oven' },
  { value: 'timer_program', label: 'Timer Program' },
  { value: 'document', label: 'Document' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'material_lot', label: 'Material Lot' },
  { value: 'custom', label: 'Custom' },
];

export default function QRCodeAdminPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedQRCode, setSelectedQRCode] = useState<QRCode | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [disableReason, setDisableReason] = useState('');
  const { toast } = useToast();

  const [newQRCode, setNewQRCode] = useState({
    entityType: '',
    entityIdentifier: '',
    label: '',
    description: '',
    expiresAt: '',
    resolveUrl: '',
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['/api/qr-codes/meta/stats'],
  });

  const buildQRCodesUrl = () => {
    const params = new URLSearchParams();
    if (entityTypeFilter && entityTypeFilter !== 'all') params.append('entityType', entityTypeFilter);
    if (activeFilter && activeFilter !== 'all') params.append('isActive', activeFilter);
    if (globalFilter) params.append('search', globalFilter);
    const queryString = params.toString();
    return queryString ? `/api/qr-codes?${queryString}` : '/api/qr-codes';
  };

  const { data: qrCodesResponse, isLoading } = useQuery<{
    data: QRCode[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: [buildQRCodesUrl()],
  });

  const qrCodes = qrCodesResponse?.data || [];

  const { data: scanHistoryResponse } = useQuery<{
    data: QRScanLog[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: [`/api/qr-codes/${selectedQRCode?.id}/scan-history`],
    enabled: !!selectedQRCode?.id && isPanelOpen,
  });

  const scanHistory = scanHistoryResponse?.data || [];

  const createMutation = useMutation({
    mutationFn: async (data: typeof newQRCode) => {
      return await apiRequest('/api/qr-codes', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          expiresAt: data.expiresAt || null,
          resolveUrl: data.resolveUrl || null,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/qr-codes');
        }
      });
      setIsCreateDialogOpen(false);
      setNewQRCode({
        entityType: '',
        entityIdentifier: '',
        label: '',
        description: '',
        expiresAt: '',
        resolveUrl: '',
      });
      toast({
        title: 'QR Code Created',
        description: `Code: ${data.publicCode}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create QR code',
        variant: 'destructive',
      });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest(`/api/qr-codes/${id}/disable`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/qr-codes');
        }
      });
      setIsDisableDialogOpen(false);
      setDisableReason('');
      setSelectedQRCode(null);
      setIsPanelOpen(false);
      toast({
        title: 'QR Code Disabled',
        description: 'The QR code has been disabled.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disable QR code',
        variant: 'destructive',
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/qr-codes/${id}/reactivate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/qr-codes');
        }
      });
      toast({
        title: 'QR Code Reactivated',
        description: 'The QR code is now active again.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reactivate QR code',
        variant: 'destructive',
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  const getQRUrl = (publicCode: string) => {
    return `${window.location.origin}/qr/${publicCode}`;
  };

  const columns: ColumnDef<QRCode>[] = useMemo(() => [
    {
      accessorKey: 'publicCode',
      header: 'Code',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-gray-400" />
          <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
            {row.original.publicCode}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(getQRUrl(row.original.publicCode));
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      accessorKey: 'entityType',
      header: 'Entity Type',
      cell: ({ row }) => (
        <Badge variant="outline">
          {ENTITY_TYPES.find(t => t.value === row.original.entityType)?.label || row.original.entityType}
        </Badge>
      ),
    },
    {
      accessorKey: 'entityIdentifier',
      header: 'Entity ID',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.entityIdentifier}</span>
      ),
    },
    {
      accessorKey: 'label',
      header: 'Label',
      cell: ({ row }) => row.original.label || <span className="text-gray-400">-</span>,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => {
        const isExpired = row.original.expiresAt && new Date(row.original.expiresAt) < new Date();
        if (!row.original.isActive) {
          return <Badge variant="destructive">Disabled</Badge>;
        }
        if (isExpired) {
          return <Badge variant="secondary">Expired</Badge>;
        }
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      },
    },
    {
      accessorKey: 'environment',
      header: 'Env',
      cell: ({ row }) => (
        <Badge variant={row.original.environment === 'prod' ? 'default' : 'secondary'}>
          {row.original.environment}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => format(new Date(row.original.createdAt), 'MMM d, yyyy'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedQRCode(row.original);
              setIsPanelOpen(true);
            }}
          >
            <History className="h-4 w-4" />
          </Button>
          {row.original.isActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedQRCode(row.original);
                setIsDisableDialogOpen(true);
              }}
            >
              <Ban className="h-4 w-4 text-red-500" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                reactivateMutation.mutate(row.original.id);
              }}
            >
              <RotateCcw className="h-4 w-4 text-green-500" />
            </Button>
          )}
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: qrCodes,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  });

  const getScanResultIcon = (result: string) => {
    switch (result) {
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'expired':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'disabled':
        return <Ban className="h-4 w-4 text-red-500" />;
      case 'not_found':
        return <X className="h-4 w-4 text-gray-500" />;
      case 'environment_mismatch':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <X className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">QR Code Management</h1>
          <p className="text-gray-500">Generate and manage QR codes for EPOCH entities</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create QR Code
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total QR Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalQRCodes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeQRCodes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Scans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalScans}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.totalScans > 0 
                  ? `${Math.round((stats.successfulScans / stats.totalScans) * 100)}%`
                  : 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>QR Codes</CardTitle>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ENTITY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setSelectedQRCode(row.original);
                          setIsPanelOpen(true);
                        }}
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
                        No QR codes found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  Showing {table.getRowModel().rows.length} of {qrCodesResponse?.pagination.total || 0} QR codes
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code Details
            </SheetTitle>
            <SheetDescription>
              {selectedQRCode?.publicCode}
            </SheetDescription>
          </SheetHeader>

          {selectedQRCode && (
            <ScrollArea className="h-[calc(100vh-150px)] mt-6">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-500">Full URL</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-sm bg-gray-100 p-2 rounded">
                        {getQRUrl(selectedQRCode.publicCode)}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(getQRUrl(selectedQRCode.publicCode))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(getQRUrl(selectedQRCode.publicCode), '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-500">Entity Type</Label>
                      <p className="font-medium">
                        {ENTITY_TYPES.find(t => t.value === selectedQRCode.entityType)?.label || selectedQRCode.entityType}
                      </p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Entity Identifier</Label>
                      <p className="font-mono">{selectedQRCode.entityIdentifier}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Status</Label>
                      <p>{selectedQRCode.isActive ? 'Active' : 'Disabled'}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Environment</Label>
                      <p>{selectedQRCode.environment}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Created</Label>
                      <p>{format(new Date(selectedQRCode.createdAt), 'MMM d, yyyy HH:mm')}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Created By</Label>
                      <p>{selectedQRCode.createdByUser?.username || 'Unknown'}</p>
                    </div>
                  </div>

                  {selectedQRCode.label && (
                    <div>
                      <Label className="text-gray-500">Label</Label>
                      <p>{selectedQRCode.label}</p>
                    </div>
                  )}

                  {selectedQRCode.description && (
                    <div>
                      <Label className="text-gray-500">Description</Label>
                      <p>{selectedQRCode.description}</p>
                    </div>
                  )}

                  {selectedQRCode.expiresAt && (
                    <div>
                      <Label className="text-gray-500">Expires At</Label>
                      <p>{format(new Date(selectedQRCode.expiresAt), 'MMM d, yyyy HH:mm')}</p>
                    </div>
                  )}

                  {!selectedQRCode.isActive && selectedQRCode.disabledReason && (
                    <div className="bg-red-50 p-4 rounded-lg">
                      <Label className="text-red-700">Disabled Reason</Label>
                      <p className="text-red-600">{selectedQRCode.disabledReason}</p>
                      {selectedQRCode.disabledAt && (
                        <p className="text-sm text-red-500 mt-1">
                          Disabled on {format(new Date(selectedQRCode.disabledAt), 'MMM d, yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <Label className="text-lg font-semibold">Scan History</Label>
                  <div className="mt-4 space-y-2">
                    {scanHistory.length > 0 ? (
                      scanHistory.map((scan) => (
                        <div key={scan.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {getScanResultIcon(scan.scanResult)}
                            <div>
                              <p className="text-sm font-medium capitalize">{scan.scanResult.replace('_', ' ')}</p>
                              <p className="text-xs text-gray-500">
                                {scan.scannedByUser?.username || 'Anonymous'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{format(new Date(scan.scannedAt), 'MMM d, HH:mm')}</p>
                            {scan.ipAddress && (
                              <p className="text-xs text-gray-500">{scan.ipAddress}</p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-8">No scans yet</p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2">
                  {selectedQRCode.isActive ? (
                    <Button
                      variant="destructive"
                      onClick={() => setIsDisableDialogOpen(true)}
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Disable QR Code
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => reactivateMutation.mutate(selectedQRCode.id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New QR Code</DialogTitle>
            <DialogDescription>
              Generate a new QR code that links to an EPOCH entity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="entityType">Entity Type *</Label>
              <Select
                value={newQRCode.entityType}
                onValueChange={(value) => setNewQRCode({ ...newQRCode, entityType: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityIdentifier">Entity Identifier *</Label>
              <Input
                id="entityIdentifier"
                placeholder="e.g., AG-2024-001, EMP-123"
                value={newQRCode.entityIdentifier}
                onChange={(e) => setNewQRCode({ ...newQRCode, entityIdentifier: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Use stable identifiers only (orderId, agPartNumber, employeeCode, etc.)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                placeholder="Optional human-readable label"
                value={newQRCode.label}
                onChange={(e) => setNewQRCode({ ...newQRCode, label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={newQRCode.description}
                onChange={(e) => setNewQRCode({ ...newQRCode, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresAt">Expires At</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={newQRCode.expiresAt}
                onChange={(e) => setNewQRCode({ ...newQRCode, expiresAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolveUrl">Custom Resolve URL</Label>
              <Input
                id="resolveUrl"
                placeholder="Optional custom redirect URL"
                value={newQRCode.resolveUrl}
                onChange={(e) => setNewQRCode({ ...newQRCode, resolveUrl: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Leave empty to use default routing based on entity type
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newQRCode)}
              disabled={!newQRCode.entityType || !newQRCode.entityIdentifier || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create QR Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable QR Code</DialogTitle>
            <DialogDescription>
              This will prevent the QR code from being used. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="disableReason">Reason *</Label>
            <Textarea
              id="disableReason"
              placeholder="Why is this QR code being disabled?"
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDisableDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedQRCode) {
                  disableMutation.mutate({ id: selectedQRCode.id, reason: disableReason });
                }
              }}
              disabled={!disableReason || disableMutation.isPending}
            >
              {disableMutation.isPending ? 'Disabling...' : 'Disable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
