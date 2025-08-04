import React, { useState } from 'react';
import { useAPTransactions } from '../hooks/useTransactions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';

/**
 * AP Journal component displaying Accounts Payable transactions
 * @param {Object} props - Component props
 * @param {string} props.dateFrom - Start date for filtering transactions
 * @param {string} props.dateTo - End date for filtering transactions
 */
export default function APJournal({ dateFrom, dateTo }) {
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState({ dateFrom, dateTo });
  const { data, loading, error, refresh } = useAPTransactions(dateRange);

  // Handle date range changes
  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  // Navigate to detailed AP transaction view
  const handleRowClick = (transaction) => {
    navigate(`/ap/${transaction.id}`);
  };

  // Format currency for display
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Get status badge variant based on status
  const getStatusVariant = (status) => {
    switch (status) {
      case 'paid': return 'success';
      case 'pending': return 'warning';
      case 'overdue': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-4">
      {/* Date Range Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateRange.dateFrom}
                onChange={(e) => handleDateChange('dateFrom', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateRange.dateTo}
                onChange={(e) => handleDateChange('dateTo', e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={refresh} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>AP Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              Error loading transactions: {error}
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transactions found for the selected date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">PO Number</th>
                    <th className="text-left p-4 font-medium">Vendor</th>
                    <th className="text-right p-4 font-medium">Amount</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleRowClick(transaction)}
                    >
                      <td className="p-4 font-mono text-sm">{transaction.poNumber}</td>
                      <td className="p-4">{transaction.vendorName}</td>
                      <td className="p-4 text-right font-medium">
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {new Date(transaction.date).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <Badge variant={getStatusVariant(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(transaction);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}