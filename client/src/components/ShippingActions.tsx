import React, { useState } from 'react';
import { FileText, Truck, ClipboardCheck } from 'lucide-react';
import axios from 'axios';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface ShippingActionsProps {
  orderId: string;
  orderData?: any;
  onCreateLabel?: () => void;
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

export function ShippingActions({ orderId, orderData, onCreateLabel }: ShippingActionsProps) {
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
    zip: '',
  });

  const [packageDetails, setPackageDetails] = useState<PackageDetails>({
    weight: '10',
    length: '12',
    width: '12',
    height: '12',
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
      // Open PDF in new tab for easy printing instead of downloading
      window.open(`/api/shipping-pdf/qc-checklist/${orderId}`, '_blank');

      toast({
        title: 'QC Checklist Generated',
        description: `QC checklist for order ${orderId} opened in new tab.`,
      });
    } catch (error) {
      console.error('Error generating QC checklist:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate QC checklist. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingQC(false);
    }
  };

  const handleSalesOrder = async () => {
    setIsGeneratingSO(true);
    try {
      // Open PDF in new tab for easy printing instead of downloading
      window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');

      toast({
        title: 'Sales Order Generated',
        description: `Sales order for ${orderId} opened in new tab.`,
      });
    } catch (error) {
      console.error('Error generating sales order:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate sales order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSO(false);
    }
  };

  const handleShippingLabel = async () => {
    setIsGeneratingLabel(true);
    try {
      // Send package details to server for UPS label generation
      const response = await axios.post(
        `/api/shipping-pdf/ups-shipping-label/${orderId}`,
        {
          shippingAddress,
          packageDetails,
        }
      );

      if (response.data.success && response.data.labelUrl) {
        // Open the generated label in new tab
        window.open(response.data.labelUrl, '_blank');

        toast({
          title: 'Shipping Label Generated',
          description: `UPS shipping label for order ${orderId} created with tracking: ${response.data.trackingNumber}`,
        });

        // Refresh any tracking displays if needed
        window.dispatchEvent(
          new CustomEvent('trackingUpdated', { detail: { orderId } })
        );

        setShippingDialogOpen(false);

        // Reset form
        setShippingAddress({
          name: '',
          street: '',
          city: '',
          state: '',
          zip: '',
        });
        setPackageDetails({
          weight: '10',
          length: '12',
          width: '12',
          height: '12',
        });
      } else {
        // If no labelUrl returned, fall back to direct URL approach
        window.open(
          `/api/shipping-pdf/ups-shipping-label/${orderId}`,
          '_blank'
        );

        toast({
          title: 'Shipping Label Generated',
          description: `UPS shipping label for order ${orderId} opened in new tab for printing.`,
        });

        setShippingDialogOpen(false);
      }
    } catch (error) {
      console.error('Error generating shipping label:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate shipping label. Please try again.',
        variant: 'destructive',
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

      {/* UPS Shipping Label Button - Opens New Label Creator */}
      <Button
        size="default"
        variant="outline"
        onClick={onCreateLabel}
        className="flex-1 h-12"
        data-testid="button-create-shipping-label"
      >
        <Truck className="h-4 w-4 mr-2" />
        Create Shipping Label
      </Button>
    </div>
  );
}
