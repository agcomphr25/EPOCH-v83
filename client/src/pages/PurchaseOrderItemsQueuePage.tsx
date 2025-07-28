
import PurchaseOrderItemsQueue from '@/components/PurchaseOrderItemsQueue';

export default function PurchaseOrderItemsQueuePage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Purchase Order Items Queue</h1>
        <p className="text-muted-foreground">
          View all purchase order items currently queued in the system
        </p>
      </div>
      <PurchaseOrderItemsQueue />
    </div>
  );
}
