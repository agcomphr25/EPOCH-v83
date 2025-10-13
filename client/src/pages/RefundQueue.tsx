import React, { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Clock, DollarSign, User, Calendar, FileText, AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface RefundRequest {
  id: number;
  orderId: string;
  customerId: string;
  requestedBy: string;
  refundAmount: number;
  reason: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  processedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Joined data
  customerName?: string;
  orderDate?: string;
  paymentTotal?: number;
}

type ActionType = 'approve' | 'reject';

export default function RefundQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null);
  const [actionType, setActionType] = useState<ActionType>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showActionDialog, setShowActionDialog] = useState(false);

  // Fetch refund requests
  const { data: refundRequests = [], isLoading, error } = useQuery({
    queryKey: ['/api/refund-requests'],
    queryFn: async () => {
      const response = await apiRequest('/api/refund-requests');
      return response as RefundRequest[];
    },
  });

  // Update refund request status mutation
  const updateRefundRequestMutation = useMutation({
    mutationFn: async ({ id, action, rejectionReason }: { id: number; action: ActionType; rejectionReason?: string }) => {
      return await apiRequest(`/api/refund-requests/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason }),
      });
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === 'approve' ? 'Request Approved' : 'Request Rejected',
        description: variables.action === 'approve' 
          ? 'The refund request has been approved and processed.'
          : 'The refund request has been rejected.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/refund-requests'] });
      setShowActionDialog(false);
      setSelectedRequest(null);
      setRejectionReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update refund request',
        variant: 'destructive',
      });
    },
  });

  const handleAction = (request: RefundRequest, action: ActionType) => {
    setSelectedRequest(request);
    setActionType(action);
    setShowActionDialog(true);
  };

  const confirmAction = () => {
    if (!selectedRequest) return;

    if (actionType === 'reject' && !rejectionReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for rejection',
        variant: 'destructive',
      });
      return;
    }

    updateRefundRequestMutation.mutate({
      id: selectedRequest.id,
      action: actionType,
      rejectionReason: actionType === 'reject' ? rejectionReason.trim() : undefined,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'APPROVED':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'PROCESSED':
        return <Badge variant="default" className="bg-blue-100 text-blue-800"><CheckCircle className="h-3 w-3 mr-1" />Processed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingRequests = refundRequests.filter(req => req.status === 'PENDING');
  const processedRequests = refundRequests.filter(req => req.status !== 'PENDING');

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl" data-testid="loading-container">
        <div className="text-center py-12" data-testid="loading-message">
          <Clock className="h-8 w-8 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading refund requests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-6xl" data-testid="error-container">
        <Alert variant="destructive" data-testid="error-alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load refund requests. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="refund-queue-page">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="page-title">
          Refund Request Queue
        </h1>
        <p className="text-gray-600" data-testid="page-description">
          Review and approve or reject refund requests from customer service representatives.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" data-testid="summary-stats">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="pending-count-label">Pending Requests</p>
                <p className="text-2xl font-bold text-yellow-600" data-testid="pending-count">{pendingRequests.length}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="total-count-label">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="total-count">{refundRequests.length}</p>
              </div>
              <FileText className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600" data-testid="pending-amount-label">Pending Amount</p>
                <p className="text-2xl font-bold text-green-600" data-testid="pending-amount">
                  {formatCurrency(pendingRequests.reduce((sum, req) => sum + req.refundAmount, 0))}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="mb-8" data-testid="pending-requests-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Approval ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4" data-testid="pending-requests-list">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border border-yellow-200 rounded-lg bg-yellow-50"
                  data-testid={`pending-request-${request.id}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link 
                          href={`/orders?search=${request.orderId}`}
                          className="font-medium text-lg text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          data-testid={`request-order-${request.id}`}
                        >
                          {request.orderId}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-1" data-testid={`request-customer-${request.id}`}>
                          <User className="h-3 w-3" />
                          Customer: {request.customerName || request.customerId}
                        </div>
                        <div className="flex items-center gap-1" data-testid={`request-date-${request.id}`}>
                          <Calendar className="h-3 w-3" />
                          Requested: {formatDate(request.createdAt)}
                        </div>
                        <div data-testid={`request-by-${request.id}`}>
                          Requested by: {request.requestedBy}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600 mb-2" data-testid={`request-amount-${request.id}`}>
                        {formatCurrency(request.refundAmount)}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAction(request, 'approve')}
                          className="bg-green-600 hover:bg-green-700"
                          data-testid={`approve-button-${request.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(request, 'reject')}
                          data-testid={`reject-button-${request.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Reason: </span>
                      <span className="text-sm text-gray-600" data-testid={`request-reason-${request.id}`}>
                        {request.reason}
                      </span>
                    </div>
                    {request.notes && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Notes: </span>
                        <span className="text-sm text-gray-600" data-testid={`request-notes-${request.id}`}>
                          {request.notes}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processed Requests */}
      {processedRequests.length > 0 && (
        <Card data-testid="processed-requests-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Activity ({processedRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3" data-testid="processed-requests-list">
              {processedRequests.slice(0, 10).map((request) => (
                <div
                  key={request.id}
                  className="p-3 border rounded-lg"
                  data-testid={`processed-request-${request.id}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Link 
                        href={`/orders?search=${request.orderId}`}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                        data-testid={`processed-order-${request.id}`}
                      >
                        {request.orderId}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      {getStatusBadge(request.status)}
                      <span className="text-sm text-gray-600" data-testid={`processed-amount-${request.id}`}>
                        {formatCurrency(request.refundAmount)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500" data-testid={`processed-date-${request.id}`}>
                      {request.approvedAt ? formatDate(request.approvedAt) : formatDate(request.updatedAt)}
                    </div>
                  </div>
                  {request.rejectionReason && (
                    <div className="mt-2 text-sm text-red-600" data-testid={`rejection-reason-${request.id}`}>
                      <strong>Rejection reason:</strong> {request.rejectionReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {refundRequests.length === 0 && (
        <Card data-testid="no-requests-card">
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600" data-testid="no-requests-message">
              No refund requests found.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Confirmation Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent data-testid="action-dialog">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {actionType === 'approve' ? 'Approve' : 'Reject'} Refund Request
            </DialogTitle>
            <DialogDescription data-testid="dialog-description">
              {selectedRequest && (
                <>
                  {actionType === 'approve' 
                    ? `Approve a ${formatCurrency(selectedRequest.refundAmount)} refund for order ${selectedRequest.orderId}?`
                    : `Reject the refund request for order ${selectedRequest.orderId}?`
                  }
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {actionType === 'reject' && (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason" data-testid="rejection-reason-label">
                Reason for Rejection *
              </Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this refund is being rejected..."
                rows={3}
                data-testid="rejection-reason-input"
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 mt-6">
            <Button 
              variant="outline" 
              onClick={() => setShowActionDialog(false)}
              data-testid="cancel-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              disabled={updateRefundRequestMutation.isPending}
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              data-testid="confirm-action-button"
            >
              {updateRefundRequestMutation.isPending ? 'Processing...' : 
                actionType === 'approve' ? 'Approve Refund' : 'Reject Request'
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}