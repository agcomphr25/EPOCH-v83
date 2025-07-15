import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Package, Users, ChevronDown, Send, CheckCircle } from 'lucide-react';
import debounce from 'lodash.debounce';
import { useLocation, useRoute } from 'wouter';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import type { Customer } from '@shared/schema';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface FeatureDefinition {
  id: string;
  name: string;
  type: 'dropdown' | 'search' | 'text';
  options?: { value: string; label: string }[];
}

export default function OrderEntry() {
  const { toast } = useToast();
  const [location] = useLocation();

  // Extract draft ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const draftId = urlParams.get('draft');

  // Draft management state
  const [orderStatus, setOrderStatus] = useState('DRAFT');
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Form state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [modelOptions, setModelOptions] = useState<StockModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [features, setFeatures] = useState<Record<string, any>>({});

  const [orderDate, setOrderDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCustomerPO, setHasCustomerPO] = useState(false);
  const [customerPO, setCustomerPO] = useState('');
  const [fbOrderNumber, setFbOrderNumber] = useState('');
  const [hasAgrOrder, setHasAgrOrder] = useState(false);
  const [agrOrderDetails, setAgrOrderDetails] = useState('');

  // Simple render to test basic functionality
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Order Entry - Clean Version</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                id="orderId"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="Enter order ID"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasCustomerPO"
                checked={hasCustomerPO}
                onChange={(e) => setHasCustomerPO(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="hasCustomerPO">Has Customer PO</Label>
            </div>

            {hasCustomerPO && (
              <div>
                <Label htmlFor="customerPO">Customer PO</Label>
                <Input
                  id="customerPO"
                  value={customerPO}
                  onChange={(e) => setCustomerPO(e.target.value)}
                  placeholder="Enter customer PO"
                />
              </div>
            )}
            
            <Button className="w-full">
              Create Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}