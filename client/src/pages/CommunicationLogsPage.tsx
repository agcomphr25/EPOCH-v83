import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  Mail, 
  MessageSquare, 
  CheckCircle, 
  XCircle, 
  Clock, 
  SkipForward,
  RefreshCw,
  Filter,
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';

interface CommunicationLog {
  id: number;
  orderId: string | null;
  customerId: string;
  type: string;
  context: string | null;
  method: string;
  recipient: string;
  subject: string | null;
  message: string | null;
  status: string;
  skipReason: string | null;
  error: string | null;
  externalId: string | null;
  signatureToken: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function CommunicationLogsPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<CommunicationLog | null>(null);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, refetch } = useQuery<CommunicationLog[]>({
    queryKey: ['/api/communications/logs'],
    refetchInterval: 30000,
  });

  const filteredLogs = logs.filter((log) => {
    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchesSearch = 
      searchQuery === '' ||
      log.orderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.customerId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-yellow-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      sent: 'bg-green-100 text-green-800 border-green-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
      skipped: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      pending: 'bg-blue-100 text-blue-800 border-blue-200',
    };
    return variants[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getContextBadge = (context: string | null) => {
    if (!context) return null;
    const colors: Record<string, string> = {
      initial: 'bg-blue-100 text-blue-800',
      resend: 'bg-purple-100 text-purple-800',
      reminder: 'bg-orange-100 text-orange-800',
    };
    return (
      <Badge className={colors[context] || 'bg-gray-100 text-gray-800'}>
        {context}
      </Badge>
    );
  };

  const getMethodIcon = (method: string) => {
    return method === 'email' ? (
      <Mail className="h-4 w-4 text-blue-500" />
    ) : (
      <MessageSquare className="h-4 w-4 text-green-500" />
    );
  };

  const uniqueTypes = Array.from(new Set(logs.map((log) => log.type)));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Communication Logs</h1>
          <p className="text-muted-foreground">
            View email and SMS notification history
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          className="gap-2"
          data-testid="button-refresh-logs"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Order ID, recipient, or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-logs"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Logs ({filteredLogs.length} of {logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No communication logs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedLog(log)}
                      data-testid={`row-log-${log.id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <Badge className={getStatusBadge(log.status)}>
                            {log.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getMethodIcon(log.method)}
                          <span className="capitalize">{log.method}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {log.type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </span>
                      </TableCell>
                      <TableCell>{getContextBadge(log.context)}</TableCell>
                      <TableCell>
                        {log.orderId ? (
                          <Badge variant="outline">{log.orderId}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {log.recipient}
                      </TableCell>
                      <TableCell>
                        {log.sentAt
                          ? format(new Date(log.sentAt), 'MMM d, yyyy h:mm a')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {log.status === 'failed' && log.error && (
                          <Badge variant="destructive" className="text-xs">
                            Error
                          </Badge>
                        )}
                        {log.status === 'skipped' && log.skipReason && (
                          <Badge variant="secondary" className="text-xs">
                            {log.skipReason}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Communication Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Status
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(selectedLog.status)}
                    <Badge className={getStatusBadge(selectedLog.status)}>
                      {selectedLog.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Method
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    {getMethodIcon(selectedLog.method)}
                    <span className="capitalize">{selectedLog.method}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Type
                  </label>
                  <p className="mt-1">
                    {selectedLog.type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Context
                  </label>
                  <div className="mt-1">
                    {getContextBadge(selectedLog.context) || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Order ID
                  </label>
                  <p className="mt-1">{selectedLog.orderId || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Customer ID
                  </label>
                  <p className="mt-1">{selectedLog.customerId}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Recipient
                  </label>
                  <p className="mt-1">{selectedLog.recipient}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Sent At
                  </label>
                  <p className="mt-1">
                    {selectedLog.sentAt
                      ? format(new Date(selectedLog.sentAt), 'MMM d, yyyy h:mm:ss a')
                      : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Created At
                  </label>
                  <p className="mt-1">
                    {format(new Date(selectedLog.createdAt), 'MMM d, yyyy h:mm:ss a')}
                  </p>
                </div>
                {selectedLog.signatureToken && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Signature Token
                    </label>
                    <p className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                      {selectedLog.signatureToken.substring(0, 20)}...
                    </p>
                  </div>
                )}
                {selectedLog.externalId && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      External ID (SendGrid/Twilio)
                    </label>
                    <p className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                      {selectedLog.externalId}
                    </p>
                  </div>
                )}
              </div>

              {selectedLog.message && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Message
                  </label>
                  <p className="mt-1 bg-muted p-3 rounded text-sm">
                    {selectedLog.message}
                  </p>
                </div>
              )}

              {selectedLog.status === 'skipped' && selectedLog.skipReason && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <label className="text-sm font-medium text-yellow-800">
                    Skip Reason
                  </label>
                  <p className="mt-1 text-yellow-700">{selectedLog.skipReason}</p>
                </div>
              )}

              {selectedLog.status === 'failed' && selectedLog.error && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <label className="text-sm font-medium text-red-800">
                    Error
                  </label>
                  <p className="mt-1 text-red-700 font-mono text-sm">
                    {selectedLog.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
