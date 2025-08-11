import React from 'react';
import { useInventory } from '../hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

export default function InventoryDashboard() {
  const { inventory, loading, refresh } = useInventory();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Inventory Overview</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AG Part#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Supplier Part#</TableHead>
                <TableHead className="text-right">Cost Per</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500">
                    No inventory items found
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((item) => (
                    <TableRow 
                      key={item.id} 
                      className={!item.isActive ? 'bg-gray-50' : ''}
                    >
                      <TableCell className="font-medium">{item.agPartNumber}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.source || 'N/A'}</TableCell>
                      <TableCell>{item.supplierPartNumber || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        {item.costPer ? `$${item.costPer.toFixed(2)}` : 'N/A'}
                      </TableCell>
                      <TableCell>{item.department || 'N/A'}</TableCell>
                      <TableCell>
                        {item.orderDate ? new Date(item.orderDate).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "default" : "secondary"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}