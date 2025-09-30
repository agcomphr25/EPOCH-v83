import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Search, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
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

interface OrderDetails {
  orderId: string;
  currentDepartment: string;
  status: string;
  trackingNumber?: string;
  customerNotified?: boolean;
  shippedDate?: string;
}

export default function OrderDepartmentTransfer() {
  const [orderId, setOrderId] = useState('');
  const [currentDepartment, setCurrentDepartment] = useState('');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [orderFound, setOrderFound] = useState(false);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [showFulfilledDialog, setShowFulfilledDialog] = useState(false);
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
      const response = await fetch(`/api/orders/${orderId.trim()}`);
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (response.ok || response.status === 304) {
        let order;
        try {
          order = await response.json();
          console.log('Order data:', order);
        } catch (jsonError) {
          console.error('Error parsing JSON:', jsonError);
          throw new Error('Invalid response format');
        }
        
        const department = order.currentDepartment || order.department || 'Unknown';
        setCurrentDepartment(department);
        setOrderFound(true);
        
        // Store full order details for fulfillment checking
        setOrderDetails({
          orderId: order.orderId,
          currentDepartment: department,
          status: order.status || 'Unknown',
          trackingNumber: order.trackingNumber,
          customerNotified: order.customerNotified,
          shippedDate: order.shippedDate
        });
        
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

    // Check if we're moving a FULFILLED order to any different department
    // FULFILLED orders should remain fulfilled only if staying in or returning to Shipping Management/Fulfilled
    const shippingDepartments = ['Shipping Management', 'Fulfilled'];
    if (orderDetails?.status === 'FULFILLED' && !shippingDepartments.includes(targetDepartment)) {
      // Show the dialog for user to choose action
      setShowFulfilledDialog(true);
      return;
    }

    // Proceed with normal transfer
    await executeTransfer(false);
  };

  const executeTransfer = async (reopenOrder: boolean) => {
    setIsLoading(true);
    setShowFulfilledDialog(false);

    try {
      const response = await fetch(`/api/orders/${orderId.trim()}/department`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          department: targetDepartment,
          reopenOrder: reopenOrder
        })
      });

      console.log('Transfer response status:', response.status);
      console.log('Transfer response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('Transfer result:', result);
        
        setCurrentDepartment(targetDepartment);
        setTargetDepartment('');
        toast({
          title: 'Transfer Successful',
          description: `Order ${orderId} has been moved to ${targetDepartment}`,
        });
      } else {
        let errorMessage = 'Failed to transfer order';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (jsonError) {
          console.error('Error parsing error response:', jsonError);
        }
        
        toast({
          title: 'Transfer Failed',
          description: errorMessage,
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

      {/* Fulfilled Order Warning Dialog */}
      <Dialog open={showFulfilledDialog} onOpenChange={setShowFulfilledDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
              <DialogTitle>Fulfilled Order - Confirm Action</DialogTitle>
            </div>
            <DialogDescription className="pt-4 space-y-3">
              <p className="font-medium text-base">
                This order is marked as <span className="text-blue-600 font-bold">FULFILLED</span>{orderDetails?.currentDepartment && ` and is currently in ${orderDetails.currentDepartment}`}.
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Order Details:</p>
                <ul className="text-sm space-y-1 text-blue-800 dark:text-blue-200">
                  <li>• Order ID: <strong>{orderDetails?.orderId}</strong></li>
                  <li>• Current Location: <strong>{orderDetails?.currentDepartment}</strong></li>
                  {orderDetails?.trackingNumber && (
                    <li>• Tracking: <strong>{orderDetails.trackingNumber}</strong></li>
                  )}
                  {orderDetails?.shippedDate && (
                    <li>• Shipped: <strong>{new Date(orderDetails.shippedDate).toLocaleDateString()}</strong></li>
                  )}
                  {orderDetails?.customerNotified && (
                    <li>• Customer Notified: <strong>Yes</strong></li>
                  )}
                </ul>
              </div>

              <p className="text-sm">
                Moving this FULFILLED order to <strong>{targetDepartment}</strong> suggests rework or correction may be needed.
              </p>

              <p className="text-sm font-medium">
                Would you like to reopen this order (change status to IN_PROGRESS)?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFulfilledDialog(false)}
              data-testid="button-cancel-transfer"
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => executeTransfer(false)}
              data-testid="button-keep-fulfilled"
            >
              Keep as FULFILLED
            </Button>
            <Button
              onClick={() => executeTransfer(true)}
              data-testid="button-reopen-order"
              className="bg-orange-600 hover:bg-orange-700"
            >
              Reopen Order (IN_PROGRESS)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}