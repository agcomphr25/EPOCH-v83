import { useState } from "react";
import { P2CustomerManager } from "@/components/P2CustomerManager";
import { P2POManager } from "@/components/P2POManager";
import { P2POItemsManager } from "@/components/P2POItemsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FileText, Package } from "lucide-react";

type ViewMode = 'customers' | 'orders' | 'items';

interface ItemsView {
  poId: number;
  poNumber: string;
}

export default function P2PurchaseOrders() {
  const [activeTab, setActiveTab] = useState<ViewMode>('customers');
  const [itemsView, setItemsView] = useState<ItemsView | null>(null);

  const handleManageItems = (poId: number, poNumber: string) => {
    setItemsView({ poId, poNumber });
    setActiveTab('items');
  };

  const handleBackToOrders = () => {
    setItemsView(null);
    setActiveTab('orders');
  };

  const handleBackToCustomers = () => {
    setItemsView(null);
    setActiveTab('customers');
  };

  if (activeTab === 'items' && itemsView) {
    return (
      <div className="container mx-auto p-6">
        <P2POItemsManager 
          poId={itemsView.poId} 
          poNumber={itemsView.poNumber}
          onBack={handleBackToOrders}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">P2 Purchase Orders</h1>
        <p className="text-muted-foreground">
          Manage P2 customers, purchase orders, and line items with Part #, Quantity, and Price tracking
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ViewMode)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            P2 Customers
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Purchase Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-6">
          <P2CustomerManager />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <P2POManager onManageItems={handleManageItems} />
        </TabsContent>
      </Tabs>
    </div>
  );
}