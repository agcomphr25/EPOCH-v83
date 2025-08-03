import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { User, Building2, Mail, Phone, MapPin, FileText, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  customerType: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomerAddress {
  id: number;
  customerId: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  type: string;
  isDefault: boolean;
  isValidated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomerDetailsTooltipProps {
  customerId: string;
  customerName: string;
  children: React.ReactNode;
}

export default function CustomerDetailsTooltip({ customerId, customerName, children }: CustomerDetailsTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch customer details
  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: isOpen && !!customerId,
  });

  // Fetch customer addresses
  const { data: addresses = [] } = useQuery<CustomerAddress[]>({
    queryKey: [`/api/addresses?customerId=${customerId}`],
    enabled: isOpen && !!customerId,
  });

  // Get the primary/default address
  const primaryAddress = addresses.find(addr => addr.isDefault) || addresses[0];

  return (
    <HoverCard open={isOpen} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors">
          {children}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-4" align="start">
        <div className="space-y-3">
          {/* Customer Name and Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{customerName}</span>
            </div>
            {customer?.isActive === false && (
              <Badge variant="destructive" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>

          {/* Customer ID */}
          <div className="text-sm text-gray-600">
            ID: {customerId}
          </div>

          {/* Company */}
          {customer?.company && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-gray-500" />
              <span>{customer.company}</span>
            </div>
          )}

          {/* Email */}
          {customer?.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-gray-500" />
              <span>{customer.email}</span>
            </div>
          )}

          {/* Phone */}
          {customer?.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-500" />
              <span>{customer.phone}</span>
            </div>
          )}

          {/* Primary Address */}
          {primaryAddress && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>Primary Address</span>
                {primaryAddress.type !== 'shipping' && (
                  <Badge variant="outline" className="text-xs">
                    {primaryAddress.type}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-gray-600 ml-6">
                <div>{primaryAddress.street}</div>
                <div>
                  {primaryAddress.city}, {primaryAddress.state} {primaryAddress.zipCode}
                </div>
                {primaryAddress.country !== 'United States' && (
                  <div>{primaryAddress.country}</div>
                )}
              </div>
            </div>
          )}

          {/* Customer Type */}
          {customer?.customerType && customer.customerType !== 'standard' && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Type:</span>
                <Badge variant="secondary" className="text-xs">
                  {customer.customerType}
                </Badge>
              </div>
            </div>
          )}

          {/* Notes */}
          {customer?.notes && (
            <div className="border-t pt-3">
              <div className="text-sm">
                <span className="font-medium">Notes:</span>
                <p className="text-gray-600 mt-1">{customer.notes}</p>
              </div>
            </div>
          )}

          {/* Communication Actions */}
          {customer && (customer.email || customer.phone) && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Contact:</span>
                <div className="flex gap-1">
                  {customer.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 hover:bg-blue-50 dark:hover:bg-blue-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        // This will need to be passed down as a prop from the parent component
                        if (window.handleCommunicationOpen) {
                          window.handleCommunicationOpen(customer, 'email');
                        }
                      }}
                      title="Send Email"
                    >
                      <Mail className="h-3 w-3 text-blue-600 mr-1" />
                      Email
                    </Button>
                  )}
                  {customer.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 hover:bg-green-50 dark:hover:bg-green-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        // This will need to be passed down as a prop from the parent component
                        if (window.handleCommunicationOpen) {
                          window.handleCommunicationOpen(customer, 'sms');
                        }
                      }}
                      title="Send SMS"
                    >
                      <MessageSquare className="h-3 w-3 text-green-600 mr-1" />
                      SMS
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isOpen && !customer && (
            <div className="text-center py-4 text-sm text-gray-500">
              Loading customer details...
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}