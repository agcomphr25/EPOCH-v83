
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createUpsLabels, getShippingStatus } from "@/utils/shippingApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

type OrderRow = {
  id: number;
  orderId: string;
  customer: string;
  product?: string;
  currentDepartment: string;
  status: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  shippedDate?: string;
  estimatedDelivery?: string;
  customerNotified?: boolean;
  weight_lbs?: number;
};

export function ShippingScreen(props: { rows: OrderRow[] }) {
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<number[]>([]);
  const [serviceCode, setServiceCode] = React.useState<string>("03"); // Ground

  const batchMut = useMutation({
    mutationFn: () => createUpsLabels({ orderIds: selected, serviceCode }),
    onSuccess: (data) => {
      toast({ 
        title: "Labels created", 
        description: `Generated ${data.labels.length} label(s). ${data.errors?.length ? `${data.errors.length} errors occurred.` : ''}` 
      });
      
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank");
      // Optionally open each label:
      data.labels.forEach(l => window.open(l.labelUrl, "_blank"));
      
      if (data.errors?.length) {
        console.warn('Batch shipping errors:', data.errors);
      }
      
      setSelected([]);
    },
    onError: (e: any) => {
      toast({ 
        title: "UPS Error", 
        description: String(e?.message ?? e), 
        variant: "destructive" 
      });
    },
  });

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () => {
    const unshippedIds = props.rows.filter(r => !r.trackingNumber).map(r => r.id);
    setSelected(prev => prev.length === unshippedIds.length ? [] : unshippedIds);
  };

  const unshippedRows = props.rows.filter(r => !r.trackingNumber);
  const shippedRows = props.rows.filter(r => r.trackingNumber);

  return (
    <div className="p-4 space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="border rounded px-3 py-2"
          value={serviceCode}
          onChange={(e) => setServiceCode(e.target.value)}
        >
          <option value="03">UPS Ground</option>
          <option value="02">UPS 2nd Day Air</option>
          <option value="01">UPS Next Day Air</option>
        </select>
        
        <Button
          variant="outline"
          onClick={toggleAll}
          disabled={unshippedRows.length === 0}
        >
          {selected.length === unshippedRows.length ? 'Deselect All' : 'Select All'}
        </Button>

        <Button
          disabled={selected.length === 0 || batchMut.isPending}
          onClick={() => batchMut.mutate()}
        >
          {batchMut.isPending ? "Processing…" : `Create UPS Labels + Packing Slip (${selected.length})`}
        </Button>
      </div>

      {/* Ready to Ship Section */}
      {unshippedRows.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Ready to Ship ({unshippedRows.length})</h2>
          <div className="border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Select</th>
                  <th className="text-left p-3">Order #</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Department</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {unshippedRows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/50">
                    <td className="p-3">
                      <Checkbox 
                        checked={selected.includes(r.id)} 
                        onCheckedChange={() => toggle(r.id)} 
                      />
                    </td>
                    <td className="p-3 font-medium">{r.orderId}</td>
                    <td className="p-3">{r.customer}</td>
                    <td className="p-3">{r.product || 'N/A'}</td>
                    <td className="p-3">
                      <Badge variant="secondary">{r.currentDepartment}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Already Shipped Section */}
      {shippedRows.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Already Shipped ({shippedRows.length})</h2>
          <div className="border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Order #</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Tracking #</th>
                  <th className="text-left p-3">Carrier</th>
                  <th className="text-left p-3">Shipped</th>
                  <th className="text-left p-3">Notified</th>
                </tr>
              </thead>
              <tbody>
                {shippedRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 font-medium">{r.orderId}</td>
                    <td className="p-3">{r.customer}</td>
                    <td className="p-3">
                      {r.trackingNumber ? (
                        <a 
                          href={`https://www.ups.com/track?tracknum=${r.trackingNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {r.trackingNumber}
                        </a>
                      ) : 'N/A'}
                    </td>
                    <td className="p-3">{r.shippingCarrier || 'N/A'}</td>
                    <td className="p-3">
                      {r.shippedDate ? new Date(r.shippedDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-3">
                      <Badge variant={r.customerNotified ? "default" : "destructive"}>
                        {r.customerNotified ? "Yes" : "No"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {props.rows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No orders ready for shipping</p>
        </div>
      )}
    </div>
  );
}
