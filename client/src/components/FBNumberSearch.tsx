import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getDisplayOrderId } from '@/lib/orderUtils';

interface FBNumberSearchProps {
  onOrderFound?: (orderId: string) => void;
  className?: string;
}

export default function FBNumberSearch({
  onOrderFound,
  className = ''
}: FBNumberSearchProps) {
  const [searchValue, setSearchValue] = useState('');

  // Get all orders
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Filter orders by FishBowl number or Order ID
  const searchResults = useMemo(() => {
    if (!searchValue.trim()) return [];
    
    const query = searchValue.toLowerCase().trim();
    return (allOrders as any[]).filter((order: any) => {
      const fbNumber = order.fbOrderNumber?.toLowerCase();
      const orderId = order.orderId?.toLowerCase();
      
      return (
        (fbNumber && fbNumber.includes(query)) ||
        (orderId && orderId.includes(query))
      );
    });
  }, [allOrders, searchValue]);

  const handleClear = () => {
    setSearchValue('');
  };

  const handleOrderSelect = (orderId: string) => {
    if (onOrderFound) {
      onOrderFound(orderId);
    }
    setSearchValue('');
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Search className="h-4 w-4" />
        <Label htmlFor="fb-search" className="text-sm font-medium">
          Search by FishBowl Number or Order ID
        </Label>
      </div>
      
      <div className="relative">
        <Input
          id="fb-search"
          type="text"
          placeholder="Enter FishBowl order number or Order ID..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pr-8"
        />
        
        {searchValue && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
            onClick={handleClear}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Search Results */}
      {searchValue && (
        <div className="mt-2">
          {searchResults.length > 0 ? (
            <div className="border rounded-md bg-white dark:bg-gray-800 shadow-sm">
              <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-b">
                Found {searchResults.length} order{searchResults.length !== 1 ? 's' : ''}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((order: any) => (
                  <div
                    key={order.orderId}
                    className="p-3 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => handleOrderSelect(order.orderId)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">
                          {getDisplayOrderId(order.orderId)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          FB: {order.fbOrderNumber}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Current: {order.currentDepartment}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'No due date'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 text-sm text-gray-500 dark:text-gray-400 border rounded-md bg-gray-50 dark:bg-gray-800">
              No orders found with FishBowl number containing "{searchValue}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}