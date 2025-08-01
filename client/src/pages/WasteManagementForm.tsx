import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Download, Save, Plus } from 'lucide-react';
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

  // Predefined chemical list that can be expanded
  const [availableChemicals, setAvailableChemicals] = useState<string[]>([
    'Acetone',
    'Benzene',
    'Chloroform',
    'Ethanol',
    'Formaldehyde',
    'Hydrochloric Acid',
    'Methanol',
    'Paint Thinner',
    'Solvent',
    'Toluene',
    'Xylene'
  ]);

  const [newChemicalInput, setNewChemicalInput] = useState<{ [key: string]: string }>({});
  const [showAddChemical, setShowAddChemical] = useState<{ [key: string]: boolean }>({});

  // Load saved chemicals from localStorage on component mount
  useEffect(() => {
    const savedChemicals = localStorage.getItem('wasteManagementChemicals');
    if (savedChemicals) {
      try {
        const parsed = JSON.parse(savedChemicals);
        setAvailableChemicals(prev => {
          const combined = [...prev, ...parsed];
          return [...new Set(combined)]; // Remove duplicates
        });
      } catch (error) {
        console.error('Error loading saved chemicals:', error);
      }
    }
  }, []);

  // Save chemicals to localStorage whenever the list changes
  const saveChemicalsToStorage = (chemicals: string[]) => {
    const customChemicals = chemicals.filter(chem => 
      !['Acetone', 'Benzene', 'Chloroform', 'Ethanol', 'Formaldehyde', 
        'Hydrochloric Acid', 'Methanol', 'Paint Thinner', 'Solvent', 
        'Toluene', 'Xylene'].includes(chem)
    );
    localStorage.setItem('wasteManagementChemicals', JSON.stringify(customChemicals));
  };

  const handleFormDataChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleChemicalEntryChange = (id: string, field: keyof ChemicalEntry, value: string) => {
    setChemicalEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  const addNewChemical = (entryId: string) => {
    const newChemical = newChemicalInput[entryId]?.trim();
    if (newChemical && !availableChemicals.includes(newChemical)) {
      const updatedChemicals = [...availableChemicals, newChemical].sort();
      setAvailableChemicals(updatedChemicals);
      saveChemicalsToStorage(updatedChemicals);
      
      // Set this chemical for the current entry
      handleChemicalEntryChange(entryId, 'chemicalName', newChemical);
      
      // Clear the input and hide the add form
      setNewChemicalInput(prev => ({ ...prev, [entryId]: '' }));
      setShowAddChemical(prev => ({ ...prev, [entryId]: false }));
      
      toast.success(`Added "${newChemical}" to chemical database`);
    } else if (availableChemicals.includes(newChemical)) {
      toast.error('Chemical already exists in the list');
    }
  };

  const cancelAddChemical = (entryId: string) => {
    setNewChemicalInput(prev => ({ ...prev, [entryId]: '' }));
    setShowAddChemical(prev => ({ ...prev, [entryId]: false }));
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
                          {!showAddChemical[entry.id] ? (
                            <div className="flex items-center gap-1">
                              <Select 
                                value={entry.chemicalName} 
                                onValueChange={(value) => {
                                  if (value === '__add_new__') {
                                    setShowAddChemical(prev => ({ ...prev, [entry.id]: true }));
                                  } else {
                                    handleChemicalEntryChange(entry.id, 'chemicalName', value);
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 border-0 bg-transparent focus:bg-gray-50 focus:ring-1 focus:ring-blue-500 text-sm">
                                  <SelectValue placeholder="Select or add chemical" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableChemicals.map((chemical) => (
                                    <SelectItem key={chemical} value={chemical}>
                                      {chemical}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="__add_new__" className="text-blue-600 font-medium">
                                    <div className="flex items-center gap-2">
                                      <Plus className="h-4 w-4" />
                                      Add New Chemical
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              {entry.chemicalName && (
                                <Button
                                  type="button"
                                  onClick={() => setShowAddChemical(prev => ({ ...prev, [entry.id]: true }))}
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                                  title="Add new chemical"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Input
                                value={newChemicalInput[entry.id] || ''}
                                onChange={(e) => setNewChemicalInput(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                className="border border-blue-300 bg-blue-50 focus:bg-white focus:ring-1 focus:ring-blue-500 text-sm h-8 flex-1"
                                placeholder="Enter new chemical name"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addNewChemical(entry.id);
                                  } else if (e.key === 'Escape') {
                                    cancelAddChemical(entry.id);
                                  }
                                }}
                                autoFocus
                              />
                              <Button
                                type="button"
                                onClick={() => addNewChemical(entry.id)}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                                title="Add chemical"
                              >
                                ✓
                              </Button>
                              <Button
                                type="button"
                                onClick={() => cancelAddChemical(entry.id)}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-600 hover:text-red-800"
                                title="Cancel"
                              >
                                ×
                              </Button>
                            </div>
                          )}
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