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
  Edit,
  ArrowRight,
  FileText,
  Download,
  AlertTriangle,
  RefreshCw,
  FileDown,
  XCircle,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { useOrderActions } from '@/hooks/useOrderActions';
import { Link } from 'wouter';

interface OrderActionsDrawerProps {
  orderId: string;
  orderStatus?: string;
  currentDepartment?: string;
  isCancelled?: boolean;
  onViewSalesOrder?: () => void;
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
  onViewSalesOrder,
}: OrderActionsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [sendToRts, setSendToRts] = useState(true);
  const [, setLocation] = useLocation();

  const {
    progressOrderMutation,
    cancelOrderMutation,
    undoCancelMutation,
    resendSignatureEmailMutation,
    sendUpdatedOrderMutation,
    emailPdfCopyMutation,
  } = useOrderActions({
    onSuccess: () => {
      setOpen(false);
      setCancelDialogOpen(false);
      setCancelReason('');
    },
  });

  const nextDept = getNextDepartment(currentDepartment);
  const isScrapped = orderStatus === 'SCRAPPED';
  const isFulfilled = orderStatus === 'FULFILLED';
  const isInShipping = currentDepartment === 'Shipping';
  const isPendingSignature = orderStatus?.toUpperCase() === 'PENDING_SIGNATURE';
  const isFinalized = orderStatus?.toUpperCase() === 'FINALIZED';

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
    if (onViewSalesOrder) {
      onViewSalesOrder();
    }
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
        <SheetContent side="right" className="w-[400px] sm:w-[450px]">
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
              <h4 className="text-sm font-medium text-muted-foreground">Navigation</h4>
              <Link href={`/order-entry?draft=${orderId}`}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Edit className="h-4 w-4" />
                  Edit Order
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </Button>
              </Link>
            </div>

            <Separator />

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
                onClick={handleViewSalesOrder}
              >
                <Download className="h-4 w-4" />
                Download Sales Order
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Email Actions</h4>
              {(isPendingSignature || isFinalized) && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-blue-600 hover:text-blue-700"
                  onClick={() => sendUpdatedOrderMutation.mutate(orderId)}
                  disabled={sendUpdatedOrderMutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${sendUpdatedOrderMutation.isPending ? 'animate-spin' : ''}`} />
                  {sendUpdatedOrderMutation.isPending ? 'Sending...' : 'Send Updated Order Email'}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-green-600 hover:text-green-700"
                onClick={() => emailPdfCopyMutation.mutate(orderId)}
                disabled={emailPdfCopyMutation.isPending}
              >
                <FileDown className={`h-4 w-4 ${emailPdfCopyMutation.isPending ? 'animate-pulse' : ''}`} />
                {emailPdfCopyMutation.isPending ? 'Sending...' : 'Email PDF Copy'}
              </Button>
              {isPendingSignature && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => resendSignatureEmailMutation.mutate(orderId)}
                  disabled={resendSignatureEmailMutation.isPending}
                >
                  <Mail className={`h-4 w-4 ${resendSignatureEmailMutation.isPending ? 'animate-pulse' : ''}`} />
                  {resendSignatureEmailMutation.isPending ? 'Sending...' : 'Resend Signature Email'}
                </Button>
              )}
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
                onClick={() => setLocation('/kickback-tracking')}
              >
                <AlertTriangle className="h-4 w-4" />
                Report Kickback
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
    </>
  );
}
