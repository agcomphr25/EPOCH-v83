import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Plus, Trash2 } from 'lucide-react';

interface ReturnItem {
  qty: string;
  partSku: string;
  serialNumber: string;
  description: string;
  reasonForReturn: string;
}

export default function RMAFormPage() {
  const [rmaNumber, setRmaNumber] = useState('');
  const [dateIssued, setDateIssued] = useState('');
  const [returnDeadline, setReturnDeadline] = useState('');
  const [issuedBy, setIssuedBy] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [returnAddress, setReturnAddress] = useState('');
  const [cityStateZip, setCityStateZip] = useState('');

  const [originalOrderNumber, setOriginalOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');

  const [items, setItems] = useState<ReturnItem[]>([
    { qty: '', partSku: '', serialNumber: '', description: '', reasonForReturn: '' }
  ]);

  const [reasonCodes, setReasonCodes] = useState({
    defective: false,
    damagedInShipping: false,
    incorrectItem: false,
    warrantyRepair: false,
    upgrade: false,
    other: false,
    otherText: ''
  });

  const [requestedAction, setRequestedAction] = useState({
    repair: false,
    replacement: false,
    creditRefund: false,
    evaluationOnly: false
  });

  const [issueDescription, setIssueDescription] = useState('');

  const [shippingInstructions, setShippingInstructions] = useState({
    customerResponsible: false,
    companyProvidedLabel: false,
    freightSpecialHandling: false
  });

  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const [customerSignature, setCustomerSignature] = useState('');
  const [printedName, setPrintedName] = useState('');
  const [signatureDate, setSignatureDate] = useState('');

  const addItem = () => {
    setItems([...items, { qty: '', partSku: '', serialNumber: '', description: '', reasonForReturn: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ReturnItem, value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="no-print mb-4 flex justify-end">
        <Button onClick={handlePrint} className="flex items-center gap-2">
          <Printer className="h-4 w-4" />
          Print to PDF
        </Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none" id="rma-form">
        <div className="p-8 space-y-6">
          <div className="text-center border-b-2 border-gray-800 pb-4">
            <h1 className="text-2xl font-bold uppercase">Return Merchandise Authorization (RMA) Form</h1>
          </div>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg flex items-center gap-2">
                🏷️ RMA Information
                <span className="text-sm font-normal text-gray-600">(Completed by Company)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rmaNumber">RMA Number</Label>
                  <Input 
                    id="rmaNumber" 
                    value={rmaNumber} 
                    onChange={(e) => setRmaNumber(e.target.value)}
                    placeholder="RMA-#####"
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateIssued">Date Issued</Label>
                  <Input 
                    id="dateIssued" 
                    type="date"
                    value={dateIssued} 
                    onChange={(e) => setDateIssued(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnDeadline">Return Deadline</Label>
                  <Input 
                    id="returnDeadline" 
                    type="date"
                    value={returnDeadline} 
                    onChange={(e) => setReturnDeadline(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issuedBy">Issued By</Label>
                  <Input 
                    id="issuedBy" 
                    value={issuedBy} 
                    onChange={(e) => setIssuedBy(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
              </div>
              <p className="text-sm text-red-600 mt-4 font-medium">⚠️ Important: Returns without an RMA number may be refused.</p>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">👤 Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company / Customer Name</Label>
                  <Input 
                    id="companyName" 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input 
                    id="contactName" 
                    value={contactName} 
                    onChange={(e) => setContactName(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input 
                    id="phoneNumber" 
                    value={phoneNumber} 
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailAddress">Email Address</Label>
                  <Input 
                    id="emailAddress" 
                    type="email"
                    value={emailAddress} 
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnAddress">Return Shipping Address</Label>
                  <Input 
                    id="returnAddress" 
                    value={returnAddress} 
                    onChange={(e) => setReturnAddress(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cityStateZip">City / State / ZIP</Label>
                  <Input 
                    id="cityStateZip" 
                    value={cityStateZip} 
                    onChange={(e) => setCityStateZip(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">📄 Order & Product Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="originalOrderNumber">Original Order #</Label>
                  <Input 
                    id="originalOrderNumber" 
                    value={originalOrderNumber} 
                    onChange={(e) => setOriginalOrderNumber(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Invoice # (if available)</Label>
                  <Input 
                    id="invoiceNumber" 
                    value={invoiceNumber} 
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchaseDate">Purchase Date</Label>
                  <Input 
                    id="purchaseDate" 
                    type="date"
                    value={purchaseDate} 
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>🔧 Item(s) Being Returned</span>
                <Button onClick={addItem} size="sm" variant="outline" className="no-print">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border p-2 text-left text-sm font-medium">Qty</th>
                      <th className="border p-2 text-left text-sm font-medium">Part / SKU</th>
                      <th className="border p-2 text-left text-sm font-medium">Serial #</th>
                      <th className="border p-2 text-left text-sm font-medium">Description</th>
                      <th className="border p-2 text-left text-sm font-medium">Reason</th>
                      <th className="border p-2 text-left text-sm font-medium no-print w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="border p-1">
                          <Input 
                            value={item.qty} 
                            onChange={(e) => updateItem(index, 'qty', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="border p-1">
                          <Input 
                            value={item.partSku} 
                            onChange={(e) => updateItem(index, 'partSku', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="border p-1">
                          <Input 
                            value={item.serialNumber} 
                            onChange={(e) => updateItem(index, 'serialNumber', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="border p-1">
                          <Input 
                            value={item.description} 
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="border p-1">
                          <Input 
                            value={item.reasonForReturn} 
                            onChange={(e) => updateItem(index, 'reasonForReturn', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="border p-1 no-print">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeItem(index)}
                            disabled={items.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <p className="font-medium mb-2">Reason Codes (check all that apply):</p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="defective" 
                      checked={reasonCodes.defective}
                      onCheckedChange={(checked) => setReasonCodes({...reasonCodes, defective: !!checked})}
                    />
                    <Label htmlFor="defective">Defective</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="damagedInShipping" 
                      checked={reasonCodes.damagedInShipping}
                      onCheckedChange={(checked) => setReasonCodes({...reasonCodes, damagedInShipping: !!checked})}
                    />
                    <Label htmlFor="damagedInShipping">Damaged in Shipping</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="incorrectItem" 
                      checked={reasonCodes.incorrectItem}
                      onCheckedChange={(checked) => setReasonCodes({...reasonCodes, incorrectItem: !!checked})}
                    />
                    <Label htmlFor="incorrectItem">Incorrect Item</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="warrantyRepair" 
                      checked={reasonCodes.warrantyRepair}
                      onCheckedChange={(checked) => setReasonCodes({...reasonCodes, warrantyRepair: !!checked})}
                    />
                    <Label htmlFor="warrantyRepair">Warranty Repair</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="upgrade" 
                      checked={reasonCodes.upgrade}
                      onCheckedChange={(checked) => setReasonCodes({...reasonCodes, upgrade: !!checked})}
                    />
                    <Label htmlFor="upgrade">Upgrade</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="other" 
                      checked={reasonCodes.other}
                      onCheckedChange={(checked) => setReasonCodes({...reasonCodes, other: !!checked})}
                    />
                    <Label htmlFor="other">Other:</Label>
                    <Input 
                      value={reasonCodes.otherText} 
                      onChange={(e) => setReasonCodes({...reasonCodes, otherText: e.target.value})}
                      className="w-32 h-8"
                      disabled={!reasonCodes.other}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">🛠️ Requested Action</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="repair" 
                    checked={requestedAction.repair}
                    onCheckedChange={(checked) => setRequestedAction({...requestedAction, repair: !!checked})}
                  />
                  <Label htmlFor="repair">Repair</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="replacement" 
                    checked={requestedAction.replacement}
                    onCheckedChange={(checked) => setRequestedAction({...requestedAction, replacement: !!checked})}
                  />
                  <Label htmlFor="replacement">Replacement</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="creditRefund" 
                    checked={requestedAction.creditRefund}
                    onCheckedChange={(checked) => setRequestedAction({...requestedAction, creditRefund: !!checked})}
                  />
                  <Label htmlFor="creditRefund">Credit / Refund</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="evaluationOnly" 
                    checked={requestedAction.evaluationOnly}
                    onCheckedChange={(checked) => setRequestedAction({...requestedAction, evaluationOnly: !!checked})}
                  />
                  <Label htmlFor="evaluationOnly">Evaluation Only (Contact me with findings)</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">📝 Description of Issue</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-gray-600 mb-2">(Be as detailed as possible)</p>
              <Textarea 
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                className="min-h-[120px] print:border print:border-gray-400"
                placeholder="Describe the issue in detail..."
              />
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">📦 Return Shipping Instructions</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="customerResponsible" 
                      checked={shippingInstructions.customerResponsible}
                      onCheckedChange={(checked) => setShippingInstructions({...shippingInstructions, customerResponsible: !!checked})}
                    />
                    <Label htmlFor="customerResponsible">Customer is responsible for return shipping</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="companyProvidedLabel" 
                      checked={shippingInstructions.companyProvidedLabel}
                      onCheckedChange={(checked) => setShippingInstructions({...shippingInstructions, companyProvidedLabel: !!checked})}
                    />
                    <Label htmlFor="companyProvidedLabel">Company provided return label</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="freightSpecialHandling" 
                      checked={shippingInstructions.freightSpecialHandling}
                      onCheckedChange={(checked) => setShippingInstructions({...shippingInstructions, freightSpecialHandling: !!checked})}
                    />
                    <Label htmlFor="freightSpecialHandling">Freight / Special handling required</Label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="carrier">Carrier</Label>
                    <Input 
                      id="carrier" 
                      value={carrier} 
                      onChange={(e) => setCarrier(e.target.value)}
                      className="print:border-b print:border-gray-400 print:rounded-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trackingNumber">Tracking #</Label>
                    <Input 
                      id="trackingNumber" 
                      value={trackingNumber} 
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="print:border-b print:border-gray-400 print:rounded-none"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">⚠️ Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Products must be returned with RMA number clearly marked on the outside of the package.</li>
                <li>Items must be properly packaged to prevent damage.</li>
                <li>Evaluation fees may apply if no defect is found.</li>
                <li>Unauthorized or late returns may be rejected.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="print:border print:border-gray-400">
            <CardHeader className="bg-gray-100 print:bg-gray-100">
              <CardTitle className="text-lg">✍️ Authorization</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-gray-600 mb-4">I certify that the information above is accurate.</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customerSignature">Customer Signature</Label>
                  <Input 
                    id="customerSignature" 
                    value={customerSignature} 
                    onChange={(e) => setCustomerSignature(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="printedName">Printed Name</Label>
                  <Input 
                    id="printedName" 
                    value={printedName} 
                    onChange={(e) => setPrintedName(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signatureDate">Date</Label>
                  <Input 
                    id="signatureDate" 
                    type="date"
                    value={signatureDate} 
                    onChange={(e) => setSignatureDate(e.target.value)}
                    className="print:border-b print:border-gray-400 print:rounded-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #rma-form {
            box-shadow: none !important;
          }
          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </div>
  );
}
