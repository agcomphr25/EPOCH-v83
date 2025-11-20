import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  createRecord,
  updateRecord,
  fetchOne,
} from '../utils/nonconformanceUtils';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '../lib/queryClient';

const issueOptions = [
  'Customer Requested Additional Work',
  'Order Error',
  'Incorrect LOP',
  'Check Riser Hardware Issue',
  'Wrong Inlet/CNC Error',
  'Paint Issue',
  'Cosmetic Damage/Poor Finish',
  'Shipping Damage',
  'Cracked/Broken Stock',
  'QD/Swivel Stud/Rail Issue',
  'Does Not Meet Customer Requirements',
  'Other',
];

const dispositionOptions = [
  'Scrap',
  'Repair',
  'Use As Is',
  'Use for Reference',
  'Return to Vendor',
];
const authorizationOptions = [
  'Customer',
  'Glenn',
  'AG',
  'Matt',
  'Laurie',
  'Quality Manager',
];

const repairDepartmentOptions = [
  'Layup',
  'CNC',
  'Paint',
  'Finish QC',
  'Assembly',
  'Hardware',
];

interface OrderLookup {
  id: number;
  orderId: string;
  serialNumber?: string | null;
  customerName?: string | null;
  poNumber?: string | null;
  customerPO?: string | null;
  modelId?: string | null;
}

interface NonconformanceFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  recordToEdit?: any;
}

export default function NonconformanceFormModal({
  open,
  onClose,
  onSaved,
  recordToEdit,
}: NonconformanceFormModalProps) {
  const isEdit = Boolean(recordToEdit);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [orderResults, setOrderResults] = useState<OrderLookup[]>([]);
  const lastSelectedOrderIdRef = useRef<string | null>(null);

  const [form, setForm] = useState({
    orderId: '',
    serialNumber: '',
    customerName: '',
    poNumber: '',
    stockModel: '',
    quantity: 1,
    issueCause: issueOptions[0],
    manufacturerDefect: false,
    disposition: dispositionOptions[0],
    authorization: authorizationOptions[0],
    dispositionDate: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'Open',
    repairDepartment: '',
    repairNotes: '',
    addedToRts: false,
    useOrderAddress: false,
    repairAddress: {
      street: '',
      street2: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
    },
  });

  const [orderAddress, setOrderAddress] = useState<any>(null);

  // Wrapper for onClose that resets the ref
  const handleClose = () => {
    lastSelectedOrderIdRef.current = null;
    onClose();
  };

  // Fetch address for a given order ID
  const fetchOrderAddress = async (orderId: string): Promise<boolean> => {
    try {
      const orderDetailsResponse = await apiRequest(`/api/all-orders/${orderId}`);
      if (orderDetailsResponse) {
        let foundAddress = null;
        
        // Check if order has alt ship to address
        if (orderDetailsResponse.hasAltShipTo && orderDetailsResponse.altShipToAddress) {
          foundAddress = orderDetailsResponse.altShipToAddress;
        } else if (orderDetailsResponse.shippingAddress) {
          // Use order's shipping address if available
          foundAddress = orderDetailsResponse.shippingAddress;
        } else if (orderDetailsResponse.customerAddress) {
          // Try customer address from order if available
          foundAddress = orderDetailsResponse.customerAddress;
        }

        if (foundAddress) {
          setOrderAddress(foundAddress);
          return true;
        } else {
          // No address found, notify user and keep manual mode with preserved address
          setOrderAddress(null);
          // Don't clear repairAddress - preserve manual data
          toast({
            title: 'No Address Found',
            description: 'No shipping address found for this order. Please enter a manual repair address.',
            variant: 'default',
          });
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('Error fetching order address:', error);
      setOrderAddress(null);
      // Don't clear repairAddress - preserve manual data
      toast({
        title: 'Error Fetching Address',
        description: 'Could not retrieve address for this order. Please enter a manual repair address.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Load record for edit
  useEffect(() => {
    if (isEdit && recordToEdit) {
      // Set the ref to the current orderId to prevent hydration from overwriting
      lastSelectedOrderIdRef.current = recordToEdit.orderId || null;
      
      setForm({
        orderId: recordToEdit.orderId || '',
        serialNumber: recordToEdit.serialNumber || '',
        customerName: recordToEdit.customerName || '',
        poNumber: recordToEdit.poNumber || '',
        stockModel: recordToEdit.stockModel || '',
        quantity: recordToEdit.quantity || 1,
        issueCause: recordToEdit.issueCause || issueOptions[0],
        manufacturerDefect: recordToEdit.manufacturerDefect || false,
        disposition: recordToEdit.disposition || dispositionOptions[0],
        authorization: recordToEdit.authorization || authorizationOptions[0],
        dispositionDate:
          recordToEdit.dispositionDate?.split('T')[0] ||
          new Date().toISOString().split('T')[0],
        notes: recordToEdit.notes || '',
        status: recordToEdit.status || 'Open',
        repairDepartment: recordToEdit.repairDepartment || '',
        repairNotes: recordToEdit.repairNotes || '',
        addedToRts: recordToEdit.addedToRts || false,
        useOrderAddress: recordToEdit.useOrderAddress || false,
        repairAddress: recordToEdit.repairAddress || {
          street: '',
          street2: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
        },
      });

      // If editing and record has useOrderAddress set, fetch the order address
      if (recordToEdit.useOrderAddress && recordToEdit.orderId) {
        fetchOrderAddress(recordToEdit.orderId);
      } else if (recordToEdit.repairAddress) {
        // If has manual address but not using order address, sync it to orderAddress for display consistency
        // This allows the UI to show the manual address even though useOrderAddress is false
        setOrderAddress(recordToEdit.repairAddress);
      } else {
        // No address at all
        setOrderAddress(null);
      }
    }
  }, [recordToEdit, isEdit]);

  // Search orders from all orders list
  useEffect(() => {
    const searchOrders = async () => {
      try {
        if (orderQuery.length === 0) {
          // Fetch all orders initially
          const data = await apiRequest('/api/orders');
          setOrderResults((data || []).slice(0, 50)); // Limit to first 50 for performance
        } else if (orderQuery.length >= 2) {
          // Search with filter
          const data = await apiRequest('/api/orders');
          const filtered = (data || [])
            .filter(
              (order: any) =>
                (order.orderId &&
                  order.orderId
                    .toLowerCase()
                    .includes(orderQuery.toLowerCase())) ||
                (order.serialNumber &&
                  order.serialNumber
                    .toLowerCase()
                    .includes(orderQuery.toLowerCase())) ||
                (order.customer &&
                  order.customer
                    .toLowerCase()
                    .includes(orderQuery.toLowerCase())) ||
                (order.customerName &&
                  order.customerName
                    .toLowerCase()
                    .includes(orderQuery.toLowerCase()))
            )
            .slice(0, 20); // Limit results for performance
          setOrderResults(filtered);
        } else {
          setOrderResults([]);
        }
      } catch (error) {
        console.error('Error searching orders:', error);
        setOrderResults([]);
      }
    };

    const timeoutId = setTimeout(searchOrders, 300);
    return () => clearTimeout(timeoutId);
  }, [orderQuery]);

  const handleOrderSelect = async (selectedOrder: any) => {
    console.log('Selected order data:', selectedOrder); // Debug log to see available fields
    const orderId = selectedOrder.orderId || selectedOrder.id || '';
    
    // Guard against duplicate handler firing using ref (prevents Select hydration from overwriting state)
    if (orderId && orderId === lastSelectedOrderIdRef.current) {
      console.log('Skipping duplicate order selection for', orderId);
      return;
    }
    
    // Use functional setForm to guard against stale closures
    setForm((prev) => {
      // Guard against re-running when orderId already matches
      if (orderId === prev.orderId) {
        return prev;
      }
      
      // Update order info but preserve manual address and keep useOrderAddress false initially
      return {
        ...prev,
        orderId,
        serialNumber: selectedOrder.serialNumber || '',
        customerName: selectedOrder.customerName || selectedOrder.customer || '',
        poNumber:
          selectedOrder.poNumber ||
          selectedOrder.po ||
          selectedOrder.customerPO ||
          '',
        stockModel:
          selectedOrder.modelId ||
          selectedOrder.stockModel ||
          selectedOrder.model ||
          selectedOrder.product ||
          '',
        useOrderAddress: false, // Keep false until fetch succeeds
      };
    });
    
    // Track this order ID in the ref to prevent duplicate handler firing
    lastSelectedOrderIdRef.current = orderId;
    
    setOrderQuery('');
    setOrderResults([]);

    // Fetch the address for this order and only toggle useOrderAddress if successful
    if (orderId) {
      const addressFound = await fetchOrderAddress(orderId);
      if (addressFound) {
        // Only enable useOrderAddress if fetch was successful
        setForm((prev) => ({ ...prev, useOrderAddress: true }));
      }
      // If fetch failed or no address found, fetchOrderAddress already showed toast
      // and useOrderAddress remains false, preserving manual address mode
    }
  };

  const handleSave = async () => {
    if (!form.orderId && !form.serialNumber) {
      toast({
        title: 'Validation Error',
        description: 'Please provide either an Order ID or Serial Number',
        variant: 'destructive',
      });
      return;
    }

    // Validate repair department when disposition is "Repair"
    if (form.disposition === 'Repair' && !form.repairDepartment) {
      toast({
        title: 'Validation Error',
        description: 'Repair Department is required when disposition is "Repair"',
        variant: 'destructive',
      });
      return;
    }

    // Validate address when disposition is "Repair"
    if (form.disposition === 'Repair') {
      if (!form.useOrderAddress) {
        // Manual address is required
        if (!form.repairAddress.street || !form.repairAddress.city || 
            !form.repairAddress.state || !form.repairAddress.zipCode) {
          toast({
            title: 'Validation Error',
            description: 'Please provide a complete repair address (street, city, state, and ZIP code)',
            variant: 'destructive',
          });
          return;
        }
      } else if (!orderAddress) {
        // Using order address but no address found
        toast({
          title: 'Validation Error',
          description: 'No address found for the selected order. Please provide a manual address.',
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);
    try {
      // Prepare the form data for submission
      const dataToSave = {
        ...form,
        // If using order address, store it in repairAddress for backend consistency
        repairAddress: form.useOrderAddress && orderAddress ? orderAddress : form.repairAddress,
      };

      if (isEdit) {
        await updateRecord(recordToEdit.id, dataToSave);
        toast({
          title: 'Success',
          description: 'Nonconformance record updated successfully',
        });
      } else {
        await createRecord(dataToSave);
        toast({
          title: 'Success',
          description: 'Nonconformance record created successfully',
        });
      }

      onSaved();
      handleClose();
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: 'Error',
        description: 'Failed to save record. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit' : 'New'} Nonconformance Record
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Search Dropdown */}
          <div className="space-y-2">
            <Label>Search Order</Label>
            <Select
              value={form.orderId}
              onValueChange={(selectedOrderId) => {
                const selectedOrder = orderResults.find(
                  (order) => order.orderId === selectedOrderId
                );
                if (selectedOrder) {
                  handleOrderSelect(selectedOrder);
                }
              }}
              onOpenChange={(open) => {
                if (open && orderResults.length === 0) {
                  // Trigger initial search when dropdown opens
                  setOrderQuery('');
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Search and select an order...">
                  {form.orderId
                    ? `${form.orderId} - ${form.customerName}`
                    : 'Search and select an order...'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    placeholder="Type to search orders..."
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    className="mb-2"
                  />
                </div>
                {orderResults.length > 0 ? (
                  orderResults.map((order: any) => (
                    <SelectItem
                      key={order.id}
                      value={order.orderId || order.id}
                    >
                      <div className="flex flex-col">
                        <div className="font-medium">{order.orderId}</div>
                        <div className="text-sm text-gray-600">
                          {order.serialNumber && `${order.serialNumber} • `}
                          {order.customerName}
                        </div>
                      </div>
                    </SelectItem>
                  ))
                ) : orderQuery.length >= 2 ? (
                  <div className="p-2 text-sm text-gray-500">
                    No orders found
                  </div>
                ) : (
                  <div className="p-2 text-sm text-gray-500">
                    Type to search orders...
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Order Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Order ID</Label>
              <Input
                value={form.orderId}
                onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                placeholder="Enter Order ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Serial Number</Label>
              <Input
                value={form.serialNumber}
                onChange={(e) =>
                  setForm({ ...form, serialNumber: e.target.value })
                }
                placeholder="Enter Serial Number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
                placeholder="Customer Name"
              />
            </div>
            <div className="space-y-2">
              <Label>PO Number</Label>
              <Input
                value={form.poNumber}
                onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                placeholder="PO Number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stock Model</Label>
              <Input
                value={form.stockModel}
                onChange={(e) =>
                  setForm({ ...form, stockModel: e.target.value })
                }
                placeholder="Stock Model"
              />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: parseInt(e.target.value) || 1 })
                }
              />
            </div>
          </div>

          {/* Issue Details */}
          <div className="space-y-2">
            <Label>Issue/Cause</Label>
            <Select
              value={form.issueCause}
              onValueChange={(value) => setForm({ ...form, issueCause: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {issueOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Manufacturer Defect */}
          <div className="space-y-2">
            <Label>Manufacturer Defect?</Label>
            <RadioGroup
              value={form.manufacturerDefect ? 'yes' : 'no'}
              onValueChange={(value) =>
                setForm({ ...form, manufacturerDefect: value === 'yes' })
              }
              className="flex space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="defect-yes" />
                <Label htmlFor="defect-yes">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="defect-no" />
                <Label htmlFor="defect-no">No</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Disposition */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Disposition</Label>
              <Select
                value={form.disposition}
                onValueChange={(value) =>
                  setForm({ ...form, disposition: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dispositionOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Authorization</Label>
              <Select
                value={form.authorization}
                onValueChange={(value) =>
                  setForm({ ...form, authorization: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {authorizationOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditional Repair Fields */}
          {form.disposition === 'Repair' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-4 border-2 border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                Repair Details
              </h3>
              <div className="space-y-2">
                <Label>Repair Department *</Label>
                <Select
                  value={form.repairDepartment}
                  onValueChange={(value) =>
                    setForm({ ...form, repairDepartment: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {repairDepartmentOptions.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Repair Notes</Label>
                <Textarea
                  value={form.repairNotes}
                  onChange={(e) =>
                    setForm({ ...form, repairNotes: e.target.value })
                  }
                  placeholder="Describe what needs to be repaired..."
                  rows={3}
                />
              </div>

              {/* Address Selection */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  Repair Shipping Address
                </h4>
                {form.orderId && orderAddress && (
                  <div className="flex items-center space-x-2" data-testid="checkbox-use-order-address">
                    <Checkbox
                      id="useOrderAddress"
                      checked={form.useOrderAddress}
                      onCheckedChange={(checked) => {
                        setForm({ ...form, useOrderAddress: checked === true });
                        // Clear orderAddress when toggling off to avoid accidental reuse
                        if (!checked) {
                          setOrderAddress(null);
                        }
                      }}
                    />
                    <Label htmlFor="useOrderAddress" className="cursor-pointer">
                      Use address associated with order {form.orderId}
                    </Label>
                  </div>
                )}

                {form.useOrderAddress && orderAddress ? (
                  <div className="p-3 bg-white dark:bg-gray-800 rounded border">
                    <p className="text-sm font-medium mb-2">Order Address:</p>
                    <p className="text-sm">
                      {orderAddress.street}
                      {orderAddress.street2 && <>, {orderAddress.street2}</>}
                      <br />
                      {orderAddress.city}, {orderAddress.state} {orderAddress.zipCode}
                      <br />
                      {orderAddress.country}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {form.orderId && !orderAddress 
                        ? 'No address found for this order. Please enter a repair address below.'
                        : 'Enter the address where the item should be shipped for repair:'}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <Label>Street Address</Label>
                        <Input
                          value={form.repairAddress.street}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              repairAddress: {
                                ...form.repairAddress,
                                street: e.target.value,
                              },
                            })
                          }
                          placeholder="Street address"
                          data-testid="input-repair-street"
                        />
                      </div>
                      <div>
                        <Label>Street Address 2 (optional)</Label>
                        <Input
                          value={form.repairAddress.street2}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              repairAddress: {
                                ...form.repairAddress,
                                street2: e.target.value,
                              },
                            })
                          }
                          placeholder="Suite, unit, etc."
                          data-testid="input-repair-street2"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>City</Label>
                          <Input
                            value={form.repairAddress.city}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                repairAddress: {
                                  ...form.repairAddress,
                                  city: e.target.value,
                                },
                              })
                            }
                            placeholder="City"
                            data-testid="input-repair-city"
                          />
                        </div>
                        <div>
                          <Label>State</Label>
                          <Input
                            value={form.repairAddress.state}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                repairAddress: {
                                  ...form.repairAddress,
                                  state: e.target.value,
                                },
                              })
                            }
                            placeholder="State"
                            data-testid="input-repair-state"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>ZIP Code</Label>
                          <Input
                            value={form.repairAddress.zipCode}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                repairAddress: {
                                  ...form.repairAddress,
                                  zipCode: e.target.value,
                                },
                              })
                            }
                            placeholder="ZIP code"
                            data-testid="input-repair-zipcode"
                          />
                        </div>
                        <div>
                          <Label>Country</Label>
                          <Input
                            value={form.repairAddress.country}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                repairAddress: {
                                  ...form.repairAddress,
                                  country: e.target.value,
                                },
                              })
                            }
                            placeholder="Country"
                            data-testid="input-repair-country"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Conditional Use As Is Fields */}
          {form.disposition === 'Use As Is' && (
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg space-y-4 border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="addToRts"
                  checked={form.addedToRts}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, addedToRts: checked === true })
                  }
                />
                <Label htmlFor="addToRts" className="font-semibold text-green-900 dark:text-green-100">
                  Add to RTS Inventory
                </Label>
              </div>
              {form.addedToRts && (
                <p className="text-sm text-green-700 dark:text-green-300">
                  This item will be added to Ready-To-Ship inventory as AVAILABLE
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Disposition Date</Label>
            <Input
              type="date"
              value={form.dispositionDate}
              onChange={(e) =>
                setForm({ ...form, dispositionDate: e.target.value })
              }
            />
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes or comments..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
