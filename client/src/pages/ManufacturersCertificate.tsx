import { useState, useRef } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save, Printer, Download, FileText, Award } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_INFO, CERTIFICATE_TEMPLATES } from "@shared/company-config";

export default function ManufacturersCertificate() {
  const { toast } = useToast();
  const signatureCanvasRef = useRef<SignatureCanvas>(null);
  
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

  // Fetch inventory items for part number dropdown
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['/api/inventory'],
    select: (data: any[]) => data.map(item => ({
      id: item.id,
      agPartNumber: item.agPartNumber,
      name: item.name
    }))
  });

  const [formData, setFormData] = useState({
    // Company Information (from shared config)
    companyName: COMPANY_INFO.name,
    streetAddress: COMPANY_INFO.streetAddress,
    city: COMPANY_INFO.city,
    state: COMPANY_INFO.state,
    zipCode: COMPANY_INFO.zipCode,
    
    // Customer & Order Information (Dropdowns)
    customerId: '',
    customerName: '',
    customerAddress: '',
    poNumber: '',
    partNumber: '',
    lotNumber: '',
    
    // Form Fields from PDF
    drawingNumber: 'n/a',
    sourceManufacturer: 'n/a',
    manufacturersPartNumber: '',
    manufacturersLotNumber: '',
    dateOfManufacture: '',
    quantity: '1',
    dateShippedDelivered: '',
    description: '',
    specialProcesses: 'n/a',
    serialNumbers: '',
    
    // Certification Text (from shared templates)
    certificationText: CERTIFICATE_TEMPLATES.manufacturersConformance.certificationText,
    otherDataText: CERTIFICATE_TEMPLATES.manufacturersConformance.otherDataText,
    
    // Signature Fields
    signatureDataURL: '',
    signatureDate: '',
    signerTitle: '',
    
    // System Fields
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
  };

  const handleSaveSignature = () => {
    if (signatureCanvasRef.current) {
      const signatureURL = signatureCanvasRef.current.toDataURL();
      setFormData(prev => ({ 
        ...prev, 
        signatureDataURL: signatureURL,
        signatureDate: new Date().toLocaleDateString()
      }));
    }
  };

  const handleClearSignature = () => {
    if (signatureCanvasRef.current) {
      signatureCanvasRef.current.clear();
      setFormData(prev => ({ ...prev, signatureDataURL: '', signatureDate: '' }));
    }
  };

  const handleSubmit = async (status: 'DRAFT' | 'SUBMITTED') => {
    try {
      const submissionData = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        customerAddress: formData.customerAddress,
        poNumber: formData.poNumber,
        partNumber: formData.partNumber,
        lotNumber: formData.lotNumber,
        formData: formData,
        status: status,
        createdBy: formData.createdBy
      };

      await apiRequest('/api/manufacturers-certificates', {
        method: 'POST',
        body: JSON.stringify(submissionData)
      });

      toast({
        title: "Certificate Saved",
        description: `Manufacturer's Certificate of Conformance ${status === 'DRAFT' ? 'saved as draft' : 'submitted'} successfully.`,
      });

      // Reset form after successful submission
      if (status === 'SUBMITTED') {
        // Reset to initial state but keep company info
        setFormData(prev => ({
          ...{
            companyName: COMPANY_INFO.name,
            streetAddress: COMPANY_INFO.streetAddress,
            city: COMPANY_INFO.city,
            state: COMPANY_INFO.state,
            zipCode: COMPANY_INFO.zipCode,
            customerId: '',
            customerName: '',
            customerAddress: '',
            poNumber: '',
            partNumber: '',
            lotNumber: '',
            drawingNumber: 'n/a',
            sourceManufacturer: 'n/a',
            manufacturersPartNumber: '',
            manufacturersLotNumber: '',
            dateOfManufacture: '',
            quantity: '1',
            dateShippedDelivered: '',
            description: '',
            specialProcesses: 'n/a',
            serialNumbers: '',
            certificationText: CERTIFICATE_TEMPLATES.manufacturersConformance.certificationText,
            otherDataText: CERTIFICATE_TEMPLATES.manufacturersConformance.otherDataText,
            signatureDataURL: '',
            signatureDate: '',
            signerTitle: '',
            status: 'DRAFT',
            createdBy: 'System User'
          }
        }));
        
        if (signatureCanvasRef.current) {
          signatureCanvasRef.current.clear();
        }
      }
    } catch (error) {
      console.error('Error saving certificate:', error);
      toast({
        title: "Error",
        description: `Failed to ${status === 'DRAFT' ? 'save draft' : 'submit'} certificate. Please try again.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Award className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold text-gray-900">Manufacturer's Certificate of Conformance</h1>
          </div>
          <p className="text-gray-600">
            Quality assurance certificate for manufactured products
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-center">
              MANUFACTURER'S CERTIFICATE OF CONFORMANCE
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Company Information - Static from template */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-sm font-semibold">COMPANY NAME:</Label>
                <div className="mt-1 text-sm">{formData.companyName}</div>
              </div>
              <div>
                <Label className="text-sm font-semibold">STREET ADDRESS:</Label>
                <div className="mt-1 text-sm">{formData.streetAddress}</div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <Label className="text-sm font-semibold">CITY:</Label>
                    <div className="mt-1 text-sm">{formData.city}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">STATE:</Label>
                    <div className="mt-1 text-sm">{formData.state}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">ZIPCODE:</Label>
                    <div className="mt-1 text-sm">{formData.zipCode}</div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Customer & Order Information - With Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div>
                <Label htmlFor="customerAddress" className="text-sm font-semibold">Customer Address</Label>
                <Input
                  id="customerAddress"
                  value={formData.customerAddress}
                  onChange={(e) => handleInputChange('customerAddress', e.target.value)}
                  className="mt-1"
                  placeholder="Auto-filled from customer selection"
                />
              </div>

              <div>
                <Label htmlFor="poNumber" className="text-sm font-semibold">PURCHASE ORDER NUMBER *</Label>
                <Input
                  id="poNumber"
                  value={formData.poNumber}
                  onChange={(e) => handleInputChange('poNumber', e.target.value)}
                  className="mt-1"
                  placeholder="Enter PO number..."
                />
              </div>

              <div>
                <Label htmlFor="partNumber" className="text-sm font-semibold">Part Number *</Label>
                <Select value={formData.partNumber} onValueChange={(value) => handleInputChange('partNumber', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select part number..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryItems.map((item) => (
                      <SelectItem key={item.id} value={item.agPartNumber}>
                        {item.agPartNumber} - {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="lotNumber" className="text-sm font-semibold">Lot Number *</Label>
                <Input
                  id="lotNumber"
                  value={formData.lotNumber}
                  onChange={(e) => handleInputChange('lotNumber', e.target.value)}
                  className="mt-1"
                  placeholder="Enter lot number..."
                />
              </div>
            </div>

            <Separator />

            {/* Manufacturing Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="drawingNumber" className="text-sm font-semibold">DRAWING NUMBER:</Label>
                <Input
                  id="drawingNumber"
                  value={formData.drawingNumber}
                  onChange={(e) => handleInputChange('drawingNumber', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="sourceManufacturer" className="text-sm font-semibold">SOURCE (MANUFACTURER'S COMPANY NAME IF DIFFERENT FROM SUPPLIER):</Label>
                <Input
                  id="sourceManufacturer"
                  value={formData.sourceManufacturer}
                  onChange={(e) => handleInputChange('sourceManufacturer', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="manufacturersPartNumber" className="text-sm font-semibold">MANUFACTURER'S PART NUMBER:</Label>
                <Input
                  id="manufacturersPartNumber"
                  value={formData.manufacturersPartNumber}
                  onChange={(e) => handleInputChange('manufacturersPartNumber', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="manufacturersLotNumber" className="text-sm font-semibold">MANUFACTURER'S LOT NUMBER:</Label>
                <Input
                  id="manufacturersLotNumber"
                  value={formData.manufacturersLotNumber}
                  onChange={(e) => handleInputChange('manufacturersLotNumber', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="dateOfManufacture" className="text-sm font-semibold">DATE OF MANUFACTURE:</Label>
                <Input
                  id="dateOfManufacture"
                  type="date"
                  value={formData.dateOfManufacture}
                  onChange={(e) => handleInputChange('dateOfManufacture', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="quantity" className="text-sm font-semibold">Quantity:</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  className="mt-1"
                  min="1"
                />
              </div>

              <div>
                <Label htmlFor="dateShippedDelivered" className="text-sm font-semibold">DATE SHIPPED / DELIVERED:</Label>
                <Input
                  id="dateShippedDelivered"
                  type="date"
                  value={formData.dateShippedDelivered}
                  onChange={(e) => handleInputChange('dateShippedDelivered', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="serialNumbers" className="text-sm font-semibold">SERIAL NUMBER(S):</Label>
                <Input
                  id="serialNumbers"
                  value={formData.serialNumbers}
                  onChange={(e) => handleInputChange('serialNumbers', e.target.value)}
                  className="mt-1"
                  placeholder="Enter serial numbers..."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-semibold">DESCRIPTION:</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="mt-1"
                rows={3}
                placeholder="Enter product description..."
              />
            </div>

            <div>
              <Label htmlFor="specialProcesses" className="text-sm font-semibold">SPECIAL PROCESSES:</Label>
              <Input
                id="specialProcesses"
                value={formData.specialProcesses}
                onChange={(e) => handleInputChange('specialProcesses', e.target.value)}
                className="mt-1"
              />
            </div>

            <Separator />

            {/* Certification Text */}
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
              <div>
                <Label htmlFor="certificationText" className="text-sm font-semibold">Certification Statement:</Label>
                <Textarea
                  id="certificationText"
                  value={formData.certificationText}
                  onChange={(e) => handleInputChange('certificationText', e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="otherDataText" className="text-sm font-semibold">Additional Information:</Label>
                <Textarea
                  id="otherDataText"
                  value={formData.otherDataText}
                  onChange={(e) => handleInputChange('otherDataText', e.target.value)}
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            {/* Signature Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Signature & Authorization</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="signerTitle" className="text-sm font-semibold">Title:</Label>
                  <Input
                    id="signerTitle"
                    value={formData.signerTitle}
                    onChange={(e) => handleInputChange('signerTitle', e.target.value)}
                    className="mt-1"
                    placeholder="Enter signer title..."
                  />
                </div>
                
                <div>
                  <Label className="text-sm font-semibold">Date:</Label>
                  <div className="mt-1 text-sm p-2 bg-gray-100 rounded">
                    {formData.signatureDate || 'Date will appear when signature is saved'}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold mb-2 block">Digital Signature:</Label>
                <div className="border border-gray-300 rounded-lg p-4 bg-white">
                  <SignatureCanvas
                    ref={signatureCanvasRef}
                    canvasProps={{
                      width: 400,
                      height: 150,
                      className: 'signature-canvas border border-gray-200 rounded'
                    }}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button type="button" onClick={handleSaveSignature} size="sm">
                      Save Signature
                    </Button>
                    <Button type="button" onClick={handleClearSignature} variant="outline" size="sm">
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

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
                Submit Certificate
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
              FO Form 6 - Version 2.2 08/14/2024
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}