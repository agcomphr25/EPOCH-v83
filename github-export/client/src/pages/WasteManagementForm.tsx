import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Printer, Download, Save, Plus, ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChemicalEntry {
  id: string;
  chemicalName: string;
  quantity: string;
  containerSize: string;
  sds: boolean;
}

export default function WasteManagementForm() {
  const [formData, setFormData] = useState({
    generatorPickupAddress: '',
    customerNameAndPhone: '',
    treatmentRestrictions: '',
    additionalComments: ''
  });

  const [chemicalEntries, setChemicalEntries] = useState<ChemicalEntry[]>([
    { id: '1', chemicalName: '', quantity: '', containerSize: '', sds: false },
    { id: '2', chemicalName: '', quantity: '', containerSize: '', sds: false },
    { id: '3', chemicalName: '', quantity: '', containerSize: '', sds: false },
    { id: '4', chemicalName: '', quantity: '', containerSize: '', sds: false },
    { id: '5', chemicalName: '', quantity: '', containerSize: '', sds: false }
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

  // Predefined container sizes that can be expanded
  const [availableContainerSizes, setAvailableContainerSizes] = useState<string[]>([
    '5 gal',
    '1 gal',
    'Pint',
    '55 gal drum',
    '30 gal drum',
    '5 gal bucket',
    'Quart',
    'Gallon jug'
  ]);

  const [newChemicalInput, setNewChemicalInput] = useState<{ [key: string]: string }>({});
  const [showAddChemical, setShowAddChemical] = useState<{ [key: string]: boolean }>({});
  const [newContainerSizeInput, setNewContainerSizeInput] = useState<{ [key: string]: string }>({});
  const [showAddContainerSize, setShowAddContainerSize] = useState<{ [key: string]: boolean }>({});
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);
  const [showSavedDrafts, setShowSavedDrafts] = useState(false);

  // Load saved chemicals and container sizes from localStorage on component mount
  useEffect(() => {
    const savedChemicals = localStorage.getItem('wasteManagementChemicals');
    if (savedChemicals) {
      try {
        const parsed = JSON.parse(savedChemicals);
        setAvailableChemicals(prev => {
          const combined = [...prev, ...parsed];
          return Array.from(new Set(combined)); // Remove duplicates
        });
      } catch (error) {
        console.error('Error loading saved chemicals:', error);
      }
    }

    const savedContainerSizes = localStorage.getItem('wasteManagementContainerSizes');
    if (savedContainerSizes) {
      try {
        const parsed = JSON.parse(savedContainerSizes);
        setAvailableContainerSizes(prev => {
          const combined = [...prev, ...parsed];
          return Array.from(new Set(combined)); // Remove duplicates
        });
      } catch (error) {
        console.error('Error loading saved container sizes:', error);
      }
    }

    // Load saved drafts
    loadSavedDrafts();
  }, []);

  const loadSavedDrafts = () => {
    const saved = localStorage.getItem('wasteManagementDrafts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedDrafts(parsed);
      } catch (error) {
        console.error('Error loading saved drafts:', error);
        setSavedDrafts([]);
      }
    }
  };

  // Save chemicals to localStorage whenever the list changes
  const saveChemicalsToStorage = (chemicals: string[]) => {
    const customChemicals = chemicals.filter(chem => 
      !['Acetone', 'Benzene', 'Chloroform', 'Ethanol', 'Formaldehyde', 
        'Hydrochloric Acid', 'Methanol', 'Paint Thinner', 'Solvent', 
        'Toluene', 'Xylene'].includes(chem)
    );
    localStorage.setItem('wasteManagementChemicals', JSON.stringify(customChemicals));
  };

  // Save container sizes to localStorage whenever the list changes
  const saveContainerSizesToStorage = (sizes: string[]) => {
    const customSizes = sizes.filter(size => 
      !['5 gal', '1 gal', 'Pint', '55 gal drum', '30 gal drum', 
        '5 gal bucket', 'Quart', 'Gallon jug'].includes(size)
    );
    localStorage.setItem('wasteManagementContainerSizes', JSON.stringify(customSizes));
  };

  const handleFormDataChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleChemicalEntryChange = (id: string, field: keyof ChemicalEntry, value: string | boolean) => {
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

  const addNewContainerSize = (entryId: string) => {
    const newSize = newContainerSizeInput[entryId]?.trim();
    if (newSize && !availableContainerSizes.includes(newSize)) {
      const updatedSizes = [...availableContainerSizes, newSize].sort();
      setAvailableContainerSizes(updatedSizes);
      saveContainerSizesToStorage(updatedSizes);
      
      // Set this size for the current entry
      handleChemicalEntryChange(entryId, 'containerSize', newSize);
      
      // Clear the input and hide the add form
      setNewContainerSizeInput(prev => ({ ...prev, [entryId]: '' }));
      setShowAddContainerSize(prev => ({ ...prev, [entryId]: false }));
      
      toast.success(`Added "${newSize}" to container sizes`);
    } else if (availableContainerSizes.includes(newSize)) {
      toast.error('Container size already exists in the list');
    }
  };

  const cancelAddContainerSize = (entryId: string) => {
    setNewContainerSizeInput(prev => ({ ...prev, [entryId]: '' }));
    setShowAddContainerSize(prev => ({ ...prev, [entryId]: false }));
  };

  const addChemicalEntry = () => {
    const newId = (chemicalEntries.length + 1).toString();
    setChemicalEntries(prev => [...prev, {
      id: newId,
      chemicalName: '',
      quantity: '',
      containerSize: '',
      sds: false
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
    const draftData = {
      formData,
      chemicalEntries: chemicalEntries.filter(entry => 
        entry.chemicalName || entry.quantity || entry.containerSize
      ),
      timestamp: new Date().toISOString(),
      id: Date.now(),
      title: `Draft - ${new Date().toLocaleString()}`
    };
    
    const existingDrafts = JSON.parse(localStorage.getItem('wasteManagementDrafts') || '[]');
    existingDrafts.push(draftData);
    localStorage.setItem('wasteManagementDrafts', JSON.stringify(existingDrafts));
    
    loadSavedDrafts(); // Refresh the drafts list
    toast.success('Draft saved successfully');
  };

  const loadDraft = (draft: any) => {
    setFormData(draft.formData);
    
    // Load the saved chemical entries and ensure we have at least 5 rows
    const loadedEntries = draft.chemicalEntries || [];
    const minEntries = 5;
    
    // Ensure proper ID sequence and minimum 5 entries
    const processedEntries = loadedEntries.map((entry: ChemicalEntry, index: number) => ({
      ...entry,
      id: (index + 1).toString()
    }));
    
    // If we have fewer than 5 entries, pad with empty entries
    if (processedEntries.length < minEntries) {
      const additionalEntries = [];
      for (let i = processedEntries.length; i < minEntries; i++) {
        additionalEntries.push({
          id: (i + 1).toString(),
          chemicalName: '',
          quantity: '',
          containerSize: '',
          sds: false
        });
      }
      setChemicalEntries([...processedEntries, ...additionalEntries]);
    } else {
      setChemicalEntries(processedEntries);
    }
    
    toast.success('Draft loaded successfully');
  };

  const deleteDraft = (draftId: number) => {
    const existingDrafts = JSON.parse(localStorage.getItem('wasteManagementDrafts') || '[]');
    const updatedDrafts = existingDrafts.filter((draft: any) => draft.id !== draftId);
    localStorage.setItem('wasteManagementDrafts', JSON.stringify(updatedDrafts));
    
    loadSavedDrafts(); // Refresh the drafts list
    toast.success('Draft deleted successfully');
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
          {/* Saved Drafts Section */}
          {savedDrafts.length > 0 && (
            <Collapsible 
              open={showSavedDrafts} 
              onOpenChange={setShowSavedDrafts}
              className="print:hidden"
            >
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">Saved Drafts ({savedDrafts.length})</span>
                  </div>
                  {showSavedDrafts ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2">
                <div className="border rounded-lg bg-gray-50 p-3">
                  <div className="space-y-2">
                    {savedDrafts.map((draft: any) => (
                      <div 
                        key={draft.id} 
                        className="flex items-center justify-between bg-white p-3 rounded border"
                      >
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{draft.title}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(draft.timestamp).toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {draft.chemicalEntries?.length || 0} chemical entries
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <Button
                            onClick={() => loadDraft(draft)}
                            variant="outline"
                            size="sm"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Load
                          </Button>
                          <Button
                            onClick={() => deleteDraft(draft.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

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
                          {!showAddContainerSize[entry.id] ? (
                            <div className="flex items-center gap-1">
                              <Select 
                                value={entry.containerSize} 
                                onValueChange={(value) => {
                                  if (value === '__add_new__') {
                                    setShowAddContainerSize(prev => ({ ...prev, [entry.id]: true }));
                                  } else {
                                    handleChemicalEntryChange(entry.id, 'containerSize', value);
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 border-0 bg-transparent focus:bg-gray-50 focus:ring-1 focus:ring-blue-500 text-sm">
                                  <SelectValue placeholder="Select size" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableContainerSizes.map((size) => (
                                    <SelectItem key={size} value={size}>
                                      {size}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="__add_new__" className="text-blue-600 font-medium">
                                    <div className="flex items-center gap-2">
                                      <Plus className="h-4 w-4" />
                                      Add New Size
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Input
                                value={newContainerSizeInput[entry.id] || ''}
                                onChange={(e) => setNewContainerSizeInput(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                className="border border-blue-300 bg-blue-50 focus:bg-white focus:ring-1 focus:ring-blue-500 text-sm h-8 flex-1"
                                placeholder="Enter new size"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addNewContainerSize(entry.id);
                                  } else if (e.key === 'Escape') {
                                    cancelAddContainerSize(entry.id);
                                  }
                                }}
                                autoFocus
                              />
                              <Button
                                type="button"
                                onClick={() => addNewContainerSize(entry.id)}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                                title="Add size"
                              >
                                ✓
                              </Button>
                              <Button
                                type="button"
                                onClick={() => cancelAddContainerSize(entry.id)}
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
                          <div className="flex justify-center">
                            <Checkbox
                              checked={entry.sds}
                              onCheckedChange={(checked) => handleChemicalEntryChange(entry.id, 'sds', checked === true)}
                              className="h-5 w-5"
                            />
                          </div>
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