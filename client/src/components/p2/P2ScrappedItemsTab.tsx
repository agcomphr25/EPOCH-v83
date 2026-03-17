import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Search, AlertTriangle, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ScrappedItem {
  id: string;
  serialNumber: string;
  barcode: string;
  partNumber: string;
  partName: string;
  poNumber: string;
  customerName: string;
  currentDepartment: string;
  status: string;
  scrapReason: string | null;
  scrapBy: string | null;
  scrapAt: string | null;
  createdAt: string;
}

export default function P2ScrappedItemsTab() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: scrappedItems = [], isLoading, isError, error } = useQuery<ScrappedItem[]>({
    queryKey: ['/api/p2/serialized-items/scrapped'],
    refetchInterval: 60000,
  });

  const filtered = scrappedItems.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.serialNumber?.toLowerCase().includes(term) ||
      item.partNumber?.toLowerCase().includes(term) ||
      item.partName?.toLowerCase().includes(term) ||
      item.poNumber?.toLowerCase().includes(term) ||
      item.customerName?.toLowerCase().includes(term) ||
      item.scrapReason?.toLowerCase().includes(term) ||
      item.scrapBy?.toLowerCase().includes(term)
    );
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-12 w-12 mb-3" />
          <p className="font-medium">Failed to load scrapped items</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            Scrapped P2 Items
            <Badge variant="destructive" className="ml-2">
              {scrappedItems.length}
            </Badge>
          </CardTitle>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by serial, part, PO, customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            {scrappedItems.length === 0 ? (
              <>
                <p className="font-medium">No scrapped items</p>
                <p className="text-sm">Items scrapped from production will appear here</p>
              </>
            ) : (
              <>
                <p className="font-medium">No results</p>
                <p className="text-sm">No scrapped items match your search</p>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Scrap Reason</TableHead>
                  <TableHead>Scrapped By</TableHead>
                  <TableHead>Scrapped At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-medium">{item.serialNumber}</TableCell>
                    <TableCell className="font-mono text-sm">{item.partNumber}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={item.partName}>
                      {item.partName}
                    </TableCell>
                    <TableCell className="font-medium">{item.poNumber}</TableCell>
                    <TableCell>{item.customerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.currentDepartment}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      <span className="text-red-600 dark:text-red-400 text-sm" title={item.scrapReason}>
                        {item.scrapReason}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{item.scrapBy || '—'}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(item.scrapAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
