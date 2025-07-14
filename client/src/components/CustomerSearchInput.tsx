import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Search, Plus, User, Building, Phone, Mail, ChevronDown, Check, MapPin } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash.debounce';
import type { Customer } from '@shared/schema';
import AddressInput from '@/components/AddressInput';
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
  placeholder = "Search customers...", 
  className = "",
  error 
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
    notes: ''
  });
  
  const [customerAddress, setCustomerAddress] = useState<AddressData>({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States'
  });

  // Debounced search
  const debouncedSearch = useRef(
    debounce((query: string) => {
      if (query.length > 0) {
        searchCustomers(query);
      }
    }, 300)
  ).current;

  const { data: customers = [], isLoading, refetch: searchCustomers } = useQuery({
    queryKey: ['/api/customers/search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const response = await apiRequest(`/api/customers/search?query=${encodeURIComponent(searchQuery.trim())}`);
      return response as Customer[];
    },
    enabled: false
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: typeof newCustomer) => {
      // Clean up empty strings for optional fields
      const cleanedData = {
        ...customerData,
        email: customerData.email?.trim() || undefined,
        phone: customerData.phone?.trim() || undefined,
        company: customerData.company?.trim() || undefined,
        notes: customerData.notes?.trim() || undefined
      };
      
      const response = await apiRequest('/api/customers', {
        method: 'POST',
        body: cleanedData
      });
      
      // If address is provided, create customer address
      if (customerAddress.street || customerAddress.city) {
        try {
          await apiRequest('/api/addresses', {
            method: 'POST',
            body: {
              customerId: response.id.toString(),
              ...customerAddress,
              type: 'both'
            }
          });
        } catch (error) {
          console.error('Failed to create customer address:', error);
        }
      }
      
      return response as Customer;
    },
    onSuccess: (customer) => {
      toast({
        title: "Customer Created",
        description: `${customer.name} has been added successfully.`
      });
      setNewCustomer({
        name: '',
        email: '',
        phone: '',
        company: '',
        customerType: 'standard',
        notes: ''
      });
      setCustomerAddress({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'United States'
      });
      setShowAddDialog(false);
      onValueChange(customer);
      setIsOpen(false);
      
      // Invalidate both customer queries and search queries
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/search'] });
      
      // Trigger a new search to refresh the dropdown
      if (searchQuery.trim()) {
        searchCustomers(searchQuery);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  const handleSelectCustomer = (customer: Customer) => {
    onValueChange(customer);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleAddCustomer = () => {
    if (!newCustomer.name.trim()) {
      toast({
        title: "Error",
        description: "Customer name is required",
        variant: "destructive"
      });
      return;
    }

    createCustomerMutation.mutate(newCustomer);
  };

  const displayValue = value ? (value.company ? `${value.name} (${value.company})` : value.name) : '';

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
                                <span className="text-sm text-gray-500">({customer.company})</span>
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
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Customer</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Name *
                      </Label>
                      <Input
                        id="name"
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                        className="col-span-3"
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="company" className="text-right">
                        Company
                      </Label>
                      <Input
                        id="company"
                        value={newCustomer.company}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, company: e.target.value }))}
                        className="col-span-3"
                        placeholder="ABC Defense"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="email" className="text-right">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                        className="col-span-3"
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phone" className="text-right">
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                        className="col-span-3"
                        placeholder="555-0123"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="notes" className="text-right">
                        Notes
                      </Label>
                      <Input
                        id="notes"
                        value={newCustomer.notes}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, notes: e.target.value }))}
                        className="col-span-3"
                        placeholder="Additional notes..."
                      />
                    </div>
                    
                    {/* Address Field */}
                    <div className="col-span-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        <Label>Address (Optional)</Label>
                      </div>
                      <AddressInput 
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