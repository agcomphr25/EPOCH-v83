// React is automatically imported by Vite JSX transformer
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileText, Edit, Trash2, Check, Send } from 'lucide-react';
import { Link, useLocation } from 'wouter';

interface OrderDraft {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string | null;
  customerPO: string | null;
  modelId: string | null;
  handedness: string | null;
  features: Record<string, any> | null;
  featureQuantities: Record<string, Record<string, number>> | null;
  discountCode: string | null;
  shipping: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function DraftOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: allDrafts = [], isLoading, error } = useQuery({
    queryKey: ['/api/orders/drafts'],
    queryFn: () => apiRequest('/api/orders/drafts'),
  });

  // Filter to only show actual drafts, not finalized orders
  const drafts = allDrafts.filter((draft: OrderDraft) => 
    draft.status === 'DRAFT' || draft.status === 'CONFIRMED'
  );

  const deleteDraftMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest(`/api/orders/draft/${orderId}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/drafts'] });
      toast({
        title: "Draft Deleted",
        description: "Draft order has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete draft order",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (orderId: string) => {
    if (window.confirm('Are you sure you want to delete this draft?')) {
      deleteDraftMutation.mutate(orderId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFeatureCount = (features: Record<string, any> | null) => {
    if (!features) return 0;
    return Object.values(features).filter(value => 
      value !== null && value !== undefined && value !== ''
    ).length;
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-600">
          <p>Error loading draft orders. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          Draft Orders
        </h1>
        <p className="text-gray-600 mt-2">Manage saved draft orders</p>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No draft orders found</h3>
              <p className="text-gray-500 mb-4">
                Create a new order and save it as a draft to see it here.
              </p>
              <Link href="/order-entry">
                <Button>Create New Order</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {drafts.map((draft: OrderDraft) => (
            <Card key={draft.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{draft.orderId}</CardTitle>
                    <Badge variant="secondary">{draft.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setLocation(`/order-entry?draft=${draft.orderId}`);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(draft.orderId)}
                      disabled={deleteDraftMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Order Date</p>
                    <p className="font-medium">{formatDate(draft.orderDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Due Date</p>
                    <p className="font-medium">{formatDate(draft.dueDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Customer</p>
                    <p className="font-medium">{draft.customerId || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Stock Model</p>
                    <p className="font-medium">{draft.modelId || 'Not selected'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Handedness</p>
                    <p className="font-medium">{draft.handedness || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Features</p>
                    <p className="font-medium">{getFeatureCount(draft.features)} configured</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Shipping</p>
                    <p className="font-medium">${draft.shipping.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Last Updated</p>
                    <p className="font-medium">{formatDate(draft.updatedAt)}</p>
                  </div>
                </div>
                
                {draft.customerPO && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">Customer PO</p>
                    <p className="font-medium">{draft.customerPO}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}