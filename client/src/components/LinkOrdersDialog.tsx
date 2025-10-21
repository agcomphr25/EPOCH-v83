import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { Link2, Unlink, Lock, Plus, Trash2 } from 'lucide-react';

interface LinkOrdersDialogProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: string;
}

interface LinkGroupData {
  id: number;
  name: string | null;
  requiresApprovalToSeparate: boolean;
  notes: string | null;
  createdBy: string | null;
}

interface LinkedOrderData {
  id: number;
  linkGroupId: number;
  orderId: string;
  addedBy: string | null;
  addedAt: Date | null;
}

interface LinkInfo {
  linked: boolean;
  linkGroup: LinkGroupData | null;
  orders: LinkedOrderData[];
}

export default function LinkOrdersDialog({
  orderId,
  isOpen,
  onClose,
  currentUser = 'System',
}: LinkOrdersDialogProps) {
  const [groupName, setGroupName] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [approvalCode, setApprovalCode] = useState('');
  const [orderToLink, setOrderToLink] = useState('');
  const [unlinkApprovalCode, setUnlinkApprovalCode] = useState('');
  const [showUnlinkPrompt, setShowUnlinkPrompt] = useState(false);

  // Fetch link information for this order
  const { data: linkInfo, refetch } = useQuery<LinkInfo>({
    queryKey: ['/api/linked-orders/order', orderId],
    enabled: isOpen && !!orderId,
  });

  // Create link group mutation
  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const groupData = {
        name: groupName || `Link Group for ${orderId}`,
        requiresApprovalToSeparate: requireApproval,
        approvalCode: requireApproval ? approvalCode : null,
        createdBy: currentUser,
      };

      const newGroup = await apiRequest('/api/linked-orders/groups', {
        method: 'POST',
        body: JSON.stringify(groupData),
      });

      // Add current order to the group
      await apiRequest(`/api/linked-orders/groups/${newGroup.id}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          addedBy: currentUser,
        }),
      });

      // If orderToLink is provided, add it too
      if (orderToLink.trim()) {
        await apiRequest(`/api/linked-orders/groups/${newGroup.id}/orders`, {
          method: 'POST',
          body: JSON.stringify({
            orderId: orderToLink.trim().toUpperCase(),
            addedBy: currentUser,
          }),
        });
      }

      return newGroup;
    },
    onSuccess: () => {
      toast.success('Link group created successfully');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      setGroupName('');
      setRequireApproval(false);
      setApprovalCode('');
      setOrderToLink('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create link group');
    },
  });

  // Add order to existing group mutation
  const addOrderMutation = useMutation({
    mutationFn: async (targetOrderId: string) => {
      if (!linkInfo?.linkGroup) throw new Error('No link group found');

      return await apiRequest(
        `/api/linked-orders/groups/${linkInfo.linkGroup.id}/orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            orderId: targetOrderId.trim().toUpperCase(),
            addedBy: currentUser,
          }),
        }
      );
    },
    onSuccess: () => {
      toast.success('Order added to link group');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      setOrderToLink('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add order to group');
    },
  });

  // Unlink order mutation
  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const body: any = { unlinkedBy: currentUser };
      
      if (linkInfo?.linkGroup?.requiresApprovalToSeparate) {
        if (!unlinkApprovalCode) {
          throw new Error('Approval code required');
        }
        body.approvalCode = unlinkApprovalCode;
      }

      return await apiRequest(`/api/linked-orders/orders/${orderId}`, {
        method: 'DELETE',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success('Order unlinked successfully');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      setUnlinkApprovalCode('');
      setShowUnlinkPrompt(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to unlink order');
    },
  });

  const handleCreateGroup = () => {
    if (requireApproval && !approvalCode.trim()) {
      toast.error('Please enter an approval code');
      return;
    }
    createGroupMutation.mutate();
  };

  const handleAddOrder = () => {
    if (!orderToLink.trim()) {
      toast.error('Please enter an order ID');
      return;
    }
    if (linkInfo?.linkGroup) {
      addOrderMutation.mutate(orderToLink);
    }
  };

  const handleUnlink = () => {
    if (linkInfo?.linkGroup?.requiresApprovalToSeparate && !unlinkApprovalCode) {
      toast.error('Please enter the approval code');
      return;
    }
    unlinkMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-link-orders">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Link Orders - {orderId}
          </DialogTitle>
          <DialogDescription>
            Link orders that must ship together or be processed as a group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Link Status */}
          {linkInfo?.linked && linkInfo.linkGroup && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                      Currently Linked
                    </h3>
                    {linkInfo.linkGroup.requiresApprovalToSeparate && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        <Lock className="w-3 h-3 mr-1" />
                        Approval Required
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                    <strong>Group:</strong> {linkInfo.linkGroup.name || 'Unnamed Group'}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Orders in group:</strong> {linkInfo.orders.length}
                  </p>
                  
                  {/* List all linked orders */}
                  <div className="mt-3 space-y-1">
                    {linkInfo.orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Badge variant={order.orderId === orderId ? 'default' : 'secondary'}>
                          {order.orderId}
                        </Badge>
                        {order.orderId === orderId && (
                          <span className="text-xs text-blue-600 dark:text-blue-400">(this order)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {!showUnlinkPrompt && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowUnlinkPrompt(true)}
                    className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                    data-testid="button-show-unlink"
                  >
                    <Unlink className="w-4 h-4 mr-1" />
                    Unlink
                  </Button>
                )}
              </div>

              {/* Unlink Prompt */}
              {showUnlinkPrompt && (
                <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2">
                    Unlink this order from the group?
                  </p>
                  
                  {linkInfo.linkGroup.requiresApprovalToSeparate && (
                    <div className="mb-3">
                      <Label htmlFor="unlink-approval-code" className="text-xs">
                        Enter 4-Digit Code
                      </Label>
                      <Input
                        id="unlink-approval-code"
                        type="text"
                        value={unlinkApprovalCode}
                        onChange={(e) => setUnlinkApprovalCode(e.target.value.toUpperCase().slice(0, 4))}
                        placeholder="Ask the CSR who linked these orders"
                        maxLength={4}
                        className="mt-1"
                        data-testid="input-unlink-approval"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleUnlink}
                      disabled={unlinkMutation.isPending}
                      data-testid="button-confirm-unlink"
                    >
                      Confirm Unlink
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowUnlinkPrompt(false);
                        setUnlinkApprovalCode('');
                      }}
                      data-testid="button-cancel-unlink"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Order to Existing Group */}
          {linkInfo?.linked && linkInfo.linkGroup && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Another Order to This Group
                </h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Order ID (e.g., AG123)"
                    value={orderToLink}
                    onChange={(e) => setOrderToLink(e.target.value.toUpperCase())}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddOrder()}
                    data-testid="input-order-to-add"
                  />
                  <Button
                    onClick={handleAddOrder}
                    disabled={addOrderMutation.isPending || !orderToLink.trim()}
                    data-testid="button-add-order"
                  >
                    Add Order
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Create New Link Group */}
          {!linkInfo?.linked && (
            <div>
              <h3 className="font-semibold mb-3">Create New Link Group</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="group-name">Group Name (Optional)</Label>
                  <Input
                    id="group-name"
                    placeholder={`Link Group for ${orderId}`}
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    data-testid="input-group-name"
                  />
                </div>

                <div>
                  <Label htmlFor="order-to-link">Link With Order ID</Label>
                  <Input
                    id="order-to-link"
                    placeholder="Enter Order ID (e.g., AG124)"
                    value={orderToLink}
                    onChange={(e) => setOrderToLink(e.target.value.toUpperCase())}
                    data-testid="input-order-to-link"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: Enter another order to link with {orderId}
                  </p>
                </div>

                <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <Checkbox
                    id="require-approval"
                    checked={requireApproval}
                    onCheckedChange={(checked) => setRequireApproval(!!checked)}
                    data-testid="checkbox-require-approval"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="require-approval"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Protect with code
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Set a 4-digit code to prevent others from unlinking these orders
                    </p>
                  </div>
                </div>

                {requireApproval && (
                  <div>
                    <Label htmlFor="approval-code">Set 4-Digit Code</Label>
                    <Input
                      id="approval-code"
                      type="text"
                      placeholder="e.g., 1234 or AB12"
                      value={approvalCode}
                      onChange={(e) => setApprovalCode(e.target.value.toUpperCase().slice(0, 4))}
                      maxLength={4}
                      data-testid="input-approval-code"
                    />
                    <p className="text-xs text-blue-600 mt-1">
                      Remember this code - you'll need to provide it to anyone who needs to unlink these orders.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleCreateGroup}
                  disabled={createGroupMutation.isPending}
                  className="w-full"
                  data-testid="button-create-group"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Create Link Group
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
