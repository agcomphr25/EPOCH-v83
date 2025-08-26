import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Package, Truck, Download, DollarSign, Weight, Ruler, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface UPSLabelCreatorProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (labelData: any) => void;
}

interface Address {
  name: string;
  company?: string;
  contact?: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string;
  email?: string;
  isResidential?: boolean;
}

interface PackageInfo {
  weight: number;
  length?: number;
  width?: number;
  height?: number;
}

interface ShippingRate {
  serviceCode: string;
  serviceName: string;
  totalCharges: number;
  currency: string;
  guaranteedDaysToDelivery?: string;
}

export default function UPSLabelCreator({ orderId, isOpen, onClose, onSuccess }: UPSLabelCreatorProps) {
  const { toast } = useToast();
  
  // Form state
  const [shipToAddress, setShipToAddress] = useState<Address>({
    name: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
  });
  
  const [shipFromAddress, setShipFromAddress] = useState<Address>({
    name: 'AG Composites',
    company: 'AG Composites',
    contact: 'Shipping',
    street: '230 Hamer Rd.',
    city: 'Owens Crossroads',
    state: 'AL',
    zipCode: '35763',
    country: 'US',
    phone: '256-723-8381',
    email: 'shipping@agcomposites.com',
  });
  
  const [packageInfo, setPackageInfo] = useState<PackageInfo>({
    weight: 1,
    length: 12,
    width: 12,
    height: 6,
  });
  
  const [selectedService, setSelectedService] = useState('03'); // UPS Ground
  const [reference1, setReference1] = useState('');
  const [reference2, setReference2] = useState('');
  const [showRates, setShowRates] = useState(false);
  const [rates, setRates] = useState<ShippingRate[]>([]);

  // Get order details with customer and address data
  const { data: orderData } = useQuery({
    queryKey: ['/api/shipping/order', orderId],
    enabled: !!orderId && isOpen,
  });

  const order = (orderData as any);
  const customer = (orderData as any)?.customer;
  const addresses = (orderData as any)?.addresses;

  // Auto-populate customer shipping address
  useEffect(() => {
    if (customer) {
      console.log('🚚 Auto-populating shipping info for:', customer.name);
      console.log('📍 Available addresses:', addresses);
      
      let shippingAddress = null;
      
      // Try to find shipping address from customer addresses
      if (Array.isArray(addresses) && addresses.length > 0) {
        shippingAddress = addresses.find((addr: any) => 
          addr.type === 'shipping' || addr.type === 'both' || addr.isDefault
        ) || addresses[0];
      }
      
      // Fallback: Use order address data if available
      if (!shippingAddress && order?.shippingAddress) {
        shippingAddress = order.shippingAddress;
      }
      
      // Set customer info regardless of address availability
      const customerInfo = {
        name: customer.name || '',
        company: customer.company || '',
        contact: customer.contact || customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        isResidential: !customer.company,
      };

      if (shippingAddress) {
        setShipToAddress({
          ...customerInfo,
          street: shippingAddress.street || '',
          street2: shippingAddress.street2 || '',
          city: shippingAddress.city || '',
          state: shippingAddress.state || '',
          zipCode: shippingAddress.zipCode || '',
          country: shippingAddress.country || 'US',
        });
        console.log('✅ Auto-populated full shipping address');
      } else {
        // At least set customer info, user can fill address manually
        setShipToAddress(prev => ({
          ...prev,
          ...customerInfo,
        }));
        console.log('ℹ️ Auto-populated customer info only, address needs manual entry');
      }
      
      setReference1(orderId);
      setReference2(customer.name || '');
    }
  }, [customer, addresses, orderId, order]);

  // Get shipping rates mutation
  const getRatesMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/shipping/get-rates', {
      method: 'POST',
      body: data,
    }),
    onSuccess: (data) => {
      setRates(data.rates || []);
      setShowRates(true);
      toast({
        title: 'Rates Retrieved',
        description: `Found ${data.rates?.length || 0} shipping options`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Rate Error',
        description: error.message || 'Failed to get shipping rates',
        variant: 'destructive',
      });
    },
  });

  // Create label mutation
  const createLabelMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/shipping/create-label', {
      method: 'POST',
      body: data,
    }),
    onSuccess: (data) => {
      toast({
        title: 'Label Created',
        description: `Tracking number: ${data.trackingNumber}`,
      });
      onSuccess(data);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Label Creation Failed',
        description: error.message || 'Failed to create shipping label',
        variant: 'destructive',
      });
    },
  });

  const handleGetRates = () => {
    if (!validateAddresses()) return;
    
    getRatesMutation.mutate({
      shipToAddress,
      shipFromAddress,
      packageWeight: packageInfo.weight,
      packageDimensions: packageInfo.length ? {
        length: packageInfo.length,
        width: packageInfo.width,
        height: packageInfo.height,
      } : undefined,
    });
  };

  const handleCreateLabel = () => {
    if (!validateAddresses()) return;
    
    createLabelMutation.mutate({
      orderId,
      shipToAddress,
      shipFromAddress,
      packageWeight: packageInfo.weight,
      packageDimensions: packageInfo.length ? {
        length: packageInfo.length,
        width: packageInfo.width,
        height: packageInfo.height,
      } : undefined,
      serviceType: selectedService,
      reference1,
      reference2,
    });
  };

  const validateAddresses = () => {
    if (!shipToAddress.name || !shipToAddress.street || !shipToAddress.city || 
        !shipToAddress.state || !shipToAddress.zipCode) {
      toast({
        title: 'Invalid Ship To Address',
        description: 'Please fill in all required shipping address fields',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const downloadLabel = (labelBase64: string, trackingNumber: string) => {
    const link = document.createElement('a');
    link.href = `data:image/gif;base64,${labelBase64}`;
    link.download = `UPS_Label_${orderId}_${trackingNumber}.gif`;
    link.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Create UPS Shipping Label - {orderId}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ship From Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Ship From Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={shipFromAddress.name}
                    onChange={(e) => setShipFromAddress(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Contact</Label>
                  <Input
                    value={shipFromAddress.contact}
                    onChange={(e) => setShipFromAddress(prev => ({ ...prev, contact: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <Label>Street Address</Label>
                <Input
                  value={shipFromAddress.street}
                  onChange={(e) => setShipFromAddress(prev => ({ ...prev, street: e.target.value }))}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    value={shipFromAddress.city}
                    onChange={(e) => setShipFromAddress(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={shipFromAddress.state}
                    onChange={(e) => setShipFromAddress(prev => ({ ...prev, state: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>ZIP Code</Label>
                  <Input
                    value={shipFromAddress.zipCode}
                    onChange={(e) => setShipFromAddress(prev => ({ ...prev, zipCode: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ship To Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Ship To Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Name *</Label>
                  <Input
                    value={shipToAddress.name}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input
                    value={shipToAddress.company}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, company: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <Label>Street Address *</Label>
                <Input
                  value={shipToAddress.street}
                  onChange={(e) => setShipToAddress(prev => ({ ...prev, street: e.target.value }))}
                />
              </div>
              
              <div>
                <Label>Apt/Suite/Unit</Label>
                <Input
                  value={shipToAddress.street2}
                  onChange={(e) => setShipToAddress(prev => ({ ...prev, street2: e.target.value }))}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>City *</Label>
                  <Input
                    value={shipToAddress.city}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>State *</Label>
                  <Input
                    value={shipToAddress.state}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, state: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>ZIP Code *</Label>
                  <Input
                    value={shipToAddress.zipCode}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, zipCode: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={shipToAddress.phone}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={shipToAddress.email}
                    onChange={(e) => setShipToAddress(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Package Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Weight className="w-4 h-4" />
              Package Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Weight (lbs) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={packageInfo.weight}
                  onChange={(e) => setPackageInfo(prev => ({ ...prev, weight: parseFloat(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <Label>Length (in)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={packageInfo.length}
                  onChange={(e) => setPackageInfo(prev => ({ ...prev, length: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Width (in)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={packageInfo.width}
                  onChange={(e) => setPackageInfo(prev => ({ ...prev, width: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Height (in)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={packageInfo.height}
                  onChange={(e) => setPackageInfo(prev => ({ ...prev, height: parseFloat(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <Label>Reference 1</Label>
                <Input
                  value={reference1}
                  onChange={(e) => setReference1(e.target.value)}
                  placeholder="Order ID"
                />
              </div>
              <div>
                <Label>Reference 2</Label>
                <Input
                  value={reference2}
                  onChange={(e) => setReference2(e.target.value)}
                  placeholder="Customer Name"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shipping Rates */}
        <div className="flex gap-4">
          <Button
            onClick={handleGetRates}
            disabled={getRatesMutation.isPending}
            variant="outline"
            className="flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            {getRatesMutation.isPending ? 'Getting Rates...' : 'Get Shipping Rates'}
          </Button>

          {showRates && rates.length > 0 && (
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select shipping service" />
              </SelectTrigger>
              <SelectContent>
                {rates.map((rate) => (
                  <SelectItem key={rate.serviceCode} value={rate.serviceCode}>
                    <div className="flex justify-between w-full">
                      <span>{rate.serviceName}</span>
                      <span className="ml-4 font-bold">${rate.totalCharges.toFixed(2)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateLabel}
            disabled={createLabelMutation.isPending}
            className="flex items-center gap-2"
          >
            <Truck className="w-4 h-4" />
            {createLabelMutation.isPending ? 'Creating Label...' : 'Create Shipping Label'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}