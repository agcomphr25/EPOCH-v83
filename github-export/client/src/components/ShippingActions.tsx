import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Truck, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

interface ShippingActionsProps {
  orderId: string;
  orderData?: any;
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

export function ShippingActions({ orderId, orderData }: ShippingActionsProps) {
  const { toast } = useToast();
  const [isGeneratingQC, setIsGeneratingQC] = useState(false);
  const [isGeneratingSO, setIsGeneratingSO] = useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [shippingDialogOpen, setShippingDialogOpen] = useState(false);
  
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

  const handleQCChecklist = async () => {
    setIsGeneratingQC(true);
    try {
      const response = await axios.get(`/api/shipping-pdf/qc-checklist/${orderId}`, {
        responseType: 'blob'
      });
      
      downloadPdf(response.data, `QC-Checklist-${orderId}.pdf`);
      
      toast({
        title: "QC Checklist Generated",
        description: `QC checklist for order ${orderId} has been downloaded.`,
      });
    } catch (error) {
      console.error('Error generating QC checklist:', error);
      toast({
        title: "Error",
        description: "Failed to generate QC checklist. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingQC(false);
    }
  };

  const handleSalesOrder = async () => {
    setIsGeneratingSO(true);
    try {
      const response = await axios.get(`/api/shipping-pdf/sales-order/${orderId}`, {
        responseType: 'blob'
      });
      
      downloadPdf(response.data, `Sales-Order-${orderId}.pdf`);
      
      toast({
        title: "Sales Order Generated",
        description: `Sales order for ${orderId} has been downloaded.`,
      });
    } catch (error) {
      console.error('Error generating sales order:', error);
      toast({
        title: "Error",
        description: "Failed to generate sales order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSO(false);
    }
  };

  const handleShippingLabel = async () => {
    setIsGeneratingLabel(true);
    try {
      const response = await axios.post(`/api/shipping-pdf/ups-shipping-label/${orderId}`, {
        shippingAddress,
        packageDetails
      }, {
        responseType: 'blob'
      });
      
      downloadPdf(response.data, `Shipping-Label-${orderId}.pdf`);
      
      toast({
        title: "Shipping Label Generated",
        description: `UPS shipping label for order ${orderId} has been downloaded and tracking info saved.`,
      });
      
      // Refresh any tracking displays if needed
      window.dispatchEvent(new CustomEvent('trackingUpdated', { detail: { orderId } }));
      
      setShippingDialogOpen(false);
      
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
      console.error('Error generating shipping label:', error);
      toast({
        title: "Error",
        description: "Failed to generate shipping label. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingLabel(false);
    }
  };

  return (
    <div className="flex gap-3">
      {/* QC Checklist Button */}
      <Button
        size="default"
        variant="outline"
        onClick={handleQCChecklist}
        disabled={isGeneratingQC}
        className="flex-1 h-12"
      >
        <ClipboardCheck className="h-4 w-4 mr-2" />
        {isGeneratingQC ? 'Generating...' : 'QC Checklist'}
      </Button>

      {/* Sales Order Button */}
      <Button
        size="default"
        variant="outline"
        onClick={handleSalesOrder}
        disabled={isGeneratingSO}
        className="flex-1 h-12"
      >
        <FileText className="h-4 w-4 mr-2" />
        {isGeneratingSO ? 'Generating...' : 'Sales Order'}
      </Button>

      {/* Shipping Label Button */}
      <Dialog open={shippingDialogOpen} onOpenChange={setShippingDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="default"
            variant="outline"
            className="flex-1 h-12"
          >
            <Truck className="h-4 w-4 mr-2" />
            Shipping Label
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate UPS Shipping Label</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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

            <div>
              <Label className="text-sm font-medium">Package Details</Label>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder="Weight (lbs)"
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

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShippingDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleShippingLabel}
                disabled={isGeneratingLabel || !shippingAddress.name || !shippingAddress.street}
                className="flex-1"
              >
                {isGeneratingLabel ? 'Generating...' : 'Generate Label'}
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
              <strong>Note:</strong> This currently generates a placeholder label. 
              UPS API integration is required for live shipping labels.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}