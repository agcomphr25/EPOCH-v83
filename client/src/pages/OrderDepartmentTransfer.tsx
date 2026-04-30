import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Search, AlertCircle, CheckCircle, Building2, Loader2, X, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useSearch } from 'wouter';

const DEPARTMENTS = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
  'Fulfilled',
];

interface OrderMatch {
  orderId: string;
  fbOrderNumber: string | null;
  customerPO: string | null;
  currentDepartment: string;
  source: string;
}

export default function OrderDepartmentTransfer() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const prefilledOrderId = params.get('orderId') || '';

  const [searchQuery, setSearchQuery] = useState(prefilledOrderId);
  const [searchResults, setSearchResults] = useState<OrderMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderMatch | null>(null);
  const [targetDepartment, setTargetDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showOnlyUnknown, setShowOnlyUnknown] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUnknownDepartment = (dept: string) =>
    !dept || dept.trim() === '' || dept.trim().toLowerCase() === 'unknown';
  const { toast } = useToast();

  // Auto-search when prefilled from URL
  useEffect(() => {
    if (prefilledOrderId) {
      doSearch(prefilledOrderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    setShowResults(true);
    try {
      const res = await fetch(`/api/orders/search-all?query=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data: OrderMatch[] = await res.json();
        setShowOnlyUnknown(false);
        setSearchResults(data);
        // Auto-select if exactly one result matches the prefilled ID
        if (prefilledOrderId && data.length === 1 && data[0].orderId === prefilledOrderId.toUpperCase()) {
          setSelectedOrder(data[0]);
          setShowResults(false);
        }
      }
    } catch {
      toast({ title: 'Search error', description: 'Could not reach the server', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedOrder(null);
    setTargetDepartment('');
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelectOrder = (order: OrderMatch) => {
    setSelectedOrder(order);
    setSearchQuery(order.orderId);
    setShowResults(false);
    setTargetDepartment('');
  };

  const handleTransfer = async () => {
    if (!selectedOrder || !targetDepartment) return;
    if (selectedOrder.currentDepartment === targetDepartment) {
      toast({ title: 'No change', description: 'Order is already in that department', variant: 'destructive' });
      return;
    }
    setIsTransferring(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.orderId}/department`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: targetDepartment, reason: reason.trim() || undefined }),
      });
      if (res.ok) {
        const prev = selectedOrder.currentDepartment;
        setSelectedOrder({ ...selectedOrder, currentDepartment: targetDepartment });
        setTargetDepartment('');
        setReason('');
        toast({
          title: 'Transfer Successful',
          description: `${selectedOrder.orderId} moved from ${prev} → ${targetDepartment}`,
        });
      } else {
        let msg = 'Failed to transfer order';
        try { msg = (await res.json()).error || msg; } catch {}
        toast({ title: 'Transfer Failed', description: msg, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not reach the server', variant: 'destructive' });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleReset = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedOrder(null);
    setTargetDepartment('');
    setReason('');
    setShowResults(false);
    setShowOnlyUnknown(false);
  };

  const visibleResults = showOnlyUnknown
    ? searchResults.filter((o) => isUnknownDepartment(o.currentDepartment))
    : searchResults;

  const unknownCount = searchResults.filter((o) => isUnknownDepartment(o.currentDepartment)).length;

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Order Department Transfer
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Search by order ID, FB number, or customer PO — then reassign its department
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5" />
            <span>Find Order</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Label htmlFor="search-query">Order ID, FB Number, or Customer PO</Label>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  id="search-query"
                  placeholder="e.g. FC1751, AK046, or PO-12345"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') doSearch(searchQuery);
                    if (e.key === 'Escape') setShowResults(false);
                  }}
                  autoComplete="off"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
              {searchQuery && (
                <Button variant="ghost" size="icon" onClick={handleReset} title="Clear">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Dropdown results */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 flex flex-col">
                {/* Filter bar */}
                {unknownCount > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-amber-50 dark:bg-amber-900/20 rounded-t-lg flex-shrink-0">
                    <span className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {unknownCount} order{unknownCount !== 1 ? 's' : ''} with no department
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowOnlyUnknown((v) => !v)}
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded transition-colors ${
                        showOnlyUnknown
                          ? 'bg-amber-600 text-white'
                          : 'text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/40'
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                      {showOnlyUnknown ? 'Show all' : 'Show unknown only'}
                    </button>
                  </div>
                )}
                <div className="overflow-y-auto">
                  {visibleResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      No unknown-department orders in these results
                    </div>
                  ) : (
                    visibleResults.map((order) => {
                      const unknown = isUnknownDepartment(order.currentDepartment);
                      return (
                        <button
                          key={order.orderId}
                          type="button"
                          className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                            unknown
                              ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                          }`}
                          onClick={() => handleSelectOrder(order)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {order.orderId}
                              </span>
                              {unknown && (
                                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30">
                                  No department
                                </Badge>
                              )}
                              {order.fbOrderNumber && (
                                <span className="text-sm text-gray-500">
                                  FB: {order.fbOrderNumber}
                                </span>
                              )}
                              {order.customerPO && (
                                <span className="text-sm text-gray-500">
                                  PO: {order.customerPO}
                                </span>
                              )}
                            </div>
                            <div className={`flex items-center gap-1 text-sm flex-shrink-0 ml-2 ${
                              unknown
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}>
                              <Building2 className="w-3 h-3" />
                              {order.currentDepartment}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {showResults && !isSearching && searchResults.length === 0 && searchQuery.trim() && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  No orders found matching "{searchQuery}"
                </div>
              </div>
            )}
          </div>

          {/* Selected order summary */}
          {selectedOrder && (
            <div className={`p-4 rounded-lg border ${
              isUnknownDepartment(selectedOrder.currentDepartment)
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}>
              <div className="flex items-start space-x-2">
                <CheckCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  isUnknownDepartment(selectedOrder.currentDepartment)
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-blue-600'
                }`} />
                <div className="flex-1">
                  <p className={`font-medium ${
                    isUnknownDepartment(selectedOrder.currentDepartment)
                      ? 'text-amber-900 dark:text-amber-100'
                      : 'text-blue-900 dark:text-blue-100'
                  }`}>
                    {selectedOrder.orderId}
                  </p>
                  {selectedOrder.fbOrderNumber && (
                    <p className={`text-sm ${
                      isUnknownDepartment(selectedOrder.currentDepartment)
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-blue-700 dark:text-blue-300'
                    }`}>
                      FB: {selectedOrder.fbOrderNumber}
                    </p>
                  )}
                  {selectedOrder.customerPO && (
                    <p className={`text-sm ${
                      isUnknownDepartment(selectedOrder.currentDepartment)
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-blue-700 dark:text-blue-300'
                    }`}>
                      Customer PO: {selectedOrder.customerPO}
                    </p>
                  )}
                  <p className={`mt-1 ${
                    isUnknownDepartment(selectedOrder.currentDepartment)
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-blue-700 dark:text-blue-300'
                  }`} data-testid="text-current-department">
                    Current Department: <strong>{selectedOrder.currentDepartment}</strong>
                  </p>
                  {isUnknownDepartment(selectedOrder.currentDepartment) && (
                    <div className="mt-2 flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-200">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        This order has no department assignment. Use the form below to assign it to the correct department.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer form — only shown when an order is selected */}
      {selectedOrder && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ArrowRight className="w-5 h-5" />
              <span>Reassign Department</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="target-department">Target Department</Label>
              <Select value={targetDepartment} onValueChange={setTargetDepartment}>
                <SelectTrigger id="target-department" data-testid="select-target-department" className="mt-1">
                  <SelectValue placeholder="Select target department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem
                      key={dept}
                      value={dept}
                      disabled={dept === selectedOrder.currentDepartment}
                    >
                      {dept}
                      {dept === selectedOrder.currentDepartment && ' (Current)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="transfer-reason">Reason (optional)</Label>
              <Textarea
                id="transfer-reason"
                placeholder="Describe why this order is being moved..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleTransfer}
                disabled={isTransferring || !targetDepartment}
                className="flex-1"
                data-testid="button-transfer-order"
              >
                {isTransferring ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Transferring...</>
                ) : (
                  <><ArrowRight className="w-4 h-4 mr-2" />Move to {targetDepartment || 'Selected Department'}</>
                )}
              </Button>
              <Button variant="outline" onClick={handleReset} data-testid="button-reset-form">
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <p className="font-medium mb-1">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Use this tool for corrections and emergency moves only</li>
              <li>All transfers are logged in the audit trail with actor and reason</li>
              <li>Orders moved manually may bypass normal workflow validations</li>
              <li>Use with caution to maintain production flow integrity</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
