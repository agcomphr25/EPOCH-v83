import React, { useState, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getAddressConfigForCountry,
  SUPPORTED_COUNTRIES,
  validatePostalCode,
} from '@/lib/countryAddressConfig';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  BarChart3,
  DollarSign,
  Eye,
  CreditCard,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  isInternational: boolean;
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

type CustomerContact = {
  id: number;
  customerId: number;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
  receivesInvoices: boolean;
  invoiceDeliveryRole: 'TO' | 'CC';
  receivesShippingNotifications: boolean;
  receivesOrderConfirmations: boolean;
  notes?: string | null;
  active: boolean;
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
  isInternational: boolean;
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

type ContactFormData = {
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  receivesInvoices: boolean;
  invoiceDeliveryRole: 'TO' | 'CC';
  receivesShippingNotifications: boolean;
  receivesOrderConfirmations: boolean;
  notes: string;
  active: boolean;
};

const initialFormData: CustomerFormData = {
  name: '',
  email: '',
  phone: '',
  contact: '',
  customerType: 'AGR',
  preferredCommunicationMethod: [],
  notes: '',
  isActive: true,
  isInternational: false,
  // Address defaults
  street: '',
  street2: '',
  city: '',
  state: '',
  zipCode: '',
  country: 'United States',
  addressType: 'both',
};

const initialContactFormData: ContactFormData = {
  name: '',
  title: '',
  email: '',
  phone: '',
  isPrimary: false,
  receivesInvoices: false,
  invoiceDeliveryRole: 'TO',
  receivesShippingNotifications: false,
  receivesOrderConfirmations: false,
  notes: '',
  active: true,
};

// Move CustomerFormFields outside the main component to prevent cursor reset
const CustomerFormFields = ({
  formData,
  setFormData,
  formErrors,
  handleCustomerAddressChange,
  customerTypes,
}: {
  formData: CustomerFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  formErrors: Record<string, string>;
  handleCustomerAddressChange: (field: string, value: string) => void;
  customerTypes: { id: number; name: string; description: string | null }[];
}) => (
  <div className="space-y-6 py-4">
    {/* Customer Information Section */}
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
        <UserCheck className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-900">
          Customer Information
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Name *
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            className={formErrors.name ? 'border-red-500' : ''}
            placeholder="Enter customer name"
          />
          {formErrors.name && (
            <p className="text-sm text-red-500">{formErrors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            className={formErrors.email ? 'border-red-500' : ''}
            placeholder="customer@example.com"
          />
          {formErrors.email && (
            <p className="text-sm text-red-500">{formErrors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone
          </Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, phone: e.target.value }))
            }
            className={formErrors.phone ? 'border-red-500' : ''}
            placeholder="(555) 123-4567"
          />
          {formErrors.phone && (
            <p className="text-sm text-red-500">{formErrors.phone}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="customerType" className="text-sm font-medium">
            Type
          </Label>
          <Select
            value={formData.customerType}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, customerType: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select customer type" />
            </SelectTrigger>
            <SelectContent>
              {customerTypes.map((type) => (
                <SelectItem key={type.id} value={type.name}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preferred Communication Method Section */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">
          Preferred Communication Method
        </Label>
        <div className="flex flex-col space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="comm-email"
              checked={formData.preferredCommunicationMethod.includes('email')}
              onCheckedChange={(checked) => {
                const methods = formData.preferredCommunicationMethod;
                if (checked) {
                  setFormData((prev) => ({
                    ...prev,
                    preferredCommunicationMethod: [...methods, 'email'],
                  }));
                } else {
                  setFormData((prev) => ({
                    ...prev,
                    preferredCommunicationMethod: methods.filter(
                      (m) => m !== 'email'
                    ),
                  }));
                }
              }}
            />
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <Label
                htmlFor="comm-email"
                className="text-sm font-medium cursor-pointer"
              >
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
                  setFormData((prev) => ({
                    ...prev,
                    preferredCommunicationMethod: [...methods, 'sms'],
                  }));
                } else {
                  setFormData((prev) => ({
                    ...prev,
                    preferredCommunicationMethod: methods.filter(
                      (m) => m !== 'sms'
                    ),
                  }));
                }
              }}
            />
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-green-600" />
              <Label
                htmlFor="comm-sms"
                className="text-sm font-medium cursor-pointer"
              >
                SMS
              </Label>
            </div>
          </div>

          {formData.preferredCommunicationMethod.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No communication method selected
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="isActive" className="text-sm font-medium">
            Status
          </Label>
          <Select
            value={formData.isActive ? 'active' : 'inactive'}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, isActive: value === 'active' }))
            }
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
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isInternational"
            data-testid="checkbox-international"
            checked={formData.isInternational}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, isInternational: !!checked }))
            }
          />
          <Label
            htmlFor="isInternational"
            className="text-sm font-medium cursor-pointer"
          >
            International Customer
          </Label>
        </div>
        <p className="text-xs text-gray-500 ml-6">
          Check this to allow free-form text entry for state/province instead of dropdown selection
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-sm font-medium">
          Notes
        </Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, notes: e.target.value }))
          }
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
        <h3 className="text-sm font-semibold text-gray-900">
          Address Information
        </h3>
        <span className="text-xs text-gray-500">(Optional)</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="addressType" className="text-sm font-medium">
          Address Type
        </Label>
        <Select
          value={formData.addressType}
          onValueChange={(value: 'shipping' | 'billing' | 'both') =>
            setFormData((prev) => ({ ...prev, addressType: value }))
          }
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
        <Label htmlFor="street" className="text-sm font-medium">
          Street Address
        </Label>
        <Input
            id="street"
            value={formData.street}
            onChange={(e) =>
              handleCustomerAddressChange('street', e.target.value)
            }
            className={formErrors.street ? 'border-red-500' : ''}
            placeholder="123 Main Street"
          />
        {formErrors.street && (
          <p className="text-sm text-red-500">{formErrors.street}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="street2" className="text-sm font-medium">
          Suite/Apt/Unit #
        </Label>
        <Input
          id="street2"
          value={formData.street2}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, street2: e.target.value }))
          }
          placeholder="Suite 100, Apt 2B, Unit 5"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="city" className="text-sm font-medium">
            City
          </Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) =>
              handleCustomerAddressChange('city', e.target.value)
            }
            className={formErrors.city ? 'border-red-500' : ''}
            placeholder="City name"
          />
          {formErrors.city && (
            <p className="text-sm text-red-500">{formErrors.city}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="state" className="text-sm font-medium">
            {(() => {
              const config = getAddressConfigForCountry(formData.country);
              return config.stateLabel;
            })()}
          </Label>
          {(() => {
            const config = getAddressConfigForCountry(formData.country);
            const hasStates = config.states.length > 0;
            
            if (hasStates && !formData.isInternational) {
              return (
                <Select
                  value={formData.state}
                  onValueChange={(value) => handleCustomerAddressChange('state', value)}
                >
                  <SelectTrigger 
                    id="state"
                    data-testid="input-state"
                    className={formErrors.state ? 'border-red-500' : ''}
                  >
                    <SelectValue placeholder={`Select ${config.stateLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {config.states.map((state) => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.name} ({state.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            }
            
            return (
              <Input
                id="state"
                data-testid="input-state"
                value={formData.state}
                onChange={(e) => handleCustomerAddressChange('state', e.target.value)}
                className={formErrors.state ? 'border-red-500' : ''}
                placeholder={config.stateLabel}
              />
            );
          })()}
          {formErrors.state && (
            <p className="text-sm text-red-500">{formErrors.state}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {(() => {
            const config = getAddressConfigForCountry(formData.country);
            return (
              <>
                <Label htmlFor="zipCode" className="text-sm font-medium">
                  {config.postalCodeLabel}
                </Label>
                <Input
                  id="zipCode"
                  data-testid="input-zipcode"
                  value={formData.zipCode}
                  onChange={(e) =>
                    handleCustomerAddressChange('zipCode', e.target.value)
                  }
                  className={formErrors.zipCode ? 'border-red-500' : ''}
                  placeholder={config.postalCodePlaceholder}
                />
                {formErrors.zipCode && (
                  <p className="text-sm text-red-500">{formErrors.zipCode}</p>
                )}
              </>
            );
          })()}
        </div>

        <div className="space-y-2">
          <Label htmlFor="country" className="text-sm font-medium">
            Country
          </Label>
          <Select
            value={formData.country}
            onValueChange={(value) => {
              setFormData((prev) => ({ 
                ...prev, 
                country: value,
                state: '',
              }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.name}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  </div>
);

export default function CustomerManagement() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<
    'all' | 'active' | 'inactive'
  >('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [sortField, setSortField] = useState<null | 'type' | 'state'>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<
    'activate' | 'deactivate' | 'delete' | null
  >(null);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [isEditAddressDialogOpen, setIsEditAddressDialogOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] =
    useState<CustomerAddress | null>(null);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] =
    useState<CustomerContact | null>(null);
  const [contactFormData, setContactFormData] =
    useState<ContactFormData>(initialContactFormData);
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

  const addressInputRef = useRef<HTMLInputElement>(null);

  // CSV Import states
  const [isCSVImportDialogOpen, setIsCSVImportDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isProcessingCSV, setIsProcessingCSV] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Balance Due Dialog state
  const [isBalanceDueDialogOpen, setIsBalanceDueDialogOpen] = useState(false);
  const [balanceDueCustomerId, setBalanceDueCustomerId] = useState<string | null>(null);

  // Fetch current user session
  const { data: session } = useQuery({
    queryKey: ['/api/auth/session'],
    queryFn: () => apiRequest('/api/auth/session'),
  });

  // Check if current user is glennj (only user with access to balance due)
  const isGlennj = session?.username === 'glennj';

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

  // Fetch balance due for selected customer
  const { data: balanceDueData, isLoading: balanceDueLoading } = useQuery({
    queryKey: ['/api/customers', balanceDueCustomerId, 'balance-due'],
    enabled: !!balanceDueCustomerId,
    queryFn: () => apiRequest(`/api/customers/${balanceDueCustomerId}/balance-due`),
  });

  // Fetch customer types for inline selector
  const { data: customerTypes = [] } = useQuery<{ id: number; name: string; description: string | null }[]>({
    queryKey: ['/api/marketing/customer-types'],
    queryFn: () => apiRequest('/api/marketing/customer-types'),
  });

  // State to track which customer is currently being updated (for loading indicator)
  const [updatingCustomerTypeId, setUpdatingCustomerTypeId] = useState<number | null>(null);

  // Inline customer type update mutation
  const updateCustomerTypeMutation = useMutation({
    mutationFn: ({ id, customerType }: { id: number; customerType: string }) =>
      apiRequest(`/api/customers/update-bypass/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerType }),
      }),
    onMutate: ({ id }) => {
      setUpdatingCustomerTypeId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/customer-types'] });
      toast({
        title: 'Success',
        description: 'Customer type updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update customer type',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setUpdatingCustomerTypeId(null);
    },
  });

  // Fetch addresses for selected customer
  const { data: addresses = [], isLoading: addressesLoading } = useQuery<
    CustomerAddress[]
  >({
    queryKey: ['/api/addresses', selectedCustomer?.id],
    enabled: !!selectedCustomer?.id,
    queryFn: () =>
      apiRequest(`/api/addresses?customerId=${selectedCustomer?.id}`),
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<
    CustomerContact[]
  >({
    queryKey: ['/api/customers', selectedCustomer?.id, 'contacts'],
    enabled: !!selectedCustomer?.id,
    queryFn: () =>
      apiRequest(`/api/customers/${selectedCustomer?.id}/contacts`),
  });

  // Precompute default state per customer for efficient sorting and filtering
  const customerDefaultStateMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (addressesData) {
      const byCustomer: Record<number, CustomerAddress[]> = {};
      for (const addr of addressesData) {
        const cid = typeof addr.customerId === 'string' ? parseInt(addr.customerId, 10) : addr.customerId;
        if (!byCustomer[cid]) byCustomer[cid] = [];
        byCustomer[cid].push(addr);
      }
      for (const [cid, addrs] of Object.entries(byCustomer)) {
        const def = addrs.find((a) => a.isDefault) || addrs[0];
        map[Number(cid)] = (def?.state ?? '').toLowerCase();
      }
    }
    return map;
  }, [addressesData]);

  // Derive distinct states present in customer data for the state filter dropdown
  const availableStates = useMemo(() => {
    const stateSet = new Set<string>();
    for (const state of Object.values(customerDefaultStateMap)) {
      if (state) stateSet.add(state);
    }
    return Array.from(stateSet).sort();
  }, [customerDefaultStateMap]);

  // Filter customers based on search, status, type, and state
  const filteredCustomers = customers.filter((customer: Customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterActive === 'all' ||
      (filterActive === 'active' && customer.isActive) ||
      (filterActive === 'inactive' && !customer.isActive);

    const matchesType =
      filterType === 'all' ||
      (customer.customerType ?? '') === filterType;

    const matchesState =
      filterState === 'all' ||
      (customerDefaultStateMap[customer.id] ?? '') === filterState.toLowerCase();

    return matchesSearch && matchesFilter && matchesType && matchesState;
  });

  // Sort customers by type or state
  const sortedCustomers = sortField
    ? [...filteredCustomers].sort((a: Customer, b: Customer) => {
        let aVal = '';
        let bVal = '';
        if (sortField === 'type') {
          aVal = (a.customerType ?? '').toLowerCase();
          bVal = (b.customerType ?? '').toLowerCase();
        } else if (sortField === 'state') {
          aVal = customerDefaultStateMap[a.id] ?? '';
          bVal = customerDefaultStateMap[b.id] ?? '';
        }
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      })
    : filteredCustomers;

  const handleSort = (field: 'type' | 'state') => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle address field changes for the separate address dialog
  const handleAddressFieldChange = (field: string, value: string) => {
    setAddressFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle customer form address field changes
  const handleCustomerAddressChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Create customer mutation with address support
  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData): Promise<{ addrPayload: object | null }> => {
      // Create customer first
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
          isInternational: data.isInternational,
        }),
      });

      // Create address if address fields are provided (state optional for international)
      let addrPayload: object | null = null;
      if (data.street && data.city) {
        addrPayload = {
          customerId: customer.id.toString(),
          street: data.street,
          street2: data.street2,
          city: data.city,
          state: data.state || '',
          zipCode: data.zipCode || '',
          country: data.country,
          type: data.addressType,
          isDefault: true,
        };

        await apiRequest('/api/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...addrPayload, skipValidation: true }),
        });
      }

      return { addrPayload };
    },
    onSuccess: ({ addrPayload }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/addresses/all'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: addrPayload
          ? 'Customer and address created successfully'
          : 'Customer created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create customer',
        variant: 'destructive',
      });
    },
  });

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<CustomerFormData>;
    }) =>
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
        title: 'Success',
        description: 'Customer updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update customer',
        variant: 'destructive',
      });
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/customers/delete-bypass/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/bypass'] });
      setIsDeleteDialogOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: 'Customer deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete customer',
        variant: 'destructive',
      });
    },
  });

  // Address mutations
  const createAddressMutation = useMutation({
    mutationFn: (data: AddressFormData) =>
      apiRequest('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, skipValidation: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/addresses', selectedCustomer?.id],
      });
      setIsAddressDialogOpen(false);
      resetAddressForm();
      toast({
        title: 'Success',
        description: 'Address created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create address',
        variant: 'destructive',
      });
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: (data: AddressFormData & { id: number }) =>
      apiRequest(`/api/addresses/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, skipValidation: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/addresses', selectedCustomer?.id],
      });
      setIsEditAddressDialogOpen(false);
      resetAddressForm();
      toast({
        title: 'Success',
        description: 'Address updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update address',
        variant: 'destructive',
      });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/addresses/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/addresses', selectedCustomer?.id],
      });
      toast({
        title: 'Success',
        description: 'Address deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete address',
        variant: 'destructive',
      });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: (data: ContactFormData) =>
      apiRequest(`/api/customers/${selectedCustomer?.id}/contacts`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/customers', selectedCustomer?.id, 'contacts'],
      });
      setIsContactDialogOpen(false);
      resetContactForm();
      toast({
        title: 'Success',
        description: 'Contact added successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add contact',
        variant: 'destructive',
      });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: (data: ContactFormData & { id: number }) =>
      apiRequest(`/api/customers/${selectedCustomer?.id}/contacts/${data.id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/customers', selectedCustomer?.id, 'contacts'],
      });
      setIsContactDialogOpen(false);
      resetContactForm();
      toast({
        title: 'Success',
        description: 'Contact updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update contact',
        variant: 'destructive',
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/customers/${selectedCustomer?.id}/contacts/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/customers', selectedCustomer?.id, 'contacts'],
      });
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete contact',
        variant: 'destructive',
      });
    },
  });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Customer name is required';
    }

    if (formData.email && !isValidEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (formData.phone && !isValidPhone(formData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (formData.zipCode && formData.zipCode.trim()) {
      const config = getAddressConfigForCountry(formData.country);
      if (!validatePostalCode(formData.zipCode, formData.country)) {
        errors.zipCode = config.postalCodeErrorMessage;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string): boolean => {
    // Allow digits, spaces, hyphens, dots, parentheses, and leading +
    const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{7,}$/;
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
          contact: formData.contact,
          customerType: formData.customerType,
          preferredCommunicationMethod: formData.preferredCommunicationMethod,
          notes: formData.notes,
          isActive: formData.isActive,
        },
      });

      // Also handle address update if address fields are filled
      if (
        formData.street ||
        formData.street2 ||
        formData.city ||
        formData.state ||
        formData.zipCode
      ) {
        try {
          // Find existing address for this customer
          const customerAddresses =
            addressesData?.filter((addr) => {
              const addrCustomerId =
                typeof addr.customerId === 'string'
                  ? parseInt(addr.customerId)
                  : addr.customerId;
              return addrCustomerId === selectedCustomer.id;
            }) || [];
          const existingAddress =
            customerAddresses.find((addr) => addr.isDefault) ||
            customerAddresses[0];

          const addressData = {
            customerId: selectedCustomer.id.toString(),
            street: formData.street,
            street2: formData.street2,
            city: formData.city,
            state: formData.state,
            zipCode: formData.zipCode,
            country: formData.country,
            type: formData.addressType,
            isDefault: true,
          };

          if (existingAddress) {
            // Update existing address
            await apiRequest(`/api/addresses/${existingAddress.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...addressData, skipValidation: true }),
            });
          } else {
            // Create new address
            await apiRequest('/api/addresses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...addressData, skipValidation: true }),
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
    const customerAddresses =
      addressesData?.filter((addr) => {
        const addrCustomerId =
          typeof addr.customerId === 'string'
            ? parseInt(addr.customerId)
            : addr.customerId;
        return addrCustomerId === customer.id;
      }) || [];
    const defaultAddress =
      customerAddresses.find((addr) => addr.isDefault) || customerAddresses[0];

    setFormData({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      contact: customer.contact || '',
      customerType: customer.customerType,
      preferredCommunicationMethod: customer.preferredCommunicationMethod || [],
      notes: customer.notes || '',
      isActive: customer.isActive,
      isInternational: customer.isInternational || false,
      // Load existing address if available
      street: defaultAddress?.street || '',
      street2: defaultAddress?.street2 || '',
      city: defaultAddress?.city || '',
      state: defaultAddress?.state || '',
      zipCode: defaultAddress?.zipCode || '',
      country: defaultAddress?.country || 'United States',
      addressType: defaultAddress?.type || 'shipping',
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
    setSelectedCustomers((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
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

    if (addressFormData.zipCode && addressFormData.zipCode.trim()) {
      const config = getAddressConfigForCountry(addressFormData.country);
      if (!validatePostalCode(addressFormData.zipCode, addressFormData.country)) {
        toast({
          title: 'Validation Error',
          description: config.postalCodeErrorMessage,
          variant: 'destructive',
        });
        return;
      }
    }

    const addressData = {
      ...addressFormData,
      customerId: selectedCustomer.id.toString(),
    };

    createAddressMutation.mutate(addressData);
  };

  const handleUpdateAddress = () => {
    if (!selectedAddress) return;

    if (addressFormData.zipCode && addressFormData.zipCode.trim()) {
      const config = getAddressConfigForCountry(addressFormData.country);
      if (!validatePostalCode(addressFormData.zipCode, addressFormData.country)) {
        toast({
          title: 'Validation Error',
          description: config.postalCodeErrorMessage,
          variant: 'destructive',
        });
        return;
      }
    }

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

  const resetContactForm = () => {
    setContactFormData(initialContactFormData);
    setSelectedContact(null);
  };

  const handleAddContact = () => {
    if (!selectedCustomer) return;
    resetContactForm();
    setIsContactDialogOpen(true);
  };

  const handleEditContact = (contact: CustomerContact) => {
    setSelectedContact(contact);
    setContactFormData({
      name: contact.name,
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      isPrimary: contact.isPrimary,
      receivesInvoices: contact.receivesInvoices,
      invoiceDeliveryRole: contact.invoiceDeliveryRole || 'TO',
      receivesShippingNotifications: contact.receivesShippingNotifications,
      receivesOrderConfirmations: contact.receivesOrderConfirmations,
      notes: contact.notes || '',
      active: contact.active,
    });
    setIsContactDialogOpen(true);
  };

  const validateContactForm = () => {
    if (!contactFormData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Contact name is required',
        variant: 'destructive',
      });
      return false;
    }
    if (contactFormData.email && !isValidEmail(contactFormData.email)) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return false;
    }
    if (contactFormData.phone && !isValidPhone(contactFormData.phone)) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid phone number',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleSaveContact = () => {
    if (!selectedCustomer || !validateContactForm()) return;
    if (selectedContact) {
      updateContactMutation.mutate({ ...contactFormData, id: selectedContact.id });
    } else {
      createContactMutation.mutate(contactFormData);
    }
  };

  const handleDeleteContact = (contact: CustomerContact) => {
    if (confirm(`Delete contact ${contact.name}?`)) {
      deleteContactMutation.mutate(contact.id);
    }
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
      [
        'Name',
        'Email',
        'Phone',
        'Customer Type',
        'Status',
        'Notes',
        'Created Date',
      ],
      ...filteredCustomers.map((customer: Customer) => [
        customer.name,
        customer.email || '',
        customer.phone || '',
        customer.customerType,
        customer.isActive ? 'Active' : 'Inactive',
        customer.notes || '',
        new Date(customer.createdAt).toLocaleDateString(),
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

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
        title: 'Invalid File',
        description: 'Please select a valid CSV file',
        variant: 'destructive',
      });
    }
  };

  const parseCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map((h) => h.trim());
      const data = lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
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
        title: 'No Data',
        description: 'No valid data found in CSV file',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessingCSV(true);

    try {
      // Convert CSV data to raw CSV string format for the backend
      const headers = Object.keys(csvData[0]);
      const csvString = [
        headers.join(','), // Header row
        ...csvData.map((row) =>
          headers.map((header) => row[header] || '').join(',')
        ),
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
        title: 'Import Complete',
        description: description,
        variant:
          result.errors && result.errors.length > 0 ? 'destructive' : 'default',
      });

      setIsCSVImportDialogOpen(false);
      setCsvFile(null);
      setCsvData([]);
    } catch (error: any) {
      setIsProcessingCSV(false);
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import customers from CSV',
        variant: 'destructive',
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
            onClick={() => setLocation('/customer-satisfaction')}
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Customer Satisfaction
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['/api/customers/bypass'],
              })
            }
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCustomers}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Dialog
            open={isCSVImportDialogOpen}
            onOpenChange={setIsCSVImportDialogOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </DialogTrigger>
          </Dialog>
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
          >
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
                customerTypes={customerTypes}
              />
              <div className="flex justify-end gap-2 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
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
            <CardTitle className="text-sm font-medium">
              Total Customers
            </CardTitle>
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
              {
                customers.filter((c: Customer) => {
                  const created = new Date(c.createdAt);
                  const now = new Date();
                  return (
                    created.getMonth() === now.getMonth() &&
                    created.getFullYear() === now.getFullYear()
                  );
                }).length
              }
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

            <Select
              value={filterActive}
              onValueChange={(value: any) => setFilterActive(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filterType}
              onValueChange={(value) => setFilterType(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {customerTypes.map((ct) => (
                  <SelectItem key={ct.id} value={ct.name}>{ct.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterState}
              onValueChange={(value) => setFilterState(value)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {availableStates.map((state) => (
                  <SelectItem key={state} value={state}>{state.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({sortedCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading customers...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('state')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Address
                      {sortField === 'state' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => handleSort('type')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Type
                      {sortField === 'type' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  {isGlennj && (
                    <TableHead className="text-right">Balance Due</TableHead>
                  )}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCustomers.map((customer: Customer) => {
                  // Get addresses for this customer - properly handle type conversion
                  const customerAddresses =
                    addressesData?.filter((addr) => {
                      // Convert both to numbers for comparison
                      const addrCustomerId =
                        typeof addr.customerId === 'string'
                          ? parseInt(addr.customerId, 10)
                          : addr.customerId;
                      return addrCustomerId === customer.id;
                    }) || [];
                  const defaultAddress =
                    customerAddresses.find((addr) => addr.isDefault) ||
                    customerAddresses[0];

                  return (
                    <TableRow 
                      key={customer.id}
                      interactive
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button, a, [role="menu"], [role="menuitem"], input, select, [data-radix-collection-item]')) return;
                        handleEditCustomer(customer);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button, a, [role="menu"], input, select')) {
                          handleEditCustomer(customer);
                        }
                      }}
                    >
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
                            <div className="text-gray-600">
                              {defaultAddress.city}
                              {defaultAddress.state && `, ${defaultAddress.state}`}
                              {defaultAddress.zipCode && ` ${defaultAddress.zipCode}`}
                            </div>
                            <div className="text-gray-500">
                              {defaultAddress.country}
                            </div>
                            {defaultAddress.type !== 'shipping' && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {defaultAddress.type}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">
                            No address
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={customer.customerType || ''}
                            onValueChange={(value) => {
                              updateCustomerTypeMutation.mutate({
                                id: customer.id,
                                customerType: value,
                              });
                            }}
                            disabled={updatingCustomerTypeId === customer.id}
                          >
                            <SelectTrigger 
                              className="w-[130px] h-8 text-sm"
                              data-testid={`select-customer-type-${customer.id}`}
                            >
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {customerTypes.length > 0 ? (
                                customerTypes.map((type) => (
                                  <SelectItem 
                                    key={type.id} 
                                    value={type.name}
                                    data-testid={`option-customer-type-${type.name}`}
                                  >
                                    {type.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <>
                                  <SelectItem value="AGR">AGR</SelectItem>
                                  <SelectItem value="Gunbuilder">Gunbuilder</SelectItem>
                                  <SelectItem value="Distributor">Distributor</SelectItem>
                                  <SelectItem value="OEM">OEM</SelectItem>
                                  <SelectItem value="Individual">Individual</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          {updatingCustomerTypeId === customer.id && (
                            <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={customer.isActive ? 'default' : 'secondary'}
                        >
                          {customer.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </TableCell>
                      {isGlennj && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            onClick={() => {
                              setBalanceDueCustomerId(customer.id.toString());
                              setIsBalanceDueDialogOpen(true);
                            }}
                            data-testid={`button-view-balance-${customer.id}`}
                            title="View Balance Due Details"
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            View Balance
                          </Button>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                            title="Edit Customer & Address"
                            data-testid={`button-edit-customer-${customer.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCustomer(customer)}
                            title="Delete Customer"
                            data-testid={`button-delete-customer-${customer.id}`}
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
      <Dialog
        open={isCSVImportDialogOpen}
        onOpenChange={setIsCSVImportDialogOpen}
      >
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
                Expected format: Name, Email, Phone (Name is required, Email and
                Phone are optional)
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
                    <p className="text-sm font-medium text-green-800">
                      File Selected
                    </p>
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
                    <div
                      key={index}
                      className="text-sm mb-2 p-2 bg-white rounded border"
                    >
                      <strong>{row.Name || row.name || 'No name'}</strong>
                      <br />
                      {(row.Email || row.email) && (
                        <span>📧 {row.Email || row.email}</span>
                      )}
                      <br />
                      {(row.Phone || row.phone) && (
                        <span>📞 {row.Phone || row.phone}</span>
                      )}
                    </div>
                  ))}
                  {csvData.length > 3 && (
                    <p className="text-sm text-gray-500">
                      ... and {csvData.length - 3} more records
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsCSVImportDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={processCSVImport}
              disabled={csvData.length === 0 || isProcessingCSV}
            >
              {isProcessingCSV
                ? 'Processing...'
                : `Import ${csvData.length} Record(s)`}
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
              <h3 className="text-lg font-semibold border-b pb-2">
                Customer Information
              </h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className={formErrors.name ? 'border-red-500' : ''}
                  />
                  {formErrors.name && (
                    <p className="text-sm text-red-500 mt-1">
                      {formErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="edit-contact">Contact</Label>
                  <Input
                    id="edit-contact"
                    value={formData.contact}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        contact: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Additional Contacts</h4>
                    <p className="text-xs text-muted-foreground">
                      Used for invoice recipient selection and customer notifications.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddContact}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>

                {contactsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading contacts...</div>
                ) : contacts.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">
                    No additional contacts have been configured.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="rounded-md border bg-muted/20 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium">{contact.name}</span>
                              {contact.isPrimary && <Badge variant="secondary">Primary</Badge>}
                              {!contact.active && <Badge variant="outline">Inactive</Badge>}
                            </div>
                            {contact.title && (
                              <div className="text-xs text-muted-foreground">{contact.title}</div>
                            )}
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {contact.email && <div>{contact.email}</div>}
                              {contact.phone && <div>{contact.phone}</div>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {contact.receivesInvoices && (
                                <Badge variant="outline">
                                  Invoice {contact.invoiceDeliveryRole || 'TO'}
                                </Badge>
                              )}
                              {contact.receivesShippingNotifications && <Badge variant="outline">Shipping</Badge>}
                              {contact.receivesOrderConfirmations && <Badge variant="outline">Orders</Badge>}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleEditContact(contact)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteContact(contact)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Address Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">
                Primary Address
              </h3>

              <div className="space-y-4">
                <div className="relative">
                  <Label htmlFor="edit-street">Street Address</Label>
                  <Input
                    id="edit-street"
                    value={formData.street}
                    onChange={(e) =>
                      handleCustomerAddressChange('street', e.target.value)
                    }
                    placeholder="123 Main Street"
                  />
                </div>

                <div>
                  <Label htmlFor="edit-street2">Suite/Apt/Unit #</Label>
                  <Input
                    id="edit-street2"
                    value={formData.street2}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        street2: e.target.value,
                      }))
                    }
                    placeholder="Suite 100, Apt 2B, Unit 5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-city">City</Label>
                    <Input
                      id="edit-city"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          city: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    {(() => {
                      const config = getAddressConfigForCountry(formData.country);
                      const hasStates = config.states.length > 0;
                      
                      return (
                        <>
                          <Label htmlFor="edit-state">{config.stateLabel}</Label>
                          {hasStates ? (
                            <Select
                              value={formData.state}
                              onValueChange={(value) =>
                                setFormData((prev) => ({ ...prev, state: value }))
                              }
                            >
                              <SelectTrigger id="edit-state">
                                <SelectValue placeholder={`Select ${config.stateLabel.toLowerCase()}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {config.states.map((state) => (
                                  <SelectItem key={state.code} value={state.code}>
                                    {state.name} ({state.code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id="edit-state"
                              value={formData.state}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  state: e.target.value,
                                }))
                              }
                              placeholder={config.stateLabel}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {(() => {
                      const config = getAddressConfigForCountry(formData.country);
                      return (
                        <>
                          <Label htmlFor="edit-zipCode">{config.postalCodeLabel}</Label>
                          <Input
                            id="edit-zipCode"
                            value={formData.zipCode}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                zipCode: e.target.value,
                              }))
                            }
                            placeholder={config.postalCodePlaceholder}
                          />
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <Label htmlFor="edit-country">Country</Label>
                    <Select
                      value={formData.country}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, country: value, state: '' }))
                      }
                    >
                      <SelectTrigger id="edit-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.name}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-addressType">Address Type</Label>
                  <Select
                    value={formData.addressType}
                    onValueChange={(value: 'shipping' | 'billing' | 'both') =>
                      setFormData((prev) => ({ ...prev, addressType: value }))
                    }
                  >
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
                <Label htmlFor="edit-customerType">Customer Type</Label>
                <Select
                  value={formData.customerType}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, customerType: value }))
                  }
                >
                  <SelectTrigger id="edit-customerType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map((type) => (
                      <SelectItem key={type.id} value={type.name}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preferred Communication Method Section */}
            <div>
              <Label className="text-sm font-medium">
                Preferred Communication Method
              </Label>
              <div className="flex flex-row space-x-6 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-comm-email"
                    checked={formData.preferredCommunicationMethod.includes(
                      'email'
                    )}
                    onCheckedChange={(checked) => {
                      const methods = formData.preferredCommunicationMethod;
                      if (checked) {
                        setFormData((prev) => ({
                          ...prev,
                          preferredCommunicationMethod: [...methods, 'email'],
                        }));
                      } else {
                        setFormData((prev) => ({
                          ...prev,
                          preferredCommunicationMethod: methods.filter(
                            (m) => m !== 'email'
                          ),
                        }));
                      }
                    }}
                  />
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <Label
                      htmlFor="edit-comm-email"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Email
                    </Label>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-comm-sms"
                    checked={formData.preferredCommunicationMethod.includes(
                      'sms'
                    )}
                    onCheckedChange={(checked) => {
                      const methods = formData.preferredCommunicationMethod;
                      if (checked) {
                        setFormData((prev) => ({
                          ...prev,
                          preferredCommunicationMethod: [...methods, 'sms'],
                        }));
                      } else {
                        setFormData((prev) => ({
                          ...prev,
                          preferredCommunicationMethod: methods.filter(
                            (m) => m !== 'sms'
                          ),
                        }));
                      }
                    }}
                  />
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-green-600" />
                    <Label
                      htmlFor="edit-comm-sms"
                      className="text-sm font-medium cursor-pointer"
                    >
                      SMS
                    </Label>
                  </div>
                </div>

                {formData.preferredCommunicationMethod.length === 0 && (
                  <p className="text-sm text-gray-500 italic">
                    No communication method selected
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateCustomer}
              disabled={updateCustomerMutation.isPending || !formData.name}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {updateCustomerMutation.isPending
                ? 'Updating...'
                : 'Update Customer & Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {selectedContact ? 'Edit Customer Contact' : 'Add Customer Contact'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Name *</Label>
                <Input
                  id="contact-name"
                  value={contactFormData.name}
                  onChange={(e) => setContactFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-title">Role / Title</Label>
                <Input
                  id="contact-title"
                  value={contactFormData.title}
                  onChange={(e) => setContactFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Accounts payable"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactFormData.email}
                  onChange={(e) => setContactFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="contact@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  value={contactFormData.phone}
                  onChange={(e) => setContactFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="contact-primary"
                  checked={contactFormData.isPrimary}
                  onCheckedChange={(checked) =>
                    setContactFormData((prev) => ({ ...prev, isPrimary: !!checked }))
                  }
                />
                <Label htmlFor="contact-primary" className="cursor-pointer text-sm font-medium">
                  Primary contact
                </Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contact-invoices"
                    checked={contactFormData.receivesInvoices}
                    onCheckedChange={(checked) =>
                      setContactFormData((prev) => ({ ...prev, receivesInvoices: !!checked }))
                    }
                  />
                  <Label htmlFor="contact-invoices" className="cursor-pointer text-sm">
                    Invoice recipient
                  </Label>
                </div>
                {contactFormData.receivesInvoices && (
                  <div className="space-y-1">
                    <Label htmlFor="contact-invoice-role" className="text-sm">
                      Invoice delivery
                    </Label>
                    <Select
                      value={contactFormData.invoiceDeliveryRole}
                      onValueChange={(value: 'TO' | 'CC') =>
                        setContactFormData((prev) => ({
                          ...prev,
                          invoiceDeliveryRole: value,
                        }))
                      }
                    >
                      <SelectTrigger id="contact-invoice-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TO">To</SelectItem>
                        <SelectItem value="CC">CC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contact-shipping"
                    checked={contactFormData.receivesShippingNotifications}
                    onCheckedChange={(checked) =>
                      setContactFormData((prev) => ({ ...prev, receivesShippingNotifications: !!checked }))
                    }
                  />
                  <Label htmlFor="contact-shipping" className="cursor-pointer text-sm">
                    Shipping notifications
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contact-orders"
                    checked={contactFormData.receivesOrderConfirmations}
                    onCheckedChange={(checked) =>
                      setContactFormData((prev) => ({ ...prev, receivesOrderConfirmations: !!checked }))
                    }
                  />
                  <Label htmlFor="contact-orders" className="cursor-pointer text-sm">
                    Order confirmations
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contact-active"
                    checked={contactFormData.active}
                    onCheckedChange={(checked) =>
                      setContactFormData((prev) => ({ ...prev, active: !!checked }))
                    }
                  />
                  <Label htmlFor="contact-active" className="cursor-pointer text-sm">
                    Active
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={contactFormData.notes}
                onChange={(e) => setContactFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveContact}
              disabled={createContactMutation.isPending || updateContactMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {selectedContact ? 'Update Contact' : 'Add Contact'}
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
              <Label htmlFor="street" className="text-right">
                Street
              </Label>
              <div className="col-span-3 relative">
                <Input
                  id="street"
                  ref={addressInputRef}
                  value={addressFormData.street}
                  onChange={(e) =>
                    handleAddressFieldChange('street', e.target.value)
                  }
                  placeholder="123 Main St"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="city" className="text-right">
                City
              </Label>
              <Input
                id="city"
                value={addressFormData.city}
                onChange={(e) =>
                  handleAddressFieldChange('city', e.target.value)
                }
                className="col-span-3"
                placeholder="San Francisco"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="country" className="text-right">
                Country
              </Label>
              <Select
                value={addressFormData.country}
                onValueChange={(value) => {
                  setAddressFormData((prev) => ({
                    ...prev,
                    country: value,
                    state: '',
                  }));
                }}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.name}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              {(() => {
                const config = getAddressConfigForCountry(addressFormData.country);
                return (
                  <>
                    <Label htmlFor="state" className="text-right">
                      {config.stateLabel}
                    </Label>
                    {config.states.length > 0 ? (
                      <Select
                        value={addressFormData.state}
                        onValueChange={(value) => handleAddressFieldChange('state', value)}
                      >
                        <SelectTrigger className="col-span-3">
                          <SelectValue placeholder={`Select ${config.stateLabel.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {config.states.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name} ({state.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="state"
                        value={addressFormData.state}
                        onChange={(e) => handleAddressFieldChange('state', e.target.value)}
                        className="col-span-3"
                        placeholder={config.stateLabel}
                      />
                    )}
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              {(() => {
                const config = getAddressConfigForCountry(addressFormData.country);
                return (
                  <>
                    <Label htmlFor="zipCode" className="text-right">
                      {config.postalCodeLabel}
                    </Label>
                    <Input
                      id="zipCode"
                      value={addressFormData.zipCode}
                      onChange={(e) =>
                        handleAddressFieldChange('zipCode', e.target.value)
                      }
                      className="col-span-3"
                      placeholder={config.postalCodePlaceholder}
                    />
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="addressType" className="text-right">
                Type
              </Label>
              <Select
                value={addressFormData.type}
                onValueChange={(value: 'shipping' | 'billing' | 'both') =>
                  setAddressFormData((prev) => ({ ...prev, type: value }))
                }
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
              <Label htmlFor="isDefault" className="text-right">
                Default
              </Label>
              <div className="col-span-3">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={addressFormData.isDefault}
                  onChange={(e) =>
                    setAddressFormData((prev) => ({
                      ...prev,
                      isDefault: e.target.checked,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isDefault" className="ml-2 text-sm">
                  Make this the default address
                </Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsAddressDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAddress}
              disabled={createAddressMutation.isPending}
            >
              {createAddressMutation.isPending
                ? 'Creating...'
                : 'Create Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Address Dialog */}
      <Dialog
        open={isEditAddressDialogOpen}
        onOpenChange={setIsEditAddressDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Address</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editStreet" className="text-right">
                Street
              </Label>
              <div className="col-span-3 relative">
                <Input
                  id="editStreet"
                  value={addressFormData.street}
                  onChange={(e) =>
                    handleAddressFieldChange('street', e.target.value)
                  }
                  placeholder="123 Main St"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editCity" className="text-right">
                City
              </Label>
              <Input
                id="editCity"
                value={addressFormData.city}
                onChange={(e) =>
                  handleAddressFieldChange('city', e.target.value)
                }
                className="col-span-3"
                placeholder="San Francisco"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editCountry" className="text-right">
                Country
              </Label>
              <Select
                value={addressFormData.country}
                onValueChange={(value) => {
                  setAddressFormData((prev) => ({
                    ...prev,
                    country: value,
                    state: '',
                  }));
                }}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.name}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              {(() => {
                const config = getAddressConfigForCountry(addressFormData.country);
                return (
                  <>
                    <Label htmlFor="editState" className="text-right">
                      {config.stateLabel}
                    </Label>
                    {config.states.length > 0 ? (
                      <Select
                        value={addressFormData.state}
                        onValueChange={(value) => handleAddressFieldChange('state', value)}
                      >
                        <SelectTrigger className="col-span-3">
                          <SelectValue placeholder={`Select ${config.stateLabel.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {config.states.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name} ({state.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="editState"
                        value={addressFormData.state}
                        onChange={(e) => handleAddressFieldChange('state', e.target.value)}
                        className="col-span-3"
                        placeholder={config.stateLabel}
                      />
                    )}
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              {(() => {
                const config = getAddressConfigForCountry(addressFormData.country);
                return (
                  <>
                    <Label htmlFor="editZipCode" className="text-right">
                      {config.postalCodeLabel}
                    </Label>
                    <Input
                      id="editZipCode"
                      value={addressFormData.zipCode}
                      onChange={(e) =>
                        handleAddressFieldChange('zipCode', e.target.value)
                      }
                      className="col-span-3"
                      placeholder={config.postalCodePlaceholder}
                    />
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editAddressType" className="text-right">
                Type
              </Label>
              <Select
                value={addressFormData.type}
                onValueChange={(value: 'shipping' | 'billing' | 'both') =>
                  setAddressFormData((prev) => ({ ...prev, type: value }))
                }
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
              <Label htmlFor="editIsDefault" className="text-right">
                Default
              </Label>
              <div className="col-span-3">
                <input
                  type="checkbox"
                  id="editIsDefault"
                  checked={addressFormData.isDefault}
                  onChange={(e) =>
                    setAddressFormData((prev) => ({
                      ...prev,
                      isDefault: e.target.checked,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <Label htmlFor="editIsDefault" className="ml-2 text-sm">
                  Make this the default address
                </Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsEditAddressDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateAddress}
              disabled={updateAddressMutation.isPending}
            >
              {updateAddressMutation.isPending
                ? 'Updating...'
                : 'Update Address'}
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
          <p>
            Are you sure you want to delete{' '}
            <strong>{selectedCustomer?.name}</strong>? This action cannot be
            undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
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

      {/* Balance Due Details Dialog */}
      <Dialog open={isBalanceDueDialogOpen} onOpenChange={setIsBalanceDueDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-orange-600" />
              Balance Due Details
            </DialogTitle>
          </DialogHeader>

          {balanceDueLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-3 text-gray-600">Loading balance information...</span>
            </div>
          ) : balanceDueData ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Orders Balance */}
                <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm font-medium text-orange-900">Orders Balance</p>
                      <p className="text-2xl font-bold text-orange-700 mt-1">
                        ${balanceDueData.totalBalanceDue?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                        {balanceDueData.orderCount || 0} unpaid order{balanceDueData.orderCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Credits Available */}
                <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm font-medium text-green-900">Credits Available</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">
                        -${balanceDueData.totalCreditsAvailable?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {balanceDueData.creditMemos?.length || 0} credit memo{balanceDueData.creditMemos?.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Net Balance Due */}
                <Card className={`bg-gradient-to-br ${balanceDueData.netBalanceDue > 0 ? 'from-red-50 to-red-100 border-red-200' : 'from-blue-50 to-blue-100 border-blue-200'}`}>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className={`text-sm font-medium ${balanceDueData.netBalanceDue > 0 ? 'text-red-900' : 'text-blue-900'}`}>
                        Net Balance Due
                      </p>
                      <p className={`text-2xl font-bold mt-1 ${balanceDueData.netBalanceDue > 0 ? 'text-red-700' : 'text-blue-700'}`}>
                        ${balanceDueData.netBalanceDue?.toFixed(2) || '0.00'}
                      </p>
                      <p className={`text-xs mt-1 ${balanceDueData.netBalanceDue > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        After applying credits
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Orders List */}
              {balanceDueData.orders && balanceDueData.orders.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Unpaid Orders</h3>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer PO</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead className="text-right">Order Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Refunded</TableHead>
                        <TableHead className="text-right">Net Paid</TableHead>
                        <TableHead className="text-right">Balance Due</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceDueData.orders.map((order: any) => (
                        <TableRow key={order.orderId} data-testid={`row-order-${order.orderId}`}>
                          <TableCell className="font-medium" data-testid={`text-order-id-${order.orderId}`}>
                            {order.orderId}
                          </TableCell>
                          <TableCell data-testid={`text-customer-po-${order.orderId}`}>
                            {order.customerPO || '-'}
                          </TableCell>
                          <TableCell data-testid={`text-order-date-${order.orderId}`}>
                            {new Date(order.orderDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-order-total-${order.orderId}`}>
                            ${order.orderTotal?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell className="text-right text-green-600" data-testid={`text-total-paid-${order.orderId}`}>
                            ${order.totalPaid?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell className="text-right text-red-600" data-testid={`text-total-refunded-${order.orderId}`}>
                            -${order.totalRefunded?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell 
                            className={`text-right font-medium ${order.netPaid < 0 ? 'text-red-600' : 'text-blue-600'}`} 
                            data-testid={`text-net-paid-${order.orderId}`}
                          >
                            {order.netPaid < 0 ? `-$${Math.abs(order.netPaid).toFixed(2)}` : `$${order.netPaid?.toFixed(2) || '0.00'}`}
                            {order.netPaid < 0 && (
                              <span className="text-xs ml-1">(Credit)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-orange-600" data-testid={`text-balance-due-${order.orderId}`}>
                            ${order.balanceDue?.toFixed(2) || '0.00'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-600">No unpaid orders.</p>
                </div>
              )}

              {/* Credit Memos List */}
              {balanceDueData.creditMemos && balanceDueData.creditMemos.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-green-600" />
                    Available Credit Memos
                  </h3>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Memo Number</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Issued Date</TableHead>
                        <TableHead className="text-right">Original Amount</TableHead>
                        <TableHead className="text-right">Applied</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceDueData.creditMemos.map((memo: any) => (
                        <TableRow key={memo.id} data-testid={`row-credit-memo-${memo.id}`}>
                          <TableCell className="font-medium text-green-700" data-testid={`text-memo-number-${memo.id}`}>
                            {memo.memoNumber}
                          </TableCell>
                          <TableCell data-testid={`text-memo-reason-${memo.id}`}>
                            {memo.reason || '-'}
                          </TableCell>
                          <TableCell data-testid={`text-memo-date-${memo.id}`}>
                            {memo.issuedDate ? new Date(memo.issuedDate).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-memo-amount-${memo.id}`}>
                            ${memo.amount?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell className="text-right text-gray-500" data-testid={`text-memo-applied-${memo.id}`}>
                            ${memo.appliedAmount?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-600" data-testid={`text-memo-available-${memo.id}`}>
                            ${memo.unappliedAmount?.toFixed(2) || '0.00'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* No balance message */}
              {(!balanceDueData.orders || balanceDueData.orders.length === 0) && 
               (!balanceDueData.creditMemos || balanceDueData.creditMemos.length === 0) && (
                <div className="text-center py-12 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-lg font-semibold text-green-800">No Outstanding Balance</p>
                  <p className="text-sm text-green-600 mt-1">
                    This customer has no unpaid orders or available credits.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No balance information available</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsBalanceDueDialogOpen(false);
                setBalanceDueCustomerId(null);
              }}
              data-testid="button-close-balance-dialog"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
