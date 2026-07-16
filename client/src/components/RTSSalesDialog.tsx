import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import CustomerSearchInput from './CustomerSearchInput';
import { BarcodeDisplay } from './BarcodeDisplay';
import { useToast } from '@/hooks/use-toast';
import { Package, DollarSign, Truck, CreditCard } from 'lucide-react';

interface RTSInventoryItem {
  id: string;
  rtsNumber: string;
  stockModel: string;
  actionLength: string | null;
  action: string | null;
  barrel: string | null;
  bottomMetal: string | null;
  color: string | null;
  extras: string | null;
  lastDepartment: string | null;
  status: string;
  price: number | null;
}

interface RTSSalesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  availableItems: RTSInventoryItem[];
}

export default function RTSSalesDialog({
  isOpen,
  onClose,
  availableItems,
}: RTSSalesDialogProps) {
  const { toast } = useToast();
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerId, setCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');

  // Shipping address
  const [shipToName, setShipToName] = useState('');
  const [shipToCompany, setShipToCompany] = useState('');
  const [shipToStreet, setShipToStreet] = useState('');
  const [shipToStreet2, setShipToStreet2] = useState('');
  const [shipToCity, setShipToCity] = useState('');
  const [shipToState, setShipToState] = useState('');
  const [shipToZipCode, setShipToZipCode] = useState('');
  const [shipToCountry, setShipToCountry] = useState('US');
  const [shipToPhone, setShipToPhone] = useState('');

  // Package info
  const [packageWeight, setPackageWeight] = useState('5');
  const [packageLength, setPackageLength] = useState('48');
  const [packageWidth, setPackageWidth] = useState('12');
  const [packageHeight, setPackageHeight] = useState('6');

  // Shipping method
  const [shippingMethod, setShippingMethod] = useState('03'); // UPS Ground
  const [createdOrder, setCreatedOrder] = useState<{
    orderId: string;
    barcode: string;
    department: string;
  } | null>(null);

  // Payment info
  const [addPayment, setAddPayment] = useState(false);
  const [paymentType, setPaymentType] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedItemIds(new Set());
      setItemPrices({});
      setSelectedCustomer(null);
      setCustomerId('');
      setCustomerName('');
      setShipToName('');
      setShipToCompany('');
      setShipToStreet('');
      setShipToStreet2('');
      setShipToCity('');
      setShipToState('');
      setShipToZipCode('');
      setShipToCountry('US');
      setShipToPhone('');
      setPackageWeight('5');
      setPackageLength('48');
      setPackageWidth('12');
      setPackageHeight('6');
      setShippingMethod('03');
      setAddPayment(false);
      setPaymentType('cash');
      setPaymentAmount('');
      setPaymentNotes('');
    }
  }, [isOpen]);

  const createSaleMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/rts-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rts-sales'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      
      const paymentMsg = response.payment ? ` Payment of $${response.payment.paymentAmount.toFixed(2)} recorded.` : '';
      const orderMsg = response.order ? ` Order ${response.order.orderId} created.` : '';
      if (response.order) {
        setCreatedOrder(response.order);
      }
      
      if (response.labelError) {
        toast({
          title: 'Sale Created (Label Failed)',
          description: `Sale created successfully but shipping label generation failed: ${response.labelError}${paymentMsg}${orderMsg}`,
          variant: 'destructive',
        });
      } else if (response.label) {
        toast({
          title: 'Sale Created & Label Generated',
          description: `Sale ${response.sale.saleNumber} created with tracking ${response.sale.trackingNumber}.${paymentMsg}${orderMsg}`,
        });
      } else {
        toast({
          title: 'Sale Created',
          description: `Sale ${response.sale.saleNumber} created successfully.${paymentMsg}${orderMsg}`,
        });
      }
      
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Error Creating Sale',
        description: error.message || 'Failed to create RTS sale',
        variant: 'destructive',
      });
    },
  });

  const handleToggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItemIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      const newPrices = { ...itemPrices };
      delete newPrices[itemId];
      setItemPrices(newPrices);
    } else {
      newSelected.add(itemId);
      // Set default price from item if available
      const item = availableItems.find(i => i.id === itemId);
      if (item?.price) {
        setItemPrices({ ...itemPrices, [itemId]: item.price });
      }
    }
    setSelectedItemIds(newSelected);
  };

  const handlePriceChange = (itemId: string, value: string) => {
    const price = parseFloat(value);
    if (!isNaN(price)) {
      setItemPrices({ ...itemPrices, [itemId]: price });
    }
  };

  const handleCustomerSelect = async (customer: any) => {
    setSelectedCustomer(customer);
    
    if (!customer) {
      setCustomerId('');
      setCustomerName('');
      return;
    }
    
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    
    // Set basic info
    setShipToName(customer.name);
    setShipToPhone(customer.phone || '');
    
    // Fetch customer addresses to auto-fill shipping address
    try {
      const response = await fetch(`/api/customers/${customer.id}/addresses`);
      if (response.ok) {
        const addresses = await response.json();
        // Find default shipping address or first address
        const shippingAddr = addresses.find((addr: any) => 
          (addr.type === 'shipping' || addr.type === 'both') && addr.isDefault
        ) || addresses.find((addr: any) => 
          addr.type === 'shipping' || addr.type === 'both'
        ) || addresses[0];
        
        if (shippingAddr) {
          setShipToStreet(shippingAddr.street || '');
          setShipToStreet2(shippingAddr.street2 || '');
          setShipToCity(shippingAddr.city || '');
          setShipToState(shippingAddr.state || '');
          setShipToZipCode(shippingAddr.zipCode || '');
          setShipToCountry(shippingAddr.country || 'US');
        }
      }
    } catch (error) {
      console.error('Error fetching customer addresses:', error);
      // Continue without address auto-fill
    }
  };

  const calculateTotal = () => {
    return Array.from(selectedItemIds).reduce((sum, itemId) => {
      return sum + (itemPrices[itemId] || 0);
    }, 0);
  };

  const handleSubmit = () => {
    // Validation
    if (selectedItemIds.size === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select at least one RTS item to sell',
        variant: 'destructive',
      });
      return;
    }

    if (!customerId) {
      toast({
        title: 'No Customer Selected',
        description: 'Please select a customer for this sale',
        variant: 'destructive',
      });
      return;
    }

    if (!shipToName || !shipToStreet || !shipToCity || !shipToState || !shipToZipCode) {
      toast({
        title: 'Incomplete Shipping Address',
        description: 'Please fill in all required shipping address fields',
        variant: 'destructive',
      });
      return;
    }

    // Check all items have prices
    for (const itemId of Array.from(selectedItemIds)) {
      if (!itemPrices[itemId] || itemPrices[itemId] <= 0) {
        toast({
          title: 'Missing Item Price',
          description: 'Please set a price for all selected items',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validate payment if enabled
    if (addPayment) {
      const payAmt = parseFloat(paymentAmount);
      if (isNaN(payAmt) || payAmt <= 0) {
        toast({
          title: 'Invalid Payment Amount',
          description: 'Please enter a valid payment amount',
          variant: 'destructive',
        });
        return;
      }
    }

    const saleData: any = {
      customerId: customerId.toString(),
      items: Array.from(selectedItemIds).map(itemId => ({
        rtsInventoryId: itemId,
        unitPrice: itemPrices[itemId],
      })),
      shipTo: {
        name: shipToName,
        company: shipToCompany,
        street: shipToStreet,
        street2: shipToStreet2,
        city: shipToCity,
        state: shipToState,
        zipCode: shipToZipCode,
        country: shipToCountry,
        phone: shipToPhone,
      },
      shipping: {
        method: shippingMethod,
      },
      package: {
        weight: parseFloat(packageWeight),
        length: parseFloat(packageLength),
        width: parseFloat(packageWidth),
        height: parseFloat(packageHeight),
      },
      generateLabel: true,
    };

    // Add payment data if enabled
    if (addPayment && paymentAmount) {
      saleData.payment = {
        paymentType: paymentType,
        paymentAmount: parseFloat(paymentAmount),
        notes: paymentNotes || undefined,
      };
    }

    createSaleMutation.mutate(saleData);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Create RTS Sale
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Item Selection */}
          <div>
            <h3 className="font-semibold mb-3">Select Items to Sell</h3>
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {availableItems.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No RTS items available for sale
                </div>
              ) : (
                <div className="divide-y">
                  {availableItems.map(item => (
                    <div key={item.id} className="p-3 hover:bg-muted/50">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedItemIds.has(item.id)}
                          onCheckedChange={() => handleToggleItem(item.id)}
                          data-testid={`checkbox-rts-item-${item.id}`}
                        />
                        <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="font-mono font-semibold mr-2">{item.rtsNumber}</span>
                            <span className="font-medium">{item.stockModel}</span>
                            {item.actionLength && <span className="text-muted-foreground"> • {item.actionLength}</span>}
                          </div>
                          <div className="text-muted-foreground">
                            {item.action} {item.barrel && `• ${item.barrel}`}
                          </div>
                          <div className="text-muted-foreground">
                            {item.color}
                            {item.lastDepartment && ` • Last: ${item.lastDepartment}`}
                          </div>
                        </div>
                        {selectedItemIds.has(item.id) && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={itemPrices[item.id] || ''}
                              onChange={(e) => handlePriceChange(item.id, e.target.value)}
                              className="w-24"
                              placeholder="Price"
                              data-testid={`input-price-${item.id}`}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedItemIds.size > 0 && (
              <div className="mt-2 text-sm font-medium">
                Selected: {selectedItemIds.size} item(s) • Total: ${calculateTotal().toFixed(2)}
              </div>
            )}
          </div>

          <Separator />

          {/* Customer Selection */}
          <div>
            <h3 className="font-semibold mb-3">Customer</h3>
            <CustomerSearchInput
              value={selectedCustomer}
              onValueChange={handleCustomerSelect}
              placeholder="Search or create customer..."
            />
          </div>

          <Separator />

          {/* Shipping Address */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Shipping Address
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="shipToName">Name *</Label>
                <Input
                  id="shipToName"
                  value={shipToName}
                  onChange={(e) => setShipToName(e.target.value)}
                  data-testid="input-ship-to-name"
                />
              </div>
              <div>
                <Label htmlFor="shipToCompany">Company</Label>
                <Input
                  id="shipToCompany"
                  value={shipToCompany}
                  onChange={(e) => setShipToCompany(e.target.value)}
                  data-testid="input-ship-to-company"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="shipToStreet">Street Address *</Label>
                <Input
                  id="shipToStreet"
                  value={shipToStreet}
                  onChange={(e) => setShipToStreet(e.target.value)}
                  data-testid="input-ship-to-street"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="shipToStreet2">Street Address 2</Label>
                <Input
                  id="shipToStreet2"
                  value={shipToStreet2}
                  onChange={(e) => setShipToStreet2(e.target.value)}
                  data-testid="input-ship-to-street2"
                />
              </div>
              <div>
                <Label htmlFor="shipToCity">City *</Label>
                <Input
                  id="shipToCity"
                  value={shipToCity}
                  onChange={(e) => setShipToCity(e.target.value)}
                  data-testid="input-ship-to-city"
                />
              </div>
              <div>
                <Label htmlFor="shipToState">State *</Label>
                <Input
                  id="shipToState"
                  value={shipToState}
                  onChange={(e) => setShipToState(e.target.value)}
                  maxLength={2}
                  placeholder="AL"
                  data-testid="input-ship-to-state"
                />
              </div>
              <div>
                <Label htmlFor="shipToZipCode">Zip Code *</Label>
                <Input
                  id="shipToZipCode"
                  value={shipToZipCode}
                  onChange={(e) => setShipToZipCode(e.target.value)}
                  data-testid="input-ship-to-zip"
                />
              </div>
              <div>
                <Label htmlFor="shipToPhone">Phone</Label>
                <Input
                  id="shipToPhone"
                  value={shipToPhone}
                  onChange={(e) => setShipToPhone(e.target.value)}
                  data-testid="input-ship-to-phone"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Payment Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment (Optional)
              </h3>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="addPayment"
                  checked={addPayment}
                  onCheckedChange={(checked) => {
                    setAddPayment(checked === true);
                    if (checked) {
                      setPaymentAmount(calculateTotal().toFixed(2));
                    }
                  }}
                  data-testid="checkbox-add-payment"
                />
                <Label htmlFor="addPayment" className="text-sm cursor-pointer">
                  Add payment now
                </Label>
              </div>
            </div>
            
            {addPayment && (
              <div className="grid grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/30">
                <div>
                  <Label htmlFor="paymentType">Payment Type *</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger data-testid="select-payment-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="ach">ACH/Bank Transfer</SelectItem>
                      <SelectItem value="agr">AGR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="paymentAmount">Amount *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="paymentAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="pl-8"
                      placeholder="0.00"
                      data-testid="input-payment-amount"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="paymentNotes">Notes</Label>
                  <Input
                    id="paymentNotes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Check #, reference, etc."
                    data-testid="input-payment-notes"
                  />
                </div>
                <div className="col-span-3 text-sm text-muted-foreground">
                  Order total: ${calculateTotal().toFixed(2)}
                  {parseFloat(paymentAmount) > 0 && parseFloat(paymentAmount) < calculateTotal() && (
                    <span className="ml-2 text-amber-600">
                      (Partial payment - ${(calculateTotal() - parseFloat(paymentAmount)).toFixed(2)} will remain due)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Package & Shipping */}
          <div>
            <h3 className="font-semibold mb-3">Package Details</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="weight">Weight (lbs) *</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={packageWeight}
                  onChange={(e) => setPackageWeight(e.target.value)}
                  data-testid="input-package-weight"
                />
              </div>
              <div>
                <Label htmlFor="length">Length (in)</Label>
                <Input
                  id="length"
                  type="number"
                  value={packageLength}
                  onChange={(e) => setPackageLength(e.target.value)}
                  data-testid="input-package-length"
                />
              </div>
              <div>
                <Label htmlFor="width">Width (in)</Label>
                <Input
                  id="width"
                  type="number"
                  value={packageWidth}
                  onChange={(e) => setPackageWidth(e.target.value)}
                  data-testid="input-package-width"
                />
              </div>
              <div>
                <Label htmlFor="height">Height (in)</Label>
                <Input
                  id="height"
                  type="number"
                  value={packageHeight}
                  onChange={(e) => setPackageHeight(e.target.value)}
                  data-testid="input-package-height"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="shippingMethod">Shipping Method</Label>
              <Select value={shippingMethod} onValueChange={setShippingMethod}>
                <SelectTrigger data-testid="select-shipping-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="03">UPS Ground</SelectItem>
                  <SelectItem value="02">UPS 2nd Day Air</SelectItem>
                  <SelectItem value="01">UPS Next Day Air</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createSaleMutation.isPending || selectedItemIds.size === 0}
            data-testid="button-create-sale"
          >
            {createSaleMutation.isPending ? 'Creating...' : 'Create RTS Sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!createdOrder} onOpenChange={(open) => !open && setCreatedOrder(null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Production Order Created</DialogTitle>
        </DialogHeader>
        {createdOrder && (
          <div className="space-y-4">
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              Order <span className="font-mono font-semibold">{createdOrder.orderId}</span> was
              entered into the regular {createdOrder.department} queue. Print this barcode and
              attach it to the item before sending it to production.
            </div>
            <BarcodeDisplay
              orderId={createdOrder.orderId}
              barcode={createdOrder.barcode}
              titleLabel="Production Order Barcode"
              printHeaderLabel="P1 ORDER"
            />
            <DialogFooter>
              <Button onClick={() => setCreatedOrder(null)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
