import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Plus, Trash2, Download, ChevronDown, Check } from 'lucide-react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { useQuery } from '@tanstack/react-query';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ReturnItem {
  qty: string;
  partSku: string;
  serialNumber: string;
  description: string;
  reasonForReturn: string;
}

const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#333',
    paddingBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  sectionHeader: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  sectionContent: {
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  field: {
    flex: 1,
    marginRight: 10,
  },
  fieldLabel: {
    fontSize: 8,
    color: '#666',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 2,
    minHeight: 14,
  },
  warning: {
    color: '#c00',
    fontSize: 9,
    marginTop: 5,
    fontWeight: 'bold',
  },
  table: {
    marginTop: 5,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#333',
  },
  tableHeaderCell: {
    padding: 5,
    fontSize: 8,
    fontWeight: 'bold',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#333',
  },
  tableCell: {
    padding: 5,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#333',
    minHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 5,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 5,
  },
  checkboxChecked: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 5,
    backgroundColor: '#333',
  },
  checkboxLabel: {
    fontSize: 9,
  },
  descriptionBox: {
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 60,
    padding: 5,
    fontSize: 9,
  },
  termsList: {
    paddingLeft: 10,
  },
  termItem: {
    fontSize: 9,
    marginBottom: 3,
  },
  signatureRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  signatureField: {
    flex: 1,
    marginRight: 15,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginTop: 25,
    paddingBottom: 2,
  },
  certification: {
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 10,
  },
});

interface RMAPDFProps {
  rmaNumber: string;
  dateIssued: string;
  returnDeadline: string;
  issuedBy: string;
  companyName: string;
  contactName: string;
  phoneNumber: string;
  emailAddress: string;
  originalOrderNumber: string;
  invoiceNumber: string;
  purchaseDate: string;
  items: ReturnItem[];
  reasonCodes: {
    defective: boolean;
    damagedInShipping: boolean;
    incorrectItem: boolean;
    warrantyRepair: boolean;
    other: boolean;
    otherText: string;
  };
  requestedAction: {
    repair: boolean;
    replacement: boolean;
    creditRefund: boolean;
    evaluationOnly: boolean;
  };
  issueDescription: string;
  shippingInstructions: {
    customerResponsible: boolean;
    companyProvidedLabel: boolean;
    freightSpecialHandling: boolean;
  };
  carrier: string;
  trackingNumber: string;
  printedName: string;
  signatureDate: string;
}

const RMAPDFDocument = (props: RMAPDFProps) => (
  <Document>
    <Page size="LETTER" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>Return Merchandise Authorization (RMA) Form</Text>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>RMA INFORMATION (Completed by Company)</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.row}>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>RMA Number</Text>
              <Text style={pdfStyles.fieldValue}>{props.rmaNumber || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Date Issued</Text>
              <Text style={pdfStyles.fieldValue}>{props.dateIssued || ' '}</Text>
            </View>
          </View>
          <View style={pdfStyles.row}>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Return Deadline</Text>
              <Text style={pdfStyles.fieldValue}>{props.returnDeadline || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Issued By</Text>
              <Text style={pdfStyles.fieldValue}>{props.issuedBy || ' '}</Text>
            </View>
          </View>
          <Text style={pdfStyles.warning}>Important: Returns without an RMA number may be refused.</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>CUSTOMER INFORMATION</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.row}>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Company / Customer Name</Text>
              <Text style={pdfStyles.fieldValue}>{props.companyName || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Contact Name</Text>
              <Text style={pdfStyles.fieldValue}>{props.contactName || ' '}</Text>
            </View>
          </View>
          <View style={pdfStyles.row}>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Phone Number</Text>
              <Text style={pdfStyles.fieldValue}>{props.phoneNumber || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Email Address</Text>
              <Text style={pdfStyles.fieldValue}>{props.emailAddress || ' '}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>ORDER & PRODUCT INFORMATION</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.row}>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Original Order #</Text>
              <Text style={pdfStyles.fieldValue}>{props.originalOrderNumber || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Invoice # (if available)</Text>
              <Text style={pdfStyles.fieldValue}>{props.invoiceNumber || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Purchase Date</Text>
              <Text style={pdfStyles.fieldValue}>{props.purchaseDate || ' '}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>ITEM(S) BEING RETURNED</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.table}>
            <View style={pdfStyles.tableHeader}>
              <Text style={[pdfStyles.tableHeaderCell, { width: '8%' }]}>Qty</Text>
              <Text style={[pdfStyles.tableHeaderCell, { width: '18%' }]}>Part / SKU</Text>
              <Text style={[pdfStyles.tableHeaderCell, { width: '18%' }]}>Serial #</Text>
              <Text style={[pdfStyles.tableHeaderCell, { width: '28%' }]}>Description</Text>
              <Text style={[pdfStyles.tableHeaderCell, { width: '28%', borderRightWidth: 0 }]}>Reason</Text>
            </View>
            {props.items.map((item, index) => (
              <View style={pdfStyles.tableRow} key={index}>
                <Text style={[pdfStyles.tableCell, { width: '8%' }]}>{item.qty}</Text>
                <Text style={[pdfStyles.tableCell, { width: '18%' }]}>{item.partSku}</Text>
                <Text style={[pdfStyles.tableCell, { width: '18%' }]}>{item.serialNumber}</Text>
                <Text style={[pdfStyles.tableCell, { width: '28%' }]}>{item.description}</Text>
                <Text style={[pdfStyles.tableCell, { width: '28%', borderRightWidth: 0 }]}>{item.reasonForReturn}</Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', marginBottom: 5 }}>Reason Codes:</Text>
            <View style={pdfStyles.checkboxRow}>
              <View style={pdfStyles.checkboxItem}>
                <View style={props.reasonCodes.defective ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
                <Text style={pdfStyles.checkboxLabel}>Defective</Text>
              </View>
              <View style={pdfStyles.checkboxItem}>
                <View style={props.reasonCodes.damagedInShipping ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
                <Text style={pdfStyles.checkboxLabel}>Damaged in Shipping</Text>
              </View>
              <View style={pdfStyles.checkboxItem}>
                <View style={props.reasonCodes.incorrectItem ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
                <Text style={pdfStyles.checkboxLabel}>Incorrect Item</Text>
              </View>
              <View style={pdfStyles.checkboxItem}>
                <View style={props.reasonCodes.warrantyRepair ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
                <Text style={pdfStyles.checkboxLabel}>Warranty Repair</Text>
              </View>
              <View style={pdfStyles.checkboxItem}>
                <View style={props.reasonCodes.other ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
                <Text style={pdfStyles.checkboxLabel}>Other: {props.reasonCodes.otherText}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>REQUESTED ACTION</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.checkboxRow}>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.requestedAction.repair ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Repair</Text>
            </View>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.requestedAction.replacement ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Replacement</Text>
            </View>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.requestedAction.creditRefund ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Credit / Refund</Text>
            </View>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.requestedAction.evaluationOnly ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Evaluation Only (Contact me with findings)</Text>
            </View>
          </View>
        </View>
      </View>

    </Page>
    <Page size="LETTER" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>DESCRIPTION OF ISSUE</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <Text style={{ fontSize: 8, color: '#666', marginBottom: 3 }}>(Be as detailed as possible)</Text>
          <View style={pdfStyles.descriptionBox}>
            <Text>{props.issueDescription || ' '}</Text>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>RETURN SHIPPING INSTRUCTIONS</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.checkboxRow}>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.shippingInstructions.customerResponsible ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Customer is responsible for return shipping</Text>
            </View>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.shippingInstructions.companyProvidedLabel ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Company provided return label</Text>
            </View>
            <View style={pdfStyles.checkboxItem}>
              <View style={props.shippingInstructions.freightSpecialHandling ? pdfStyles.checkboxChecked : pdfStyles.checkbox} />
              <Text style={pdfStyles.checkboxLabel}>Freight / Special handling required</Text>
            </View>
          </View>
          <View style={[pdfStyles.row, { marginTop: 10 }]}>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Carrier</Text>
              <Text style={pdfStyles.fieldValue}>{props.carrier || ' '}</Text>
            </View>
            <View style={pdfStyles.field}>
              <Text style={pdfStyles.fieldLabel}>Tracking #</Text>
              <Text style={pdfStyles.fieldValue}>{props.trackingNumber || ' '}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>TERMS & CONDITIONS</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <View style={pdfStyles.termsList}>
            <Text style={pdfStyles.termItem}>• Please return item with the RMA # clearly marked on the outside of the package.</Text>
            <Text style={pdfStyles.termItem}>• Items must be properly packaged to prevent damage.</Text>
          </View>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>AUTHORIZATION</Text>
        </View>
        <View style={pdfStyles.sectionContent}>
          <Text style={pdfStyles.certification}>I certify that the information above is accurate.</Text>
          <View style={pdfStyles.signatureRow}>
            <View style={pdfStyles.signatureField}>
              <Text style={pdfStyles.fieldLabel}>Customer Signature</Text>
              <View style={pdfStyles.signatureLine} />
            </View>
            <View style={pdfStyles.signatureField}>
              <Text style={pdfStyles.fieldLabel}>Printed Name</Text>
              <Text style={pdfStyles.fieldValue}>{props.printedName || ' '}</Text>
            </View>
            <View style={[pdfStyles.signatureField, { marginRight: 0 }]}>
              <Text style={pdfStyles.fieldLabel}>Date</Text>
              <Text style={pdfStyles.fieldValue}>{props.signatureDate || ' '}</Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  </Document>
);

export default function RMAFormPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [rmaNumber, setRmaNumber] = useState('');
  const [dateIssued, setDateIssued] = useState('');
  const [returnDeadline, setReturnDeadline] = useState('');
  const [issuedBy, setIssuedBy] = useState('');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');

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
    other: false,
    otherText: ''
  });

  const { data: p1Customers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers'],
  });

  const { data: p2Customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2_customers'],
  });

  const allCustomers = [
    ...p1Customers.map(c => ({ ...c, type: 'P1' as const })),
    ...p2Customers.map(c => ({ ...c, type: 'P2' as const })),
  ].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const handleCustomerSelect = (customerId: string) => {
    const customer = allCustomers.find(c => String(c.id) === customerId);
    if (customer) {
      setSelectedCustomerId(customerId);
      setCompanyName(customer.name || '');
      setContactName(customer.contact || '');
      setPhoneNumber(customer.phone || '');
      setEmailAddress(customer.email || '');
    }
    setCustomerDropdownOpen(false);
  };

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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US');
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const doc = (
        <RMAPDFDocument
          rmaNumber={rmaNumber}
          dateIssued={formatDate(dateIssued)}
          returnDeadline={formatDate(returnDeadline)}
          issuedBy={issuedBy}
          companyName={companyName}
          contactName={contactName}
          phoneNumber={phoneNumber}
          emailAddress={emailAddress}
          originalOrderNumber={originalOrderNumber}
          invoiceNumber={invoiceNumber}
          purchaseDate={formatDate(purchaseDate)}
          items={items}
          reasonCodes={reasonCodes}
          requestedAction={requestedAction}
          issueDescription={issueDescription}
          shippingInstructions={shippingInstructions}
          carrier={carrier}
          trackingNumber={trackingNumber}
          printedName={printedName}
          signatureDate={formatDate(signatureDate)}
        />
      );
      const blob = await pdf(doc).toBlob();
      const filename = rmaNumber ? `RMA-${rmaNumber}.pdf` : 'RMA-Form.pdf';
      saveAs(blob, filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mb-4 flex justify-between items-center max-w-4xl mx-auto">
        <h1 className="text-xl font-bold">RMA Form</h1>
        <Button onClick={handleDownloadPDF} disabled={isGenerating} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          {isGenerating ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
        <div className="p-8 space-y-6">
          <div className="text-center border-b-2 border-gray-800 pb-4">
            <h1 className="text-2xl font-bold uppercase">Return Merchandise Authorization (RMA) Form</h1>
          </div>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg flex items-center gap-2">
                RMA Information
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateIssued">Date Issued</Label>
                  <Input 
                    id="dateIssued" 
                    type="date"
                    value={dateIssued} 
                    onChange={(e) => setDateIssued(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnDeadline">Return Deadline</Label>
                  <Input 
                    id="returnDeadline" 
                    type="date"
                    value={returnDeadline} 
                    onChange={(e) => setReturnDeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issuedBy">Issued By</Label>
                  <Input 
                    id="issuedBy" 
                    value={issuedBy} 
                    onChange={(e) => setIssuedBy(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-sm text-red-600 mt-4 font-medium">Important: Returns without an RMA number may be refused.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Select Customer</Label>
                  <Popover open={customerDropdownOpen} onOpenChange={setCustomerDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerDropdownOpen}
                        className="w-full justify-between"
                      >
                        {selectedCustomerId
                          ? allCustomers.find(c => String(c.id) === selectedCustomerId)?.name || 'Select customer...'
                          : 'Select customer...'}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search customers..." />
                        <CommandList>
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup heading="P1 Customers">
                            {allCustomers
                              .filter(c => c.type === 'P1')
                              .map((customer) => (
                                <CommandItem
                                  key={`p1-${customer.id}`}
                                  value={customer.name}
                                  onSelect={() => handleCustomerSelect(String(customer.id))}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      selectedCustomerId === String(customer.id) ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  />
                                  {customer.name}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                          <CommandGroup heading="P2 Customers">
                            {allCustomers
                              .filter(c => c.type === 'P2')
                              .map((customer) => (
                                <CommandItem
                                  key={`p2-${customer.id}`}
                                  value={customer.name}
                                  onSelect={() => handleCustomerSelect(String(customer.id))}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      selectedCustomerId === String(customer.id) ? 'opacity-100' : 'opacity-0'
                                    }`}
                                  />
                                  {customer.name}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company / Customer Name</Label>
                  <Input 
                    id="companyName" 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input 
                    id="contactName" 
                    value={contactName} 
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input 
                    id="phoneNumber" 
                    value={phoneNumber} 
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailAddress">Email Address</Label>
                  <Input 
                    id="emailAddress" 
                    type="email"
                    value={emailAddress} 
                    onChange={(e) => setEmailAddress(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Order & Product Information</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="originalOrderNumber">Original Order #</Label>
                  <Input 
                    id="originalOrderNumber" 
                    value={originalOrderNumber} 
                    onChange={(e) => setOriginalOrderNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Invoice # (if available)</Label>
                  <Input 
                    id="invoiceNumber" 
                    value={invoiceNumber} 
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchaseDate">Purchase Date</Label>
                  <Input 
                    id="purchaseDate" 
                    type="date"
                    value={purchaseDate} 
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Item(s) Being Returned</span>
                <Button onClick={addItem} size="sm" variant="outline">
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
                      <th className="border p-2 text-left text-sm font-medium w-10"></th>
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
                        <td className="border p-1">
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

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Requested Action</CardTitle>
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

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Description of Issue</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-gray-600 mb-2">(Be as detailed as possible)</p>
              <Textarea 
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                className="min-h-[120px]"
                placeholder="Describe the issue in detail..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Return Shipping Instructions</CardTitle>
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
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trackingNumber">Tracking #</Label>
                    <Input 
                      id="trackingNumber" 
                      value={trackingNumber} 
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="list-disc pl-5 space-y-2 text-sm">
                <li>Please return item with the RMA # clearly marked on the outside of the package.</li>
                <li>Items must be properly packaged to prevent damage.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-lg">Authorization</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-gray-600 mb-4">I certify that the information above is accurate.</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Customer Signature</Label>
                  <div className="border-b-2 border-gray-400 h-10"></div>
                  <p className="text-xs text-gray-500">Sign on printed copy</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="printedName">Printed Name</Label>
                  <Input 
                    id="printedName" 
                    value={printedName} 
                    onChange={(e) => setPrintedName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signatureDate">Date</Label>
                  <Input 
                    id="signatureDate" 
                    type="date"
                    value={signatureDate} 
                    onChange={(e) => setSignatureDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
