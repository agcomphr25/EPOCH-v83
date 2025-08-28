import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, FileText, MessageSquare, Download, Send, Mail } from 'lucide-react';
import AddressInput from '@/components/AddressInput';
import AddressTestComponent from '@/components/AddressTestComponent';
import PdfViewer from '@/components/PdfViewer';
import CommunicationPanel from '@/components/CommunicationPanel';
import { type AddressData } from '@/utils/addressUtils';

export default function Module8TestPage() {
  const [selectedAddress, setSelectedAddress] = useState<AddressData>({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States'
  });

  const mockCustomerPreferences = {
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    preferredMethod: 'email' as const
  };

  const mockOrderId = 'AG001';

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Module 8: API Integrations & Communications</h1>
          <p className="text-muted-foreground mt-2">
            Test suite for address validation, PDF generation, and customer communications
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          Test Environment
        </Badge>
      </div>

      <Tabs defaultValue="address" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="address" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Address Management
          </TabsTrigger>
          <TabsTrigger value="pdf" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            PDF Generation
          </TabsTrigger>
          <TabsTrigger value="communication" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Communications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="address" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address API Direct Test
              </CardTitle>
              <CardDescription>
                Test address autocomplete API directly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddressTestComponent />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address Input & Validation
              </CardTitle>
              <CardDescription>
                Test address autocomplete and validation functionality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <AddressInput
                  label="Customer Shipping Address"
                  value={selectedAddress}
                  onChange={setSelectedAddress}
                  required
                />
                
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Selected Address:</h4>
                  <pre className="text-sm">
                    {JSON.stringify(selectedAddress, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Order Confirmation PDF
                </CardTitle>
                <CardDescription>
                  Generate and preview order confirmation documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PdfViewer
                  endpoint="/api/pdfs/order-confirmation"
                  orderId={mockOrderId}
                  filename={`${mockOrderId}-confirmation.pdf`}
                  title="Order Confirmation"
                  description="Customer order confirmation document"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Packing Slip PDF
                </CardTitle>
                <CardDescription>
                  Generate and preview packing slip documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PdfViewer
                  endpoint="/api/pdfs/packing-slip"
                  orderId={mockOrderId}
                  filename={`${mockOrderId}-packing-slip.pdf`}
                  title="Packing Slip"
                  description="Warehouse packing slip document"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice PDF
              </CardTitle>
              <CardDescription>
                Generate and preview invoice documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PdfViewer
                endpoint="/api/pdfs/invoice"
                orderId={mockOrderId}
                filename={`${mockOrderId}-invoice.pdf`}
                title="Invoice"
                description="Customer invoice document"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communication" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Customer Communication Panel
              </CardTitle>
              <CardDescription>
                Send order notifications and updates to customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommunicationPanel
                orderId={mockOrderId}
                customerPreferences={mockCustomerPreferences}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Communication Features</CardTitle>
              <CardDescription>
                Available communication methods and capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Communications
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Order confirmations</li>
                    <li>• Shipping notifications</li>
                    <li>• Quality control alerts</li>
                    <li>• Custom messages</li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    SMS Communications
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Order status updates</li>
                    <li>• Delivery notifications</li>
                    <li>• Urgent alerts</li>
                    <li>• Appointment reminders</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Module 8 Integration Notes</CardTitle>
          <CardDescription>
            Implementation details and production considerations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Address Validation
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Currently using mock data. In production, integrate with Google Places API or USPS Address Validation API for real-time address verification and autocomplete.
              </p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                PDF Generation
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                Mock PDF generation implemented. For production, use libraries like jsPDF, Puppeteer, or PDFKit to generate real documents with order data, company branding, and formatting.
              </p>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-2">
                Communications
              </h4>
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Mock communication sending. For production, integrate with SendGrid for email and Twilio for SMS. All communications are logged in the database for audit trails.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}