import { useState } from 'react';
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

export default function PurchaseReviewChecklist() {
  const [formData, setFormData] = useState({
    // Section A - Customer Information
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
    paymentTerms: '',
    earlyPayDiscount: '',
    paymentMethod: '',
    paymentMethodOther: '',

    // Section B - Service/Product Requested and Prices
    outsideServices: '',
    quantityRequested: '',
    unitOfMeasure: '',
    unitPrice: '',
    toolingPrice: '',
    additionalItems: '',
    additionalCost: '',
    amount: '',
    disbursementSchedule: '',
    
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleSave = () => {
    console.log('Saving form data:', formData);
    // TODO: Implement save functionality
  };

  const handlePrint = () => {
    window.print();
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

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea 
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                rows={2}
              />
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
                <Input 
                  id="paymentTerms"
                  value={formData.paymentTerms}
                  onChange={(e) => handleInputChange('paymentTerms', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="earlyPayDiscount">Early Pay & Discount Requested</Label>
                <Input 
                  id="earlyPayDiscount"
                  value={formData.earlyPayDiscount}
                  onChange={(e) => handleInputChange('earlyPayDiscount', e.target.value)}
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
                  value={formData.quantityRequested}
                  onChange={(e) => handleInputChange('quantityRequested', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                <Input 
                  id="unitOfMeasure"
                  value={formData.unitOfMeasure}
                  onChange={(e) => handleInputChange('unitOfMeasure', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="unitPrice">Unit Price</Label>
                <Input 
                  id="unitPrice"
                  value={formData.unitPrice}
                  onChange={(e) => handleInputChange('unitPrice', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="toolingPrice">Tooling Price</Label>
                <Input 
                  id="toolingPrice"
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
                <Label htmlFor="additionalCost">Cost</Label>
                <Input 
                  id="additionalCost"
                  value={formData.additionalCost}
                  onChange={(e) => handleInputChange('additionalCost', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input 
                  id="amount"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="disbursementSchedule">Disbursement Schedule</Label>
              <Input 
                id="disbursementSchedule"
                value={formData.disbursementSchedule}
                onChange={(e) => handleInputChange('disbursementSchedule', e.target.value)}
              />
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
                />
              </div>
              <div>
                <Label htmlFor="acceptanceTimeframe">Acceptance Timeframe</Label>
                <Input 
                  id="acceptanceTimeframe"
                  value={formData.acceptanceTimeframe}
                  onChange={(e) => handleInputChange('acceptanceTimeframe', e.target.value)}
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
                <Input 
                  id="shippingCompany"
                  value={formData.shippingCompany}
                  onChange={(e) => handleInputChange('shippingCompany', e.target.value)}
                />
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
                <Label htmlFor="signature">Signature</Label>
                <Input 
                  id="signature"
                  value={formData.signature}
                  onChange={(e) => handleInputChange('signature', e.target.value)}
                  placeholder="Digital signature or name"
                />
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

        <div className="text-center mt-8 mb-4">
          <p className="text-sm text-gray-500">FO Form 12 • Version 1.4 07/22/2025</p>
        </div>
      </div>
    </div>
  );
}