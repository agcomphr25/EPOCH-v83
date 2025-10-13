import { useState, useEffect, useRef } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save, Printer, Download, FileText } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';

// SmartyStreets address autocomplete hook
const useSmartyStreetsAutocomplete = (query: string) => {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 3) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch('/api/address/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      } catch (error) {
        console.error('Address autocomplete error:', error);
        setSuggestions([]);
      }
      setIsLoading(false);
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  return { suggestions, isLoading };
};

export default function PurchaseReviewChecklist() {
  // Signature canvas reference
  const signatureCanvasRef = useRef<SignatureCanvas>(null);

  // Fetch P2 customers for dropdown including ship-to information
  const { data: p2Customers = [] } = useQuery({
    queryKey: ['/api/p2/customers'],
    select: (data: any[]) => data.map(customer => ({
      id: customer.id,
      customerId: customer.customerId,
      customerName: customer.customerName,
      shipToAddress: customer.shipToAddress
    }))
  });

  // Address autocomplete state
  const [addressQuery, setAddressQuery] = useState('');
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const { suggestions: addressSuggestions } = useSmartyStreetsAutocomplete(addressQuery);

  const [formData, setFormData] = useState({
    // Section A - Customer Information - moved customerId to top
    customerId: '',
    existingCustomer: '',
    significantChanges: '',
    companyName: '',
    address: '',
    contractingOfficer: '',
    phone: '',
    email: '',
    ffl: '',
    fflCopyOnHand: '',
    creditCheckAuth: '',
    creditApproval: '',
    poNumber: '',
    contractNumber: '',
    invoiceRemittance: '',
    paymentTerms: 'Net 30', // Set default
    earlyPayDiscount: 'N/A', // Set to N/A as requested
    paymentMethod: '',
    paymentMethodOther: '',

    // Section B - Service/Product Requested and Prices
    outsideServices: '',
    quantityRequested: '0',
    unitOfMeasure: '',
    unitPrice: '0',
    toolingPrice: '0',
    additionalItems: '',
    additionalCost: '0',
    amount: '0', // Will be calculated
    disbursementSchedule: 'As Delivered', // Set default
    
    // Level 1 Assembly
    level1ItemNumber: '',
    level1PartsKits: '',
    level1Exhibits: '',
    
    // Level 2 CNC
    level2ItemNumber: '',
    level2PartsKits: '',
    level2Programming: '',
    
    // Level 3 Manufacturing
    level3ItemNumber: '',
    level3PartsKits: '',
    level3Exhibits: '',

    // Section C - Description/Specifications
    criticalSafetyItems: '',
    qualityRequirements: '',
    acceptanceRejectionCriteria: '',
    verificationOperations: '',
    verificationRequirements: '',
    verificationSequence: '',
    measurementResults: '',
    measurementEquipment: '',
    specialInstructions: '',
    materialSourcing: '',
    optionalDesignElements: '',
    tolerancesProvided: '',

    // Section D - Inspection and Acceptance
    firstArticleQuantity: '',
    firstArticleDueDate: '',
    inspectionLocation: '',
    acceptanceTimeframe: '',

    // Section E - Shipping
    specialPackaging: '',
    specialMarking: '',
    fobType: '',
    shippingCompany: '',
    clientAccountNumber: '',
    shippingType: '',
    deliverySchedule: '',
    shipToInformation: '',

    // Section F - Special Contract Requirements
    certifications: [] as string[],
    retentionRequirements: '',
    dpasRating: '',
    
    // Reviewers
    reviewerName: '',
    reviewerTitle: '',
    acceptance: '',
    signature: '',
    date: ''
  });

  // Calculate amount when quantity, unit price, tooling, or additional cost changes
  useEffect(() => {
    const quantity = parseFloat(formData.quantityRequested) || 0;
    const unitPrice = parseFloat(formData.unitPrice) || 0;
    const tooling = parseFloat(formData.toolingPrice) || 0;
    const additional = parseFloat(formData.additionalCost) || 0;
    
    const calculatedAmount = (quantity * unitPrice) + tooling + additional;
    
    setFormData(prev => ({
      ...prev,
      amount: calculatedAmount.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })
    }));
  }, [formData.quantityRequested, formData.unitPrice, formData.toolingPrice, formData.additionalCost]);

  // Auto-set First Article fields to N/A when quantity is 0
  useEffect(() => {
    const quantity = parseFloat(formData.firstArticleQuantity) || 0;
    if (quantity === 0) {
      setFormData(prev => ({
        ...prev,
        firstArticleDueDate: 'N/A',
        inspectionLocation: 'N/A',
        acceptanceTimeframe: 'N/A'
      }));
    }
  }, [formData.firstArticleQuantity]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (value: string) => {
    setAddressQuery(value);
    handleInputChange('address', value);
    setShowAddressSuggestions(value.length >= 3);
  };

  const selectAddressSuggestion = (suggestion: any) => {
    console.log('Selected address suggestion:', suggestion);
    
    // Handle different possible data structures from SmartyStreets API
    const streetLine = suggestion.streetLine || suggestion.street_line || suggestion.street || '';
    const city = suggestion.city || '';
    const state = suggestion.state || '';
    const zipcode = suggestion.zipCode || suggestion.zipcode || '';
    
    const fullAddress = streetLine && city && state ? 
      `${streetLine}, ${city}, ${state}${zipcode ? ' ' + zipcode : ''}` :
      (suggestion.text || streetLine);
      
    handleInputChange('address', fullAddress);
    setAddressQuery(fullAddress);
    setShowAddressSuggestions(false);
  };

  const handleCheckboxChange = (field: string, checked: boolean) => {
    if (field === 'certifications') {
      // Handle certifications array
      return;
    }
    setFormData(prev => ({ ...prev, [field]: checked ? 'Y' : 'N' }));
  };

  const handleCertificationChange = (certification: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      certifications: checked 
        ? [...prev.certifications, certification]
        : prev.certifications.filter(c => c !== certification)
    }));
  };

  // Handle customer selection to populate ship-to information
  const handleCustomerChange = (customerId: string) => {
    const selectedCustomer = p2Customers.find(c => c.customerId === customerId);
    setFormData(prev => ({
      ...prev,
      customerId,
      customerName: selectedCustomer?.customerName || '',
      shipToInformation: selectedCustomer?.shipToAddress || ''
    }));
  };

  // Clear signature
  const clearSignature = () => {
    if (signatureCanvasRef.current) {
      signatureCanvasRef.current.clear();
    }
  };

  // Save signature as base64
  const saveSignature = () => {
    if (signatureCanvasRef.current) {
      const signatureData = signatureCanvasRef.current.toDataURL();
      setFormData(prev => ({ ...prev, signature: signatureData }));
    }
  };

  const handleSave = async () => {
    try {
      console.log('Saving form data:', formData);
      
      const checklistData = {
        customerId: formData.customerId || null,
        formData: formData,
        createdBy: 'current_user', // Replace with actual user context
        status: 'DRAFT' as const
      };

      const response = await fetch('/api/purchase-review-checklists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(checklistData)
      });

      if (!response.ok) {
        throw new Error('Failed to save checklist');
      }

      const result = await response.json();
      console.log('Checklist saved successfully:', result);
      
      // Show success message
      alert('Purchase Review Checklist saved successfully!');
    } catch (error) {
      console.error('Error saving checklist:', error);
      alert('Failed to save checklist. Please try again.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Handle form submission
  const handleSubmitChecklist = () => {
    // TODO: Implement form submission logic
    // For now, just show a placeholder message
    console.log('Purchase Review Checklist submitted:', formData);
    alert('Checklist submission functionality will be implemented soon.');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900">LLC</h1>
            <p className="text-sm text-gray-600">Responsive • Reliable • Supportive</p>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Purchase Review Checklist</h2>
          
          {/* Action Buttons */}
          <div className="flex justify-center gap-3 mb-6">
            <Button onClick={handleSave} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save Form
            </Button>
            <Button onClick={handlePrint} variant="outline" className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Customer Selection - Moved to top */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Customer Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="customerId">Select Customer</Label>
              <Select value={formData.customerId} onValueChange={handleCustomerChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {p2Customers.map(customer => (
                    <SelectItem key={customer.id} value={customer.customerId}>
                      {customer.customerName} ({customer.customerId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Section A - Customer Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Section A - Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>1. Is this an existing customer?</Label>
                <RadioGroup value={formData.existingCustomer} onValueChange={(value) => handleInputChange('existingCustomer', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="existing-y" />
                    <Label htmlFor="existing-y">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="existing-n" />
                    <Label htmlFor="existing-n">No</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>2. Are there any significant changes to products/services requested or new products?</Label>
                <RadioGroup value={formData.significantChanges} onValueChange={(value) => handleInputChange('significantChanges', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="changes-y" />
                    <Label htmlFor="changes-y">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="changes-n" />
                    <Label htmlFor="changes-n">No</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-gray-500">(If No complete Sections B, D, & F only)</p>
              </div>
            </div>

            <Separator className="my-4" />
            <h4 className="font-semibold">For New Customers, Products, and/or Services:</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="companyName">3. Company Name</Label>
                <Input 
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="contractingOfficer">Contracting Officer</Label>
                <Input 
                  id="contractingOfficer"
                  value={formData.contractingOfficer}
                  onChange={(e) => handleInputChange('contractingOfficer', e.target.value)}
                />
              </div>
            </div>

            <div className="relative">
              <Label htmlFor="address">Address</Label>
              <Textarea 
                id="address"
                value={formData.address}
                onChange={(e) => handleAddressChange(e.target.value)}
                rows={2}
                placeholder="Start typing address for autocomplete..."
              />
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  {addressSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                      onClick={() => selectAddressSuggestion(suggestion)}
                    >
                      <div className="font-medium">
                        {suggestion.streetLine || suggestion.street_line || suggestion.street || suggestion.text}
                      </div>
                      <div className="text-sm text-gray-600">
                        {(suggestion.city && suggestion.state) ? 
                          `${suggestion.city}, ${suggestion.state}${suggestion.zipCode || suggestion.zipcode ? ' ' + (suggestion.zipCode || suggestion.zipcode) : ''}` :
                          'Address information'
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input 
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>FFL</Label>
                <RadioGroup value={formData.ffl} onValueChange={(value) => handleInputChange('ffl', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="ffl-y" />
                    <Label htmlFor="ffl-y">Y</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="ffl-n" />
                    <Label htmlFor="ffl-n">N</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="NA" id="ffl-na" />
                    <Label htmlFor="ffl-na">N/A</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>FFL copy on hand?</Label>
                <RadioGroup value={formData.fflCopyOnHand} onValueChange={(value) => handleInputChange('fflCopyOnHand', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="ffl-copy-y" />
                    <Label htmlFor="ffl-copy-y">Y</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="ffl-copy-n" />
                    <Label htmlFor="ffl-copy-n">N</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="NA" id="ffl-copy-na" />
                    <Label htmlFor="ffl-copy-na">N/A</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Credit Check Authorization</Label>
                <RadioGroup value={formData.creditCheckAuth} onValueChange={(value) => handleInputChange('creditCheckAuth', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="credit-auth-y" />
                    <Label htmlFor="credit-auth-y">Y</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="credit-auth-n" />
                    <Label htmlFor="credit-auth-n">N</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="NA" id="credit-auth-na" />
                    <Label htmlFor="credit-auth-na">N/A</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Credit Approval</Label>
                <RadioGroup value={formData.creditApproval} onValueChange={(value) => handleInputChange('creditApproval', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="credit-approval-y" />
                    <Label htmlFor="credit-approval-y">Y</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="credit-approval-n" />
                    <Label htmlFor="credit-approval-n">N</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="NA" id="credit-approval-na" />
                    <Label htmlFor="credit-approval-na">N/A</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator className="my-4" />
            <h4 className="font-semibold">PO Verification:</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="poNumber">PO #</Label>
                <Input 
                  id="poNumber"
                  value={formData.poNumber}
                  onChange={(e) => handleInputChange('poNumber', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="contractNumber">Contract #/Procurement Instrument</Label>
                <Input 
                  id="contractNumber"
                  value={formData.contractNumber}
                  onChange={(e) => handleInputChange('contractNumber', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="invoiceRemittance">Invoice Remittance Information</Label>
              <Textarea 
                id="invoiceRemittance"
                value={formData.invoiceRemittance}
                onChange={(e) => handleInputChange('invoiceRemittance', e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paymentTerms">Payment Terms</Label>
                <Select value={formData.paymentTerms} onValueChange={(value) => handleInputChange('paymentTerms', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CIA">CIA</SelectItem>
                    <SelectItem value="Net 10">Net 10</SelectItem>
                    <SelectItem value="Net 20">Net 20</SelectItem>
                    <SelectItem value="Net 30">Net 30</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="earlyPayDiscount">Early Pay & Discount Requested</Label>
                <Input 
                  id="earlyPayDiscount"
                  value={formData.earlyPayDiscount}
                  onChange={(e) => handleInputChange('earlyPayDiscount', e.target.value)}
                  placeholder="Enter early pay discount terms or N/A"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Method of Payment</Label>
              <RadioGroup value={formData.paymentMethod} onValueChange={(value) => handleInputChange('paymentMethod', value)}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="electronic" id="payment-electronic" />
                    <Label htmlFor="payment-electronic">Electronic Funds</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="check" id="payment-check" />
                    <Label htmlFor="payment-check">Check</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="credit" id="payment-credit" />
                    <Label htmlFor="payment-credit">Credit Card</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="payment-other" />
                    <Label htmlFor="payment-other">Other</Label>
                  </div>
                </div>
              </RadioGroup>
              {formData.paymentMethod === 'other' && (
                <Input 
                  placeholder="Specify other payment method"
                  value={formData.paymentMethodOther}
                  onChange={(e) => handleInputChange('paymentMethodOther', e.target.value)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section B - Service/Product Requested and Prices */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Section B - Service/Product Requested and Prices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="outsideServices">Outside services required to complete job</Label>
                <Input 
                  id="outsideServices"
                  value={formData.outsideServices}
                  onChange={(e) => handleInputChange('outsideServices', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="quantityRequested">Quantity Requested</Label>
                <Input 
                  id="quantityRequested"
                  type="number"
                  min="1"
                  value={formData.quantityRequested}
                  onChange={(e) => handleInputChange('quantityRequested', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                <Select value={formData.unitOfMeasure} onValueChange={(value) => handleInputChange('unitOfMeasure', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ea">Each (ea)</SelectItem>
                    <SelectItem value="pc">Piece (pc)</SelectItem>
                    <SelectItem value="set">Set</SelectItem>
                    <SelectItem value="pair">Pair</SelectItem>
                    <SelectItem value="kit">Kit</SelectItem>
                    <SelectItem value="lot">Lot</SelectItem>
                    <SelectItem value="doz">Dozen (doz)</SelectItem>
                    <SelectItem value="pkg">Package (pkg)</SelectItem>
                    <SelectItem value="assy">Assembly (assy)</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="unitPrice">Unit Price ($)</Label>
                <Input 
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  value={formData.unitPrice}
                  onChange={(e) => handleInputChange('unitPrice', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="toolingPrice">Tooling Price ($)</Label>
                <Input 
                  id="toolingPrice"
                  type="number"
                  step="0.01"
                  value={formData.toolingPrice}
                  onChange={(e) => handleInputChange('toolingPrice', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="additionalItems">Add'l Items</Label>
                <Input 
                  id="additionalItems"
                  value={formData.additionalItems}
                  onChange={(e) => handleInputChange('additionalItems', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="additionalCost">Additional Cost ($)</Label>
                <Input 
                  id="additionalCost"
                  type="number"
                  step="0.01"
                  value={formData.additionalCost}
                  onChange={(e) => handleInputChange('additionalCost', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount (Calculated) ($)</Label>
                <Input 
                  id="amount"
                  value={`$${formData.amount}`}
                  disabled
                  className="bg-gray-100 font-medium"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="disbursementSchedule">Disbursement Schedule</Label>
              <Select value={formData.disbursementSchedule} onValueChange={(value) => handleInputChange('disbursementSchedule', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select disbursement schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Paid in Advance">Paid in Advance</SelectItem>
                  <SelectItem value="At Completion">At Completion</SelectItem>
                  <SelectItem value="As Delivered">As Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Level sections */}
            <div className="space-y-6">
              {/* Level 1 - Assembly */}
              <div className="border p-4 rounded">
                <h4 className="font-semibold mb-3">Level 1 - Assembly</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="level1ItemNumber">Item #</Label>
                    <Input 
                      id="level1ItemNumber"
                      value={formData.level1ItemNumber}
                      onChange={(e) => handleInputChange('level1ItemNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parts or Kits Provided</Label>
                    <RadioGroup value={formData.level1PartsKits} onValueChange={(value) => handleInputChange('level1PartsKits', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="level1-parts-y" />
                          <Label htmlFor="level1-parts-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="level1-parts-n" />
                          <Label htmlFor="level1-parts-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="level1-parts-na" />
                          <Label htmlFor="level1-parts-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Exhibits/Drawings Provided</Label>
                    <RadioGroup value={formData.level1Exhibits} onValueChange={(value) => handleInputChange('level1Exhibits', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="level1-exhibits-y" />
                          <Label htmlFor="level1-exhibits-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="level1-exhibits-n" />
                          <Label htmlFor="level1-exhibits-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="level1-exhibits-na" />
                          <Label htmlFor="level1-exhibits-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>

              {/* Level 2 - CNC */}
              <div className="border p-4 rounded">
                <h4 className="font-semibold mb-3">Level 2 - CNC</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="level2ItemNumber">Item #</Label>
                    <Input 
                      id="level2ItemNumber"
                      value={formData.level2ItemNumber}
                      onChange={(e) => handleInputChange('level2ItemNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parts or Kits Provided</Label>
                    <RadioGroup value={formData.level2PartsKits} onValueChange={(value) => handleInputChange('level2PartsKits', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="level2-parts-y" />
                          <Label htmlFor="level2-parts-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="level2-parts-n" />
                          <Label htmlFor="level2-parts-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="level2-parts-na" />
                          <Label htmlFor="level2-parts-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Programming Provided</Label>
                    <RadioGroup value={formData.level2Programming} onValueChange={(value) => handleInputChange('level2Programming', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="level2-programming-y" />
                          <Label htmlFor="level2-programming-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="level2-programming-n" />
                          <Label htmlFor="level2-programming-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="level2-programming-na" />
                          <Label htmlFor="level2-programming-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>

              {/* Level 3 - Manufacturing */}
              <div className="border p-4 rounded">
                <h4 className="font-semibold mb-3">Level 3 - Manufacturing</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="level3ItemNumber">Item #</Label>
                    <Input 
                      id="level3ItemNumber"
                      value={formData.level3ItemNumber}
                      onChange={(e) => handleInputChange('level3ItemNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parts or Kits Provided</Label>
                    <RadioGroup value={formData.level3PartsKits} onValueChange={(value) => handleInputChange('level3PartsKits', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="level3-parts-y" />
                          <Label htmlFor="level3-parts-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="level3-parts-n" />
                          <Label htmlFor="level3-parts-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="level3-parts-na" />
                          <Label htmlFor="level3-parts-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Exhibits Provided</Label>
                    <RadioGroup value={formData.level3Exhibits} onValueChange={(value) => handleInputChange('level3Exhibits', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="level3-exhibits-y" />
                          <Label htmlFor="level3-exhibits-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="level3-exhibits-n" />
                          <Label htmlFor="level3-exhibits-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="level3-exhibits-na" />
                          <Label htmlFor="level3-exhibits-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section C - Description/Specifications/Statement of Work */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Section C - Description/Specifications/Statement of Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Are critical safety items being ordered?</Label>
                <RadioGroup value={formData.criticalSafetyItems} onValueChange={(value) => handleInputChange('criticalSafetyItems', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="safety-y" />
                    <Label htmlFor="safety-y">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="safety-n" />
                    <Label htmlFor="safety-n">No</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Are the quality requirements included?</Label>
                <RadioGroup value={formData.qualityRequirements} onValueChange={(value) => handleInputChange('qualityRequirements', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="quality-y" />
                    <Label htmlFor="quality-y">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="quality-n" />
                    <Label htmlFor="quality-n">No</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div>
              <Label htmlFor="acceptanceRejectionCriteria">What are the acceptance/rejection criteria?</Label>
              <Textarea 
                id="acceptanceRejectionCriteria"
                value={formData.acceptanceRejectionCriteria}
                onChange={(e) => handleInputChange('acceptanceRejectionCriteria', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Are verification operations required?</Label>
              <RadioGroup value={formData.verificationOperations} onValueChange={(value) => handleInputChange('verificationOperations', value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Y" id="verification-y" />
                  <Label htmlFor="verification-y">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="N" id="verification-n" />
                  <Label htmlFor="verification-n">No</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="verificationRequirements">If YES, What are the verification requirements?</Label>
              <Textarea 
                id="verificationRequirements"
                value={formData.verificationRequirements}
                onChange={(e) => handleInputChange('verificationRequirements', e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="verificationSequence">Where in the manufacturing sequence are verification operations required?</Label>
              <Input 
                id="verificationSequence"
                value={formData.verificationSequence}
                onChange={(e) => handleInputChange('verificationSequence', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="measurementResults">What measurement results must be retained?</Label>
              <Textarea 
                id="measurementResults"
                value={formData.measurementResults}
                onChange={(e) => handleInputChange('measurementResults', e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="measurementEquipment">What specific monitoring and measurement equipment is required?</Label>
              <Textarea 
                id="measurementEquipment"
                value={formData.measurementEquipment}
                onChange={(e) => handleInputChange('measurementEquipment', e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Are there special instructions for the use of the required measuring instruments?</Label>
                <RadioGroup value={formData.specialInstructions} onValueChange={(value) => handleInputChange('specialInstructions', value)}>
                  <div className="flex space-x-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Y" id="special-instructions-y" />
                      <Label htmlFor="special-instructions-y">Y</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="N" id="special-instructions-n" />
                      <Label htmlFor="special-instructions-n">N</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="NA" id="special-instructions-na" />
                      <Label htmlFor="special-instructions-na">N/A</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Are there special instructions for material sourcing?</Label>
                <RadioGroup value={formData.materialSourcing} onValueChange={(value) => handleInputChange('materialSourcing', value)}>
                  <div className="flex space-x-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Y" id="material-sourcing-y" />
                      <Label htmlFor="material-sourcing-y">Y</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="N" id="material-sourcing-n" />
                      <Label htmlFor="material-sourcing-n">N</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Are there "optional" design elements?</Label>
                <RadioGroup value={formData.optionalDesignElements} onValueChange={(value) => handleInputChange('optionalDesignElements', value)}>
                  <div className="flex space-x-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Y" id="optional-design-y" />
                      <Label htmlFor="optional-design-y">Y</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="N" id="optional-design-n" />
                      <Label htmlFor="optional-design-n">N</Label>
                    </div>
                  </div>
                </RadioGroup>
                {formData.optionalDesignElements === 'Y' && (
                  <div className="mt-2">
                    <Label>If so, are tolerances provided?</Label>
                    <RadioGroup value={formData.tolerancesProvided} onValueChange={(value) => handleInputChange('tolerancesProvided', value)}>
                      <div className="flex space-x-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Y" id="tolerances-y" />
                          <Label htmlFor="tolerances-y">Y</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="N" id="tolerances-n" />
                          <Label htmlFor="tolerances-n">N</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NA" id="tolerances-na" />
                          <Label htmlFor="tolerances-na">N/A</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section D - Inspection and Acceptance */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Section D - Inspection and Acceptance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstArticleQuantity">First Article Quantity</Label>
                <Input 
                  id="firstArticleQuantity"
                  type="number"
                  min="0"
                  value={formData.firstArticleQuantity}
                  onChange={(e) => handleInputChange('firstArticleQuantity', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="firstArticleDueDate">First Article Due Date</Label>
                <Input 
                  id="firstArticleDueDate"
                  type="date"
                  value={formData.firstArticleDueDate}
                  onChange={(e) => handleInputChange('firstArticleDueDate', e.target.value)}
                  disabled={parseFloat(formData.firstArticleQuantity) === 0}
                  className={parseFloat(formData.firstArticleQuantity) === 0 ? "bg-gray-100" : ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inspectionLocation">Inspection Location</Label>
                <Input 
                  id="inspectionLocation"
                  value={formData.inspectionLocation}
                  onChange={(e) => handleInputChange('inspectionLocation', e.target.value)}
                  disabled={parseFloat(formData.firstArticleQuantity) === 0}
                  className={parseFloat(formData.firstArticleQuantity) === 0 ? "bg-gray-100" : ""}
                />
              </div>
              <div>
                <Label htmlFor="acceptanceTimeframe">Acceptance Timeframe</Label>
                <Input 
                  id="acceptanceTimeframe"
                  value={formData.acceptanceTimeframe}
                  onChange={(e) => handleInputChange('acceptanceTimeframe', e.target.value)}
                  disabled={parseFloat(formData.firstArticleQuantity) === 0}
                  className={parseFloat(formData.firstArticleQuantity) === 0 ? "bg-gray-100" : ""}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section E - Shipping */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Section E - Shipping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Are there special packaging instructions?</Label>
                <RadioGroup value={formData.specialPackaging} onValueChange={(value) => handleInputChange('specialPackaging', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="packaging-y" />
                    <Label htmlFor="packaging-y">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="packaging-n" />
                    <Label htmlFor="packaging-n">No</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Are there special marking instructions?</Label>
                <RadioGroup value={formData.specialMarking} onValueChange={(value) => handleInputChange('specialMarking', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Y" id="marking-y" />
                    <Label htmlFor="marking-y">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="N" id="marking-n" />
                    <Label htmlFor="marking-n">No</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-2">
              <Label>FOB</Label>
              <RadioGroup value={formData.fobType} onValueChange={(value) => handleInputChange('fobType', value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="destination" id="fob-destination" />
                  <Label htmlFor="fob-destination">Destination</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="origin" id="fob-origin" />
                  <Label htmlFor="fob-origin">Origin</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="shippingCompany">Shipping Company</Label>
                <Select value={formData.shippingCompany} onValueChange={(value) => handleInputChange('shippingCompany', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shipping company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPS">UPS</SelectItem>
                    <SelectItem value="FedEx">FedEx</SelectItem>
                    <SelectItem value="USPS">USPS</SelectItem>
                    <SelectItem value="N/A">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="clientAccountNumber">Client Account #</Label>
                <Input 
                  id="clientAccountNumber"
                  value={formData.clientAccountNumber}
                  onChange={(e) => handleInputChange('clientAccountNumber', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Shipping Type</Label>
              <RadioGroup value={formData.shippingType} onValueChange={(value) => handleInputChange('shippingType', value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="freight" id="shipping-freight" />
                  <Label htmlFor="shipping-freight">Freight</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="standard" id="shipping-standard" />
                  <Label htmlFor="shipping-standard">Standard</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="deliverySchedule">Delivery Schedule</Label>
              <Input 
                id="deliverySchedule"
                value={formData.deliverySchedule}
                onChange={(e) => handleInputChange('deliverySchedule', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="shipToInformation">Ship To Information</Label>
              <Textarea 
                id="shipToInformation"
                value={formData.shipToInformation}
                onChange={(e) => handleInputChange('shipToInformation', e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section F - Special Contract Requirements */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Section F - Special Contract Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">Certifications</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {['ISO9001', 'AS9100', 'ITAR', 'FFL', 'N/A'].map((cert) => (
                  <div key={cert} className="flex items-center space-x-2">
                    <Checkbox
                      id={`cert-${cert}`}
                      checked={formData.certifications.includes(cert)}
                      onCheckedChange={(checked) => handleCertificationChange(cert, checked as boolean)}
                    />
                    <Label htmlFor={`cert-${cert}`}>{cert}</Label>
                  </div>
                ))}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="cert-other"
                    checked={formData.certifications.some(c => !['ISO9001', 'AS9100', 'ITAR', 'FFL', 'N/A'].includes(c))}
                  />
                  <Label htmlFor="cert-other">Other:</Label>
                  <Input 
                    placeholder="Specify"
                    className="flex-1"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleCertificationChange(`Other: ${e.target.value}`, true);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="retentionRequirements">Retention Requirements</Label>
              <Input 
                id="retentionRequirements"
                value={formData.retentionRequirements}
                onChange={(e) => handleInputChange('retentionRequirements', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="dpasRating">DPAS Rating</Label>
              <div className="flex items-center space-x-2">
                <span>D</span>
                <Input 
                  id="dpasRating"
                  value={formData.dpasRating}
                  onChange={(e) => handleInputChange('dpasRating', e.target.value)}
                  className="w-32"
                  placeholder="__-___"
                />
                <div className="flex items-center space-x-2">
                  <Checkbox id="dpas-na" />
                  <Label htmlFor="dpas-na">N/A</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reviewers Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Reviewers Name and Authorization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reviewerName">Name/Title</Label>
                <Input 
                  id="reviewerName"
                  value={formData.reviewerName}
                  onChange={(e) => handleInputChange('reviewerName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Acceptance</Label>
                <RadioGroup value={formData.acceptance} onValueChange={(value) => handleInputChange('acceptance', value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Yes" id="acceptance-yes" />
                    <Label htmlFor="acceptance-yes">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="No" id="acceptance-no" />
                    <Label htmlFor="acceptance-no">No</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Digital Signature</Label>
                <div className="border border-gray-300 rounded-md p-2">
                  <SignatureCanvas
                    ref={signatureCanvasRef}
                    penColor="black"
                    canvasProps={{
                      width: 300,
                      height: 150,
                      className: 'signature-canvas border rounded'
                    }}
                    onEnd={saveSignature}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={clearSignature}>
                    Clear
                  </Button>
                  <Button size="sm" variant="outline" onClick={saveSignature}>
                    Save Signature
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input 
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-center mb-6">
          <Button 
            onClick={handleSubmitChecklist}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-medium"
            size="lg"
          >
            Submit Checklist
          </Button>
        </div>

        <div className="text-center mt-8 mb-4">
          <p className="text-sm text-gray-500">FO Form 12 • Version 1.4 07/22/2025</p>
        </div>
      </div>
    </div>
  );
}