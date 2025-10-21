import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link2, Unlink, AlertTriangle, Plus, Trash2, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';

interface LinkedOrdersManagerProps {
  orderId: string;
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
  addedAt: string;
}

interface LinkDataResponse {
  linked: boolean;
  linkGroup: LinkGroupData | null;
  orders: LinkedOrderData[];
}

export function LinkedOrdersManager({ orderId, currentUser = 'System' }: LinkedOrdersManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddOrderDialogOpen, setIsAddOrderDialogOpen] = useState(false);
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupNotes, setNewGroupNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [approvalCode, setApprovalCode] = useState('');
  const [orderToAdd, setOrderToAdd] = useState('');
  const [unlinkApprovalCode, setUnlinkApprovalCode] = useState('');
  const { toast } = useToast();

  const { data: linkData, isLoading } = useQuery<LinkDataResponse>({
    queryKey: ['/api/linked-orders/order', orderId],
    enabled: !!orderId,
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; notes: string; requiresApprovalToSeparate: boolean; approvalCode: string; createdBy: string }) => {
      const group = await apiRequest(`/api/linked-orders/groups`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      await apiRequest(`/api/linked-orders/groups/${group.id}/orders`, {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });

      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/linked-orders/order', orderId] });
      setIsCreateDialogOpen(false);
      setNewGroupName('');
      setNewGroupNotes('');
      setApprovalCode('');
      toast({
        title: 'Link group created',
        description: 'Orders are now linked together',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create link group',
        variant: 'destructive',
      });
    },
  });

  const addOrderMutation = useMutation({
    mutationFn: async ({ groupId, orderId: orderToLink }: { groupId: number; orderId: string }) => {
      return apiRequest(`/api/linked-orders/groups/${groupId}/orders`, {
        method: 'POST',
        body: JSON.stringify({ orderId: orderToLink }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/linked-orders/order', orderId] });
      setIsAddOrderDialogOpen(false);
      setOrderToAdd('');
      toast({
        title: 'Order added',
        description: 'Order has been linked to the group',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add order to link group',
        variant: 'destructive',
      });
    },
  });

  const unlinkOrderMutation = useMutation({
    mutationFn: async ({ groupId, orderId: orderToUnlink, approvalCode }: { groupId: number; orderId: string; approvalCode: string }) => {
      return apiRequest(`/api/linked-orders/groups/${groupId}/orders/${orderToUnlink}`, {
        method: 'DELETE',
        body: JSON.stringify({ approvalCode }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/linked-orders/order', orderId] });
      setIsUnlinkDialogOpen(false);
      setUnlinkApprovalCode('');
      toast({
        title: 'Order unlinked',
        description: 'Order has been removed from the link group',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink order',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Linked Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const isLinked = linkData?.linked;
  const linkGroup = linkData?.linkGroup;
  const linkedOrders = linkData?.orders || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Linked Orders
        </CardTitle>
        <CardDescription>
          Group orders together to process and ship as a single unit
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLinked ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                This order is not currently linked to any other orders.
              </AlertDescription>
            </Alert>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-link-group" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Link Group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Link Group</DialogTitle>
                  <DialogDescription>
                    Create a new group to link multiple orders together
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="group-name">Group Name (Optional)</Label>
                    <Input
                      id="group-name"
                      data-testid="input-group-name"
                      placeholder="e.g., Customer Bulk Order"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="group-notes">Notes (Optional)</Label>
                    <Textarea
                      id="group-notes"
                      data-testid="input-group-notes"
                      placeholder="Additional information about this link group"
                      value={newGroupNotes}
                      onChange={(e) => setNewGroupNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="requires-approval"
                      data-testid="checkbox-requires-approval"
                      checked={requiresApproval}
                      onChange={(e) => setRequiresApproval(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="requires-approval">
                      Require approval code to unlink orders
                    </Label>
                  </div>
                  {requiresApproval && (
                    <div>
                      <Label htmlFor="approval-code">Approval Code</Label>
                      <Input
                        id="approval-code"
                        data-testid="input-approval-code"
                        type="password"
                        placeholder="Enter approval code"
                        value={approvalCode}
                        onChange={(e) => setApprovalCode(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    data-testid="button-submit-create-group"
                    onClick={() => {
                      createGroupMutation.mutate({
                        name: newGroupName || '',
                        notes: newGroupNotes || '',
                        requiresApprovalToSeparate: requiresApproval,
                        approvalCode: requiresApproval ? approvalCode : '',
                        createdBy: currentUser || 'System',
                      });
                    }}
                    disabled={createGroupMutation.isPending || (requiresApproval && !approvalCode)}
                  >
                    {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  {linkGroup?.name || 'Unnamed Link Group'}
                  {linkGroup?.requiresApprovalToSeparate && (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </h4>
                {linkGroup?.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{linkGroup.notes}</p>
                )}
              </div>
              <Badge variant="secondary" data-testid="badge-linked-count">
                {linkedOrders.length} orders linked
              </Badge>
            </div>

            <div className="space-y-2">
              <Label>Linked Orders</Label>
              <div className="space-y-2">
                {linkedOrders.map((lo: any) => (
                  <div
                    key={lo.orderId}
                    data-testid={`linked-order-${lo.orderId}`}
                    className={`flex items-center justify-between p-2 rounded border ${
                      lo.orderId === orderId ? 'bg-primary/10 border-primary' : ''
                    }`}
                  >
                    <span className="font-mono text-sm">{lo.orderId}</span>
                    {lo.orderId === orderId && (
                      <Badge variant="outline" data-testid="badge-current-order">Current</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Dialog open={isAddOrderDialogOpen} onOpenChange={setIsAddOrderDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-add-order" className="flex-1">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Order
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Order to Link Group</DialogTitle>
                    <DialogDescription>
                      Enter the order ID to add to this link group
                    </DialogDescription>
                  </DialogHeader>
                  <div>
                    <Label htmlFor="order-to-add">Order ID</Label>
                    <Input
                      id="order-to-add"
                      data-testid="input-order-to-add"
                      placeholder="e.g., 25001"
                      value={orderToAdd}
                      onChange={(e) => setOrderToAdd(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      data-testid="button-submit-add-order"
                      onClick={() => {
                        if (!linkGroup) return;
                        addOrderMutation.mutate({
                          groupId: linkGroup.id,
                          orderId: orderToAdd,
                        });
                      }}
                      disabled={addOrderMutation.isPending || !orderToAdd}
                    >
                      {addOrderMutation.isPending ? 'Adding...' : 'Add Order'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isUnlinkDialogOpen} onOpenChange={setIsUnlinkDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-unlink-order" className="flex-1">
                    <Unlink className="h-4 w-4 mr-2" />
                    Unlink This Order
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Unlink Order</DialogTitle>
                    <DialogDescription>
                      Remove this order from the link group
                    </DialogDescription>
                  </DialogHeader>
                  {linkGroup?.requiresApprovalToSeparate && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        This link group requires an approval code to unlink orders
                      </AlertDescription>
                    </Alert>
                  )}
                  <div>
                    <Label htmlFor="unlink-approval">
                      {linkGroup?.requiresApprovalToSeparate ? 'Approval Code' : 'Confirmation'}
                    </Label>
                    <Input
                      id="unlink-approval"
                      data-testid="input-unlink-approval"
                      type="password"
                      placeholder={linkGroup?.requiresApprovalToSeparate ? 'Enter approval code' : 'Type UNLINK to confirm'}
                      value={unlinkApprovalCode}
                      onChange={(e) => setUnlinkApprovalCode(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      data-testid="button-submit-unlink"
                      variant="destructive"
                      onClick={() => {
                        if (!linkGroup) return;
                        unlinkOrderMutation.mutate({
                          groupId: linkGroup.id,
                          orderId,
                          approvalCode: unlinkApprovalCode,
                        });
                      }}
                      disabled={unlinkOrderMutation.isPending || !unlinkApprovalCode}
                    >
                      {unlinkOrderMutation.isPending ? 'Unlinking...' : 'Unlink Order'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
