import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Printer, Download, Save } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChemicalEntry {
  id: string;
  chemicalName: string;
  quantity: string;
  containerSize: string;
  sds: string;
}

export default function WasteManagementForm() {
  const [formData, setFormData] = useState({
    generatorPickupAddress: '',
    customerNameAndPhone: '',
    treatmentRestrictions: '',
    additionalComments: ''
  });

  const [chemicalEntries, setChemicalEntries] = useState<ChemicalEntry[]>([
    { id: '1', chemicalName: '', quantity: '', containerSize: '', sds: '' },
    { id: '2', chemicalName: '', quantity: '', containerSize: '', sds: '' },
    { id: '3', chemicalName: '', quantity: '', containerSize: '', sds: '' },
    { id: '4', chemicalName: '', quantity: '', containerSize: '', sds: '' },
    { id: '5', chemicalName: '', quantity: '', containerSize: '', sds: '' }
  ]);

  const handleFormDataChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleChemicalEntryChange = (id: string, field: keyof ChemicalEntry, value: string) => {
    setChemicalEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  const addChemicalEntry = () => {
    const newId = (chemicalEntries.length + 1).toString();
    setChemicalEntries(prev => [...prev, {
      id: newId,
      chemicalName: '',
      quantity: '',
      containerSize: '',
      sds: ''
    }]);
  };

  const removeChemicalEntry = (id: string) => {
    if (chemicalEntries.length > 1) {
      setChemicalEntries(prev => prev.filter(entry => entry.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submissionData = {
      ...formData,
      chemicals: chemicalEntries.filter(entry => entry.chemicalName.trim() !== ''),
      submittedAt: new Date().toISOString()
    };

    console.log('Waste Management Discovery Form Data:', submissionData);
    toast.success('Waste Management Discovery Form submitted successfully!');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSave = () => {
    const submissionData = {
      ...formData,
      chemicals: chemicalEntries,
      savedAt: new Date().toISOString()
    };
    
    localStorage.setItem('wasteManagementForm', JSON.stringify(submissionData));
    toast.success('Form saved successfully!');
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl print:max-w-none print:px-0">
      <Card className="print:shadow-none print:border-none">
        <CardHeader className="text-center pb-6 print:pb-4">
          <div className="flex justify-between items-start mb-4 print:hidden">
            <div className="flex gap-2">
              <Button onClick={handleSave} variant="outline" size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button onClick={handlePrint} variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">WM Sales Rep:</p>
              <p className="text-sm">Scott Robertson</p>
            </div>
          </div>
          
          <CardTitle className="text-2xl font-bold text-gray-900 mb-2">
            Waste Management Discovery Form
          </CardTitle>
          <p className="text-lg font-medium text-gray-700">
            Waste Inventory for Disposal
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Basic Information Fields */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="generatorPickupAddress" className="text-sm font-medium">
                  Generator / Pick Up Address:
                </Label>
                <Input
                  id="generatorPickupAddress"
                  value={formData.generatorPickupAddress}
                  onChange={(e) => handleFormDataChange('generatorPickupAddress', e.target.value)}
                  className="mt-1 border-b-2 border-l-0 border-r-0 border-t-0 rounded-none focus:border-blue-500 bg-transparent"
                  placeholder="Enter generator or pickup address"
                />
              </div>

              <div>
                <Label htmlFor="customerNameAndPhone" className="text-sm font-medium">
                  Customer Name and Phone Number:
                </Label>
                <Input
                  id="customerNameAndPhone"
                  value={formData.customerNameAndPhone}
                  onChange={(e) => handleFormDataChange('customerNameAndPhone', e.target.value)}
                  className="mt-1 border-b-2 border-l-0 border-r-0 border-t-0 rounded-none focus:border-blue-500 bg-transparent"
                  placeholder="Enter customer name and phone number"
                />
              </div>

              <div>
                <Label htmlFor="treatmentRestrictions" className="text-sm font-medium">
                  Treatment Restrictions:
                </Label>
                <Input
                  id="treatmentRestrictions"
                  value={formData.treatmentRestrictions}
                  onChange={(e) => handleFormDataChange('treatmentRestrictions', e.target.value)}
                  className="mt-1 border-b-2 border-l-0 border-r-0 border-t-0 rounded-none focus:border-blue-500 bg-transparent"
                  placeholder="Enter any treatment restrictions"
                />
              </div>
            </div>

            <Separator className="my-6" />

            {/* Chemical Inventory Table */}
            <div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-sm py-2 px-1 border-b-2 border-gray-300">
                        Chemical Name (Product Manufacturer / Name)
                      </th>
                      <th className="text-center font-medium text-sm py-2 px-1 border-b-2 border-gray-300 w-20">
                        Quantity
                      </th>
                      <th className="text-center font-medium text-sm py-2 px-1 border-b-2 border-gray-300 w-24">
                        Container Size
                      </th>
                      <th className="text-center font-medium text-sm py-2 px-1 border-b-2 border-gray-300 w-16">
                        SDS
                      </th>
                      <th className="w-12 print:hidden"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chemicalEntries.map((entry, index) => (
                      <tr key={entry.id} className="border-b border-gray-200">
                        <td className="py-2 px-1">
                          <Input
                            value={entry.chemicalName}
                            onChange={(e) => handleChemicalEntryChange(entry.id, 'chemicalName', e.target.value)}
                            className="border-0 bg-transparent focus:bg-gray-50 focus:ring-1 focus:ring-blue-500 text-sm h-8"
                            placeholder="Enter chemical name or product"
                          />
                        </td>
                        <td className="py-2 px-1">
                          <Input
                            value={entry.quantity}
                            onChange={(e) => handleChemicalEntryChange(entry.id, 'quantity', e.target.value)}
                            className="border-0 bg-transparent focus:bg-gray-50 focus:ring-1 focus:ring-blue-500 text-sm h-8 text-center"
                            placeholder="Qty"
                          />
                        </td>
                        <td className="py-2 px-1">
                          <Input
                            value={entry.containerSize}
                            onChange={(e) => handleChemicalEntryChange(entry.id, 'containerSize', e.target.value)}
                            className="border-0 bg-transparent focus:bg-gray-50 focus:ring-1 focus:ring-blue-500 text-sm h-8 text-center"
                            placeholder="Size"
                          />
                        </td>
                        <td className="py-2 px-1">
                          <Input
                            value={entry.sds}
                            onChange={(e) => handleChemicalEntryChange(entry.id, 'sds', e.target.value)}
                            className="border-0 bg-transparent focus:bg-gray-50 focus:ring-1 focus:ring-blue-500 text-sm h-8 text-center"
                            placeholder="Y/N"
                          />
                        </td>
                        <td className="py-2 px-1 print:hidden">
                          {chemicalEntries.length > 1 && (
                            <Button
                              type="button"
                              onClick={() => removeChemicalEntry(entry.id)}
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                            >
                              ×
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 print:hidden">
                <Button
                  type="button"
                  onClick={addChemicalEntry}
                  variant="outline"
                  size="sm"
                >
                  Add Chemical Entry
                </Button>
              </div>
            </div>

            <Separator className="my-6" />

            {/* Additional Comments */}
            <div>
              <Label htmlFor="additionalComments" className="text-sm font-medium mb-2 block">
                Additional Comments:
              </Label>
              <Textarea
                id="additionalComments"
                value={formData.additionalComments}
                onChange={(e) => handleFormDataChange('additionalComments', e.target.value)}
                className="min-h-32 border-2 border-gray-200 focus:border-blue-500 resize-none"
                placeholder="Enter any additional comments or special instructions..."
              />
            </div>

            {/* Submit Button */}
            <div className="pt-6 print:hidden">
              <div className="flex gap-4 justify-center">
                <Button type="submit" className="px-8">
                  Submit Form
                </Button>
                <Button type="button" onClick={handleSave} variant="outline" className="px-8">
                  Save Draft
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { margin: 0; }
          .print\\:max-w-none { max-width: none !important; }
          .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:hidden { display: none !important; }
          .print\\:pb-4 { padding-bottom: 1rem !important; }
          table { page-break-inside: avoid; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}