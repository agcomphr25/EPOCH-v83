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
import { Checkbox } from '@/components/ui/checkbox';
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
  BarChart3
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


type Customer = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  contact?: string;
  customerType: string;
  preferredCommunicationMethod?: string[]; // Array of "email" and/or "sms"
  notes?: string;
  isActive: boolean;
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
  company: string;
  contact: string;
  customerType: string;
  preferredCommunicationMethod: string[]; // Array of "email" and/or "sms"
  notes: string;
  isActive: boolean;
  // Address fields
  street: string;
  street2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  addressType: 'shipping' | 'billing' | 'both';
};

type AddressFormData = {
  customerId: string;
  street: string;
  street2: string;
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
  contact: '',
  customerType: 'standard',
  preferredCommunicationMethod: [],
  notes: '',
  isActive: true,
  // Address defaults
  street: '',
  street2: '',
  city: '',
  state: '',
  zipCode: '',
  country: 'United States',
  addressType: 'both'
};

// Move CustomerFormFields outside the main component to prevent cursor reset
const CustomerFormFields = ({ 
  formData, 
  setFormData, 
  formErrors,
  handleCustomerAddressChange,
  customerFormSuggestions,
  showCustomerFormSuggestions,
  isValidatingCustomerAddress,
  handleCustomerFormSuggestionSelect
}: { 
  formData: CustomerFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  formErrors: Record<string, string>;
  handleCustomerAddressChange: (field: string, value: string) => void;
  customerFormSuggestions: any[];
  showCustomerFormSuggestions: boolean;
  isValidatingCustomerAddress: boolean;
  handleCustomerFormSuggestionSelect: (suggestion: any) => void;
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
          <Label htmlFor="company" className="text-sm font-medium">Company</Label>
          <Input
            id="company"
            value={formData.company}
            onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
            placeholder="Company name"
          />
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

    {/* Address Information Section */}
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
        <MapPin className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">Address Information</h3>
        <span className="text-xs text-gray-500">(Optional)</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="addressType" className="text-sm font-medium">Address Type</Label>
        <Select 
          value={formData.addressType} 
          onValueChange={(value: 'shipping' | 'billing' | 'both') => setFormData(prev => ({ ...prev, addressType: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select address type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Both Shipping & Billing</SelectItem>
            <SelectItem value="shipping">Shipping Only</SelectItem>
            <SelectItem value="billing">Billing Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="street" className="text-sm font-medium">Street Address</Label>
        <div className="relative">
          <Input
            id="street"
            value={formData.street}
            onChange={(e) => handleCustomerAddressChange('street', e.target.value)}
            className={`${formErrors.street ? "border-red-500" : ""} ${isValidatingCustomerAddress ? "pr-10" : ""}`}
            placeholder="123 Main Street"
          />
          {isValidatingCustomerAddress && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          )}
          
          {/* Address Suggestions Dropdown */}
          {showCustomerFormSuggestions && customerFormSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
              <div className="p-2 text-sm font-medium text-gray-700 bg-gray-50 border-b">
                Address Suggestions
              </div>
              {customerFormSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
                  onClick={() => handleCustomerFormSuggestionSelect(suggestion)}
                >
                  <div className="font-medium text-gray-900">
                    {suggestion.text || suggestion.streetLine || suggestion.street_line || ''}
                  </div>
                  <div className="text-sm text-gray-600">
                    SmartyStreets suggestion
                  </div>
                </div>
              ))}
              <div className="p-2 text-center">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {/* Handle close - will be managed by parent */}}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Close suggestions
                </Button>
              </div>
            </div>
          )}
        </div>
        {formErrors.street && (
          <p className="text-sm text-red-500">{formErrors.street}</p>
        )}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="street2" className="text-sm font-medium">Suite/Apt/Unit #</Label>
        <Input
          id="street2"
          value={formData.street2}
          onChange={(e) => setFormData(prev => ({ ...prev, street2: e.target.value }))}
          placeholder="Suite 100, Apt 2B, Unit 5"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="city" className="text-sm font-medium">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => handleCustomerAddressChange('city', e.target.value)}
            className={formErrors.city ? "border-red-500" : ""}
            placeholder="City name"
          />
          {formErrors.city && (
            <p className="text-sm text-red-500">{formErrors.city}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="state" className="text-sm font-medium">State</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => handleCustomerAddressChange('state', e.target.value.toUpperCase().slice(0, 2))}
            className={formErrors.state ? "border-red-500" : ""}
            placeholder="SC"
            maxLength={2}
          />
          {formErrors.state && (
            <p className="text-sm text-red-500">{formErrors.state}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="zipCode" className="text-sm font-medium">ZIP Code</Label>
          <Input
            id="zipCode"
            value={formData.zipCode}
            onChange={(e) => handleCustomerAddressChange('zipCode', e.target.value)}
            className={formErrors.zipCode ? "border-red-500" : ""}
            placeholder="29406"
          />
          {formErrors.zipCode && (
            <p className="text-sm text-red-500">{formErrors.zipCode}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="country" className="text-sm font-medium">Country</Label>
          <Select 
            value={formData.country} 
            onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="United States">United States</SelectItem>
              <SelectItem value="Canada">Canada</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  </div>
);

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

  // Address suggestions state for separate address dialog
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Customer form address suggestions state
  const [customerFormSuggestions, setCustomerFormSuggestions] = useState<any[]>([]);
  const [showCustomerFormSuggestions, setShowCustomerFormSuggestions] = useState(false);
  const [isValidatingCustomerAddress, setIsValidatingCustomerAddress] = useState(false);
  
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

  // Handle customer form address field changes with SmartyStreets autocomplete
  const handleCustomerAddressChange = async (field: string, value: string) => {
    console.log('🔧 handleCustomerAddressChange called with:', field, value);
    const updatedFormData = { ...formData, [field]: value };
    setFormData(updatedFormData);
    
    // Trigger SmartyStreets autocomplete for street address
    if (field === 'street' && value && value.length > 3) {
      setIsValidatingCustomerAddress(true);
      try {
        const response = await fetch('/api/customers/address-autocomplete-bypass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search: value  // Use 'search' parameter instead of 'input'
          })
        });
        
        const data = await response.json();
        console.log('🔧 SmartyStreets response for customer form:', data);
        
        if (data.suggestions && data.suggestions.length > 0) {
          setCustomerFormSuggestions(data.suggestions);
          setShowCustomerFormSuggestions(true);
        } else {
          setCustomerFormSuggestions([]);
          setShowCustomerFormSuggestions(false);
        }
      } catch (error) {
        console.error('Customer address autocomplete error:', error);
        setCustomerFormSuggestions([]);
        setShowCustomerFormSuggestions(false);
      } finally {
        setIsValidatingCustomerAddress(false);
      }
    } else if (field === 'street') {
      setCustomerFormSuggestions([]);
      setShowCustomerFormSuggestions(false);
    }
  };

  // Handle customer form suggestion selection
  const handleCustomerFormSuggestionSelect = async (suggestion: any) => {
    console.log('🔧 Customer form suggestion selected:', suggestion);
    
    // Parse the address from suggestion
    const parsedAddress = parseAddressString(suggestion.text || suggestion.streetLine || '');
    
    // Try to get full address details using SmartyStreets Street API for ZIP code
    try {
      const response = await fetch('/api/customers/address-autocomplete-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: suggestion.text || suggestion.streetLine || '',
          getZipCode: true
        })
      });
      
      const data = await response.json();
      console.log('🔧 Full address details:', data);
      
      if (data.fullAddress) {
        // Use full address details if available
        setFormData(prev => ({
          ...prev,
          street: data.fullAddress.delivery_line_1 || parsedAddress.street,
          city: data.fullAddress.components?.city_name || parsedAddress.city,
          state: data.fullAddress.components?.state_abbreviation || parsedAddress.state,
          zipCode: data.fullAddress.components?.zipcode || parsedAddress.zipCode,
        }));
      } else {
        // Fall back to parsed address
        setFormData(prev => ({
          ...prev,
          street: parsedAddress.street,
          city: parsedAddress.city,
          state: parsedAddress.state,
          zipCode: parsedAddress.zipCode,
        }));
      }
    } catch (error) {
      console.error('Error getting full address details:', error);
      // Fall back to parsed address
      setFormData(prev => ({
        ...prev,
        street: parsedAddress.street,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zipCode: parsedAddress.zipCode,
      }));
    }
    
    setShowCustomerFormSuggestions(false);
    setCustomerFormSuggestions([]);
    
    toast({
      title: "Address Selected",
      description: "Address fields have been filled automatically.",
      duration: 2000
    });
  };

  // Create customer mutation with address support
  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      // Create customer first
      const customer = await apiRequest('/api/customers/create-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          company: data.company,
          contact: data.contact,
          customerType: data.customerType,
          preferredCommunicationMethod: data.preferredCommunicationMethod,
          notes: data.notes,
          isActive: data.isActive,
        }),
      });

      // Create address if address fields are provided
      if (data.street && data.city && data.state) {
        await apiRequest('/api/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: customer.id.toString(),
            street: data.street,
            street2: data.street2,
            city: data.city,
            state: data.state,
            zipCode: data.zipCode || '',
            country: data.country,
            type: data.addressType,
            isDefault: true,
          }),
        });
      }

      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Customer and address created successfully",
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
    mutationFn: (id: number) => apiRequest(`/api/customers/delete-bypass/${id}`, {
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
          company: formData.company,
          contact: formData.contact,
          customerType: formData.customerType,
          preferredCommunicationMethod: formData.preferredCommunicationMethod,
          notes: formData.notes,
          isActive: formData.isActive
        },
      });
      
      // Also handle address update if address fields are filled
      if (formData.street || formData.street2 || formData.city || formData.state || formData.zipCode) {
        try {
          // Find existing address for this customer
          const customerAddresses = addressesData?.filter(addr => {
            const addrCustomerId = typeof addr.customerId === 'string' ? 
              parseInt(addr.customerId) : addr.customerId;
            return addrCustomerId === selectedCustomer.id;
          }) || [];
          const existingAddress = customerAddresses.find(addr => addr.isDefault) || customerAddresses[0];
          
          const addressData = {
            customerId: selectedCustomer.id.toString(),
            street: formData.street,
            street2: formData.street2,
            city: formData.city,
            state: formData.state,
            zipCode: formData.zipCode,
            country: formData.country,
            type: formData.addressType,
            isDefault: true
          };
          
          if (existingAddress) {
            // Update existing address
            await apiRequest(`/api/addresses/${existingAddress.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(addressData)
            });
          } else {
            // Create new address
            await apiRequest('/api/addresses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(addressData)
            });
          }
          
          // Refresh addresses data
          queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });
        } catch (error) {
          console.error('Error updating address:', error);
        }
      }
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
      company: customer.company || '',
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: csvString }),
      });

      setIsProcessingCSV(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });

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
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Create New Customer
                </DialogTitle>
              </DialogHeader>
              <CustomerFormFields 
                formData={formData}
                setFormData={setFormData}
                formErrors={formErrors}
                handleCustomerAddressChange={handleCustomerAddressChange}
                customerFormSuggestions={customerFormSuggestions}
                showCustomerFormSuggestions={showCustomerFormSuggestions}
                isValidatingCustomerAddress={isValidatingCustomerAddress}
                handleCustomerFormSuggestionSelect={handleCustomerFormSuggestionSelect}
              />
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

      {/* Edit Customer Dialog - Redesigned */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Customer & Address
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Customer Information</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className={formErrors.name ? 'border-red-500' : ''}
                  />
                  {formErrors.name && <p className="text-sm text-red-500 mt-1">{formErrors.name}</p>}
                </div>

                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-contact">Contact</Label>
                  <Input
                    id="edit-contact"
                    value={formData.contact}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Address Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Primary Address</h3>
              
              <div className="space-y-4">
                <div className="relative">
                  <Label htmlFor="edit-street">Street Address</Label>
                  <Input
                    id="edit-street"
                    value={formData.street}
                    onChange={(e) => handleCustomerAddressChange('street', e.target.value)}
                    placeholder="Start typing for address suggestions..."
                  />
                  {isValidatingCustomerAddress && (
                    <div className="absolute right-3 top-8">
                      <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  
                  {/* Address Suggestions Dropdown */}
                  {showCustomerFormSuggestions && customerFormSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {customerFormSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 border-b last:border-b-0"
                          onClick={() => handleCustomerFormSuggestionSelect(suggestion)}
                        >
                          <div className="font-medium">{suggestion.text}</div>
                          {suggestion.streetLine && suggestion.streetLine !== suggestion.text && (
                            <div className="text-sm text-gray-600">{suggestion.streetLine}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-street2">Suite/Apt/Unit #</Label>
                  <Input
                    id="edit-street2"
                    value={formData.street2}
                    onChange={(e) => setFormData(prev => ({ ...prev, street2: e.target.value }))}
                    placeholder="Suite 100, Apt 2B, Unit 5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-city">City</Label>
                    <Input
                      id="edit-city"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-state">State</Label>
                    <Input
                      id="edit-state"
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      maxLength={2}
                      placeholder="SC"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-zipCode">ZIP Code</Label>
                    <Input
                      id="edit-zipCode"
                      value={formData.zipCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-country">Country</Label>
                    <Select value={formData.country} onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}>
                      <SelectTrigger id="edit-country">
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

                <div>
                  <Label htmlFor="edit-addressType">Address Type</Label>
                  <Select value={formData.addressType} onValueChange={(value: 'shipping' | 'billing' | 'both') => setFormData(prev => ({ ...prev, addressType: value }))}>
                    <SelectTrigger id="edit-addressType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shipping">Shipping</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Customer Fields - Full Width */}
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-company">Company</Label>
                <Input
                  id="edit-company"
                  value={formData.company}
                  onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="edit-customerType">Customer Type</Label>
                <Select value={formData.customerType} onValueChange={(value) => setFormData(prev => ({ ...prev, customerType: value }))}>
                  <SelectTrigger id="edit-customerType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                    <SelectItem value="dealer">Dealer</SelectItem>
                    <SelectItem value="oem">OEM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preferred Communication Method Section */}
            <div>
              <Label className="text-sm font-medium">Preferred Communication Method</Label>
              <div className="flex flex-row space-x-6 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-comm-email"
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
                    <Label htmlFor="edit-comm-email" className="text-sm font-medium cursor-pointer">
                      Email
                    </Label>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-comm-sms"
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
                    <Label htmlFor="edit-comm-sms" className="text-sm font-medium cursor-pointer">
                      SMS
                    </Label>
                  </div>
                </div>
                
                {formData.preferredCommunicationMethod.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No communication method selected</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateCustomer}
              disabled={updateCustomerMutation.isPending || !formData.name}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {updateCustomerMutation.isPending ? 'Updating...' : 'Update Customer & Address'}
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