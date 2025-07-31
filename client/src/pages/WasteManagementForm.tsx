
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';

export default function WasteManagementForm() {
  const [formData, setFormData] = useState({
    // Company Information
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    
    // Waste Generation Information
    wasteTypes: [],
    estimatedVolume: '',
    currentDisposalMethod: '',
    frequencyOfService: '',
    containerTypes: [],
    specialRequirements: '',
    
    // Environmental Compliance
    regulatoryRequirements: '',
    permitNumbers: '',
    previousViolations: false,
    violationDetails: '',
    
    // Service Requirements
    preferredServiceDays: [],
    accessRequirements: '',
    safetyConsiderations: '',
    equipmentNeeds: '',
    
    // Additional Information
    budgetRange: '',
    timeline: '',
    additionalNotes: '',
    
    // Signatures
    customerSignature: '',
    customerDate: '',
    salesRepSignature: '',
    salesRepDate: ''
  });

  const wasteTypeOptions = [
    'General Waste',
    'Recyclables',
    'Hazardous Materials',
    'Electronic Waste',
    'Organic Waste',
    'Construction Debris',
    'Medical Waste',
    'Chemical Waste',
    'Other'
  ];

  const containerTypeOptions = [
    'Dumpster (2 yard)',
    'Dumpster (4 yard)',
    'Dumpster (6 yard)',
    'Dumpster (8 yard)',
    'Roll-off Container',
    'Compactor',
    'Recycling Bins',
    'Specialized Containers'
  ];

  const serviceDayOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: string, value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.companyName || !formData.contactPerson || !formData.phone) {
      toast.error('Please fill in required company information');
      return;
    }

    // Here you would typically send the data to your backend
    console.log('Waste Management Form Data:', formData);
    toast.success('Waste Management Discovery Form submitted successfully!');
    
    // Reset form or redirect as needed
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Waste Management Discovery Form
          </CardTitle>
          <p className="text-gray-600">Date: July 31, 2025</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Company Information Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
                Company Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="contactPerson">Contact Person *</Label>
                  <Input
                    id="contactPerson"
                    value={formData.contactPerson}
                    onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Waste Generation Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
                Waste Generation Information
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label>Types of Waste Generated (check all that apply)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                    {wasteTypeOptions.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={type}
                          checked={formData.wasteTypes.includes(type)}
                          onCheckedChange={(checked) => 
                            handleArrayChange('wasteTypes', type, checked)
                          }
                        />
                        <Label htmlFor={type} className="text-sm">{type}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estimatedVolume">Estimated Volume (per week)</Label>
                    <Input
                      id="estimatedVolume"
                      value={formData.estimatedVolume}
                      onChange={(e) => handleInputChange('estimatedVolume', e.target.value)}
                      placeholder="e.g., 10 cubic yards"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currentDisposalMethod">Current Disposal Method</Label>
                    <Input
                      id="currentDisposalMethod"
                      value={formData.currentDisposalMethod}
                      onChange={(e) => handleInputChange('currentDisposalMethod', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="frequencyOfService">Preferred Service Frequency</Label>
                  <Select onValueChange={(value) => handleInputChange('frequencyOfService', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="twice-weekly">Twice Weekly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="on-call">On-Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Container Types Needed (check all that apply)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                    {containerTypeOptions.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={type}
                          checked={formData.containerTypes.includes(type)}
                          onCheckedChange={(checked) => 
                            handleArrayChange('containerTypes', type, checked)
                          }
                        />
                        <Label htmlFor={type} className="text-sm">{type}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="specialRequirements">Special Requirements or Considerations</Label>
                  <Textarea
                    id="specialRequirements"
                    value={formData.specialRequirements}
                    onChange={(e) => handleInputChange('specialRequirements', e.target.value)}
                    placeholder="Describe any special handling, access requirements, or other considerations"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Environmental Compliance */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
                Environmental Compliance
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="regulatoryRequirements">Regulatory Requirements</Label>
                  <Textarea
                    id="regulatoryRequirements"
                    value={formData.regulatoryRequirements}
                    onChange={(e) => handleInputChange('regulatoryRequirements', e.target.value)}
                    placeholder="List any specific environmental regulations that apply to your business"
                  />
                </div>

                <div>
                  <Label htmlFor="permitNumbers">Permit Numbers (if applicable)</Label>
                  <Input
                    id="permitNumbers"
                    value={formData.permitNumbers}
                    onChange={(e) => handleInputChange('permitNumbers', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="previousViolations"
                      checked={formData.previousViolations}
                      onCheckedChange={(checked) => handleInputChange('previousViolations', checked)}
                    />
                    <Label htmlFor="previousViolations">
                      Have there been any previous environmental violations?
                    </Label>
                  </div>
                  
                  {formData.previousViolations && (
                    <div>
                      <Label htmlFor="violationDetails">Violation Details</Label>
                      <Textarea
                        id="violationDetails"
                        value={formData.violationDetails}
                        onChange={(e) => handleInputChange('violationDetails', e.target.value)}
                        placeholder="Please describe the nature and resolution of any violations"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Service Requirements */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
                Service Requirements
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label>Preferred Service Days (check all that apply)</Label>
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mt-2">
                    {serviceDayOptions.map((day) => (
                      <div key={day} className="flex items-center space-x-2">
                        <Checkbox
                          id={day}
                          checked={formData.preferredServiceDays.includes(day)}
                          onCheckedChange={(checked) => 
                            handleArrayChange('preferredServiceDays', day, checked)
                          }
                        />
                        <Label htmlFor={day} className="text-sm">{day}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="accessRequirements">Site Access Requirements</Label>
                  <Textarea
                    id="accessRequirements"
                    value={formData.accessRequirements}
                    onChange={(e) => handleInputChange('accessRequirements', e.target.value)}
                    placeholder="Describe any access restrictions, gate codes, or special instructions"
                  />
                </div>

                <div>
                  <Label htmlFor="safetyConsiderations">Safety Considerations</Label>
                  <Textarea
                    id="safetyConsiderations"
                    value={formData.safetyConsiderations}
                    onChange={(e) => handleInputChange('safetyConsiderations', e.target.value)}
                    placeholder="List any safety hazards or special precautions required on-site"
                  />
                </div>

                <div>
                  <Label htmlFor="equipmentNeeds">Equipment Needs</Label>
                  <Textarea
                    id="equipmentNeeds"
                    value={formData.equipmentNeeds}
                    onChange={(e) => handleInputChange('equipmentNeeds', e.target.value)}
                    placeholder="Describe any specific equipment requirements or preferences"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Additional Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
                Additional Information
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="budgetRange">Budget Range</Label>
                  <Select onValueChange={(value) => handleInputChange('budgetRange', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select budget range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under-500">Under $500/month</SelectItem>
                      <SelectItem value="500-1000">$500 - $1,000/month</SelectItem>
                      <SelectItem value="1000-2500">$1,000 - $2,500/month</SelectItem>
                      <SelectItem value="2500-5000">$2,500 - $5,000/month</SelectItem>
                      <SelectItem value="over-5000">Over $5,000/month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="timeline">Implementation Timeline</Label>
                  <Select onValueChange={(value) => handleInputChange('timeline', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timeline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate (within 1 week)</SelectItem>
                      <SelectItem value="1-month">Within 1 month</SelectItem>
                      <SelectItem value="1-3-months">1-3 months</SelectItem>
                      <SelectItem value="3-6-months">3-6 months</SelectItem>
                      <SelectItem value="future">Future consideration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="additionalNotes">Additional Notes or Comments</Label>
                  <Textarea
                    id="additionalNotes"
                    value={formData.additionalNotes}
                    onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
                    placeholder="Any additional information that would be helpful for our assessment"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Signatures */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">
                Signatures
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Customer Information</h4>
                  <div>
                    <Label htmlFor="customerSignature">Customer Signature</Label>
                    <Input
                      id="customerSignature"
                      value={formData.customerSignature}
                      onChange={(e) => handleInputChange('customerSignature', e.target.value)}
                      placeholder="Type full name for electronic signature"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerDate">Date</Label>
                    <Input
                      id="customerDate"
                      type="date"
                      value={formData.customerDate}
                      onChange={(e) => handleInputChange('customerDate', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">Sales Representative</h4>
                  <div>
                    <Label htmlFor="salesRepSignature">Sales Rep Signature</Label>
                    <Input
                      id="salesRepSignature"
                      value={formData.salesRepSignature}
                      onChange={(e) => handleInputChange('salesRepSignature', e.target.value)}
                      placeholder="Type full name for electronic signature"
                    />
                  </div>
                  <div>
                    <Label htmlFor="salesRepDate">Date</Label>
                    <Input
                      id="salesRepDate"
                      type="date"
                      value={formData.salesRepDate}
                      onChange={(e) => handleInputChange('salesRepDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center pt-6">
              <Button type="submit" className="px-8 py-2">
                Submit Discovery Form
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
