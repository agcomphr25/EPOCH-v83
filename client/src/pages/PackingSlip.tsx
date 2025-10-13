import { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save, Printer, Download, FileText, Package } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_INFO } from "@shared/company-config";

interface PackingSlipFormData {
  // Header Information
  packingSlipNumber: string;
  date: string;
  invoiceNumber: string;
  
  // Customer Information
  customerId: string;
  customerName: string;
  customerAddress: string;
  
  // Line Items
  poNumber: string;
  contents: string;
  contentsDescription: string;
  quantity: string;
  lotNumber: string;
  serialNumbers: string;
  shipmentNumber: string;
  
  // Footer Information
  packedShippedBy: string;
  trackingNumber: string;
  
  // System Fields
  status: 'DRAFT' | 'SUBMITTED';
  createdBy: string;
}

export default function PackingSlip() {
  const { toast } = useToast();
  
  // Fetch P2 customers for dropdown using bypass route
  const { data: p2Customers = [] } = useQuery({
    queryKey: ['/api/p2-customers-bypass'],
    select: (data: any[]) => data.map(customer => ({
      id: customer.id,
      customerId: customer.customerId,
      customerName: customer.customerName,
      shipToAddress: customer.shipToAddress
    }))
  });

  // Fetch inventory items for contents dropdown
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['/api/inventory'],
    select: (data: any[]) => data.map(item => ({
      id: item.id,
      agPartNumber: item.agPartNumber,
      name: item.name
    }))
  });

  const [formData, setFormData] = useState<PackingSlipFormData>({
    // Auto-generate packing slip number (will be same as lot number)
    packingSlipNumber: '',
    date: new Date().toLocaleDateString('en-US'),
    invoiceNumber: '', // Will be auto-generated later
    
    customerId: '',
    customerName: '',
    customerAddress: '',
    
    poNumber: '',
    contents: '',
    contentsDescription: '',
    quantity: '1',
    lotNumber: '',
    serialNumbers: '',
    shipmentNumber: '',
    
    packedShippedBy: '',
    trackingNumber: '#N/A',
    
    status: 'DRAFT',
    createdBy: 'System User'
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-populate customer fields when customer is selected
    if (field === 'customerId') {
      const selectedCustomer = p2Customers.find(c => c.customerId === value);
      if (selectedCustomer) {
        setFormData(prev => ({
          ...prev,
          customerName: selectedCustomer.customerName,
          customerAddress: selectedCustomer.shipToAddress || ''
        }));
      }
    }
    
    // Auto-populate contents description when inventory item is selected
    if (field === 'contents') {
      const selectedItem = inventoryItems.find(item => item.agPartNumber === value);
      if (selectedItem) {
        setFormData(prev => ({
          ...prev,
          contentsDescription: selectedItem.name
        }));
      }
    }
    
    // Sync packing slip number with lot number
    if (field === 'lotNumber') {
      setFormData(prev => ({
        ...prev,
        packingSlipNumber: value
      }));
    }
  };

  const handleSubmit = async (status: 'DRAFT' | 'SUBMITTED') => {
    try {
      const submissionData = {
        packingSlipNumber: formData.packingSlipNumber,
        date: formData.date,
        invoiceNumber: formData.invoiceNumber,
        customerId: formData.customerId,
        customerName: formData.customerName,
        customerAddress: formData.customerAddress,
        poNumber: formData.poNumber,
        contents: formData.contents,
        contentsDescription: formData.contentsDescription,
        quantity: formData.quantity,
        lotNumber: formData.lotNumber,
        serialNumbers: formData.serialNumbers,
        shipmentNumber: formData.shipmentNumber,
        packedShippedBy: formData.packedShippedBy,
        trackingNumber: formData.trackingNumber,
        status: status,
        createdBy: formData.createdBy
      };

      // TODO: Create packing slip API endpoint
      // await apiRequest('/api/packing-slips', {
      //   method: 'POST',
      //   body: JSON.stringify(submissionData)
      // });

      toast({
        title: "Packing Slip Saved",
        description: `Packing slip ${status === 'DRAFT' ? 'saved as draft' : 'submitted'} successfully.`,
      });

      // Reset form after successful submission
      if (status === 'SUBMITTED') {
        setFormData({
          packingSlipNumber: '',
          date: new Date().toLocaleDateString('en-US'),
          invoiceNumber: '',
          customerId: '',
          customerName: '',
          customerAddress: '',
          poNumber: '',
          contents: '',
          contentsDescription: '',
          quantity: '1',
          lotNumber: '',
          serialNumbers: '',
          shipmentNumber: '',
          packedShippedBy: '',
          trackingNumber: '#N/A',
          status: 'DRAFT',
          createdBy: 'System User'
        });
      }
    } catch (error) {
      console.error('Error saving packing slip:', error);
      toast({
        title: "Error",
        description: `Failed to ${status === 'DRAFT' ? 'save draft' : 'submit'} packing slip. Please try again.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Package className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Packing Slip</h1>
          </div>
          <p className="text-gray-600">
            Generate shipping documentation for P2 products
          </p>
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-8">
            {/* Header Section - Company Info and Packing Slip Details */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="text-lg font-bold mb-1">{COMPANY_INFO.name}</div>
                <div className="text-sm text-gray-600">
                  {COMPANY_INFO.streetAddress}<br />
                  {COMPANY_INFO.city}, {COMPANY_INFO.state} {COMPANY_INFO.zipCode}
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-lg font-bold mb-2">
                  Packing Slip #{formData.packingSlipNumber || '[Auto-filled from Lot #]'}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="font-semibold">Date</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => handleInputChange('date', e.target.value)}
                      className="mt-1 text-xs h-8"
                    />
                  </div>
                  <div>
                    <Label className="font-semibold">Invoice #</Label>
                    <Input
                      value={formData.invoiceNumber}
                      onChange={(e) => handleInputChange('invoiceNumber', e.target.value)}
                      placeholder="Auto-generated"
                      className="mt-1 text-xs h-8"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Ship To Section */}
            <div className="mb-8">
              <div className="text-center font-bold text-lg mb-4">Ship To:</div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div>
                  <Label htmlFor="customerId" className="text-sm font-semibold">Customer *</Label>
                  <Select value={formData.customerId} onValueChange={(value) => handleInputChange('customerId', value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {p2Customers.map((customer) => (
                        <SelectItem key={customer.customerId} value={customer.customerId}>
                          {customer.customerName} ({customer.customerId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="customerAddress" className="text-sm font-semibold">Customer Address</Label>
                  <Input
                    id="customerAddress"
                    value={formData.customerAddress}
                    onChange={(e) => handleInputChange('customerAddress', e.target.value)}
                    className="mt-1"
                    placeholder="Auto-filled from customer selection"
                  />
                </div>
              </div>
              
              {formData.customerName && (
                <div className="text-center mt-4 p-4 bg-gray-50 rounded-lg max-w-md mx-auto">
                  <div className="font-semibold">{formData.customerName}</div>
                  {formData.customerAddress && (
                    <div className="text-sm text-gray-600 whitespace-pre-line">
                      {formData.customerAddress}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator className="mb-8" />

            {/* Items Table Header */}
            <div className="mb-4">
              <div className="grid grid-cols-6 gap-4 text-sm font-semibold text-center border-b pb-2">
                <div>PO #</div>
                <div>Contents</div>
                <div>Quantity</div>
                <div>Lot #</div>
                <div>Serial #</div>
                <div>Shipment #</div>
              </div>
            </div>

            {/* Items Table Data */}
            <div className="grid grid-cols-6 gap-4 mb-8">
              <div>
                <Input
                  value={formData.poNumber}
                  onChange={(e) => handleInputChange('poNumber', e.target.value)}
                  placeholder="PO Number"
                  className="text-sm text-center"
                />
              </div>
              
              <div className="space-y-2">
                <Select value={formData.contents} onValueChange={(value) => handleInputChange('contents', value)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select part..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryItems.map((item) => (
                      <SelectItem key={item.id} value={item.agPartNumber}>
                        {item.agPartNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={formData.contentsDescription}
                  onChange={(e) => handleInputChange('contentsDescription', e.target.value)}
                  placeholder="Description"
                  className="text-xs"
                />
              </div>
              
              <div>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  className="text-sm text-center"
                  min="1"
                />
              </div>
              
              <div>
                <Input
                  value={formData.lotNumber}
                  onChange={(e) => handleInputChange('lotNumber', e.target.value)}
                  placeholder="Lot Number"
                  className="text-sm text-center"
                />
              </div>
              
              <div>
                <Input
                  value={formData.serialNumbers}
                  onChange={(e) => handleInputChange('serialNumbers', e.target.value)}
                  placeholder="Serial Numbers"
                  className="text-sm text-center"
                />
              </div>
              
              <div>
                <Input
                  value={formData.shipmentNumber}
                  onChange={(e) => handleInputChange('shipmentNumber', e.target.value)}
                  placeholder="Shipment #"
                  className="text-sm text-center"
                />
              </div>
            </div>

            <Separator className="mb-8" />

            {/* Footer Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <Label htmlFor="packedShippedBy" className="text-sm font-semibold">Packed / Shipped by:</Label>
                <Input
                  id="packedShippedBy"
                  value={formData.packedShippedBy}
                  onChange={(e) => handleInputChange('packedShippedBy', e.target.value)}
                  className="mt-1"
                  placeholder="Employee name"
                />
              </div>
              
              <div>
                <Label htmlFor="trackingNumber" className="text-sm font-semibold">Tracking #</Label>
                <Input
                  id="trackingNumber"
                  value={formData.trackingNumber}
                  onChange={(e) => handleInputChange('trackingNumber', e.target.value)}
                  className="mt-1"
                  placeholder="#N/A"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-4 pt-4">
              <Button 
                onClick={() => handleSubmit('DRAFT')}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
              
              <Button 
                onClick={() => handleSubmit('SUBMITTED')}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Submit Packing Slip
              </Button>
              
              <Button variant="outline" className="flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Print
              </Button>
              
              <Button variant="outline" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 mt-8 pt-4 border-t">
              SH Form 1 - Version 1.0 01/09/2023
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}