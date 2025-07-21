import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Package } from 'lucide-react';

export default function OrderEntrySimple() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Extract orderId from URL params (e.g., /order-entry?orderId=AG123)
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');

  // Form state
  const [form, setForm] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    customerName: '',
    modelName: '',
    total: '',
  });

  const [status, setStatus] = useState('DRAFT');
  const [loading, setLoading] = useState(!!orderId);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Fetch existing draft when editing
  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      setLoading(true);
      try {
        console.log('Fetching order:', orderId);
        const response = await apiRequest(`/api/orders/drafts/${orderId}`);
        console.log('RAW order response:', response);
        
        // Adapt the response based on our API structure
        const order = response;
        
        setForm({
          orderDate: order.orderDate?.split('T')[0] || new Date().toISOString().split('T')[0],
          customerName: order.customerName || '',
          modelName: order.modelName || order.stockModel?.displayName || '',
          total: order.total?.toString() || '',
        });
        setStatus(order.status || 'DRAFT');
        
        console.log('Form populated:', form);
      } catch (err) {
        console.error('fetchOrder error:', err);
        toast({
          title: "Error",
          description: "Failed to load order",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  // Generic form field handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    console.log('Form updated:', name, value);
  };

  // Save Draft (POST or PUT)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      console.log('Saving form data:', form);
      
      if (orderId) {
        // Update existing draft
        await apiRequest(`/api/orders/drafts/${orderId}`, {
          method: 'PUT',
          body: form
        });
        toast({
          title: "Success",
          description: "Draft updated"
        });
      } else {
        // Create new draft
        const response = await apiRequest('/api/orders/draft', {
          method: 'POST',
          body: form
        });
        toast({
          title: "Success", 
          description: "Draft created"
        });
        
        // Navigate to edit mode with new order ID
        if (response.orderId) {
          setLocation(`/order-entry-simple?orderId=${response.orderId}`);
        }
      }
    } catch (err: any) {
      console.error('Save error:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to save draft",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Send for Confirmation
  const handleConfirm = async () => {
    if (!orderId) return;
    setConfirming(true);
    try {
      await apiRequest(`/api/orders/${orderId}/confirm`, {
        method: 'POST'
      });
      toast({
        title: "Success",
        description: "Sent for confirmation"
      });
      setStatus('CONFIRMED');
    } catch (err: any) {
      console.error('Confirm error:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to send confirmation",
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  // Finalize
  const handleFinalize = async () => {
    if (!orderId) return;
    setFinalizing(true);
    try {
      await apiRequest(`/api/orders/${orderId}/finalize`, {
        method: 'POST'
      });
      toast({
        title: "Success",
        description: "Order finalized"
      });
      setLocation('/orders-list'); // Navigate back to orders list
    } catch (err: any) {
      console.error('Finalize error:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to finalize",
        variant: "destructive",
      });
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-12 w-12 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="ml-3 text-lg">Loading order...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {orderId ? `Edit Order #${orderId}` : 'New Order'}
          </CardTitle>
          {status !== 'DRAFT' && (
            <div className="text-sm text-muted-foreground">
              Status: <span className="font-medium">{status}</span>
            </div>
          )}
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="orderDate">Date</Label>
              <Input
                type="date"
                id="orderDate"
                name="orderDate"
                value={form.orderDate}
                onChange={handleChange}
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="customerName">Customer</Label>
              <Input
                type="text"
                id="customerName"
                name="customerName"
                value={form.customerName}
                onChange={handleChange}
                placeholder="Acme Corp"
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="modelName">Model</Label>
              <Input
                type="text"
                id="modelName"
                name="modelName"
                value={form.modelName}
                onChange={handleChange}
                placeholder="Model X"
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="total">Total ($)</Label>
              <Input
                type="number"
                id="total"
                name="total"
                value={form.total}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className="w-full"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={saving || confirming || finalizing}
                className="flex-1"
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </Button>

              {orderId && (
                <>
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={saving || confirming || finalizing || status !== 'DRAFT'}
                    variant={status === 'DRAFT' ? 'default' : 'secondary'}
                    className="flex-1"
                  >
                    {confirming ? 'Sending…' : 'Send for Confirmation'}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleFinalize}
                    disabled={saving || confirming || finalizing || status !== 'CONFIRMED'}
                    variant={status === 'CONFIRMED' ? 'default' : 'secondary'}
                    className="flex-1"
                  >
                    {finalizing ? 'Finalizing…' : 'Finalize'}
                  </Button>
                </>
              )}
            </div>
          </form>

          {/* Debug info (remove in production) */}
          <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs">
            <div><strong>Debug Info:</strong></div>
            <div>orderId: {orderId || 'none'}</div>
            <div>status: {status}</div>
            <div>form: {JSON.stringify(form, null, 2)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}