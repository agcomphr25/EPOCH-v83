import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, Eye, FileText } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  description: string;
  totalAmount: number;
  status: string;
  validUntil: string;
  quotedBy: string;
  createdAt: string;
  updatedAt: string;
  attachments?: string[];
}

export default function P2QuotesList() {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all quotes
  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ['/api/quotes'],
  });

  // Filter quotes based on search term
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
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

        {/* Search and Filter */}
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

        {/* Quotes Table */}
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
                          <Link href={`/p2-quote-form?id=${quote.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex items-center gap-1"
                              data-testid={`button-view-${quote.id}`}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
                          </Link>
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
    </div>
  );
}
