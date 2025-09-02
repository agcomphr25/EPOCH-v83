import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

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
  'Fulfilled'
];

export default function OrderDepartmentTransfer() {
  const [orderId, setOrderId] = useState('');
  const [currentDepartment, setCurrentDepartment] = useState('');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [orderFound, setOrderFound] = useState(false);
  const { toast } = useToast();

  const searchOrder = async () => {
    if (!orderId.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an order ID',
        variant: 'destructive'
      });
      return;
    }

    setIsSearching(true);
    setOrderFound(false);
    setCurrentDepartment('');

    try {
      const response = await apiRequest(`/api/orders/${orderId.trim()}`);
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (response.ok || response.status === 304) {
        let order;
        try {
          order = await response.json();
        } catch (jsonError) {
          console.error('Error parsing JSON:', jsonError);
          throw new Error('Invalid response format');
        }
        
        const department = order.currentDepartment || order.department || 'Unknown';
        setCurrentDepartment(department);
        setOrderFound(true);
        toast({
          title: 'Order Found',
          description: `Order ${orderId} is currently in ${department} department`,
        });
      } else if (response.status === 404) {
        toast({
          title: 'Order Not Found',
          description: `Order ${orderId} does not exist`,
          variant: 'destructive'
        });
        setOrderFound(false);
      } else {
        toast({
          title: 'Error',
          description: `Failed to search for order (Status: ${response.status})`,
          variant: 'destructive'
        });
        setOrderFound(false);
      }
    } catch (error) {
      console.error('Error searching order:', error);
      toast({
        title: 'Error',
        description: 'Failed to search for order - please try again',
        variant: 'destructive'
      });
      setOrderFound(false);
    } finally {
      setIsSearching(false);
    }
  };

  const transferOrder = async () => {
    if (!orderId.trim() || !targetDepartment) {
      toast({
        title: 'Error',
        description: 'Please select a target department',
        variant: 'destructive'
      });
      return;
    }

    if (currentDepartment === targetDepartment) {
      toast({
        title: 'Error',
        description: 'Order is already in the selected department',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest(`/api/orders/${orderId.trim()}/department`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          department: targetDepartment
        })
      });

      if (response.ok) {
        setCurrentDepartment(targetDepartment);
        setTargetDepartment('');
        toast({
          title: 'Transfer Successful',
          description: `Order ${orderId} has been moved to ${targetDepartment}`,
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Transfer Failed',
          description: error.message || 'Failed to transfer order',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error transferring order:', error);
      toast({
        title: 'Error',
        description: 'Failed to transfer order',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setOrderId('');
    setCurrentDepartment('');
    setTargetDepartment('');
    setOrderFound(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Order Department Transfer</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Move orders between departments for corrections and adjustments
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ArrowRight className="w-5 h-5" />
            <span>Transfer Order Between Departments</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Order Search */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                id="orderId"
                data-testid="input-order-id"
                placeholder="Enter order ID (e.g., AG123)"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && searchOrder()}
              />
            </div>
            <Button 
              onClick={searchOrder} 
              disabled={isSearching}
              data-testid="button-search-order"
            >
              <Search className="w-4 h-4 mr-2" />
              {isSearching ? 'Searching...' : 'Search Order'}
            </Button>
          </div>

          {/* Current Department Display */}
          {orderFound && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Order {orderId} Found
                  </p>
                  <p className="text-blue-700 dark:text-blue-300" data-testid="text-current-department">
                    Current Department: <strong>{currentDepartment}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Department Transfer */}
          {orderFound && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="targetDepartment">Target Department</Label>
                <Select value={targetDepartment} onValueChange={setTargetDepartment}>
                  <SelectTrigger data-testid="select-target-department">
                    <SelectValue placeholder="Select target department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem 
                        key={dept} 
                        value={dept}
                        disabled={dept === currentDepartment}
                      >
                        {dept} {dept === currentDepartment && '(Current)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={transferOrder}
                  disabled={isLoading || !targetDepartment}
                  className="flex-1"
                  data-testid="button-transfer-order"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  {isLoading ? 'Transferring...' : `Move to ${targetDepartment || 'Selected Department'}`}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetForm}
                  data-testid="button-reset-form"
                >
                  Reset
                </Button>
              </div>
            </div>
          )}

          {/* Information */}
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium mb-1">Important Notes:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>This tool should only be used for corrections and emergency moves</li>
                  <li>All transfers are logged for audit purposes</li>
                  <li>Orders moved manually may bypass normal workflow validations</li>
                  <li>Use with caution to maintain production flow integrity</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}