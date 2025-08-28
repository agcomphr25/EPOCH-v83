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
                <TableHead>Item Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">On Hand</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reorder Point</TableHead>
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
                inventory.map((item) => {
                  const available = item.onHand - item.committed;
                  const isLowStock = available <= item.reorderPoint;
                  const isOutOfStock = available <= 0;
                  
                  return (
                    <TableRow 
                      key={item.code} 
                      className={isOutOfStock ? 'bg-red-50' : isLowStock ? 'bg-yellow-50' : ''}
                    >
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category || 'N/A'}</TableCell>
                      <TableCell className="text-right">{item.onHand}</TableCell>
                      <TableCell className="text-right">{item.committed}</TableCell>
                      <TableCell className="text-right font-medium">{available}</TableCell>
                      <TableCell className="text-right">{item.reorderPoint}</TableCell>
                      <TableCell>
                        {isOutOfStock ? (
                          <Badge variant="destructive">Out of Stock</Badge>
                        ) : isLowStock ? (
                          <Badge variant="secondary">Low Stock</Badge>
                        ) : (
                          <Badge variant="default">In Stock</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}