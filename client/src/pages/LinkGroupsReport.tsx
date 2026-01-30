import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Link2, ChevronDown, ChevronRight, Lock, Search, Package } from 'lucide-react';
import { Link } from 'wouter';

interface OrderInfo {
  linkedOrder: {
    id: number;
    linkGroupId: number;
    orderId: string;
    addedAt: string;
  };
  order: {
    orderId: string;
    customerName?: string;
    orderStatus?: string;
    dueDate?: string;
  } | null;
}

interface LinkGroupWithOrders {
  id: number;
  name: string | null;
  requiresApprovalToSeparate: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  orders: OrderInfo[];
  orderCount: number;
}

export default function LinkGroupsReport() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const { data: linkGroups, isLoading, error } = useQuery<LinkGroupWithOrders[]>({
    queryKey: ['/api/linked-orders/groups'],
  });

  const toggleGroup = (groupId: number) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    if (linkGroups) {
      setExpandedGroups(new Set(linkGroups.map((g) => g.id)));
    }
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const filteredGroups = linkGroups?.filter((group) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    
    if (group.name?.toLowerCase().includes(search)) return true;
    if (group.notes?.toLowerCase().includes(search)) return true;
    if (group.createdBy?.toLowerCase().includes(search)) return true;
    
    return group.orders.some((o) => 
      o.linkedOrder.orderId.toLowerCase().includes(search) ||
      o.order?.customerName?.toLowerCase().includes(search)
    );
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link Groups Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Loading link groups...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link Groups Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">Failed to load link groups</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalOrders = linkGroups?.reduce((sum, g) => sum + g.orderCount, 0) || 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link Groups Report
          </CardTitle>
          <CardDescription>
            View all link groups and their associated orders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="text-sm">
                {linkGroups?.length || 0} Link Groups
              </Badge>
              <Badge variant="outline" className="text-sm">
                {totalOrders} Total Linked Orders
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by group name, order ID, or customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredGroups?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? 'No link groups match your search' : 'No link groups found'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups?.map((group) => (
            <Card key={group.id}>
              <Collapsible
                open={expandedGroups.has(group.id)}
                onOpenChange={() => toggleGroup(group.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedGroups.has(group.id) ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <div>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            {group.name || `Link Group #${group.id}`}
                            {group.requiresApprovalToSeparate && (
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </CardTitle>
                          {group.notes && (
                            <CardDescription className="mt-1">{group.notes}</CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge>{group.orderCount} orders</Badge>
                        <span className="text-sm text-muted-foreground">
                          Created {new Date(group.createdAt).toLocaleDateString()}
                          {group.createdBy && ` by ${group.createdBy}`}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Added To Group</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.orders.map((orderInfo) => (
                          <TableRow key={orderInfo.linkedOrder.orderId}>
                            <TableCell>
                              <Link
                                href={`/orders/${orderInfo.linkedOrder.orderId}`}
                                className="text-primary hover:underline font-mono"
                              >
                                {orderInfo.linkedOrder.orderId}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {orderInfo.order?.customerName || '-'}
                            </TableCell>
                            <TableCell>
                              {orderInfo.order?.orderStatus ? (
                                <Badge variant="outline">
                                  {orderInfo.order.orderStatus}
                                </Badge>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell>
                              {orderInfo.order?.dueDate
                                ? new Date(orderInfo.order.dueDate).toLocaleDateString()
                                : '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(orderInfo.linkedOrder.addedAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
