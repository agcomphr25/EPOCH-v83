import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Printer, Download, List, Plus, Eye, Search } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import type { P2Customer } from '@shared/schema';
import { COMPANY_INFO } from '@shared/company-config';
import { format } from 'date-fns';

interface SessionUser {
  id: number;
  username: string;
  role: string;
  employeeId?: number | null;
}

interface RFQAssessment {
  id: number;
  rfqNumber: string;
  customerId: string;
  customerName?: string;
  description: string | null;
  totalOverallPoints: number;
  adjustedRiskLevel: number;
  riskDetermination: string | null;
  bidDecision: string | null;
  formData: any;
  createdAt: string;
  updatedAt: string;
}

export default function RFQRiskAssessment() {
  // Tab and search state
  const [activeTab, setActiveTab] = useState('create');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Signature canvas reference
  const signatureCanvasRef = useRef<SignatureCanvas>(null);

  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    rfqNumber: '',
    description: '',

    // Internal Risks
    trainedStaff: '',
    equipmentRequirements: '',
    manufacturingSpace: '',
    regulatoryRequirements: '',
    conflictingPriorities: '',
    customerConcentration: '',
    climateEnvironmental: '',
    internalSubtotal: 0,

    // External Risks
    supplyChainDisruptions: '',
    supplierVariability: '',
    contractProvisions: '',
    timelines: '',
    qualityExpectations: '',
    externalSubtotal: 0,

    // Mitigation Actions
    mitigationActionA: '',
    mitigationActionB: '',
    mitigationActionC: '',

    // Risk Reduction Values
    mitigationReductionA: '0',
    mitigationReductionB: '0',
    mitigationReductionC: '0',

    // Totals and Determination
    totalOverallPoints: 0,
    adjustedRiskLevel: 0,
    riskDetermination: '',
    bidDecision: '',

    // Signature Section
    date: '',
    printedName: '',
    signature: '',
  });

  const { data: customers = [] } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  // Fetch current user session for authorization
  const { data: session } = useQuery<SessionUser>({
    queryKey: ['/api/auth/session'],
  });

  // Fetch all RFQ assessments for list view
  const { data: assessments = [], refetch: refetchAssessments } = useQuery<RFQAssessment[]>({
    queryKey: ['/api/customers/rfq-assessments'],
    enabled: activeTab === 'view',
  });

  // Check if user is authorized to sign high-risk RFQs (score > 16)
  const isHighRisk = formData.totalOverallPoints > 16;
  const isAuthorizedSigner = session?.username === 'tandyd' || session?.username === 'tandym';
  const canSign = !isHighRisk || isAuthorizedSigner;

  const handleCustomerChange = async (customerId: string) => {
    const selectedCustomer = customers.find(c => c.customerId === customerId);
    if (!selectedCustomer) {
      console.error('Customer not found:', customerId);
      return;
    }

    console.log('Selected customer:', selectedCustomer);
    console.log('Fetching RFQ number for customer:', customerId);

    try {
      const response = await fetch(`/api/customers/${customerId}/rfq-next-number`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch RFQ number: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Generated RFQ number:', data);
      
      setFormData((prev) => ({
        ...prev,
        customerId,
        customerName: selectedCustomer.customerName,
        rfqNumber: data.rfqNumber,
      }));
    } catch (error) {
      console.error('Failed to generate RFQ number:', error);
    }
  };

  // Effect to handle canvas resizing
  useEffect(() => {
    const resizeCanvas = () => {
      if (signatureCanvasRef.current) {
        const canvas = signatureCanvasRef.current.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // Store the scale factors for proper mouse coordinate mapping
        canvas.dataset.scaleX = scaleX.toString();
        canvas.dataset.scaleY = scaleY.toString();
      }
    };

    // Resize on mount and window resize
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Effect to handle mitigation actions requirement based on risk score
  useEffect(() => {
    if (formData.totalOverallPoints > 16) {
      // If risk score is above 16 and mitigation actions are empty, set them to "n/a"
      setFormData((prev) => ({
        ...prev,
        mitigationActionA: prev.mitigationActionA || 'n/a',
        mitigationActionB: prev.mitigationActionB || 'n/a',
        mitigationActionC: prev.mitigationActionC || 'n/a',
      }));
    }
  }, [formData.totalOverallPoints]);

  // Risk scoring system
  const getRiskScore = (value: string) => {
    switch (value) {
      case 'extreme':
        return 17;
      case 'high':
        return 3;
      case 'medium':
        return 1;
      case 'low':
        return 0;
      default:
        return 0;
    }
  };

  // Calculate subtotals and total whenever risk values change
  const calculateScores = () => {
    const internalRisks = [
      formData.trainedStaff,
      formData.equipmentRequirements,
      formData.manufacturingSpace,
      formData.regulatoryRequirements,
      formData.conflictingPriorities,
      formData.customerConcentration,
      formData.climateEnvironmental,
    ];

    const externalRisks = [
      formData.supplyChainDisruptions,
      formData.supplierVariability,
      formData.contractProvisions,
      formData.timelines,
      formData.qualityExpectations,
    ];

    const internalSubtotal = internalRisks.reduce(
      (sum, risk) => sum + getRiskScore(risk),
      0
    );
    const externalSubtotal = externalRisks.reduce(
      (sum, risk) => sum + getRiskScore(risk),
      0
    );
    const totalOverallPoints = internalSubtotal + externalSubtotal;

    // Calculate total risk reduction from mitigation actions
    const totalReduction =
      parseInt(formData.mitigationReductionA || '0') +
      parseInt(formData.mitigationReductionB || '0') +
      parseInt(formData.mitigationReductionC || '0');
    const adjustedRiskLevel = Math.max(0, totalOverallPoints - totalReduction);

    console.log('Risk Calculation Debug:', {
      totalOverallPoints,
      totalReduction,
      adjustedRiskLevel,
      mitigationA: formData.mitigationReductionA,
      mitigationB: formData.mitigationReductionB,
      mitigationC: formData.mitigationReductionC,
    });

    // Determine risk level based on adjusted points
    let riskDetermination = '';
    if (adjustedRiskLevel >= 17) riskDetermination = 'High (17-204 pts)';
    else if (adjustedRiskLevel >= 4) riskDetermination = 'Medium (4-16 pts)';
    else riskDetermination = 'Low (0-3 pts)';

    setFormData((prev) => ({
      ...prev,
      internalSubtotal,
      externalSubtotal,
      totalOverallPoints,
      adjustedRiskLevel,
      riskDetermination,
    }));
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };

      // Recalculate scores if it's a risk field or mitigation reduction field
      const riskFields = [
        'trainedStaff',
        'equipmentRequirements',
        'manufacturingSpace',
        'regulatoryRequirements',
        'conflictingPriorities',
        'customerConcentration',
        'climateEnvironmental',
        'supplyChainDisruptions',
        'supplierVariability',
        'contractProvisions',
        'timelines',
        'qualityExpectations',
        'mitigationReductionA',
        'mitigationReductionB',
        'mitigationReductionC',
      ];

      if (riskFields.includes(field)) {
        // Calculate immediately with new data
        const internalRisks = [
          newData.trainedStaff,
          newData.equipmentRequirements,
          newData.manufacturingSpace,
          newData.regulatoryRequirements,
          newData.conflictingPriorities,
          newData.customerConcentration,
          newData.climateEnvironmental,
        ];

        const externalRisks = [
          newData.supplyChainDisruptions,
          newData.supplierVariability,
          newData.contractProvisions,
          newData.timelines,
          newData.qualityExpectations,
        ];

        const internalSubtotal = internalRisks.reduce(
          (sum, risk) => sum + getRiskScore(risk),
          0
        );
        const externalSubtotal = externalRisks.reduce(
          (sum, risk) => sum + getRiskScore(risk),
          0
        );
        const totalOverallPoints = internalSubtotal + externalSubtotal;

        // Calculate total risk reduction from mitigation actions
        const totalReduction =
          parseInt(newData.mitigationReductionA || '0') +
          parseInt(newData.mitigationReductionB || '0') +
          parseInt(newData.mitigationReductionC || '0');
        const adjustedRiskLevel = Math.max(
          0,
          totalOverallPoints - totalReduction
        );

        // Determine risk level based on adjusted points
        let riskDetermination = '';
        if (adjustedRiskLevel >= 17) riskDetermination = 'High (17-204 pts)';
        else if (adjustedRiskLevel >= 4)
          riskDetermination = 'Medium (4-16 pts)';
        else riskDetermination = 'Low (0-3 pts)';

        return {
          ...newData,
          internalSubtotal,
          externalSubtotal,
          totalOverallPoints,
          adjustedRiskLevel,
          riskDetermination,
        };
      }

      return newData;
    });
  };

  // Clear signature
  const clearSignature = () => {
    if (signatureCanvasRef.current) {
      signatureCanvasRef.current.clear();
    }
    setFormData((prev) => ({ ...prev, signature: '' }));
  };

  // Save signature as base64
  const saveSignature = () => {
    if (signatureCanvasRef.current) {
      const signatureData = signatureCanvasRef.current.toDataURL();
      setFormData((prev) => ({ ...prev, signature: signatureData }));
    }
  };

  // Handle form submission
  const handleSubmitAssessment = () => {
    // Check authorization for high-risk RFQs
    if (isHighRisk && !canSign) {
      alert(
        `Authorization Required\n\n` +
        `This RFQ has a risk score of ${formData.totalOverallPoints} (exceeds threshold of 16).\n` +
        `Only Dave Tandy or Matt Tandy are authorized to sign high-risk RFQs.\n\n` +
        `Current user: ${session?.username || 'Not logged in'}`
      );
      return;
    }

    // Validate signature is present
    if (!formData.signature) {
      alert('Please sign the form before submitting.');
      return;
    }

    // TODO: Implement form submission logic
    // For now, just show a placeholder message
    console.log('RFQ Risk Assessment submitted:', formData);
    alert('Assessment submission functionality will be implemented soon.');
  };

  const RiskRadioGroup = ({
    name,
    value,
    onChange,
    label,
  }: {
    name: string;
    value: string;
    onChange: (value: string) => void;
    label: string;
  }) => (
    <div className="space-y-3 pl-4">
      <Label className="text-sm font-medium">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex gap-8 pl-2"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="extreme" id={`${name}-extreme`} />
          <Label htmlFor={`${name}-extreme`} className="text-sm">
            Extreme
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="high" id={`${name}-high`} />
          <Label htmlFor={`${name}-high`} className="text-sm">
            High
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="medium" id={`${name}-medium`} />
          <Label htmlFor={`${name}-medium`} className="text-sm">
            Medium
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="low" id={`${name}-low`} />
          <Label htmlFor={`${name}-low`} className="text-sm">
            Low
          </Label>
        </div>
      </RadioGroup>
    </div>
  );

  // Validation function for required mitigation actions (only if risk score > 16)
  const validateForm = () => {
    if (formData.totalOverallPoints > 16) {
      if (
        !formData.mitigationActionA.trim() ||
        !formData.mitigationActionB.trim() ||
        !formData.mitigationActionC.trim()
      ) {
        alert(
          'Mitigation Actions are required when the overall risk score is above 16. Please fill in all three mitigation action fields.'
        );
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    // Check authorization for high-risk RFQs
    if (isHighRisk && !canSign) {
      alert(
        `Authorization Required\n\n` +
        `This RFQ has a risk score of ${formData.totalOverallPoints} (exceeds threshold of 16).\n` +
        `Only Dave Tandy or Matt Tandy are authorized to save high-risk RFQs.\n\n` +
        `Current user: ${session?.username || 'Not logged in'}`
      );
      return;
    }

    if (!validateForm()) return;

    try {
      const response = await fetch('/api/customers/rfq-assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rfqNumber: formData.rfqNumber,
          customerId: formData.customerId,
          description: formData.description,
          formData: formData,
          totalOverallPoints: formData.totalOverallPoints,
          adjustedRiskLevel: formData.adjustedRiskLevel,
          riskDetermination: formData.riskDetermination,
          bidDecision: formData.bidDecision,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save RFQ Risk Assessment');
      }

      const savedAssessment = await response.json();
      console.log('Form data saved:', savedAssessment);
      alert('RFQ Risk Assessment saved successfully!');
      
      // Refresh the assessments list
      await refetchAssessments();
      
      // Switch to view tab to show the saved assessment
      setActiveTab('view');
    } catch (error) {
      console.error('Error saving RFQ Risk Assessment:', error);
      alert('Failed to save RFQ Risk Assessment. Please try again.');
    }
  };

  const handlePrint = () => {
    // Check authorization for high-risk RFQs
    if (isHighRisk && !canSign) {
      alert(
        `Authorization Required\n\n` +
        `This RFQ has a risk score of ${formData.totalOverallPoints} (exceeds threshold of 16).\n` +
        `Only Dave Tandy or Matt Tandy are authorized to print high-risk RFQs.\n\n` +
        `Current user: ${session?.username || 'Not logged in'}`
      );
      return;
    }

    if (!validateForm()) return;

    window.print();
  };

  // Helper function to get risk badge color
  const getRiskBadgeColor = (riskDetermination: string | null) => {
    if (!riskDetermination) return 'secondary';
    if (riskDetermination.toLowerCase().includes('high')) return 'destructive';
    if (riskDetermination.toLowerCase().includes('medium')) return 'default';
    return 'secondary';
  };

  // Filter assessments based on search term
  const filteredAssessments = assessments.filter(assessment => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      assessment.rfqNumber.toLowerCase().includes(searchLower) ||
      assessment.customerName?.toLowerCase().includes(searchLower) ||
      assessment.description?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900">{COMPANY_INFO.name}</h1>
            <p className="text-sm text-gray-600">
              Responsive • Reliable • Supportive
            </p>
            <h2 className="text-xl font-semibold text-gray-800 mt-2">RFQ Risk Assessment</h2>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="create" className="flex items-center gap-2" data-testid="tab-create-rfq">
              <Plus className="h-4 w-4" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="view" className="flex items-center gap-2" data-testid="tab-view-rfqs">
              <List className="h-4 w-4" />
              View Submissions
            </TabsTrigger>
          </TabsList>

          {/* Create New Tab */}
          <TabsContent value="create" className="max-w-4xl mx-auto ml-16">
            {/* Action Buttons */}
            <div className="flex justify-center gap-3 mb-6">
              <Button 
                onClick={handleSave} 
                className="flex items-center gap-2"
                disabled={!canSign}
                data-testid="button-save-form"
              >
                <Save className="h-4 w-4" />
                Save Form
              </Button>
              <Button
                onClick={handlePrint}
                variant="outline"
                className="flex items-center gap-2"
                disabled={!canSign}
                data-testid="button-print-form"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                disabled={!canSign}
                data-testid="button-export-pdf"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>

            {/* RFQ Number */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-center">RFQ Risk Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <div className="w-96">
                <Label htmlFor="customer" className="font-medium">
                  Customer
                </Label>
                <Select
                  value={formData.customerId}
                  onValueChange={handleCustomerChange}
                >
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer: any) => (
                      <SelectItem 
                        key={customer.customerId} 
                        value={customer.customerId}
                        data-testid={`customer-option-${customer.customerId}`}
                      >
                        {customer.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.rfqNumber && (
                <div className="flex items-center gap-2">
                  <Label className="font-medium">RFQ #</Label>
                  <div 
                    className="text-blue-600"
                    data-testid="text-rfq-number"
                  >
                    {formData.rfqNumber}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <Label htmlFor="description" className="font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                data-testid="input-description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange('description', e.target.value)
                }
                className="w-96 text-center"
                placeholder="Enter description"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 1: Internal Risks */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Internal Risks</CardTitle>
            <p className="text-sm text-gray-600">
              Score: Extreme - 17 pts, High - 3 pts, Medium - 1 pt, Low - 0 pt
            </p>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            <RiskRadioGroup
              name="trainedStaff"
              value={formData.trainedStaff}
              onChange={(value) => handleInputChange('trainedStaff', value)}
              label="a. Trained/Qualified Staff"
            />

            <RiskRadioGroup
              name="equipmentRequirements"
              value={formData.equipmentRequirements}
              onChange={(value) =>
                handleInputChange('equipmentRequirements', value)
              }
              label="b. Equipment Requirements"
            />

            <RiskRadioGroup
              name="manufacturingSpace"
              value={formData.manufacturingSpace}
              onChange={(value) =>
                handleInputChange('manufacturingSpace', value)
              }
              label="c. Manufacturing Space"
            />

            <RiskRadioGroup
              name="regulatoryRequirements"
              value={formData.regulatoryRequirements}
              onChange={(value) =>
                handleInputChange('regulatoryRequirements', value)
              }
              label="d. Regulatory Requirements"
            />

            <RiskRadioGroup
              name="conflictingPriorities"
              value={formData.conflictingPriorities}
              onChange={(value) =>
                handleInputChange('conflictingPriorities', value)
              }
              label="e. Conflicting Priorities of Work"
            />

            <RiskRadioGroup
              name="customerConcentration"
              value={formData.customerConcentration}
              onChange={(value) =>
                handleInputChange('customerConcentration', value)
              }
              label="f. Customer Concentration"
            />

            <RiskRadioGroup
              name="climateEnvironmental"
              value={formData.climateEnvironmental}
              onChange={(value) =>
                handleInputChange('climateEnvironmental', value)
              }
              label="g. Climate/Environmental Impact"
            />

            <div className="flex items-center gap-2 pt-4 border-t">
              <Label className="font-medium">Subtotal Points:</Label>
              <div className="w-20 px-3 py-2 bg-gray-100 border rounded text-center font-medium">
                {formData.internalSubtotal}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: External Risks */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. External Risks</CardTitle>
            <p className="text-sm text-gray-600">
              Score: Extreme - 17 pts, High - 3 pts, Medium - 1 pts, Low - 0 pt
            </p>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            <RiskRadioGroup
              name="supplyChainDisruptions"
              value={formData.supplyChainDisruptions}
              onChange={(value) =>
                handleInputChange('supplyChainDisruptions', value)
              }
              label="a. Supply Chain Disruptions"
            />

            <RiskRadioGroup
              name="supplierVariability"
              value={formData.supplierVariability}
              onChange={(value) =>
                handleInputChange('supplierVariability', value)
              }
              label="b. Supplier Source Variability"
            />

            <RiskRadioGroup
              name="contractProvisions"
              value={formData.contractProvisions}
              onChange={(value) =>
                handleInputChange('contractProvisions', value)
              }
              label="c. Contract Mandatory Provisions"
            />

            <RiskRadioGroup
              name="timelines"
              value={formData.timelines}
              onChange={(value) => handleInputChange('timelines', value)}
              label="d. Timelines"
            />

            <RiskRadioGroup
              name="qualityExpectations"
              value={formData.qualityExpectations}
              onChange={(value) =>
                handleInputChange('qualityExpectations', value)
              }
              label="e. Reasonable Quality Expectations"
            />

            <div className="flex items-center gap-2 pt-4 border-t">
              <Label className="font-medium">Subtotal Points:</Label>
              <div className="w-20 px-3 py-2 bg-gray-100 border rounded text-center font-medium">
                {formData.externalSubtotal}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Mitigation Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Mitigation Actions and Score Adjustment</CardTitle>
            {formData.totalOverallPoints > 16 ? (
              <div className="text-sm bg-orange-50 border border-orange-200 rounded p-3">
                <div className="text-orange-800 font-medium">
                  ⚠️ Mitigation Actions Required
                </div>
                <div className="text-orange-700">
                  Risk score is above 16 - all mitigation actions must be
                  completed. Enter numeric values to reduce overall risk level.
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Risk score is 16 or below - mitigation actions are optional.
                Enter numeric values to reduce overall risk level if desired.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <Label
                  htmlFor="mitigationA"
                  className={
                    formData.totalOverallPoints > 16
                      ? 'text-red-500'
                      : 'text-gray-700'
                  }
                >
                  a.{' '}
                  {formData.totalOverallPoints > 16
                    ? '* (Required)'
                    : '(Optional)'}
                </Label>
                <Textarea
                  id="mitigationA"
                  value={formData.mitigationActionA}
                  onChange={(e) =>
                    handleInputChange('mitigationActionA', e.target.value)
                  }
                  rows={2}
                  className="mt-1"
                  placeholder={
                    formData.totalOverallPoints > 16
                      ? 'Describe mitigation action...'
                      : 'Describe mitigation action (optional)...'
                  }
                  required={formData.totalOverallPoints > 16}
                />
              </div>
              <div className="w-24">
                <Label htmlFor="reductionA" className="text-sm">
                  Risk Reduction
                </Label>
                <Input
                  id="reductionA"
                  type="number"
                  min="0"
                  max="50"
                  value={formData.mitigationReductionA}
                  onChange={(e) =>
                    handleInputChange(
                      'mitigationReductionA',
                      (parseInt(e.target.value) || 0).toString()
                    )
                  }
                  className="mt-1 text-center"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <Label
                  htmlFor="mitigationB"
                  className={
                    formData.totalOverallPoints > 16
                      ? 'text-red-500'
                      : 'text-gray-700'
                  }
                >
                  b.{' '}
                  {formData.totalOverallPoints > 16
                    ? '* (Required)'
                    : '(Optional)'}
                </Label>
                <Textarea
                  id="mitigationB"
                  value={formData.mitigationActionB}
                  onChange={(e) =>
                    handleInputChange('mitigationActionB', e.target.value)
                  }
                  rows={2}
                  className="mt-1"
                  placeholder={
                    formData.totalOverallPoints > 16
                      ? 'Describe mitigation action...'
                      : 'Describe mitigation action (optional)...'
                  }
                  required={formData.totalOverallPoints > 16}
                />
              </div>
              <div className="w-24">
                <Label htmlFor="reductionB" className="text-sm">
                  Risk Reduction
                </Label>
                <Input
                  id="reductionB"
                  type="number"
                  min="0"
                  max="50"
                  value={formData.mitigationReductionB}
                  onChange={(e) =>
                    handleInputChange(
                      'mitigationReductionB',
                      (parseInt(e.target.value) || 0).toString()
                    )
                  }
                  className="mt-1 text-center"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <Label
                  htmlFor="mitigationC"
                  className={
                    formData.totalOverallPoints > 16
                      ? 'text-red-500'
                      : 'text-gray-700'
                  }
                >
                  c.{' '}
                  {formData.totalOverallPoints > 16
                    ? '* (Required)'
                    : '(Optional)'}
                </Label>
                <Textarea
                  id="mitigationC"
                  value={formData.mitigationActionC}
                  onChange={(e) =>
                    handleInputChange('mitigationActionC', e.target.value)
                  }
                  rows={2}
                  className="mt-1"
                  placeholder={
                    formData.totalOverallPoints > 16
                      ? 'Describe mitigation action...'
                      : 'Describe mitigation action (optional)...'
                  }
                  required={formData.totalOverallPoints > 16}
                />
              </div>
              <div className="w-24">
                <Label htmlFor="reductionC" className="text-sm">
                  Risk Reduction
                </Label>
                <Input
                  id="reductionC"
                  type="number"
                  min="0"
                  max="50"
                  value={formData.mitigationReductionC}
                  onChange={(e) =>
                    handleInputChange(
                      'mitigationReductionC',
                      (parseInt(e.target.value) || 0).toString()
                    )
                  }
                  className="mt-1 text-center"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Label className="font-medium">Original Total Points:</Label>
                <div className="w-20 px-3 py-2 bg-gray-100 border rounded text-center font-medium">
                  {formData.totalOverallPoints}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="font-medium">Total Risk Reduction:</Label>
                <div className="w-20 px-3 py-2 bg-green-100 border rounded text-center font-medium text-green-800">
                  -
                  {parseInt(formData.mitigationReductionA) +
                    parseInt(formData.mitigationReductionB) +
                    parseInt(formData.mitigationReductionC)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Risk Determination */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Overall Risk Determination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="font-medium mb-3 block">
                Risk Level (automatically calculated with mitigations):
              </Label>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <span className="font-medium text-blue-800">
                  {formData.riskDetermination}
                </span>
                <div className="text-sm text-gray-600 mt-1">
                  Based on adjusted risk level: {formData.adjustedRiskLevel}{' '}
                  points
                </div>
              </div>
            </div>

            <div>
              <Label className="font-medium mb-3 block">Bid Decision:</Label>
              <RadioGroup
                value={formData.bidDecision}
                onValueChange={(value) =>
                  handleInputChange('bidDecision', value)
                }
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="accept" id="bid-accept" />
                  <Label htmlFor="bid-accept">
                    By submitting a bid, I acknowledge and accept the risks
                    associated.
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="abstain" id="bid-abstain" />
                  <Label htmlFor="bid-abstain">
                    Due to risk, I choose to abstain from submitting a bid.
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Signature Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Signature</CardTitle>
          </CardHeader>
          <CardContent>
            {isHighRisk && !canSign && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-700 font-medium">
                  ⚠️ Authorization Required
                </p>
                <p className="text-red-600 text-sm mt-1">
                  This RFQ has a risk score of {formData.totalOverallPoints} (exceeds threshold of 16).
                  Only Dave Tandy or Matt Tandy are authorized to sign high-risk RFQs.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  className="mt-1"
                  disabled={!canSign}
                  data-testid="input-signature-date"
                />
              </div>

              <div>
                <Label htmlFor="printedName">Printed Name</Label>
                <Input
                  id="printedName"
                  value={formData.printedName}
                  onChange={(e) =>
                    handleInputChange('printedName', e.target.value)
                  }
                  className="mt-1"
                  disabled={!canSign}
                  data-testid="input-printed-name"
                />
              </div>
            </div>

            <div className="mt-6">
              <Label className="block mb-2">Digital Signature</Label>
              <div
                className={`border border-gray-300 rounded-md p-2 ${
                  canSign ? 'bg-white' : 'bg-gray-100'
                }`}
                style={{ width: '100%', maxWidth: '500px' }}
              >
                <SignatureCanvas
                  ref={signatureCanvasRef}
                  penColor="black"
                  canvasProps={{
                    width: 500,
                    height: 200,
                    style: {
                      width: '100%',
                      height: '200px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      opacity: canSign ? 1 : 0.5,
                      pointerEvents: canSign ? 'auto' : 'none',
                    },
                  }}
                  onEnd={saveSignature}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={clearSignature}
                  disabled={!canSign}
                  data-testid="button-clear-signature"
                >
                  Clear
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={saveSignature}
                  disabled={!canSign}
                  data-testid="button-save-signature"
                >
                  Save Signature
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-center mb-6">
          <Button
            onClick={handleSubmitAssessment}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg font-medium"
            size="lg"
            data-testid="button-submit-assessment"
          >
            Submit Assessment
          </Button>
        </div>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 mb-8">
              <p>FO Form 11 • Version 1.4 10/23/2024</p>
            </div>
          </TabsContent>

          {/* View Submissions Tab */}
          <TabsContent value="view" className="w-full">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>RFQ Risk Assessment Submissions</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search by RFQ#, Customer, or Description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-80"
                        data-testid="input-search-rfq"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredAssessments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm ? 'No assessments match your search.' : 'No RFQ assessments found.'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RFQ Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center">Risk Level</TableHead>
                        <TableHead>Risk Determination</TableHead>
                        <TableHead>Bid Decision</TableHead>
                        <TableHead>Date Created</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssessments.map((assessment) => (
                        <TableRow key={assessment.id} data-testid={`row-assessment-${assessment.id}`}>
                          <TableCell className="font-medium" data-testid={`text-rfq-number-${assessment.id}`}>
                            {assessment.rfqNumber}
                          </TableCell>
                          <TableCell data-testid={`text-customer-${assessment.id}`}>
                            {assessment.customerName || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`text-description-${assessment.id}`}>
                            {assessment.description ? (
                              assessment.description.length > 50 
                                ? `${assessment.description.substring(0, 50)}...` 
                                : assessment.description
                            ) : 'N/A'}
                          </TableCell>
                          <TableCell className="text-center" data-testid={`text-risk-level-${assessment.id}`}>
                            <Badge variant="outline">{assessment.adjustedRiskLevel}</Badge>
                          </TableCell>
                          <TableCell data-testid={`text-risk-determination-${assessment.id}`}>
                            <Badge variant={getRiskBadgeColor(assessment.riskDetermination)}>
                              {assessment.riskDetermination || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`text-bid-decision-${assessment.id}`}>
                            {assessment.bidDecision || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`text-date-${assessment.id}`}>
                            {format(new Date(assessment.createdAt), 'MM/dd/yyyy')}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex items-center gap-1"
                              data-testid={`button-view-${assessment.id}`}
                              onClick={() => {
                                // TODO: Implement view functionality
                                alert(`View details for RFQ ${assessment.rfqNumber}`);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
