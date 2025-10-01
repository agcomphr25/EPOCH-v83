import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Mail, 
  Phone, 
  Building, 
  MapPin,
  Filter,
  Download,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  FileText,
  BarChart3,
  Copy,
  Truck
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


type Customer = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  contact?: string;
  customerType: string;
  preferredCommunicationMethod?: string[]; // Array of "email" and/or "sms"
  notes?: string;
  isActive: boolean;
  billingSameAsShipping?: boolean;
  createdAt: string;
  updatedAt: string;
};

type CustomerAddress = {
  id: number;
  customerId: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  type: 'shipping' | 'billing' | 'both';
  isDefault: boolean;
  isValidated: boolean;
  createdAt: string;
  updatedAt: string;
};

type CustomerFormData = {
  name: string;
  email: string;
  phone: string;
  contact: string;
  customerType: string;
  preferredCommunicationMethod: string[]; // Array of "email" and/or "sms"
  notes: string;
  isActive: boolean;
  // Primary address fields
  street: string;
  street2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  addressType: string;
};

type AddressFormData = {
  customerId: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  type: 'shipping' | 'billing' | 'both';
  isDefault: boolean;
};

const initialFormData: CustomerFormData = {
  name: '',
  email: '',
  phone: '',
  contact: '',
  customerType: 'standard',
  preferredCommunicationMethod: [],
  notes: '',
  isActive: true,
  // Primary address fields
  street: '',
  street2: '',
  city: '',
  state: '',
  zipCode: '',
  country: 'United States',
  addressType: 'both'
};

const initialAddressFormData: AddressFormData = {
  customerId: '',
  street: '',
  street2: '',
  city: '',
  state: '',
  zipCode: '',
  country: 'United States',
  type: 'shipping',
  isDefault: false,
};

// Move CustomerFormFields outside the main component to prevent cursor reset
const CustomerFormFields = ({ 
  formData, 
  setFormData, 
  formErrors
}: { 
  formData: CustomerFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  formErrors: Record<string, string>;
}) => (
  <div className="space-y-6 py-4">
    {/* Customer Information Section */}
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
        <UserCheck className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">Customer Information</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className={formErrors.name ? "border-red-500" : ""}
            placeholder="Enter customer name"
          />
          {formErrors.name && (
            <p className="text-sm text-red-500">{formErrors.name}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className={formErrors.email ? "border-red-500" : ""}
            placeholder="customer@example.com"
          />
          {formErrors.email && (
            <p className="text-sm text-red-500">{formErrors.email}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            className={formErrors.phone ? "border-red-500" : ""}
            placeholder="(555) 123-4567"
          />
          {formErrors.phone && (
            <p className="text-sm text-red-500">{formErrors.phone}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="contact" className="text-sm font-medium">Contact</Label>
          <Input
            id="contact"
            value={formData.contact}
            onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
            className={formErrors.contact ? "border-red-500" : ""}
            placeholder="Contact person name"
          />
          {formErrors.contact && (
            <p className="text-sm text-red-500">{formErrors.contact}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="customerType" className="text-sm font-medium">Type</Label>
          <Select 
            value={formData.customerType} 
            onValueChange={(value) => setFormData(prev => ({ ...prev, customerType: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select customer type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preferred Communication Method Section */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">Preferred Communication Method</Label>
        <div className="flex flex-col space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="comm-email"
              checked={formData.preferredCommunicationMethod.includes('email')}
              onCheckedChange={(checked) => {
                const methods = formData.preferredCommunicationMethod;
                if (checked) {
                  setFormData(prev => ({ 
                    ...prev, 
                    preferredCommunicationMethod: [...methods, 'email'] 
                  }));
                } else {
                  setFormData(prev => ({ 
                    ...prev, 
                    preferredCommunicationMethod: methods.filter(m => m !== 'email') 
                  }));
                }
              }}
            />
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <Label htmlFor="comm-email" className="text-sm font-medium cursor-pointer">
                Email
              </Label>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="comm-sms"
              checked={formData.preferredCommunicationMethod.includes('sms')}
              onCheckedChange={(checked) => {
                const methods = formData.preferredCommunicationMethod;
                if (checked) {
                  setFormData(prev => ({ 
                    ...prev, 
                    preferredCommunicationMethod: [...methods, 'sms'] 
                  }));
                } else {
                  setFormData(prev => ({ 
                    ...prev, 
                    preferredCommunicationMethod: methods.filter(m => m !== 'sms') 
                  }));
                }
              }}
            />
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-green-600" />
              <Label htmlFor="comm-sms" className="text-sm font-medium cursor-pointer">
                SMS
              </Label>
            </div>
          </div>
          
          {formData.preferredCommunicationMethod.length === 0 && (
            <p className="text-sm text-gray-500 italic">No communication method selected</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="isActive" className="text-sm font-medium">Status</Label>
          <Select 
            value={formData.isActive ? 'active' : 'inactive'} 
            onValueChange={(value) => setFormData(prev => ({ ...prev, isActive: value === 'active' }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Additional notes about this customer..."
          rows={3}
          className="resize-none"
        />
      </div>
    </div>

  </div>
);

// Redesigned Address Management with shipping-first approach (Option 1)
const AddressManagementTabs = ({ 
  selectedCustomer, 
  userRole = 'EMPLOYEE' 
}: { 
  selectedCustomer: Customer | null;
  userRole?: string;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // New shipping-first state management
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddressData, setNewAddressData] = useState<AddressFormData>({
    ...initialAddressFormData,
    type: 'shipping'
  });
  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});

  // Determine if user is from shipping department
  const isShippingDepartment = userRole?.toLowerCase() === 'shipping' || 
                               userRole?.toLowerCase() === 'shipping_employee' ||
                               userRole?.toLowerCase().includes('ship');
  
  // Show billing section when not shipping-only user and billing is not linked to shipping
  const showBillingSection = !isShippingDepartment && !billingSameAsShipping;

  // Set customer ID when selected customer changes
  useEffect(() => {
    if (selectedCustomer) {
      setNewAddressData(prev => ({ ...prev, customerId: selectedCustomer.id.toString() }));
      // Read billingSameAsShipping preference from customer data
      setBillingSameAsShipping(selectedCustomer.billingSameAsShipping ?? true);
    }
  }, [selectedCustomer]);

  // Fetch addresses
  const { 
    data: addresses = [], 
    isLoading: addressesLoading 
  } = useQuery<CustomerAddress[]>({
    queryKey: ['/api/addresses', selectedCustomer?.id],
    enabled: !!selectedCustomer?.id,
  });

  // Filter addresses by type (include 'both' for legacy compatibility)
  const shippingAddresses = addresses.filter(addr => addr.type === 'shipping' || addr.type === 'both');
  const billingAddresses = addresses.filter(addr => addr.type === 'billing' || addr.type === 'both');

  // Get default addresses
  const defaultShippingAddress = shippingAddresses.find(addr => addr.isDefault);
  const defaultBillingAddress = billingAddresses.find(addr => addr.isDefault);

  // Address mutations
  const createAddressMutation = useMutation({
    mutationFn: async (addressData: AddressFormData) => {
      return apiRequest('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });
      setNewAddressData({ ...initialAddressFormData, customerId: selectedCustomer?.id.toString() || '' });
      setAddressErrors({});
      setShowAddressForm(false);
      toast({
        title: "Success",
        description: "Address added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add address",
        variant: "destructive",
      });
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (data: CustomerAddress) => {
      return apiRequest(`/api/addresses/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/addresses/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });
    },
  });

  // Customer preference mutation for billingSameAsShipping
  const updateCustomerPreferenceMutation = useMutation({
    mutationFn: async ({ customerId, billingSameAsShipping }: { customerId: number; billingSameAsShipping: boolean }) => {
      return apiRequest(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingSameAsShipping }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
    },
  });

  // Handle billing same as shipping toggle
  const handleBillingSameAsShippingToggle = async (enabled: boolean) => {
    if (!selectedCustomer) return;
    
    // Update local state immediately for responsiveness
    setBillingSameAsShipping(enabled);
    
    try {
      await updateCustomerPreferenceMutation.mutateAsync({
        customerId: selectedCustomer.id,
        billingSameAsShipping: enabled,
      });
      
      // If enabling billing same as shipping, sync billing to current default shipping
      if (enabled) {
        const defaultShipping = shippingAddresses.find(addr => addr.isDefault);
        if (defaultShipping) {
          // Unset current default billing
          const currentDefaultBilling = billingAddresses.find(addr => addr.isDefault);
          if (currentDefaultBilling) {
            await updateAddressMutation.mutateAsync({
              ...currentDefaultBilling,
              isDefault: false,
            });
          }

          // Sync billing to match default shipping
          if (defaultShipping.type === 'shipping' || defaultShipping.type === 'both') {
            if (defaultShipping.type === 'shipping') {
              // Convert shipping address to 'both' type
              await updateAddressMutation.mutateAsync({
                ...defaultShipping,
                type: 'both',
                isDefault: true,
              });
            }
            // If already 'both', it's already set as default
          } else {
            // Create new billing address matching shipping
            const billingAddress = {
              customerId: defaultShipping.customerId,
              type: 'billing' as const,
              street: defaultShipping.street,
              street2: defaultShipping.street2,
              city: defaultShipping.city,
              state: defaultShipping.state,
              zipCode: defaultShipping.zipCode,
              country: defaultShipping.country,
              isDefault: true,
            };
            await createAddressMutation.mutateAsync(billingAddress);
          }
        }
      }
      
      toast({
        title: "Success",
        description: enabled ? "Billing will use shipping address" : "Billing address separated",
      });
    } catch (error) {
      // Revert local state on error
      setBillingSameAsShipping(!enabled);
      toast({
        title: "Error",
        description: "Failed to update billing preference",
        variant: "destructive",
      });
    }
  };

  // Handle shipping address selection (radio button change)
  const handleShippingAddressSelect = async (address: CustomerAddress) => {
    try {
      // Set all other shipping addresses to not default
      const otherShippingAddresses = shippingAddresses.filter(addr => addr.id !== address.id && addr.isDefault);
      
      for (const addr of otherShippingAddresses) {
        // Only send the fields that need to be updated
        await apiRequest(`/api/addresses/${addr.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDefault: false }),
        });
      }

      // Set the selected address as default
      // Only send the fields that need to be updated
      await apiRequest(`/api/addresses/${address.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });

      // Auto-sync billing address when billingSameAsShipping is enabled
      if (billingSameAsShipping) {
        // Find current default billing address and unset it
        const currentDefaultBilling = billingAddresses.find(addr => addr.isDefault);
        if (currentDefaultBilling) {
          await apiRequest(`/api/addresses/${currentDefaultBilling.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isDefault: false }),
          });
        }

        // If the shipping address can serve as billing (type 'shipping' or 'both'), set it as billing default
        if (address.type === 'shipping' || address.type === 'both') {
          // If it's type 'shipping', we need to update it to 'both' to serve billing needs
          if (address.type === 'shipping') {
            await apiRequest(`/api/addresses/${address.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'both', isDefault: true }),
            });
          }
          // If it's already 'both', it's already set as default above
        } else {
          // Create a new billing address matching the shipping address
          const billingAddress = {
            customerId: address.customerId,
            type: 'billing' as const,
            street: address.street,
            street2: address.street2,
            city: address.city,
            state: address.state,
            zipCode: address.zipCode,
            country: address.country,
            isDefault: true,
          };
          await createAddressMutation.mutateAsync(billingAddress);
        }
      }

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });

      toast({
        title: "Success",
        description: billingSameAsShipping 
          ? `Shipping and billing will now use this address`
          : `Shipping will now use this address`,
      });
    } catch (error) {
      console.error('Error updating shipping address:', error);
      toast({
        title: "Error",
        description: "Failed to update shipping address",
        variant: "destructive",
      });
    }
  };

  // Handle delete address with default reassignment logic
  const handleDeleteAddress = async (addressId: number) => {
    const addressToDelete = addresses.find(addr => addr.id === addressId);
    if (!addressToDelete) return;

    const isDefaultAddress = addressToDelete.isDefault;
    const addressType = addressToDelete.type;
    
    // Determine which address types need new defaults after deletion
    const typesToReassign: Array<'shipping' | 'billing'> = [];
    if (addressType === 'shipping' || addressType === 'both') {
      typesToReassign.push('shipping');
    }
    if (addressType === 'billing' || addressType === 'both') {
      typesToReassign.push('billing');
    }

    // Check if there are remaining addresses for each type
    const remainingShippingAddresses = addresses.filter(addr => 
      addr.id !== addressId && (addr.type === 'shipping' || addr.type === 'both')
    );
    const remainingBillingAddresses = addresses.filter(addr => 
      addr.id !== addressId && (addr.type === 'billing' || addr.type === 'both')
    );

    // Warn if deleting the last address of any type
    const warningMessages = [];
    if (typesToReassign.includes('shipping') && remainingShippingAddresses.length === 0) {
      warningMessages.push('shipping');
    }
    if (typesToReassign.includes('billing') && remainingBillingAddresses.length === 0) {
      warningMessages.push('billing');
    }

    if (warningMessages.length > 0) {
      const confirmed = window.confirm(
        `This is the last ${warningMessages.join(' and ')} address. Deleting it will leave the customer without any ${warningMessages.join(' and ')} addresses. Are you sure you want to continue?`
      );
      if (!confirmed) return;
    } else if (isDefaultAddress) {
      const confirmed = window.confirm(
        `This is the default ${addressType} address. Deleting it will automatically set another address as the default. Are you sure you want to delete this address?`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm("Are you sure you want to delete this address? This action cannot be undone.");
      if (!confirmed) return;
    }

    try {
      // Delete the address
      await deleteAddressMutation.mutateAsync(addressId);
      
      const newDefaults: string[] = [];
      let chosenShippingAddress: any = null;
      let chosenBillingAddress: any = null;
      
      // If it was a default address, promote new defaults for each affected type independently
      if (isDefaultAddress) {
        // Handle shipping default reassignment atomically
        if (typesToReassign.includes('shipping') && remainingShippingAddresses.length > 0) {
          chosenShippingAddress = remainingShippingAddresses[0];
          
          // Clear ALL shipping defaults first (atomic operation)
          for (const addr of remainingShippingAddresses.filter(addr => addr.isDefault)) {
            await updateAddressMutation.mutateAsync({
              ...addr,
              isDefault: false,
            });
          }
          
          // Set new shipping default
          await updateAddressMutation.mutateAsync({
            ...chosenShippingAddress,
            isDefault: true,
          });
          
          newDefaults.push(`"${chosenShippingAddress.street}" as shipping default`);
        }

        // Handle billing default reassignment atomically
        if (typesToReassign.includes('billing') && remainingBillingAddresses.length > 0) {
          chosenBillingAddress = remainingBillingAddresses[0];
          
          // Always clear ALL billing defaults first (atomic operation)
          for (const addr of remainingBillingAddresses.filter(addr => addr.isDefault)) {
            await updateAddressMutation.mutateAsync({
              ...addr,
              isDefault: false,
            });
          }
          
          // Set new billing default (even if it's the same address as shipping)
          await updateAddressMutation.mutateAsync({
            ...chosenBillingAddress,
            isDefault: true,
          });
          
          // Only add to success message if it's different from shipping
          if (!chosenShippingAddress || chosenBillingAddress.id !== chosenShippingAddress.id) {
            newDefaults.push(`"${chosenBillingAddress.street}" as billing default`);
          } else if (chosenBillingAddress.type === 'both') {
            // Same address chosen for both, update message to reflect this
            if (newDefaults.length > 0) {
              newDefaults[0] = `"${chosenShippingAddress.street}" as default for both shipping and billing`;
            }
          }
        }

        // Auto-sync billing when billingSameAsShipping is enabled and shipping default changed
        if (billingSameAsShipping && chosenShippingAddress) {
          try {
            // If billing was also reassigned independently, unset it to sync with shipping
            if (chosenBillingAddress && chosenBillingAddress.id !== chosenShippingAddress.id) {
              await updateAddressMutation.mutateAsync({
                ...chosenBillingAddress,
                isDefault: false,
              });
            }

            // Convert the new default shipping to 'both' type if it's 'shipping'
            if (chosenShippingAddress.type === 'shipping') {
              await updateAddressMutation.mutateAsync({
                ...chosenShippingAddress,
                type: 'both',
                isDefault: true,
              });
            }
            // If already 'both', it's already set as default above
          } catch (error) {
            console.error('Failed to sync billing address after deletion:', error);
            // Don't fail the delete operation, just log the sync error
          }
        }
      }

      // Show appropriate success message
      if (newDefaults.length > 0) {
        toast({
          title: "Success",
          description: `Address deleted successfully. Set ${newDefaults.join(' and ')}.`,
        });
      } else {
        toast({
          title: "Success",
          description: "Address deleted successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete address",
        variant: "destructive",
      });
    }
  };

  // Handle new address form submission
  const handleAddNewAddress = async () => {
    const errors: Record<string, string> = {};
    
    if (!newAddressData.street.trim()) errors.street = "Street address is required";
    if (!newAddressData.city.trim()) errors.city = "City is required";
    if (!newAddressData.state.trim()) errors.state = "State is required";
    if (!newAddressData.zipCode.trim()) {
      errors.zipCode = "ZIP code is required";
    } else if (!/^\d{5}(-\d{4})?$/.test(newAddressData.zipCode)) {
      errors.zipCode = "Invalid ZIP code format";
    }
    
    setAddressErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      await createAddressMutation.mutateAsync({
        ...newAddressData,
        isDefault: shippingAddresses.length === 0, // Make first address default
      });
    } catch (error) {
      console.error('Failed to create address:', error);
    }
  };

  // Address change handler
  const handleAddressChange = (field: keyof AddressFormData, value: string) => {
    setNewAddressData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (addressErrors[field]) {
      setAddressErrors(prev => ({ ...prev, [field]: '' }));
    }
  };








  if (addressesLoading) {
    return (
      <div className="space-y-6">
        <div className="text-sm text-gray-600 mb-4">
          Manage shipping and billing addresses for this customer. Shipping address is required for order fulfillment.
        </div>
        
        <div className={`grid grid-cols-1 ${showBillingSection ? 'lg:grid-cols-2' : ''} gap-6`}>
          {/* Shipping Address Loading Skeleton */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Shipping Addresses</h3>
                <Badge variant="secondary">Required</Badge>
              </div>
            </div>
            <div className="animate-pulse space-y-3">
              <div className="h-24 bg-gray-200 rounded-lg"></div>
              <div className="h-24 bg-gray-200 rounded-lg"></div>
            </div>
          </div>

          {/* Billing Address Loading Skeleton - Only show for non-shipping users */}
          {showBillingSection && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Billing Addresses</h3>
                  <Badge variant="outline">Optional</Badge>
                </div>
              </div>
              <div className="animate-pulse space-y-3">
                <div className="h-24 bg-gray-200 rounded-lg"></div>
                <div className="h-24 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-600 mb-4">
        Manage shipping and billing addresses for this customer. Shipping address is required for order fulfillment.
      </div>

      {/* Top Prominent Shipping Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900" data-testid="text-shipping-default">
                  Shipping will use this address
                </h3>
                {defaultShippingAddress ? (
                  <div className="mt-1 text-sm text-blue-700">
                    <div className="font-medium">{defaultShippingAddress.street}</div>
                    {defaultShippingAddress.street2 && (
                      <div>{defaultShippingAddress.street2}</div>
                    )}
                    <div>{defaultShippingAddress.city}, {defaultShippingAddress.state} {defaultShippingAddress.zipCode}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-blue-700">No shipping address selected</div>
                )}
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                // Scroll to shipping selection section
                document.getElementById('shipping-selection')?.scrollIntoView({ behavior: 'smooth' });
              }}
              data-testid="button-change-shipping"
            >
              Change
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Billing Same as Shipping Switch */}
      {!isShippingDepartment && (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
          <div className="flex items-center gap-3">
            <Building className="h-5 w-5 text-green-600" />
            <Label htmlFor="billing-same-switch" className="font-medium">
              Billing same as Shipping
            </Label>
          </div>
          <Switch
            id="billing-same-switch"
            checked={billingSameAsShipping}
            onCheckedChange={handleBillingSameAsShippingToggle}
            data-testid="switch-billing-linked"
          />
        </div>
      )}

      {/* Billing Linked Alert */}
      {!isShippingDepartment && billingSameAsShipping && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">
            Billing will use the shipping address selected above.
          </AlertDescription>
        </Alert>
      )}

      {/* Shipping Address Selection */}
      <div id="shipping-selection" className="space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Select Shipping Address</h3>
          <Badge variant="secondary">Required</Badge>
          {isShippingDepartment && (
            <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700">Shipping Department View</Badge>
          )}
        </div>
          
        {/* Shipping Address RadioGroup */}
        {shippingAddresses.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Shipping Address</Label>
            <RadioGroup 
              value={defaultShippingAddress?.id?.toString()} 
              onValueChange={(value) => {
                const selectedAddress = shippingAddresses.find(addr => addr.id.toString() === value);
                if (selectedAddress) {
                  handleShippingAddressSelect(selectedAddress);
                }
              }}
              className="space-y-2"
            >
              {shippingAddresses.map((address) => (
                <div key={address.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-3 flex-1">
                    <RadioGroupItem 
                      value={address.id.toString()} 
                      id={`shipping-${address.id}`}
                      data-testid={`radio-shipping-${address.id}`}
                    />
                    <Label htmlFor={`shipping-${address.id}`} className="flex-1 cursor-pointer">
                      <div className="font-medium">{address.street}</div>
                      {address.street2 && (
                        <div className="text-sm text-gray-600">{address.street2}</div>
                      )}
                      <div className="text-sm text-gray-600">
                        {address.city}, {address.state} {address.zipCode}
                      </div>
                    </Label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {address.isDefault && <Badge variant="default">Default</Badge>}
                    {address.isValidated && <CheckCircle className="h-4 w-4 text-green-600" />}
                    
                    {/* Actions Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          data-testid={`menu-address-${address.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!address.isDefault && (
                          <DropdownMenuItem onClick={() => handleShippingAddressSelect(address)}>
                            <MapPin className="h-4 w-4 mr-2" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => handleDeleteAddress(address.id)}
                          className="text-red-600"
                          data-testid={`button-delete-address-${address.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        {/* Show "Add Address" button when there are no shipping addresses */}
        {shippingAddresses.length === 0 && !showAddressForm && (
          <div className="p-6 border-2 border-dashed rounded-lg bg-gray-50 text-center">
            <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-3" />
            <h4 className="font-medium text-gray-900 mb-2">No Shipping Address</h4>
            <p className="text-sm text-gray-600 mb-4">
              This customer doesn't have a shipping address yet. Add one to enable order fulfillment.
            </p>
            <Button 
              onClick={() => setShowAddressForm(true)}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-add-first-address"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Shipping Address
            </Button>
          </div>
        )}

        {/* Show "Add Another Address" button when there are existing addresses */}
        {shippingAddresses.length > 0 && !showAddressForm && (
          <Button 
            onClick={() => setShowAddressForm(true)}
            variant="outline"
            className="w-full"
            data-testid="button-add-another-address"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Shipping Address
          </Button>
        )}

          {/* Add New Address Form - Unified for both shipping and billing */}
          {showAddressForm && (
            <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
              <Label className="text-sm font-medium text-blue-900">Add New Address</Label>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Street Address *</Label>
                  <Input
                    value={newAddressData.street}
                    onChange={(e) => handleAddressChange('street', e.target.value)}
                    className={addressErrors.street ? "border-red-500" : ""}
                    placeholder="123 Main Street"
                    data-testid="input-address-street"
                  />
                  {addressErrors.street && (
                    <p className="text-sm text-red-500">{addressErrors.street}</p>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium">Suite/Apt/Unit #</Label>
                  <Input
                    value={newAddressData.street2}
                  onChange={(e) => handleAddressChange('street2', e.target.value)}
                  placeholder="Suite 100, Apt 2B"
                  data-testid="input-shipping-street2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">City *</Label>
                  <Input
                    value={newAddressData.city}
                    onChange={(e) => handleAddressChange('city', e.target.value)}
                    className={addressErrors.city ? "border-red-500" : ""}
                    placeholder="City"
                    data-testid="input-address-city"
                  />
                  {addressErrors.city && (
                    <p className="text-sm text-red-500">{addressErrors.city}</p>
                  )}
                </div>
                
                <div>
                  <Label className="text-sm font-medium">State *</Label>
                  <Input
                    value={newAddressData.state}
                    onChange={(e) => handleAddressChange('state', e.target.value.toUpperCase().slice(0, 2))}
                    className={addressErrors.state ? "border-red-500" : ""}
                    placeholder="SC"
                    maxLength={2}
                    data-testid="input-address-state"
                  />
                  {addressErrors.state && (
                    <p className="text-sm text-red-500">{addressErrors.state}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">ZIP Code *</Label>
                  <Input
                    value={newAddressData.zipCode}
                    onChange={(e) => handleAddressChange('zipCode', e.target.value)}
                    className={addressErrors.zipCode ? "border-red-500" : ""}
                    placeholder="29406"
                    data-testid="input-address-zipcode"
                  />
                  {addressErrors.zipCode && (
                    <p className="text-sm text-red-500">{addressErrors.zipCode}</p>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium">Country</Label>
                  <Select 
                    value={newAddressData.country} 
                    onValueChange={(value) => handleAddressChange('country', value)}
                  >
                    <SelectTrigger data-testid="select-address-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="United States">United States</SelectItem>
                      <SelectItem value="Canada">Canada</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleAddNewAddress}
                disabled={!newAddressData.street || !newAddressData.city || !newAddressData.state || !newAddressData.zipCode || createAddressMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700"
                data-testid="button-add-shipping-address"
              >
                {createAddressMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {createAddressMutation.isPending ? 'Adding...' : 'Add Shipping Address'}
              </Button>
            </div>
        </div>
      )}
      </div>

      {/* Collapsible Billing Section - Only show when not linked to shipping */}
      {showBillingSection && (
        <div className="space-y-4 p-4 border rounded-lg bg-green-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">Billing Addresses</h3>
              <Badge variant="outline" className="bg-green-100 text-green-700">Optional</Badge>
            </div>
          </div>

          {/* Billing Address RadioGroup */}
          {billingAddresses.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-green-900">Select Billing Address</Label>
              <RadioGroup 
                value={defaultBillingAddress?.id?.toString()} 
                onValueChange={(value) => {
                  const selectedAddress = billingAddresses.find(addr => addr.id.toString() === value);
                  if (selectedAddress) {
                    // Handle billing address selection (similar to shipping)
                    handleShippingAddressSelect(selectedAddress);
                  }
                }}
                className="space-y-2"
              >
                {billingAddresses.map((address) => (
                  <div key={address.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-white bg-green-25">
                    <div className="flex items-center space-x-3 flex-1">
                      <RadioGroupItem 
                        value={address.id.toString()} 
                        id={`billing-${address.id}`}
                        data-testid={`radio-billing-${address.id}`}
                      />
                      <Label htmlFor={`billing-${address.id}`} className="flex-1 cursor-pointer">
                        <div className="font-medium">{address.street}</div>
                        {address.street2 && (
                          <div className="text-sm text-gray-600">{address.street2}</div>
                        )}
                        <div className="text-sm text-gray-600">
                          {address.city}, {address.state} {address.zipCode}
                        </div>
                      </Label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {address.isDefault && <Badge variant="default">Default</Badge>}
                      {address.isValidated && <CheckCircle className="h-4 w-4 text-green-600" />}
                      
                      {/* Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0"
                            data-testid={`menu-address-${address.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!address.isDefault && (
                            <DropdownMenuItem onClick={() => handleShippingAddressSelect(address)}>
                              <MapPin className="h-4 w-4 mr-2" />
                              Set as Default
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDeleteAddress(address.id)}
                            className="text-red-600"
                            data-testid={`button-delete-address-${address.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Add New Billing Address Button */}
          <Button 
            variant="outline" 
            onClick={() => setShowAddressForm(true)}
            className="w-full border-green-300 text-green-700 hover:bg-green-100"
            data-testid="button-add-billing-address"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Billing Address
          </Button>
        </div>
      )}


    </div>
  );
};

export default function CustomerManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [isEditAddressDialogOpen, setIsEditAddressDialogOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null);
  const [addressFormData, setAddressFormData] = useState<AddressFormData>({
    customerId: '',
    street: '',
    street2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    type: 'shipping',
    isDefault: false,
  });
  
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  
  // CSV Import states
  const [isCSVImportDialogOpen, setIsCSVImportDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isProcessingCSV, setIsProcessingCSV] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Fetch customers using bypass route
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['/api/customers/bypass'],
    queryFn: () => apiRequest('/api/customers/bypass'),
  });

  // Fetch all addresses for table display
  const { data: addressesData = [] } = useQuery<CustomerAddress[]>({
    queryKey: ['/api/addresses/all'],
    queryFn: () => apiRequest('/api/addresses/all'),
  });

  // Fetch addresses for selected customer
  const { data: addresses = [], isLoading: addressesLoading } = useQuery<CustomerAddress[]>({
    queryKey: ['/api/addresses', selectedCustomer?.id],
    enabled: !!selectedCustomer?.id,
    queryFn: () => apiRequest(`/api/addresses?customerId=${selectedCustomer?.id}`),
  });

  // Filter customers based on search and status
  const filteredCustomers = customers.filter((customer: Customer) => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterActive === 'all' || 
                         (filterActive === 'active' && customer.isActive) ||
                         (filterActive === 'inactive' && !customer.isActive);
    
    return matchesSearch && matchesFilter;
  });

  // Address suggestions state for separate address dialog
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  
  // Auto-fill address when street, city, state, or zipCode change
  const handleAddressFieldChange = async (field: string, value: string) => {
    console.log('🔧 handleAddressFieldChange called with:', field, value);
    const updatedAddress = { ...addressFormData, [field]: value };
    console.log('🔧 Updated address:', updatedAddress);
    setAddressFormData(updatedAddress);
    
    // Trigger validation if we have at least a street address
    if (updatedAddress.street && updatedAddress.street.length > 3) {
      setIsValidatingAddress(true);
      try {
        const response = await fetch('/api/validate-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            street: updatedAddress.street,
            city: updatedAddress.city,
            state: updatedAddress.state,
            zipCode: updatedAddress.zipCode
          })
        });
        
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
          setAddressSuggestions(data.suggestions);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Address validation error:', error);
      } finally {
        setIsValidatingAddress(false);
      }
    } else {
      setAddressSuggestions([]);
      setShowSuggestions(false);
    }
  };
  
  // Parse address string into components if structured data isn't available
  const parseAddressString = (addressText: string) => {
    const parts = addressText.split(', ');
    if (parts.length >= 2) {
      const street = parts[0];
      const cityStateZip = parts[1];
      
      // Parse "City ST" or "City ST 12345" format
      const match = cityStateZip.match(/^(.+?)\s+([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
      if (match) {
        return {
          street,
          city: match[1],
          state: match[2],
          zipCode: match[3] || ''
        };
      }
    }
    return { street: addressText, city: '', state: '', zipCode: '' };
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: any) => {
    console.log('🔧 handleSuggestionSelect called with:', suggestion);
    console.log('🔧 Current addressFormData before update:', addressFormData);
    console.log('🔧 Suggestion streetLine:', suggestion.streetLine);
    console.log('🔧 Suggestion city:', suggestion.city);
    console.log('🔧 Suggestion state:', suggestion.state);
    
    // Direct mapping from the API response structure we confirmed
    const newAddressData = {
      ...addressFormData,
      street: suggestion.streetLine || suggestion.street_line || suggestion.street || '',  // Use streetLine first
      city: suggestion.city || '',
      state: suggestion.state || '',
      zipCode: suggestion.zipCode || suggestion.zipcode || '',
      country: 'USA'  // Default country
    };
    
    console.log('🔧 New address data being set:', newAddressData);
    console.log('🔧 Street field will be:', newAddressData.street);
    console.log('🔧 City field will be:', newAddressData.city);
    console.log('🔧 State field will be:', newAddressData.state);
    
    setAddressFormData(newAddressData);
    
    // Verify the state was actually set
    setTimeout(() => {
      console.log('🔧 Address form data after setState (delayed check):', addressFormData);
    }, 100);
    
    setShowSuggestions(false);
    setAddressSuggestions([]);
    
    toast({
      title: "Address Selected",
      description: "All address fields have been populated.",
      duration: 2000
    });
  };



  // Handle customer form suggestion selection
  const handleCustomerFormSuggestionSelect = (suggestion: any) => {
    console.log('🔧 Customer form suggestion selected:', suggestion);
    
    // Use structured data directly from suggestion
    const addressData = {
      street: suggestion.streetLine || suggestion.text || '',
      city: suggestion.city || '',
      state: suggestion.state || '',
      zipCode: suggestion.zipCode || '',
    };
    
    console.log('🔧 Using structured address data for customer:', addressData);
    
    setFormData(prev => ({
      ...prev,
      street: addressData.street,
      city: addressData.city,
      state: addressData.state,
      zipCode: addressData.zipCode,
    }));
    
    setShowCustomerFormSuggestions(false);
    setCustomerFormSuggestions([]);
  };


  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const customer = await apiRequest('/api/customers/create-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          contact: data.contact,
          customerType: data.customerType,
          preferredCommunicationMethod: data.preferredCommunicationMethod,
          notes: data.notes,
          isActive: data.isActive,
        }),
      });

      // If address fields are filled, create the initial shipping address
      console.log('🔧 Checking if address should be created:', {
        hasStreet: !!data.street,
        hasCity: !!data.city,
        hasState: !!data.state,
        hasZipCode: !!data.zipCode,
        willCreate: !!(data.street && data.city && data.state && data.zipCode)
      });
      
      if (data.street && data.city && data.state && data.zipCode) {
        console.log('🔧 Creating address for customer:', customer.id);
        await apiRequest('/api/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: customer.id.toString(),
            street: data.street,
            street2: data.street2 || '',
            city: data.city,
            state: data.state,
            zipCode: data.zipCode,
            country: data.country || 'United States',
            type: 'shipping',
            isDefault: true,
          }),
        });
      }

      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Customer created successfully. You can add addresses in the Addresses tab.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomerFormData> }) => 
      apiRequest(`/api/customers/update-bypass/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
      setIsEditDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/customers/delete-bypass/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
      setIsDeleteDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  // Address mutations
  const createAddressMutation = useMutation({
    mutationFn: (data: AddressFormData) => apiRequest('/api/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      setIsAddressDialogOpen(false);
      resetAddressForm();
      toast({
        title: "Success",
        description: "Address created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create address",
        variant: "destructive",
      });
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: (data: AddressFormData & { id: number }) => apiRequest(`/api/addresses/${data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      setIsEditAddressDialogOpen(false);
      resetAddressForm();
      toast({
        title: "Success",
        description: "Address updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update address",
        variant: "destructive",
      });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/addresses/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/addresses', selectedCustomer?.id] });
      toast({
        title: "Success",
        description: "Address deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete address",
        variant: "destructive",
      });
    },
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      errors.name = "Customer name is required";
    }
    
    if (formData.email && !isValidEmail(formData.email)) {
      errors.email = "Please enter a valid email address";
    }
    
    if (formData.phone && !isValidPhone(formData.phone)) {
      errors.phone = "Please enter a valid phone number";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  };

  const handleCreateCustomer = () => {
    if (!validateForm()) return;
    
    console.log('🔧 Creating customer with formData:', formData);
    console.log('🔧 Address fields:', {
      street: formData.street,
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode
    });
    
    createCustomerMutation.mutate(formData);
  };

  const handleUpdateCustomer = async () => {
    if (!validateForm()) return;
    
    if (selectedCustomer) {
      // Update customer information
      updateCustomerMutation.mutate({
        id: selectedCustomer.id,
        data: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          contact: formData.contact,
          customerType: formData.customerType,
          preferredCommunicationMethod: formData.preferredCommunicationMethod,
          notes: formData.notes,
          isActive: formData.isActive
        },
      });
      
      // Note: Address management is now handled in the dedicated Addresses tab
      // The old address update code has been removed to prevent overwriting addresses
      // when updating customer details
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    
    // Find the customer's primary/default address
    const customerAddresses = addressesData?.filter(addr => {
      const addrCustomerId = typeof addr.customerId === 'string' ? 
        parseInt(addr.customerId) : addr.customerId;
      return addrCustomerId === customer.id;
    }) || [];
    const defaultAddress = customerAddresses.find(addr => addr.isDefault) || customerAddresses[0];
    
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      contact: customer.contact || '',
      customerType: customer.customerType,
      preferredCommunicationMethod: customer.preferredCommunicationMethod || [],
      notes: customer.notes || '',
      isActive: customer.isActive,
      // Load existing address if available
      street: defaultAddress?.street || '',  
      street2: defaultAddress?.street2 || '',
      city: defaultAddress?.city || '',
      state: defaultAddress?.state || '',
      zipCode: defaultAddress?.zipCode || '',
      country: defaultAddress?.country || 'United States',
      addressType: defaultAddress?.type || 'shipping'
    });
    setFormErrors({});
    setIsEditDialogOpen(true);
  };



  const resetForm = () => {
    setFormData(initialFormData);
    setFormErrors({});
    setSelectedCustomer(null);
  };

  const handleBulkAction = (action: 'activate' | 'deactivate' | 'delete') => {
    setBulkAction(action);
    // Here you would implement the bulk action logic
    // For now, just showing the UI pattern
  };

  const toggleCustomerSelection = (customerId: number) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const toggleAllCustomers = () => {
    if (selectedCustomers.length === filteredCustomers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(filteredCustomers.map((c: Customer) => c.id));
    }
  };

  // Address management functions
  const resetAddressForm = () => {
    setAddressFormData({
      customerId: '',
      street: '',
      street2: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
      type: 'shipping',
      isDefault: false,
    });
    setSelectedAddress(null);
  };

  const handleCreateAddress = () => {
    if (!selectedCustomer) return;
    
    const addressData = {
      ...addressFormData,
      customerId: selectedCustomer.id.toString(),
    };
    
    createAddressMutation.mutate(addressData);
  };

  const handleUpdateAddress = () => {
    if (!selectedAddress) return;
    
    const addressData = {
      ...addressFormData,
      id: selectedAddress.id,
    };
    
    updateAddressMutation.mutate(addressData);
  };

  const handleEditAddress = (address: CustomerAddress) => {
    setSelectedAddress(address);
    setAddressFormData({
      customerId: address.customerId.toString(),
      street: address.street,
      street2: address.street2 || '',
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country,
      type: address.type,
      isDefault: address.isDefault,
    });
    setIsEditAddressDialogOpen(true);
  };


  const handleAddAddress = () => {
    if (!selectedCustomer) return;
    
    setAddressFormData({
      ...addressFormData,
      customerId: selectedCustomer.id.toString(),
    });
    setIsAddressDialogOpen(true);
  };

  const handleDeleteCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedCustomer) {
      deleteCustomerMutation.mutate(selectedCustomer.id);
    }
  };

  const exportCustomers = () => {
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Customer Type', 'Status', 'Notes', 'Created Date'],
      ...filteredCustomers.map((customer: Customer) => [
        customer.name,
        customer.email || '',
        customer.phone || '',
        customer.customerType,
        customer.isActive ? 'Active' : 'Inactive',
        customer.notes || '',
        new Date(customer.createdAt).toLocaleDateString(),
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      parseCSVFile(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a valid CSV file",
        variant: "destructive"
      });
    }
  };

  const parseCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      const data = lines.slice(1)
        .filter(line => line.trim())
        .map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });
      setCsvData(data);
    };
    reader.readAsText(file);
  };

  const processCSVImport = async () => {
    if (csvData.length === 0) {
      toast({
        title: "No Data",
        description: "No valid data found in CSV file",
        variant: "destructive"
      });
      return;
    }

    setIsProcessingCSV(true);
    
    try {
      // Convert CSV data to raw CSV string format for the backend
      const headers = Object.keys(csvData[0]);
      const csvString = [
        headers.join(','), // Header row
        ...csvData.map(row => headers.map(header => row[header] || '').join(','))
      ].join('\n');

      // Send to our customer CSV import bypass endpoint
      const result = await apiRequest('/api/customers/import-bypass/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: csvString }),
      });

      setIsProcessingCSV(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });

      let description = '';
      
      if (result.importedCount > 0 && result.updatedCount > 0) {
        description = `Created ${result.importedCount} new customer(s) and updated ${result.updatedCount} existing customer(s)`;
      } else if (result.importedCount > 0) {
        description = `Successfully created ${result.importedCount} new customer(s)`;
      } else if (result.updatedCount > 0) {
        description = `Successfully updated ${result.updatedCount} existing customer(s)`;
      } else {
        description = 'No customers were created or updated';
      }
      
      if (result.errors && result.errors.length > 0) {
        description += ` with ${result.errors.length} error(s)`;
        console.error('Import errors:', result.errors);
      }
      
      toast({
        title: "Import Complete",
        description: description,
        variant: result.errors && result.errors.length > 0 ? "destructive" : "default"
      });

      setIsCSVImportDialogOpen(false);
      setCsvFile(null);
      setCsvData([]);
    } catch (error: any) {
      setIsProcessingCSV(false);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import customers from CSV",
        variant: "destructive"
      });
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Customer Management</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/customer-satisfaction'}
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Customer Satisfaction
          </Button>
          <Button 
            variant="outline" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] })}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCustomers}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={isCSVImportDialogOpen} onOpenChange={setIsCSVImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </DialogTrigger>
          </Dialog>
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (open) {
              // Reset form when opening dialog
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Create New Customer
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="customer-info" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="customer-info" className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Customer Info
                  </TabsTrigger>
                  <TabsTrigger value="addresses" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Addresses
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="customer-info" className="mt-6">
                  <CustomerFormFields 
                    formData={formData}
                    setFormData={setFormData}
                    formErrors={formErrors}
                  />
                </TabsContent>
                
                <TabsContent value="addresses" className="mt-6">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Enter the customer's primary shipping address below. You can add additional addresses after creating the customer.</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="create-street">Street Address *</Label>
                        <Input
                          id="create-street"
                          value={formData.street}
                          onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                          placeholder="123 Main Street"
                          data-testid="input-create-street"
                        />
                      </div>
                      <div>
                        <Label htmlFor="create-street2">Suite/Apt/Unit #</Label>
                        <Input
                          id="create-street2"
                          value={formData.street2}
                          onChange={(e) => setFormData({ ...formData, street2: e.target.value })}
                          placeholder="Suite 100"
                          data-testid="input-create-street2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="create-city">City *</Label>
                        <Input
                          id="create-city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="City"
                          data-testid="input-create-city"
                        />
                      </div>
                      <div>
                        <Label htmlFor="create-state">State *</Label>
                        <Input
                          id="create-state"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          placeholder="AL"
                          data-testid="input-create-state"
                        />
                      </div>
                      <div>
                        <Label htmlFor="create-zipCode">ZIP Code *</Label>
                        <Input
                          id="create-zipCode"
                          value={formData.zipCode}
                          onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                          placeholder="12345"
                          data-testid="input-create-zipcode"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="create-country">Country</Label>
                      <Input
                        id="create-country"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder="United States"
                        data-testid="input-create-country"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              <div className="flex justify-end gap-2 pt-6 border-t">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateCustomer}
                  disabled={createCustomerMutation.isPending || !formData.name}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createCustomerMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Customer
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customers.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {customers.filter((c: Customer) => c.isActive).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {customers.filter((c: Customer) => !c.isActive).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Plus className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {customers.filter((c: Customer) => {
                const created = new Date(c.createdAt);
                const now = new Date();
                return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
              }).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search customers by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filterActive} onValueChange={(value: any) => setFilterActive(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading customers...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer: Customer) => {
                  // Get addresses for this customer - properly handle type conversion
                  const customerAddresses = addressesData?.filter(addr => {
                    // Convert both to numbers for comparison
                    const addrCustomerId = typeof addr.customerId === 'string' ? 
                      parseInt(addr.customerId, 10) : addr.customerId;
                    return addrCustomerId === customer.id;
                  }) || [];
                  const defaultAddress = customerAddresses.find(addr => addr.isDefault) || customerAddresses[0];
                  

                  
                  return (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="font-medium">{customer.name}</div>
                        <div className="space-y-1 mt-1">
                          {customer.email && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Mail className="h-3 w-3" />
                              {customer.email}
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                          {customer.contact && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <span className="font-medium">Contact:</span>
                              {customer.contact}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {defaultAddress ? (
                          <div className="text-sm">
                            <div className="font-medium">
                              {defaultAddress.street}
                              {defaultAddress.street2 && (
                                <span>, {defaultAddress.street2}</span>
                              )}
                            </div>
                            <div className="text-gray-600">{defaultAddress.city}, {defaultAddress.state} {defaultAddress.zipCode}</div>
                            <div className="text-gray-500">{defaultAddress.country}</div>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">No address</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.isActive ? "default" : "secondary"}>
                          {customer.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                            title="Edit Customer & Address"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeleteCustomer(customer)}
                            title="Delete Customer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CSV Import Dialog */}
      <Dialog open={isCSVImportDialogOpen} onOpenChange={setIsCSVImportDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Import Customers from CSV
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 text-gray-400 mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-700 mb-2">
                Select CSV file with customer data
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Expected format: Name, Email, Phone (Name is required, Email and Phone are optional)
              </p>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => csvInputRef.current?.click()}
                className="bg-gray-100 hover:bg-gray-200"
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose CSV File
              </Button>
            </div>

            {csvFile && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-green-800">File Selected</p>
                    <p className="text-sm text-green-700">
                      {csvFile.name} - {csvData.length} record(s) found
                    </p>
                  </div>
                </div>
              </div>
            )}

            {csvData.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Preview:</h4>
                <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                  {csvData.slice(0, 3).map((row, index) => (
                    <div key={index} className="text-sm mb-2 p-2 bg-white rounded border">
                      <strong>{row.Name || row.name || 'No name'}</strong><br />
                      {(row.Email || row.email) && <span>📧 {row.Email || row.email}</span>}<br />
                      {(row.Phone || row.phone) && <span>📞 {row.Phone || row.phone}</span>}
                    </div>
                  ))}
                  {csvData.length > 3 && (
                    <p className="text-sm text-gray-500">... and {csvData.length - 3} more records</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsCSVImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={processCSVImport}
              disabled={csvData.length === 0 || isProcessingCSV}
            >
              {isProcessingCSV ? 'Processing...' : `Import ${csvData.length} Record(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog - Tab-Based Interface */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Customer
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="customer-info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="customer-info" className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Customer Info
              </TabsTrigger>
              <TabsTrigger value="addresses" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Addresses
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="customer-info" className="mt-6">
              <CustomerFormFields 
                formData={formData}
                setFormData={setFormData}
                formErrors={formErrors}
              />
            </TabsContent>
            
            <TabsContent value="addresses" className="mt-6">
              <AddressManagementTabs 
                selectedCustomer={selectedCustomer} 
                userRole="EMPLOYEE" // Show all address sections for editing
              />
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2 pt-6 border-t">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateCustomer}
              disabled={updateCustomerMutation.isPending || !formData.name}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateCustomerMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Update Customer
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Create Address Dialog */}
      <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Address</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="street" className="text-right">Street</Label>
              <div className="col-span-3 relative">
                <Input
                  id="street"
                  ref={addressInputRef}
                  value={addressFormData.street}
                  onChange={(e) => handleAddressFieldChange('street', e.target.value)}
                  className="pr-10"
                  placeholder="123 Main St"
                />
                {isValidatingAddress && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />
                  </div>
                )}
                
                {/* Address Suggestions Dropdown */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                    <div className="p-2 text-sm font-medium text-gray-700 bg-gray-50 border-b">
                      Address Suggestions
                    </div>
                    {addressSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 transition-colors"
                        onClick={() => handleSuggestionSelect(suggestion)}
                      >
                        <div className="font-medium text-gray-900">
                          {suggestion.street || suggestion.streetLine || suggestion.street_line || ''}
                        </div>
                        <div className="text-sm text-gray-600">
                          {(suggestion.city && suggestion.state) ? 
                            `${suggestion.city}, ${suggestion.state}${suggestion.zipCode ? ' ' + suggestion.zipCode : ''}` :
                            'Address information'
                          }
                        </div>
                      </div>
                    ))}
                    <div className="p-2 text-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setShowSuggestions(false)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        Close suggestions
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="city" className="text-right">City</Label>
              <Input
                id="city"
                value={addressFormData.city}
                onChange={(e) => handleAddressFieldChange('city', e.target.value)}
                className="col-span-3"
                placeholder="San Francisco"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="state" className="text-right">State</Label>
              <Input
                id="state"
                value={addressFormData.state}
                onChange={(e) => handleAddressFieldChange('state', e.target.value)}
                className="col-span-3"
                placeholder="CA"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="zipCode" className="text-right">ZIP Code</Label>
              <Input
                id="zipCode"
                value={addressFormData.zipCode}
                onChange={(e) => handleAddressFieldChange('zipCode', e.target.value)}
                className="col-span-3"
                placeholder="94101"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="country" className="text-right">Country</Label>
              <Input
                id="country"
                value={addressFormData.country}
                onChange={(e) => setAddressFormData(prev => ({ ...prev, country: e.target.value }))}
                className="col-span-3"
                placeholder="United States"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="addressType" className="text-right">Type</Label>
              <Select 
                value={addressFormData.type} 
                onValueChange={(value: 'shipping' | 'billing' | 'both') => setAddressFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select address type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isDefault" className="text-right">Default</Label>
              <div className="col-span-3">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={addressFormData.isDefault}
                  onChange={(e) => setAddressFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isDefault" className="ml-2 text-sm">Make this the default address</Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsAddressDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateAddress}
              disabled={createAddressMutation.isPending}
            >
              {createAddressMutation.isPending ? 'Creating...' : 'Create Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Address Dialog */}
      <Dialog open={isEditAddressDialogOpen} onOpenChange={setIsEditAddressDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Address</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editStreet" className="text-right">Street</Label>
              <div className="col-span-3 relative">
                <Input
                  id="editStreet"
                  value={addressFormData.street}
                  onChange={(e) => handleAddressFieldChange('street', e.target.value)}
                  className="pr-10"
                  placeholder="123 Main St"
                />
                {isValidatingAddress && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editCity" className="text-right">City</Label>
              <Input
                id="editCity"
                value={addressFormData.city}
                onChange={(e) => handleAddressFieldChange('city', e.target.value)}
                className="col-span-3"
                placeholder="San Francisco"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editState" className="text-right">State</Label>
              <Input
                id="editState"
                value={addressFormData.state}
                onChange={(e) => handleAddressFieldChange('state', e.target.value)}
                className="col-span-3"
                placeholder="CA"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editZipCode" className="text-right">ZIP Code</Label>
              <Input
                id="editZipCode"
                value={addressFormData.zipCode}
                onChange={(e) => handleAddressFieldChange('zipCode', e.target.value)}
                className="col-span-3"
                placeholder="94101"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editCountry" className="text-right">Country</Label>
              <Input
                id="editCountry"
                value={addressFormData.country}
                onChange={(e) => setAddressFormData(prev => ({ ...prev, country: e.target.value }))}
                className="col-span-3"
                placeholder="United States"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editAddressType" className="text-right">Type</Label>
              <Select 
                value={addressFormData.type} 
                onValueChange={(value: 'shipping' | 'billing' | 'both') => setAddressFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select address type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editIsDefault" className="text-right">Default</Label>
              <div className="col-span-3">
                <input
                  type="checkbox"
                  id="editIsDefault"
                  checked={addressFormData.isDefault}
                  onChange={(e) => setAddressFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="editIsDefault" className="ml-2 text-sm">Make this the default address</Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsEditAddressDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateAddress}
              disabled={updateAddressMutation.isPending}
            >
              {updateAddressMutation.isPending ? 'Updating...' : 'Update Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete <strong>{selectedCustomer?.name}</strong>? This action cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deleteCustomerMutation.isPending}
            >
              {deleteCustomerMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}