import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Search, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  FileText,
  RefreshCw,
  Calendar,
  ArrowRight,
  Activity
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface InventoryTransaction {
  transactionId: string;
  partId: string;
  locationId: string;
  transactionType: 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT' | 'ALLOCATION' | 'CONSUMPTION';
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  referenceNumber: string | null;
  notes: string | null;
  createdBy: string;
  transactionDate: Date;
  partName?: string;
  locationName?: string;
}

interface NewTransactionData {
  partId: string;
  locationId: string;
  transactionType: string;
  quantity: number;
  unitCost?: number;
  referenceNumber?: string;
  notes?: string;
}

export default function InventoryTransactionsCard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransactionType, setSelectedTransactionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewTransactionOpen, setIsNewTransactionOpen] = useState(false);
  const [processTransaction, setProcessTransaction] = useState(false);
  const queryClient = useQueryClient();

  const transactionTypes = [
    { value: 'RECEIPT', label: 'Receipt', icon: TrendingUp, color: 'text-green-600' },
    { value: 'ISSUE', label: 'Issue', icon: TrendingDown, color: 'text-red-600' },
    { value: 'TRANSFER', label: 'Transfer', icon: ArrowRight, color: 'text-blue-600' },
    { value: 'ADJUSTMENT', label: 'Adjustment', icon: Activity, color: 'text-orange-600' },
    { value: 'ALLOCATION', label: 'Allocation', icon: Package, color: 'text-purple-600' },
    { value: 'CONSUMPTION', label: 'Consumption', icon: TrendingDown, color: 'text-gray-600' }
  ];

  // Fetch inventory transactions
  const { data: transactionsResult, isLoading, refetch } = useQuery({
    queryKey: ['/api/inventory/transactions', { 
      partId: searchQuery,
      transactionType: selectedTransactionType,
      dateFrom,
      dateTo,
      page: currentPage,
      limit: 50
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('partId', searchQuery);
      if (selectedTransactionType) params.append('transactionType', selectedTransactionType);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      params.append('page', currentPage.toString());
      params.append('limit', '50');
      
      const response = await apiRequest(`/api/inventory/transactions?${params.toString()}`);
      return response;
    }
  });

  const transactions = transactionsResult?.data || [];
  const totalTransactions = transactionsResult?.total || 0;

  // Create transaction mutation
  const createTransactionMutation = useMutation({
    mutationFn: async (data: NewTransactionData) => {
      const endpoint = processTransaction 
        ? '/api/inventory/transactions/process' 
        : '/api/inventory/transactions';
      
      return await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/balances'] });
      toast.success(`Transaction ${processTransaction ? 'processed' : 'created'} successfully`);
      setIsNewTransactionOpen(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to ${processTransaction ? 'process' : 'create'} transaction: ${error.message}`);
    },
  });

  const handleCreateTransaction = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const transactionData: NewTransactionData = {
      partId: formData.get('partId') as string,
      locationId: formData.get('locationId') as string,
      transactionType: formData.get('transactionType') as string,
      quantity: Number(formData.get('quantity')),
      unitCost: Number(formData.get('unitCost')) || undefined,
      referenceNumber: formData.get('referenceNumber') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    };

    createTransactionMutation.mutate(transactionData);
  }, [createTransactionMutation, processTransaction]);

  const getTransactionTypeInfo = (type: string) => {
    return transactionTypes.find(t => t.value === type) || 
           { label: type, icon: FileText, color: 'text-gray-600' };
  };

  const getTransactionBadgeColor = (type: string) => {
    switch (type) {
      case 'RECEIPT': return 'bg-green-100 text-green-800';
      case 'ISSUE': return 'bg-red-100 text-red-800';
      case 'TRANSFER': return 'bg-blue-100 text-blue-800';
      case 'ADJUSTMENT': return 'bg-orange-100 text-orange-800';
      case 'ALLOCATION': return 'bg-purple-100 text-purple-800';
      case 'CONSUMPTION': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Calculate summary statistics
  const summaryStats = transactions.reduce((acc, transaction) => {
    if (transaction.transactionType === 'RECEIPT') {
      acc.receipts += transaction.quantity;
    } else if (['ISSUE', 'CONSUMPTION'].includes(transaction.transactionType)) {
      acc.issues += transaction.quantity;
    }
    if (transaction.totalCost) {
      acc.totalValue += transaction.totalCost;
    }
    return acc;
  }, { receipts: 0, issues: 0, totalValue: 0 });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Inventory Transactions
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track all inventory movements with complete audit trail
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isNewTransactionOpen} onOpenChange={setIsNewTransactionOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-transaction">
                <Plus className="h-4 w-4 mr-1" />
                New Transaction
              </Button>
            </DialogTrigger>
          </Dialog>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            data-testid="button-refresh-transactions"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="search">Search Parts</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Part ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-transactions"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="transactionType">Transaction Type</Label>
              <select
                id="transactionType"
                value={selectedTransactionType}
                onChange={(e) => setSelectedTransactionType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                data-testid="select-transaction-type"
              >
                <option value="">All Types</option>
                {transactionTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>

            <div>
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTransactionType('');
                  setDateFrom('');
                  setDateTo('');
                  setCurrentPage(1);
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalTransactions.toLocaleString()}
                </p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Receipts</p>
                <p className="text-2xl font-bold text-green-600">
                  {summaryStats.receipts.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Issues</p>
                <p className="text-2xl font-bold text-red-600">
                  {summaryStats.issues.toLocaleString()}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Value</p>
                <p className="text-2xl font-bold text-purple-600">
                  ${summaryStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            Complete audit trail of all inventory movements
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading transactions...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Part ID</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Created By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => {
                  const typeInfo = getTransactionTypeInfo(transaction.transactionType);
                  const IconComponent = typeInfo.icon;
                  
                  return (
                    <TableRow key={transaction.transactionId}>
                      <TableCell className="font-mono text-sm">
                        {transaction.transactionId.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {new Date(transaction.transactionDate).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{transaction.partId}</TableCell>
                      <TableCell>{transaction.locationId}</TableCell>
                      <TableCell>
                        <Badge className={getTransactionBadgeColor(transaction.transactionType)}>
                          <IconComponent className="h-3 w-3 mr-1" />
                          {typeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={transaction.quantity >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {transaction.quantity >= 0 ? '+' : ''}{transaction.quantity.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {transaction.unitCost ? `$${transaction.unitCost.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {transaction.totalCost ? `$${transaction.totalCost.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>{transaction.referenceNumber || '-'}</TableCell>
                      <TableCell>{transaction.createdBy}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          
          {!isLoading && transactions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No transactions found matching your criteria.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalTransactions > 50 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {((currentPage - 1) * 50) + 1} to {Math.min(currentPage * 50, totalTransactions)} of {totalTransactions} transactions
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              data-testid="button-previous-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage * 50 >= totalTransactions}
              onClick={() => setCurrentPage(currentPage + 1)}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* New Transaction Dialog */}
      <Dialog open={isNewTransactionOpen} onOpenChange={setIsNewTransactionOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTransaction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="partId">Part ID *</Label>
                <Input
                  id="partId"
                  name="partId"
                  placeholder="Enter part ID"
                  required
                />
              </div>
              <div>
                <Label htmlFor="locationId">Location *</Label>
                <Input
                  id="locationId"
                  name="locationId"
                  placeholder="Enter location"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="transactionType">Transaction Type *</Label>
                <select
                  id="transactionType"
                  name="transactionType"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="">Select type...</option>
                  {transactionTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  step="0.01"
                  placeholder="Enter quantity"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="unitCost">Unit Cost</Label>
                <Input
                  id="unitCost"
                  name="unitCost"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="referenceNumber">Reference Number</Label>
                <Input
                  id="referenceNumber"
                  name="referenceNumber"
                  placeholder="PO, WO, etc."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                name="notes"
                placeholder="Additional notes..."
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="processTransaction"
                checked={processTransaction}
                onChange={(e) => setProcessTransaction(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="processTransaction" className="text-sm font-medium">
                Process transaction (update balances automatically)
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsNewTransactionOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createTransactionMutation.isPending}
                data-testid="button-save-transaction"
              >
                {createTransactionMutation.isPending ? 'Creating...' : 
                 processTransaction ? 'Process Transaction' : 'Create Transaction'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}