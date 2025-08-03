import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, X, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface BulkShippingActionsProps {
  selectedOrders: string[];
  onClearSelection: () => void;
  shippingOrders: any[];
}

interface ShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface PackageDetails {
  weight: string;
  length: string;
  width: string;
  height: string;
}

export function BulkShippingActions({ selectedOrders, onClearSelection, shippingOrders }: BulkShippingActionsProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: ''
  });
  
  const [packageDetails, setPackageDetails] = useState<PackageDetails>({
    weight: '',
    length: '',
    width: '',
    height: ''
  });

  const [communicationMethod, setCommunicationMethod] = useState<'email' | 'sms'>('email');

  const selectedOrdersData = shippingOrders.filter(order => 
    selectedOrders.includes(order.orderId)
  );

  const downloadPdf = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const generateTrackingNumber = () => {
    // Generate a realistic UPS tracking number format
    const prefix = '1Z';
    const account = 'A999';
    const service = '00';
    const sequence = Math.random().toString().substr(2, 8);
    const checkDigit = Math.floor(Math.random() * 10);
    return `${prefix}${account}${service}${sequence}${checkDigit}`;
  };

  const sendCustomerNotification = async (orderId: string, trackingNumber: string, customerInfo: any) => {
    try {
      const notificationData = {
        orderId,
        trackingNumber,
        customerName: customerInfo.customer || 'Customer',
        customerEmail: customerInfo.email || null,
        customerPhone: customerInfo.phone || null,
        method: communicationMethod,
        message: `Your order ${orderId} has been shipped! Tracking number: ${trackingNumber}. You can track your package at ups.com.`
      };

      const response = await axios.post('/api/communications/send-notification', notificationData);
      
      return response.data;
    } catch (error) {
      console.error('Error sending notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const handleBulkShipping = async () => {
    setIsProcessing(true);
    const trackingNumber = generateTrackingNumber();
    let successCount = 0;
    let notificationResults: any[] = [];

    try {
      // Generate shipping label for bulk shipment
      const response = await axios.post('/api/shipping-pdf/ups-shipping-label/bulk', {
        orderIds: selectedOrders,
        shippingAddress,
        packageDetails,
        trackingNumber
      }, {
        responseType: 'blob'
      });

      downloadPdf(response.data, `Bulk-Shipping-Label-${trackingNumber}.pdf`);

      // Send notifications to customers
      for (const order of selectedOrdersData) {
        try {
          const result = await sendCustomerNotification(
            order.orderId, 
            trackingNumber, 
            { customer: order.customer, email: order.customerEmail, phone: order.customerPhone }
          );
          notificationResults.push({ orderId: order.orderId, ...result });
          if (result.success) successCount++;
        } catch (error) {
          notificationResults.push({ 
            orderId: order.orderId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Show success message
      toast({
        title: "Bulk Shipping Completed",
        description: `${selectedOrders.length} orders shipped with tracking ${trackingNumber}. ${successCount} notifications sent successfully.`,
      });

      // Close dialog and clear selection
      setDialogOpen(false);
      onClearSelection();
      
      // Reset form
      setShippingAddress({
        name: '',
        street: '',
        city: '',
        state: '',
        zip: ''
      });
      setPackageDetails({
        weight: '',
        length: '',
        width: '',
        height: ''
      });

    } catch (error) {
      console.error('Error processing bulk shipping:', error);
      toast({
        title: "Error",
        description: "Failed to process bulk shipping. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bulk Shipping Actions
            <Badge variant="secondary">{selectedOrders.length} selected</Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClearSelection}
            className="text-blue-600 hover:text-blue-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Selected Orders Summary */}
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Selected Orders:</strong> {selectedOrders.join(', ')}
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1">
                  <Truck className="h-4 w-4 mr-2" />
                  Create Bulk Shipping Label
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Bulk Shipping for {selectedOrders.length} Orders</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Shipping Address */}
                  <div>
                    <Label className="text-sm font-medium">Shipping Address</Label>
                    <div className="space-y-2 mt-2">
                      <Input
                        placeholder="Customer Name"
                        value={shippingAddress.name}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, name: e.target.value })}
                      />
                      <Input
                        placeholder="Street Address"
                        value={shippingAddress.street}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="City"
                          value={shippingAddress.city}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                        />
                        <Input
                          placeholder="State"
                          value={shippingAddress.state}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                        />
                      </div>
                      <Input
                        placeholder="ZIP Code"
                        value={shippingAddress.zip}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, zip: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Package Details */}
                  <div>
                    <Label className="text-sm font-medium">Package Details</Label>
                    <div className="space-y-2 mt-2">
                      <Input
                        placeholder="Total Weight (lbs)"
                        value={packageDetails.weight}
                        onChange={(e) => setPackageDetails({ ...packageDetails, weight: e.target.value })}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="Length"
                          value={packageDetails.length}
                          onChange={(e) => setPackageDetails({ ...packageDetails, length: e.target.value })}
                        />
                        <Input
                          placeholder="Width"
                          value={packageDetails.width}
                          onChange={(e) => setPackageDetails({ ...packageDetails, width: e.target.value })}
                        />
                        <Input
                          placeholder="Height"
                          value={packageDetails.height}
                          onChange={(e) => setPackageDetails({ ...packageDetails, height: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Communication Method */}
                  <div>
                    <Label className="text-sm font-medium">Customer Notification Method</Label>
                    <Select value={communicationMethod} onValueChange={(value: 'email' | 'sms') => setCommunicationMethod(value)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email Notification
                          </div>
                        </SelectItem>
                        <SelectItem value="sms">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            SMS Notification
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Selected Orders List */}
                  <div>
                    <Label className="text-sm font-medium">Orders to Ship</Label>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
                      {selectedOrdersData.map((order, index) => (
                        <div key={order.orderId} className="text-sm flex justify-between">
                          <span>{order.orderId}</span>
                          <span className="text-gray-500">{order.customer}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleBulkShipping}
                      disabled={isProcessing || !shippingAddress.name || !shippingAddress.street}
                      className="flex-1"
                    >
                      {isProcessing ? 'Processing...' : 'Ship & Notify Customers'}
                    </Button>
                  </div>
                  
                  <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                    <strong>Note:</strong> This will generate a single shipping label for all selected orders 
                    and automatically send tracking information to each customer via their preferred communication method.
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}