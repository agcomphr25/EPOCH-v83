import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Search, Eye, FileText, FolderOpen, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerId: string | null;
  description: string;
  totalAmount: number;
  status: string;
  validUntil: string;
  quotedBy: string;
  createdAt: string;
  updatedAt: string;
  attachments?: string[];
}

interface CreatedProject {
  id: string;
  projectCode: string;
  projectName: string;
}

export default function P2QuotesList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [startProjectDialogOpen, setStartProjectDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [projectName, setProjectName] = useState('');
  const [targetShipDate, setTargetShipDate] = useState('');

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ['/api/quotes'],
  });

  const filteredQuotes = quotes.filter((quote) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      quote.quoteNumber?.toLowerCase().includes(searchLower) ||
      quote.customerName?.toLowerCase().includes(searchLower) ||
      quote.description?.toLowerCase().includes(searchLower) ||
      quote.quotedBy?.toLowerCase().includes(searchLower)
    );
  });

  const startProjectMutation = useMutation<CreatedProject, Error, { projectName: string; customerId: string; customerNameSnapshot: string; description: string; targetShipDate: string; quoteId: string }>({
    mutationFn: async (data) => {
      return apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          projectName: data.projectName,
          customerId: data.customerId || 'UNKNOWN',
          customerNameSnapshot: data.customerNameSnapshot || undefined,
          description: data.description,
          targetShipDate: data.targetShipDate || undefined,
          reminderDays: 3,
          quoteId: data.quoteId || undefined,
        }),
      });
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setStartProjectDialogOpen(false);
      toast({
        title: 'Project Created',
        description: `Project "${projectName}" has been created successfully.`,
      });
      setLocation(`/projects/${newProject.id}`);
    },
    onError: (err) => {
      toast({
        title: 'Failed to Create Project',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    },
  });

  const handleStartProject = (quote: Quote) => {
    setSelectedQuote(quote);
    setProjectName(`${quote.quoteNumber} – ${quote.customerName}`);
    // Pre-fill target ship date from quote's validUntil (derived from quote, not user-entered)
    setTargetShipDate(quote.validUntil ? quote.validUntil.split('T')[0] : '');
    setStartProjectDialogOpen(true);
  };

  const handleConfirmStartProject = () => {
    if (!selectedQuote) return;
    if (!projectName.trim()) {
      toast({ title: 'Project name required', description: 'Please enter a project name.', variant: 'destructive' });
      return;
    }
    startProjectMutation.mutate({
      projectName: projectName.trim(),
      customerId: selectedQuote.customerId || '',
      customerNameSnapshot: selectedQuote.customerName || '',
      description: `From quote ${selectedQuote.quoteNumber}`,
      targetShipDate,
      quoteId: selectedQuote.id,
    });
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'SENT':
        return 'default';
      case 'DRAFT':
        return 'secondary';
      case 'ACCEPTED':
        return 'default';
      case 'REJECTED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const canStartProject = (status: string) => status === 'ACCEPTED' || status === 'SENT';

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/p2-forms">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to P2 Forms
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Submitted Quotes</h1>
              <p className="text-gray-600 mt-1">
                View and manage all submitted P2 quotes
              </p>
            </div>
          </div>
          <Link href="/p2-quote-form">
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Create New Quote
            </Button>
          </Link>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by Quote#, Customer, Description, or Quoted By..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-quotes"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              All Quotes ({filteredQuotes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading quotes...</div>
            ) : filteredQuotes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchTerm ? 'No quotes found matching your search.' : 'No quotes found.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quote Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Quoted By</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Attachments</TableHead>
                      <TableHead>Date Created</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.map((quote) => (
                      <TableRow key={quote.id} data-testid={`row-quote-${quote.id}`}>
                        <TableCell className="font-medium" data-testid={`text-quote-number-${quote.id}`}>
                          {quote.quoteNumber}
                        </TableCell>
                        <TableCell data-testid={`text-customer-${quote.id}`}>
                          {quote.customerName || 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-description-${quote.id}`}>
                          <div className="max-w-xs truncate" title={quote.description}>
                            {quote.description || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold" data-testid={`text-amount-${quote.id}`}>
                          ${(quote.totalAmount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell data-testid={`text-status-${quote.id}`}>
                          <Badge variant={getStatusBadgeColor(quote.status)}>
                            {quote.status || 'DRAFT'}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-quoted-by-${quote.id}`}>
                          {quote.quotedBy || 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-valid-until-${quote.id}`}>
                          {quote.validUntil
                            ? format(new Date(quote.validUntil), 'MM/dd/yyyy')
                            : 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-attachments-${quote.id}`}>
                          {quote.attachments && quote.attachments.length > 0 ? (
                            <Badge variant="outline">
                              <FileText className="h-3 w-3 mr-1" />
                              {quote.attachments.length}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-sm">None</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-date-${quote.id}`}>
                          {format(new Date(quote.createdAt), 'MM/dd/yyyy')}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Link href={`/p2-quote-form?id=${quote.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1 w-full"
                                data-testid={`button-view-${quote.id}`}
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </Button>
                            </Link>
                            {canStartProject(quote.status) && (
                              <Button
                                size="sm"
                                variant="default"
                                className="flex items-center gap-1 w-full bg-blue-600 hover:bg-blue-700 text-white"
                                data-testid={`button-start-project-${quote.id}`}
                                onClick={() => handleStartProject(quote)}
                              >
                                <FolderOpen className="h-3 w-3" />
                                Start Project
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={startProjectDialogOpen} onOpenChange={setStartProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Start New Project from Quote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedQuote && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <p className="font-medium text-blue-800">Quote: {selectedQuote.quoteNumber}</p>
                <p className="text-blue-700">Customer: {selectedQuote.customerName}</p>
                <p className="text-blue-700">Amount: ${(selectedQuote.totalAmount || 0).toFixed(2)}</p>
              </div>
            )}
            <div>
              <Label htmlFor="dialog-project-name">Project Name</Label>
              <Input
                id="dialog-project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                className="mt-1"
                data-testid="input-project-name"
              />
            </div>
            <div>
              <Label htmlFor="dialog-ship-date">
                Target Ship Date
                {selectedQuote?.validUntil && (
                  <span className="ml-1 text-xs text-muted-foreground font-normal">(pre-filled from quote valid-until)</span>
                )}
              </Label>
              <Input
                id="dialog-ship-date"
                type="date"
                value={targetShipDate}
                onChange={(e) => setTargetShipDate(e.target.value)}
                className="mt-1"
                data-testid="input-target-ship-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartProjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmStartProject}
              disabled={startProjectMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-confirm-start-project"
            >
              {startProjectMutation.isPending ? 'Creating…' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
