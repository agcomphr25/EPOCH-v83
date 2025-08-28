import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Order {
  orderId: string;
  fbOrderNumber?: string;
  customerName?: string;
  customer?: string;
  dueDate?: string;
  modelId?: string;
  status?: string;
}

interface OrderSearchBoxProps {
  orders: Order[];
  placeholder?: string;
  onOrderSelect?: (order: Order) => void;
}

export function OrderSearchBox({ orders, placeholder = "Search by Order ID or FB Number...", onOrderSelect }: OrderSearchBoxProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return [];
    
    const term = searchTerm.toLowerCase().trim();
    return orders.filter(order => 
      order.orderId.toLowerCase().includes(term) ||
      (order.fbOrderNumber && order.fbOrderNumber.toLowerCase().includes(term))
    ).slice(0, 10); // Limit to 10 results for performance
  }, [orders, searchTerm]);

  const handleOrderClick = (order: Order) => {
    setSearchTerm('');
    setIsOpen(false);
    onOrderSelect?.(order);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(e.target.value.trim().length > 0);
          }}
          onFocus={() => setIsOpen(searchTerm.trim().length > 0)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && searchTerm.trim() && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-y-auto shadow-lg">
          <CardContent className="p-2">
            {filteredOrders.length > 0 ? (
              <div className="space-y-1">
                {filteredOrders.map((order) => (
                  <div
                    key={order.orderId}
                    onClick={() => handleOrderClick(order)}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {order.fbOrderNumber ? order.fbOrderNumber : order.orderId}
                        </span>
                        {order.fbOrderNumber && (
                          <Badge variant="outline" className="text-xs">
                            {order.orderId}
                          </Badge>
                        )}
                      </div>
                      {(order.customerName || order.customer) && (
                        <span className="text-xs text-gray-500">
                          {order.customerName || order.customer}
                        </span>
                      )}
                      {order.dueDate && (
                        <span className="text-xs text-gray-400">
                          Due: {new Date(order.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {order.status && (
                      <Badge variant="secondary" className="text-xs">
                        {order.status}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No orders found matching "{searchTerm}"
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}