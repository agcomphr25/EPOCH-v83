import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Check, ChevronDown, Mail, MapPin, Phone, Plus, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash.debounce';
import type { Customer } from '@shared/schema';
import SimpleAddressInput from '@/components/SimpleAddressInput';
import type { AddressData } from '@/utils/addressUtils';

interface CustomerSearchInputProps {
  value?: Customer | null;
  onValueChange: (customer: Customer | null) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

export default function CustomerSearchInput({
  value,
  onValueChange,
  placeholder = 'Search customers...',
  className = '',
  error,
}: CustomerSearchInputProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    customerType: 'standard',
    notes: '',
  });

  const [customerAddress, setCustomerAddress] = useState<AddressData>({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  const {
    data: customers = [],
    refetch: searchCustomers,
  } = useQuery({
    queryKey: ['/api/customers/search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const response = await apiRequest(
        `/api/customers/search?query=${encodeURIComponent(searchQuery.trim())}`
      );
      return response as Customer[];
    },
    enabled: false,
  });

  // 🔧 Debounced search
  const debouncedSearchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    debouncedSearchRef.current = debounce(() => {
      if (searchQuery.length > 0) {
        searchCustomers(); // ✅ call without params
      }
    }, 300);

    return () => {
      if (debouncedSearchRef.current && (debouncedSearchRef.current as any).cancel) {
        (debouncedSearchRef.current as any).cancel();
      }
    };
  }, [searchCustomers, searchQuery]);

  useEffect(() => {
    if (debouncedSearchRef.current) {
      debouncedSearchRef.current();
    }
  }, [searchQuery]);

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: typeof newCustomer) => {
      const cleanedData = {
        ...customerData,
        email: customerData.email?.trim() || undefined,
        phone: customerData.phone?.trim() || undefined,
        company: customerData.company?.trim() || undefined,
        notes: customerData.notes?.trim() || undefined,
      };

      const response = await apiRequest('/api/customers/create-bypass', {
        method: 'POST',
        body: JSON.stringify(cleanedData),
      });

      // Create customer address if all required fields are present
      if (customerAddress.street && customerAddress.city && customerAddress.state && customerAddress.zipCode && customerAddress.country) {
        try {
          await apiRequest('/api/addresses', {
            method: 'POST',
            body: JSON.stringify({
              customerId: response.id.toString(),
              ...customerAddress,
              type: 'both',
              isDefault: true,
            }),
          });
        } catch (error) {
          console.error('Failed to create customer address:', error);
        }
      }

      return response as Customer;
    },
    onSuccess: (customer) => {
      toast({
        title: 'Customer Created',
        description: `${customer.name} has been added successfully.`,
      });
      setNewCustomer({
        name: '',
        email: '',
        phone: '',
        company: '',
        customerType: 'standard',
        notes: '',
      });
      setCustomerAddress({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'United States',
      });
      setShowAddDialog(false);
      onValueChange(customer);
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/search'] });
      if (searchQuery.trim()) {
        searchCustomers();
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create customer',
        variant: 'destructive',
      });
    },
  });

  const handleSelectCustomer = (customer: Customer) => {
    onValueChange(customer);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleAddCustomer = () => {
    if (!newCustomer.name.trim()) {
      toast({
        title: 'Error',
        description: 'Customer name is required',
        variant: 'destructive',
      });
      return;
    }
    createCustomerMutation.mutate(newCustomer);
  };

  const displayValue = value
    ? value.company
      ? `${value.name} (${value.company})`
      : value.name
    : '';

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="customer-search">Customer</Label>
      <div className="relative">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={isOpen}
              className="w-full justify-between text-left font-normal"
            >
              {displayValue || placeholder}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search customers..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>
                  <div className="py-6 text-center text-sm">
                    {searchQuery ? 'No customers found.' : 'Type to search customers...'}
                  </div>
                </CommandEmpty>
                {customers.length > 0 && (
                  <CommandGroup>
                    {customers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={customer.name}
                        onSelect={() => handleSelectCustomer(customer)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center space-x-2 w-full">
                          <User className="h-4 w-4 text-gray-500" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">{customer.name}</span>
                              {customer.company && (
                                <span className="text-sm text-gray-500">
                                  ({customer.company})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                              {customer.email && (
                                <div className="flex items-center space-x-1">
                                  <Mail className="h-3 w-3" />
                                  <span>{customer.email}</span>
                                </div>
                              )}
                              {customer.phone && (
                                <div className="flex items-center space-x-1">
                                  <Phone className="h-3 w-3" />
                                  <span>{customer.phone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {value?.id === customer.id && (
                            <Check className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
            <div className="border-t p-2">
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Customer</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-6 py-4">
                    {/* Name - Full width, larger */}
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="John Smith"
                        className="text-base h-12"
                      />
                    </div>
                    
                    {/* Company - Full width, larger */}
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        value={newCustomer.company}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, company: e.target.value }))}
                        placeholder="ABC Defense"
                        className="text-base h-12"
                      />
                    </div>
                    
                    {/* Email and Phone on same row but wider */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="john@example.com"
                          className="text-base h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="555-0123"
                          className="text-base h-12"
                        />
                      </div>
                    </div>
                    
                    {/* Notes full width */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={newCustomer.notes}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Additional notes..."
                        className="text-base h-12"
                      />
                    </div>

                    {/* Address Field */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        <Label>Address (Optional)</Label>
                      </div>
                      <SimpleAddressInput 
                        label=""
                        value={customerAddress}
                        onChange={setCustomerAddress}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowAddDialog(false)}
                      disabled={createCustomerMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddCustomer}
                      disabled={createCustomerMutation.isPending}
                    >
                      {createCustomerMutation.isPending ? 'Adding...' : 'Add Customer'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}