import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ExternalLink, Loader2, Search, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ProductionWorkOrderRow = {
  id: string;
  workOrderNumber: string;
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  poNumber: string | null;
  partNumber: string | null;
  description: string | null;
  status: string;
  wadStatus: string | null;
  dueDate: string | null;
  updatedAt: string | null;
};

const wadStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
};

const statusColors: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-800',
  READY: 'bg-blue-100 text-blue-800',
  RELEASED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-200 text-gray-600',
};

export default function WADWizardLauncherPage() {
  const [, navigate] = useLocation();
  const initialSearch = new URLSearchParams(window.location.search).get('search') ?? '';
  const [search, setSearch] = useState(initialSearch);

  const { data: workOrders = [], isLoading, isError, error } = useQuery<ProductionWorkOrderRow[]>({
    queryKey: ['/api/work-orders/production'],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workOrders;
    return workOrders.filter((wo) => {
      return (
        wo.workOrderNumber?.toLowerCase().includes(q) ||
        wo.projectName?.toLowerCase().includes(q) ||
        wo.projectCode?.toLowerCase().includes(q) ||
        wo.poNumber?.toLowerCase().includes(q) ||
        wo.partNumber?.toLowerCase().includes(q) ||
        wo.description?.toLowerCase().includes(q) ||
        wo.wadStatus?.toLowerCase().includes(q) ||
        wo.status?.toLowerCase().includes(q)
      );
    });
  }, [workOrders, search]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-blue-600" />
            WAD Wizard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a Production Work Order to author, edit, or review its Work Authorization Document.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Production Work Orders
          </CardTitle>
          <CardDescription>
            Each WAD is anchored to a Production Work Order. Open the wizard to walk through the 12-step authorization,
            or jump to the work order detail page for full context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="input-search-work-orders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Work Order #, project, PO #, part, or WAD status..."
              className="pl-9"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading production work orders...
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Failed to load production work orders: {(error as Error)?.message ?? 'Unknown error'}
            </div>
          )}

          {!isLoading && !isError && workOrders.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">No production work orders yet</p>
              <p>
                A Production Work Order must exist before a WAD can be authored. Create one from a project, then return
                here to launch the wizard.
              </p>
            </div>
          )}

          {!isLoading && !isError && workOrders.length > 0 && filtered.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No work orders match &ldquo;{search}&rdquo;.
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Project / Order</TableHead>
                    <TableHead>Part</TableHead>
                    <TableHead>WO Status</TableHead>
                    <TableHead>WAD Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((wo) => {
                    const wadStatus = wo.wadStatus ?? 'DRAFT';
                    return (
                      <TableRow key={wo.id} data-testid={`row-work-order-${wo.id}`}>
                        <TableCell className="font-medium" data-testid={`text-work-order-number-${wo.id}`}>
                          {wo.workOrderNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {wo.projectName || wo.projectCode ? (
                            <div className="flex flex-col">
                              <span>{wo.projectName ?? wo.projectCode}</span>
                              {wo.poNumber && (
                                <span className="text-xs text-muted-foreground">PO {wo.poNumber}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {wo.partNumber ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[wo.status] ?? 'bg-gray-100 text-gray-800'}>
                            {wo.status?.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={wadStatusColors[wadStatus] ?? 'bg-gray-100 text-gray-700'}
                            data-testid={`badge-wad-status-${wo.id}`}
                          >
                            {wadStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/work-orders/${wo.id}`)}
                              data-testid={`button-view-work-order-${wo.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View Work Order
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => navigate(`/work-orders/${wo.id}/wizard`)}
                              data-testid={`button-open-wizard-${wo.id}`}
                            >
                              <Wand2 className="h-3.5 w-3.5 mr-1" />
                              Open Wizard
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
