import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createRecord, updateRecord, fetchOne } from '../utils/nonconformanceUtils';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '../lib/queryClient';

const issueOptions = [
  'Customer Request for Additional Work',
  'Wrong Inlet/CNC Error',
  'Does Not Meet Customer QC Requirements',
  'Material Defect',
  'Process Error',
  'Design Issue',
  'Other'
];

const dispositionOptions = ['Scrap', 'Repair', 'Use As Is', 'Use for Reference', 'Return to Vendor'];
const authorizationOptions = ['Customer', 'Glenn', 'AG', 'Matt', 'Laurie', 'Quality Manager'];

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
  recordToEdit 
}: NonconformanceFormModalProps) {
  const isEdit = Boolean(recordToEdit);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [orderResults, setOrderResults] = useState([]);

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
  });

  // Load record for edit
  useEffect(() => {
    if (isEdit && recordToEdit) {
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
        dispositionDate: recordToEdit.dispositionDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        notes: recordToEdit.notes || '',
        status: recordToEdit.status || 'Open',
      });
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
          const filtered = (data || []).filter((order: any) => 
            (order.orderId && order.orderId.toLowerCase().includes(orderQuery.toLowerCase())) ||
            (order.serialNumber && order.serialNumber.toLowerCase().includes(orderQuery.toLowerCase())) ||
            (order.customer && order.customer.toLowerCase().includes(orderQuery.toLowerCase())) ||
            (order.customerName && order.customerName.toLowerCase().includes(orderQuery.toLowerCase()))
          ).slice(0, 20); // Limit results for performance
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

  const handleOrderSelect = (selectedOrder: any) => {
    console.log('Selected order data:', selectedOrder); // Debug log to see available fields
    setForm({
      ...form,
      orderId: selectedOrder.orderId || selectedOrder.id || '',
      serialNumber: selectedOrder.serialNumber || '',
      customerName: selectedOrder.customerName || selectedOrder.customer || '',
      poNumber: selectedOrder.poNumber || selectedOrder.po || selectedOrder.customerPO || '',
      stockModel: selectedOrder.modelId || selectedOrder.stockModel || selectedOrder.model || selectedOrder.product || '',
    });
    setOrderQuery('');
    setOrderResults([]);
  };

  const handleSave = async () => {
    if (!form.orderId && !form.serialNumber) {
      toast({
        title: "Validation Error",
        description: "Please provide either an Order ID or Serial Number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateRecord(recordToEdit.id, form);
        toast({
          title: "Success",
          description: "Nonconformance record updated successfully",
        });
      } else {
        await createRecord(form);
        toast({
          title: "Success", 
          description: "Nonconformance record created successfully",
        });
      }
      
      onSaved();
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: "Failed to save record. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
                const selectedOrder = orderResults.find(order => order.orderId === selectedOrderId);
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
                  {form.orderId ? `${form.orderId} - ${form.customerName}` : "Search and select an order..."}
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
                    <SelectItem key={order.id} value={order.orderId || order.id}>
                      <div className="flex flex-col">
                        <div className="font-medium">{order.orderId}</div>
                        <div className="text-sm text-gray-600">
                          {order.serialNumber && `${order.serialNumber} • `}{order.customerName}
                        </div>
                      </div>
                    </SelectItem>
                  ))
                ) : orderQuery.length >= 2 ? (
                  <div className="p-2 text-sm text-gray-500">No orders found</div>
                ) : (
                  <div className="p-2 text-sm text-gray-500">Type to search orders...</div>
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
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="Enter Serial Number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
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
                onChange={(e) => setForm({ ...form, stockModel: e.target.value })}
                placeholder="Stock Model"
              />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          {/* Issue Details */}
          <div className="space-y-2">
            <Label>Issue/Cause</Label>
            <Select value={form.issueCause} onValueChange={(value) => setForm({ ...form, issueCause: value })}>
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
              onValueChange={(value) => setForm({ ...form, manufacturerDefect: value === 'yes' })}
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
              <Select value={form.disposition} onValueChange={(value) => setForm({ ...form, disposition: value })}>
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
              <Select value={form.authorization} onValueChange={(value) => setForm({ ...form, authorization: value })}>
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

          <div className="space-y-2">
            <Label>Disposition Date</Label>
            <Input
              type="date"
              value={form.dispositionDate}
              onChange={(e) => setForm({ ...form, dispositionDate: e.target.value })}
            />
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
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
          <Button variant="outline" onClick={onClose} disabled={loading}>
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