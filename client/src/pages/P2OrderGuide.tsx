import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  ArrowRight,
  User,
  FileText,
  Package,
  ClipboardCheck,
  Layers,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import p2ControlCenterImg from '@assets/image_1773203311737.png';

export default function P2OrderGuide() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/help">
            <span className="hover:text-foreground cursor-pointer">Help Center</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>How to Create a P2 Order</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            How to Create a New P2 Order
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          A step-by-step guide to creating purchase orders in the P2 Control Center
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-200">Overview</p>
              <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                Creating a P2 order is a multi-step process: you'll create the Purchase Order, configure the Bill of Materials (BOM) for each part, and then schedule production. The system guides you through each phase automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">1</div>
          <span className="font-medium">Create PO</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">2</div>
          <span className="font-medium">Configure BOM</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">3</div>
          <span className="font-medium">Schedule</span>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              Getting Started
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Navigate to the <strong>P2 Control Center</strong> from the main menu under{' '}
              <strong>Purchase Orders</strong>. You'll see the dashboard with all current P2 orders and their statuses.
            </p>
            <div className="rounded-lg overflow-hidden border">
              <img
                src={p2ControlCenterImg}
                alt="P2 Control Center showing the New P2 Order button"
                className="w-full"
              />
            </div>
            <div className="text-base">
              Click the blue <Badge className="bg-blue-600 hover:bg-blue-600 text-white">New P2 Order</Badge> button in the top-right corner to start the creation wizard.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
              Step 1: Select a Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              Choose the customer this purchase order is for from the dropdown list. The list shows all registered P2 customers.
            </p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Select the customer from the dropdown menu</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Click <strong>Next</strong> to proceed to PO details</span>
              </li>
            </ul>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  If the customer you need isn't in the list, you'll need to add them through
                  the <strong>Customer Management</strong> section first before creating the order.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                <FileText className="h-4 w-4" />
              </div>
              Step 2: Enter PO Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Fill in the purchase order information. Fields marked with an asterisk are required.</p>

            <div className="space-y-3">
              <div className="p-3 border rounded-md">
                <p className="font-medium">Customer PO Number <span className="text-red-500">*</span></p>
                <p className="text-sm text-muted-foreground">The purchase order number provided by the customer. This is their reference number for the order.</p>
              </div>
              <div className="p-3 border rounded-md">
                <p className="font-medium">Due Date <span className="text-red-500">*</span></p>
                <p className="text-sm text-muted-foreground">When the completed order needs to be delivered to the customer.</p>
              </div>
              <div className="p-3 border rounded-md">
                <p className="font-medium">Tolerance Authorizer <span className="text-red-500">*</span></p>
                <p className="text-sm text-muted-foreground">The employee responsible for authorizing quality tolerances (required for AS9100 quality control compliance).</p>
              </div>

              <Separator />

              <div className="p-3 border rounded-md border-dashed">
                <p className="font-medium text-muted-foreground">Assigned To <span className="text-xs">(optional)</span></p>
                <p className="text-sm text-muted-foreground">The employee responsible for managing this purchase order.</p>
              </div>
              <div className="p-3 border rounded-md border-dashed">
                <p className="font-medium text-muted-foreground">Production Lead <span className="text-xs">(optional)</span></p>
                <p className="text-sm text-muted-foreground">The production lead overseeing manufacturing for this order.</p>
              </div>
              <div className="p-3 border rounded-md border-dashed">
                <p className="font-medium text-muted-foreground">Notes <span className="text-xs">(optional)</span></p>
                <p className="text-sm text-muted-foreground">Any special instructions, customer requirements, or internal notes about this order.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 flex items-center justify-center">
                <Package className="h-4 w-4" />
              </div>
              Step 3: Add Line Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Add the products and parts that the customer is ordering. You must add at least one line item.</p>

            <div className="space-y-3">
              <h4 className="font-medium">Adding an Existing Product</h4>
              <ol className="space-y-2 ml-4 list-decimal list-inside">
                <li>Select a product from the <strong>Product Item</strong> dropdown — the SKU, revision, description, and unit price will auto-fill</li>
                <li>Enter the <strong>Quantity</strong> for this line</li>
                <li>Click <strong>Add Item</strong> to add it to the order</li>
                <li>Repeat for additional items</li>
              </ol>

              <Separator />

              <h4 className="font-medium">Creating a New Product Item</h4>
              <p className="text-sm text-muted-foreground">
                If the product doesn't exist yet, you can create it on the fly:
              </p>
              <ol className="space-y-2 ml-4 list-decimal list-inside">
                <li>Select <strong>"Create New Item"</strong> from the product dropdown</li>
                <li>Fill in the SKU, revision, description, and unit price</li>
                <li>Assign an internal name (choose from existing names or enter a custom one)</li>
                <li>Click <strong>Create Product</strong> — the new item is saved to the product library and selected automatically</li>
              </ol>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    You can remove any line item by clicking the trash icon next to it. The order total updates automatically as you add or remove items.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              Step 4: Review and Submit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Review all the order details before submitting. You'll see a summary of:
            </p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>Customer name and PO number</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>Due date and assigned personnel</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>All line items with quantities and pricing</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>Order total</span>
              </li>
            </ul>

            <p>
              If anything looks wrong, use the <strong>Back</strong> button to go to the previous step and make corrections.
            </p>

            <p>
              When everything is correct, click <strong>Create Order</strong>. The system will:
            </p>
            <ol className="space-y-2 ml-4 list-decimal list-inside">
              <li>Create the purchase order</li>
              <li>Automatically <strong>lock</strong> the order to prevent unauthorized edits during production</li>
              <li>Move you to the BOM configuration phase</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </div>
              Phase 2: Configure Bill of Materials (BOM)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              After the PO is created, the system automatically opens the <strong>BOM Wizard</strong>. You need to define the Bill of Materials for every manufactured part in the order.
            </p>

            <div className="space-y-3">
              <h4 className="font-medium">What is a BOM?</h4>
              <p className="text-sm text-muted-foreground">
                A Bill of Materials lists all the raw materials, components, and sub-assemblies needed to manufacture a part. This is critical for inventory planning and production tracking.
              </p>

              <h4 className="font-medium">How to configure:</h4>
              <ol className="space-y-2 ml-4 list-decimal list-inside">
                <li>The wizard shows each manufactured part that needs a BOM</li>
                <li>For each part, add the required components from inventory</li>
                <li>Set the quantity needed for each component</li>
                <li>If a component is itself manufactured, its sub-BOM will also need to be configured</li>
                <li>Click <strong>Save</strong> for each part's BOM</li>
              </ol>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    All manufactured parts must have their BOMs configured before the order can be scheduled for production.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                <Calendar className="h-4 w-4" />
              </div>
              Phase 3: Schedule Production
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Once all BOMs are configured, you'll be automatically redirected to the <strong>Schedule</strong> tab
              in the P2 Control Center. Here you can assign the order to the production timeline using the
              Production Scheduler.
            </p>
            <p className="text-sm text-muted-foreground">
              The order is now fully set up and ready for manufacturing. It will appear in the control center dashboard
              where you can track its progress through production.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-green-800 dark:text-green-200">
              <CheckCircle2 className="h-5 w-5" />
              Quick Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium mb-1">Required fields for PO:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>- Customer</li>
                  <li>- Customer PO Number</li>
                  <li>- Due Date</li>
                  <li>- Tolerance Authorizer</li>
                  <li>- At least 1 line item</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">After creation:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>- Order is automatically locked</li>
                  <li>- BOM setup is required next</li>
                  <li>- Then schedule for production</li>
                  <li>- Track progress in the Control Center</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-4">
          <Link href="/help">
            <Button variant="outline">
              Back to Help Center
            </Button>
          </Link>
          <Link href="/p2-control-center">
            <Button>
              Go to P2 Control Center
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
