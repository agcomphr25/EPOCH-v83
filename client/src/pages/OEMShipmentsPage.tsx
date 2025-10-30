import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Package, Calendar, User, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface OEMShipment {
  customerId: string;
  customerName: string;
  poCount: number;
  itemCount: number;
  firstShipDate: string;
  lastShipDate: string;
  items: Array<{
    orderId: string;
    poNumber: string;
    itemId: string;
    itemName: string;
    shippedAt: string;
    specifications: any;
  }>;
}

export default function OEMShipmentsPage() {
  const { data: shipments = [], isLoading } = useQuery<OEMShipment[]>({
    queryKey: ['/api/po-orders/oem-shipments'],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>OEM Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading OEM shipments...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">OEM Shipments</h1>
          <p className="text-muted-foreground mt-1">
            Shipped Purchase Order items grouped by customer
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {shipments.length} Customer{shipments.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {shipments.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No OEM shipments found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Shipped PO orders will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-4">
          {shipments.map((shipment) => (
            <AccordionItem
              key={shipment.customerId}
              value={shipment.customerId}
              className="border rounded-lg"
            >
              <AccordionTrigger
                className="hover:no-underline px-6"
                data-testid={`accordion-trigger-${shipment.customerId}`}
              >
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-semibold text-lg">
                        {shipment.customerName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Customer ID: {shipment.customerId}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <Badge variant="secondary" data-testid={`badge-po-count-${shipment.customerId}`}>
                      {shipment.poCount} PO{shipment.poCount !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" data-testid={`badge-item-count-${shipment.customerId}`}>
                      {shipment.itemCount} Item{shipment.itemCount !== 1 ? 's' : ''}
                    </Badge>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(
                          new Date(shipment.lastShipDate),
                          'MMM dd, yyyy'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Item ID</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Shipped Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipment.items.map((item) => (
                        <TableRow key={item.orderId} data-testid={`row-item-${item.orderId}`}>
                          <TableCell className="font-medium">
                            {item.orderId}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              <FileText className="h-3 w-3 mr-1" />
                              {item.poNumber}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.itemId}</TableCell>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell>
                            {format(
                              new Date(item.shippedAt),
                              'MMM dd, yyyy h:mm a'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
