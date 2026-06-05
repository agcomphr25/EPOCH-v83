import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  MoreHorizontal,
  ArrowRight,
  FileText,
  AlertTriangle,
  FileDown,
  XCircle,
  Download,
  Link2,
  Copy,
  CopyPlus,
  Eraser,
  Zap,
  History,
  Clock,
} from 'lucide-react';
import { useOrderActions } from '@/hooks/useOrderActions';
import { duplicateOrder } from '@/lib/queryClient';
import LinkOrdersDialog from '@/components/LinkOrdersDialog';
import AuditDrawer from '@/components/AuditDrawer';
import toast from 'react-hot-toast';
import { BookOpen } from 'lucide-react';
import {
  Sheet as StorySheet,
  SheetContent as StorySheetContent,
  SheetHeader as StorySheetHeader,
  SheetTitle as StorySheetTitle,
  SheetDescription as StorySheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import OrderStoryPanel from '@/components/OrderStoryPanel';

interface OrderActionsDrawerProps {
  orderId: string;
  orderStatus?: string;
  currentDepartment?: string;
  isCancelled?: boolean;
  urgency?: string;
  onViewSalesOrder?: () => void;
  onOrderUpdated?: () => void;
}

const DEPARTMENT_ORDER = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
];

function getNextDepartment(currentDepartment: string | undefined): string | null {
  if (!currentDepartment) return null;
  const currentIndex = DEPARTMENT_ORDER.indexOf(currentDepartment);
  if (currentIndex === -1 || currentIndex === DEPARTMENT_ORDER.length - 1) {
    return null;
  }
  return DEPARTMENT_ORDER[currentIndex + 1];
}

export function OrderActionsDrawer({
  orderId,
  orderStatus,
  currentDepartment,
  isCancelled = false,
  urgency,
  onViewSalesOrder,
  onOrderUpdated,
}: OrderActionsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [sendToRts, setSendToRts] = useState(true);
  const [linkOrdersOpen, setLinkOrdersOpen] = useState(false);
  const [storyPanelOpen, setStoryPanelOpen] = useState(false);
  const [, setLocation] = useLocation();

  const {
    progressOrderMutation,
    cancelOrderMutation,
    undoCancelMutation,
    emailPdfCopyMutation,
    setUrgencyMutation,
  } = useOrderActions({
    onSuccess: () => {
      setOpen(false);
      setCancelDialogOpen(false);
      setCancelReason('');
      onOrderUpdated?.();
    },
  });

  const nextDept = getNextDepartment(currentDepartment);
  const isScrapped = orderStatus === 'SCRAPPED';
  const isFulfilled = orderStatus === 'FULFILLED';
  const isInShipping = currentDepartment === 'Shipping';
  const isUrgent = urgency === 'high' || urgency === 'critical';

  const handleProgressOrder = () => {
    if (isInShipping && !nextDept) {
      progressOrderMutation.mutate({ orderId });
    } else if (nextDept) {
      progressOrderMutation.mutate({ orderId, nextDepartment: nextDept });
    }
  };

  const handleCancelOrder = () => {
    if (!cancelReason.trim()) return;
    cancelOrderMutation.mutate({
      orderId,
      reason: cancelReason,
      sendToRts,
    });
  };

  const handleViewSalesOrder = () => {
    window.open(`/api/orders/${orderId}/pdf`, '_blank');
    setOpen(false);
  };

  const handleDownloadSalesOrder = () => {
    window.open(`/api/orders/${orderId}/pdf?download=true`, '_blank');
    setOpen(false);
  };

  const handleDuplicateOrder = async () => {
    try {
      const res = await duplicateOrder(orderId);
      toast.success(`Duplicated → ${res.newOrderId}`);
      setLocation(`/order-entry?duplicate=${res.newOrderId}&editMode=true`);
      setOpen(false);
    } catch (error) {
      toast.error('Failed to duplicate order');
    }
  };

  const handleDuplicateXN = async () => {
    const countStr = prompt('How many duplicates? (enter number 1-50)');
    if (!countStr) return;
    const count = parseInt(countStr, 10);
    if (isNaN(count) || count < 1 || count > 50) {
      toast.error('Please enter a valid number between 1 and 50');
      return;
    }
    try {
      const res = await duplicateOrder(orderId, { count });
      if (res.created) {
        toast.success(`${res.created.length} duplicates created`);
      } else {
        toast.success(`Duplicated → ${res.newOrderId}`);
      }
      setOpen(false);
      onOrderUpdated?.();
    } catch (error) {
      toast.error('Failed to duplicate order');
    }
  };

  const handleDuplicateClearSpecs = async () => {
    try {
      const res = await duplicateOrder(orderId);
      toast.success(`Duplicated (Specs Cleared) → ${res.newOrderId}`);
      setLocation(`/order-entry?duplicate=${res.newOrderId}&clearSpecs=true&editMode=true`);
      setOpen(false);
    } catch (error) {
      toast.error('Failed to duplicate order');
    }
  };

  const handleSetUrgency = (newUrgency: string) => {
    setUrgencyMutation.mutate({ orderId, urgency: newUrgency });
  };

  const handleViewTimeline = () => {
    setLocation(`/order-timeline/p1_order/${orderId}`);
    setOpen(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MoreHorizontal className="h-4 w-4" />
            Actions
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[400px] sm:w-[450px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Order Actions
              <span className="text-sm font-normal text-muted-foreground">
                ({orderId})
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Documents</h4>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleViewSalesOrder}
              >
                <FileText className="h-4 w-4" />
                View Sales Order
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleDownloadSalesOrder}
              >
                <Download className="h-4 w-4" />
                Download Sales Order
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Order Management</h4>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setLinkOrdersOpen(true);
                  setOpen(false);
                }}
              >
                <Link2 className="h-4 w-4" />
                Link Orders
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleDuplicateOrder}
              >
                <Copy className="h-4 w-4" />
                Duplicate Order
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleDuplicateXN}
              >
                <CopyPlus className="h-4 w-4" />
                Duplicate xN
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleDuplicateClearSpecs}
              >
                <Eraser className="h-4 w-4" />
                Duplicate (Clear Specs)
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Priority</h4>
              {isUrgent ? (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-gray-600"
                  onClick={() => handleSetUrgency('medium')}
                  disabled={setUrgencyMutation.isPending}
                >
                  <Zap className="h-4 w-4" />
                  {setUrgencyMutation.isPending ? 'Updating...' : 'Remove Urgent Priority'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-red-600 hover:text-red-700"
                  onClick={() => handleSetUrgency('critical')}
                  disabled={setUrgencyMutation.isPending}
                >
                  <Zap className="h-4 w-4" />
                  {setUrgencyMutation.isPending ? 'Updating...' : 'Set as Urgent'}
                </Button>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Email Actions</h4>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-green-600 hover:text-green-700"
                onClick={() => emailPdfCopyMutation.mutate(orderId)}
                disabled={emailPdfCopyMutation.isPending}
              >
                <FileDown className={`h-4 w-4 ${emailPdfCopyMutation.isPending ? 'animate-pulse' : ''}`} />
                {emailPdfCopyMutation.isPending ? 'Sending...' : 'Email PDF Copy'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Production</h4>
              {!isScrapped && !isFulfilled && !isCancelled && (
                <>
                  {isInShipping && !nextDept ? (
                    <Button
                      className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700"
                      onClick={handleProgressOrder}
                      disabled={progressOrderMutation.isPending}
                    >
                      <ArrowRight className="h-4 w-4" />
                      Complete Shipping
                    </Button>
                  ) : nextDept ? (
                    <Button
                      className="w-full justify-start gap-2"
                      onClick={handleProgressOrder}
                      disabled={progressOrderMutation.isPending}
                    >
                      <ArrowRight className="h-4 w-4" />
                      Progress to {nextDept}
                    </Button>
                  ) : null}
                </>
              )}
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setLocation('/kickback-tracking');
                  setOpen(false);
                }}
              >
                <AlertTriangle className="h-4 w-4" />
                Report Kickback
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">History & Tracking</h4>
              <AuditDrawer
                entityType="p1_order"
                entityId={orderId}
                trigger={
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <History className="h-4 w-4" />
                    View Audit Trail
                  </Button>
                }
              />
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => { setOpen(false); setStoryPanelOpen(true); }}
              >
                <BookOpen className="h-4 w-4" />
                Order Story
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleViewTimeline}
              >
                <Clock className="h-4 w-4" />
                View Timeline
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Order Status</h4>
              {isCancelled ? (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-green-600 hover:text-green-700"
                  onClick={() => undoCancelMutation.mutate(orderId)}
                  disabled={undoCancelMutation.isPending}
                >
                  <ArrowRight className="h-4 w-4" />
                  Restore Order
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Order
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order {orderId}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the order and optionally send the stock to RTS inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Cancellation Reason</Label>
              <Textarea
                id="cancel-reason"
                placeholder="Enter the reason for cancellation..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-to-rts"
                checked={sendToRts}
                onCheckedChange={(checked) => setSendToRts(checked as boolean)}
              />
              <Label htmlFor="send-to-rts" className="text-sm">
                Send stock to RTS (Ready-to-Ship) inventory
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelOrder}
              disabled={!cancelReason.trim() || cancelOrderMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelOrderMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkOrdersDialog
        orderId={orderId}
        isOpen={linkOrdersOpen}
        onClose={() => setLinkOrdersOpen(false)}
        currentUser="System"
      />

      <StorySheet open={storyPanelOpen} onOpenChange={setStoryPanelOpen}>
        <StorySheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
          <StorySheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <StorySheetTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Order Story
              <span className="text-muted-foreground font-normal text-sm ml-1">
                — {orderId}
              </span>
            </StorySheetTitle>
            <StorySheetDescription>
              Full chronological history of every event for this order
            </StorySheetDescription>
          </StorySheetHeader>
          <ScrollArea className="flex-1 px-6 py-4">
            {storyPanelOpen && <OrderStoryPanel orderId={orderId} />}
          </ScrollArea>
        </StorySheetContent>
      </StorySheet>
    </>
  );
}
