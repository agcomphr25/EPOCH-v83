import React, { useState, useRef } from 'react';
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
  UserX,
  AlertCircle,
  Eye,
  RefreshCw,
  CheckCircle,
  FileText
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Customer = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  customerType: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CustomerAddress = {
  id: number;
  customerId: string;
  street: string;
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
  company: string;
  customerType: string;
  notes: string;
  isActive: boolean;
};

type AddressFormData = {
  customerId: string;
  street: string;
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
  company: '',
  customerType: 'standard',
  notes: '',
  isActive: true
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
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [isEditAddressDialogOpen, setIsEditAddressDialogOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null);
  const [addressFormData, setAddressFormData] = useState<AddressFormData>({
    customerId: '',
    street: '',
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

  // Fetch customers
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
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
                         customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.company?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterActive === 'all' || 
                         (filterActive === 'active' && customer.isActive) ||
                         (filterActive === 'inactive' && !customer.isActive);
    
    return matchesSearch && matchesFilter;
  });

  // Address suggestions state
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Auto-fill address when street, city, state, or zipCode change
  const handleAddressFieldChange = async (field: string, value: string) => {
    const updatedAddress = { ...addressFormData, [field]: value };
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
  
  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: any) => {
    setAddressFormData(prev => ({
      ...prev,
      street: suggestion.street,
      city: suggestion.city,
      state: suggestion.state,
      zipCode: suggestion.zipCode
    }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
    
    toast({
      title: "Address Selected",
      description: "Address has been validated and filled.",
      duration: 2000
    });
  };

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: (data: CustomerFormData) => apiRequest('/api/customers', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Customer created successfully",
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
      apiRequest(`/api/customers/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
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
    mutationFn: (id: number) => apiRequest(`/api/customers/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
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
      body: data,
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
      body: data,
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
    
    createCustomerMutation.mutate(formData);
  };

  const handleUpdateCustomer = () => {
    if (!validateForm()) return;
    
    if (selectedCustomer) {
      updateCustomerMutation.mutate({
        id: selectedCustomer.id,
        data: formData,
      });
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      customerType: customer.customerType,
      notes: customer.notes || '',
      isActive: customer.isActive,
    });
    setFormErrors({});
    setIsEditDialogOpen(true);
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewDialogOpen(true);
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
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country,
      type: address.type,
      isDefault: address.isDefault,
    });
    setIsEditAddressDialogOpen(true);
  };

  const handleDeleteAddress = (id: number) => {
    deleteAddressMutation.mutate(id);
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
      ['Name', 'Email', 'Phone', 'Company', 'Customer Type', 'Status', 'Notes', 'Created Date'],
      ...filteredCustomers.map((customer: Customer) => [
        customer.name,
        customer.email || '',
        customer.phone || '',
        customer.company || '',
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

      // Send to our customer CSV import endpoint
      const result = await apiRequest('/api/customers/import/csv', {
        method: 'POST',
        body: { csvData: csvString },
      });

      setIsProcessingCSV(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });

      let description = `Successfully imported ${result.importedCount} customer(s)`;
      
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

  const CustomerFormFields = () => (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="name" className="text-right">Name *</Label>
        <div className="col-span-3">
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className={formErrors.name ? "border-red-500" : ""}
            placeholder="Customer name"
          />
          {formErrors.name && (
            <p className="text-sm text-red-500 mt-1">{formErrors.name}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="email" className="text-right">Email</Label>
        <div className="col-span-3">
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className={formErrors.email ? "border-red-500" : ""}
            placeholder="customer@example.com"
          />
          {formErrors.email && (
            <p className="text-sm text-red-500 mt-1">{formErrors.email}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="phone" className="text-right">Phone</Label>
        <div className="col-span-3">
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            className={formErrors.phone ? "border-red-500" : ""}
            placeholder="(555) 123-4567"
          />
          {formErrors.phone && (
            <p className="text-sm text-red-500 mt-1">{formErrors.phone}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="company" className="text-right">Company</Label>
        <Input
          id="company"
          value={formData.company}
          onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
          className="col-span-3"
          placeholder="Company name"
        />
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="customerType" className="text-right">Type</Label>
        <Select 
          value={formData.customerType} 
          onValueChange={(value) => setFormData(prev => ({ ...prev, customerType: value }))}
        >
          <SelectTrigger className="col-span-3">
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
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="notes" className="text-right">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          className="col-span-3"
          placeholder="Additional notes..."
          rows={3}
        />
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="isActive" className="text-right">Status</Label>
        <Select 
          value={formData.isActive ? 'active' : 'inactive'} 
          onValueChange={(value) => setFormData(prev => ({ ...prev, isActive: value === 'active' }))}
        >
          <SelectTrigger className="col-span-3">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Customer Management</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/customers'] })}
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
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create New Customer</DialogTitle>
              </DialogHeader>
              <CustomerFormFields />
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateCustomer}
                  disabled={createCustomerMutation.isPending || !formData.name}
                >
                  {createCustomerMutation.isPending ? 'Creating...' : 'Create Customer'}
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
                  placeholder="Search customers by name, email, or company..."
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
                  // Get addresses for this customer - handle both string and number comparisons
                  const customerAddresses = addressesData?.filter(addr => 
                    addr.customerId === customer.id.toString() || 
                    addr.customerId.toString() === customer.id.toString()
                  ) || [];
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
                        </div>
                      </TableCell>
                      <TableCell>
                        {defaultAddress ? (
                          <div className="text-sm">
                            <div className="font-medium">{defaultAddress.street}</div>
                            <div className="text-gray-600">{defaultAddress.city}, {defaultAddress.state} {defaultAddress.zipCode}</div>
                            <div className="text-gray-500">{defaultAddress.country}</div>
                            {defaultAddress.type !== 'shipping' && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {defaultAddress.type}
                              </Badge>
                            )}
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
                            onClick={() => handleViewCustomer(customer)}
                            title="View Customer Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                            title="Edit Customer"
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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Customer Info</TabsTrigger>
              <TabsTrigger value="addresses">Addresses</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="space-y-4">
              <CustomerFormFields />
            </TabsContent>
            
            <TabsContent value="addresses" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Customer Addresses</h3>
                <Button size="sm" onClick={handleAddAddress}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Address
                </Button>
              </div>
              
              {addressesLoading ? (
                <div className="text-center py-4">Loading addresses...</div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>No addresses found</p>
                  <p className="text-sm">Add an address to get started</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {addresses.map((address) => (
                    <Card key={address.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">{address.street}</span>
                            {address.isDefault && (
                              <Badge variant="secondary" className="text-xs">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            {address.city}, {address.state} {address.zipCode}
                          </p>
                          <p className="text-sm text-gray-600 mb-2">{address.country}</p>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">
                              {address.type}
                            </Badge>
                            {address.isValidated && (
                              <Badge variant="default" className="text-xs">Validated</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditAddress(address)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteAddress(address.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateCustomer}
              disabled={updateCustomerMutation.isPending || !formData.name}
            >
              {updateCustomerMutation.isPending ? 'Updating...' : 'Update Customer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Customer Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Customer Info</TabsTrigger>
                <TabsTrigger value="addresses">Addresses</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Name</Label>
                    <p className="text-sm mt-1">{selectedCustomer.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="mt-1">
                      <Badge variant={selectedCustomer.isActive ? "default" : "secondary"}>
                        {selectedCustomer.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Type</Label>
                    <p className="text-sm mt-1 capitalize">{selectedCustomer.customerType}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-sm mt-1">{selectedCustomer.email || 'Not provided'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Phone</Label>
                    <p className="text-sm mt-1">{selectedCustomer.phone || 'Not provided'}</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Company</Label>
                  <p className="text-sm mt-1">{selectedCustomer.company || 'Not provided'}</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Notes</Label>
                  <p className="text-sm mt-1">{selectedCustomer.notes || 'No notes'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Created</Label>
                    <p className="text-sm mt-1">{new Date(selectedCustomer.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Last Updated</Label>
                    <p className="text-sm mt-1">{new Date(selectedCustomer.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="addresses" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Customer Addresses</h3>
                  <Button size="sm" onClick={handleAddAddress}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address
                  </Button>
                </div>
                
                {addressesLoading ? (
                  <div className="text-center py-4">Loading addresses...</div>
                ) : addresses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p>No addresses found</p>
                    <p className="text-sm">Add an address to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((address) => (
                      <Card key={address.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={address.type === 'shipping' ? 'default' : address.type === 'billing' ? 'secondary' : 'outline'}>
                                {address.type}
                              </Badge>
                              {address.isDefault && (
                                <Badge variant="outline" className="text-xs">Default</Badge>
                              )}
                              {address.isValidated && (
                                <Badge variant="default" className="text-xs bg-green-100 text-green-800">Validated</Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium">{address.street}</p>
                            <p className="text-sm text-gray-600">
                              {address.city}, {address.state} {address.zipCode}
                            </p>
                            <p className="text-sm text-gray-600">{address.country}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditAddress(address)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteAddress(address.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            <Button 
              onClick={() => {
                setIsViewDialogOpen(false);
                if (selectedCustomer) handleEditCustomer(selectedCustomer);
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Customer
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
                        <div className="font-medium text-gray-900">{suggestion.street}</div>
                        <div className="text-sm text-gray-600">
                          {suggestion.city}, {suggestion.state} {suggestion.zipCode}
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