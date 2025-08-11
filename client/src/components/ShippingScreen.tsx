
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, FileText, Check, Clock } from "lucide-react";

type OrderRow = {
  id: number;
  orderId: string;
  customer_name: string;
  ship_city: string;
  ship_state: string;
  status: string;
  weight_lbs?: number;
  trackingNumber?: string;
  shippingCarrier?: string;
  shippedDate?: string;
  estimatedDelivery?: string;
  customerNotified?: boolean;
  deliveryConfirmed?: boolean;
  isFinalized?: boolean;
};

interface ShippingScreenProps {
  rows: OrderRow[];
}

export function ShippingScreen({ rows }: ShippingScreenProps) {
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [serviceCode, setServiceCode] = React.useState<string>("03"); // Ground
  const [markShippedDialog, setMarkShippedDialog] = React.useState<string | null>(null);
  
  // Form state for marking shipped
  const [trackingNumber, setTrackingNumber] = React.useState("");
  const [shippingCarrier, setShippingCarrier] = React.useState("UPS");
  const [estimatedDelivery, setEstimatedDelivery] = React.useState("");
  const [sendNotification, setSendNotification] = React.useState(true);

  // Get shipping statistics
  const { data: shippingStats } = useQuery({
    queryKey: ['/api/shipping/stats'],
  });

  // Create UPS labels mutation
  const createLabelsMut = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await fetch('/api/shipping-pdf/ups-shipping-label/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds,
          serviceCode,
          packageDetails: {
            weight: "10", // Default weight
            length: "12",
            width: "12", 
            height: "12"
          }
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Shipping-Labels-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return { success: true };
    },
    onSuccess: () => {
      toast({ 
        title: "Labels created", 
        description: `Generated ${selected.length} shipping label(s).` 
      });
      setSelected([]);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating labels", 
        description: String(error?.message ?? error), 
        variant: "destructive" 
      });
    },
  });

  // Mark as shipped mutation
  const markShippedMut = useMutation({
    mutationFn: async (data: { orderId: string; trackingNumber: string; shippingCarrier: string; estimatedDelivery?: string; sendNotification: boolean }) => {
      const response = await fetch(`/api/shipping/mark-shipped/${data.orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Order marked as shipped", 
        description: `Order ${data.order.orderId} has been marked as shipped.` 
      });
      setMarkShippedDialog(null);
      setTrackingNumber("");
      setEstimatedDelivery("");
      // Refresh the data
      window.location.reload();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error marking as shipped", 
        description: String(error?.message ?? error), 
        variant: "destructive" 
      });
    },
  });

  const handleMarkShipped = () => {
    if (!trackingNumber.trim()) {
      toast({
        title: "Validation Error",
        description: "Tracking number is required",
        variant: "destructive"
      });
      return;
    }

    markShippedMut.mutate({
      orderId: markShippedDialog!,
      trackingNumber: trackingNumber.trim(),
      shippingCarrier,
      estimatedDelivery: estimatedDelivery || undefined,
      sendNotification
    });
  };

  const toggle = (orderId: string) =>
    setSelected((prev) => (prev.includes(orderId) ? prev.filter((x) => x !== orderId) : [...prev, orderId]));

  const getStatusBadge = (order: OrderRow) => {
    if (order.deliveryConfirmed) return <Badge variant="default" className="bg-green-500">Delivered</Badge>;
    if (order.shippedDate) return <Badge variant="secondary">Shipped</Badge>;
    if (order.trackingNumber) return <Badge variant="outline">Label Created</Badge>;
    return <Badge variant="destructive">Ready to Ship</Badge>;
  };

  // Filter orders that are ready for shipping or already shipped
  const shippingRows = rows.filter(row => 
    row.status === 'Ready for Shipping' || 
    row.trackingNumber ||
    row.shippedDate
  );

  return (
    <div className="p-4 space-y-6">
      {/* Statistics Cards */}
      {shippingStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ready to Ship</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shippingStats.readyForShipping}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shipped</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shippingStats.shipped}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shippingStats.pending}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shippingStats.delivered}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={serviceCode} onValueChange={setServiceCode}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="03">UPS Ground</SelectItem>
            <SelectItem value="02">UPS 2nd Day Air</SelectItem>
            <SelectItem value="01">UPS Next Day Air</SelectItem>
          </SelectContent>
        </Select>
        
        <Button
          disabled={selected.length === 0 || createLabelsMut.isPending}
          onClick={() => createLabelsMut.mutate(selected)}
        >
          <FileText className="mr-2 h-4 w-4" />
          {createLabelsMut.isPending ? "Creating..." : `Create Labels (${selected.length})`}
        </Button>
      </div>

      {/* Orders Table */}
      <div className="border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3">
                <Checkbox 
                  checked={selected.length === shippingRows.length && shippingRows.length > 0}
                  onCheckedChange={(checked) => {
                    setSelected(checked ? shippingRows.map(r => r.orderId) : []);
                  }}
                />
              </th>
              <th className="text-left p-3">Order #</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Ship To</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Tracking</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shippingRows.map((row) => (
              <tr key={row.orderId} className="border-t hover:bg-muted/50">
                <td className="p-3">
                  <Checkbox 
                    checked={selected.includes(row.orderId)} 
                    onCheckedChange={() => toggle(row.orderId)} 
                  />
                </td>
                <td className="p-3 font-medium">{row.orderId}</td>
                <td className="p-3">{row.customer_name}</td>
                <td className="p-3">{row.ship_city}, {row.ship_state}</td>
                <td className="p-3">{getStatusBadge(row)}</td>
                <td className="p-3">
                  {row.trackingNumber ? (
                    <div className="space-y-1">
                      <div className="font-mono text-xs">{row.trackingNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.shippingCarrier} • {row.estimatedDelivery ? new Date(row.estimatedDelivery).toLocaleDateString() : 'No ETA'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No tracking</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {!row.shippedDate && (
                      <Dialog open={markShippedDialog === row.orderId} onOpenChange={(open) => {
                        setMarkShippedDialog(open ? row.orderId : null);
                        if (!open) {
                          setTrackingNumber("");
                          setEstimatedDelivery("");
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Truck className="mr-1 h-3 w-3" />
                            Mark Shipped
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Mark Order {row.orderId} as Shipped</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="trackingNumber">Tracking Number *</Label>
                              <Input
                                id="trackingNumber"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                                placeholder="Enter tracking number"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="shippingCarrier">Shipping Carrier</Label>
                              <Select value={shippingCarrier} onValueChange={setShippingCarrier}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="UPS">UPS</SelectItem>
                                  <SelectItem value="FedEx">FedEx</SelectItem>
                                  <SelectItem value="USPS">USPS</SelectItem>
                                  <SelectItem value="DHL">DHL</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div>
                              <Label htmlFor="estimatedDelivery">Estimated Delivery (Optional)</Label>
                              <Input
                                id="estimatedDelivery"
                                type="date"
                                value={estimatedDelivery}
                                onChange={(e) => setEstimatedDelivery(e.target.value)}
                              />
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                id="sendNotification"
                                checked={sendNotification}
                                onCheckedChange={setSendNotification}
                              />
                              <Label htmlFor="sendNotification">Send customer notification</Label>
                            </div>
                            
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="outline" 
                                onClick={() => setMarkShippedDialog(null)}
                              >
                                Cancel
                              </Button>
                              <Button 
                                onClick={handleMarkShipped}
                                disabled={markShippedMut.isPending}
                              >
                                {markShippedMut.isPending ? "Marking..." : "Mark as Shipped"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {shippingRows.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No orders ready for shipping
          </div>
        )}
      </div>
    </div>
  );
}
