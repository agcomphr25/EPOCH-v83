import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Save, Printer, Download } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';

export default function RFQRiskAssessment() {
  // Signature canvas reference
  const signatureCanvasRef = useRef<SignatureCanvas>(null);

  const [formData, setFormData] = useState({
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
    signature: ''
  });

  // Risk scoring system
  const getRiskScore = (value: string) => {
    switch (value) {
      case 'extreme': return 17;
      case 'high': return 3;
      case 'medium': return 1;
      case 'low': return 0;
      default: return 0;
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
      formData.climateEnvironmental
    ];
    
    const externalRisks = [
      formData.supplyChainDisruptions,
      formData.supplierVariability,
      formData.contractProvisions,
      formData.timelines,
      formData.qualityExpectations
    ];
    
    const internalSubtotal = internalRisks.reduce((sum, risk) => sum + getRiskScore(risk), 0);
    const externalSubtotal = externalRisks.reduce((sum, risk) => sum + getRiskScore(risk), 0);
    const totalOverallPoints = internalSubtotal + externalSubtotal;
    
    // Calculate total risk reduction from mitigation actions
    const totalReduction = parseInt(formData.mitigationReductionA || '0') + parseInt(formData.mitigationReductionB || '0') + parseInt(formData.mitigationReductionC || '0');
    const adjustedRiskLevel = Math.max(0, totalOverallPoints - totalReduction);
    
    console.log('Risk Calculation Debug:', {
      totalOverallPoints,
      totalReduction,
      adjustedRiskLevel,
      mitigationA: formData.mitigationReductionA,
      mitigationB: formData.mitigationReductionB,
      mitigationC: formData.mitigationReductionC
    });
    
    // Determine risk level based on adjusted points
    let riskDetermination = '';
    if (adjustedRiskLevel >= 17) riskDetermination = 'High (17-204 pts)';
    else if (adjustedRiskLevel >= 4) riskDetermination = 'Medium (4-16 pts)';
    else riskDetermination = 'Low (0-3 pts)';
    
    setFormData(prev => ({
      ...prev,
      internalSubtotal,
      externalSubtotal,
      totalOverallPoints,
      adjustedRiskLevel,
      riskDetermination
    }));
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Recalculate scores if it's a risk field or mitigation reduction field
      const riskFields = [
        'trainedStaff', 'equipmentRequirements', 'manufacturingSpace', 
        'regulatoryRequirements', 'conflictingPriorities', 'customerConcentration', 
        'climateEnvironmental', 'supplyChainDisruptions', 'supplierVariability', 
        'contractProvisions', 'timelines', 'qualityExpectations',
        'mitigationReductionA', 'mitigationReductionB', 'mitigationReductionC'
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
          newData.climateEnvironmental
        ];
        
        const externalRisks = [
          newData.supplyChainDisruptions,
          newData.supplierVariability,
          newData.contractProvisions,
          newData.timelines,
          newData.qualityExpectations
        ];
        
        const internalSubtotal = internalRisks.reduce((sum, risk) => sum + getRiskScore(risk), 0);
        const externalSubtotal = externalRisks.reduce((sum, risk) => sum + getRiskScore(risk), 0);
        const totalOverallPoints = internalSubtotal + externalSubtotal;
        
        // Calculate total risk reduction from mitigation actions
        const totalReduction = parseInt(newData.mitigationReductionA || '0') + parseInt(newData.mitigationReductionB || '0') + parseInt(newData.mitigationReductionC || '0');
        const adjustedRiskLevel = Math.max(0, totalOverallPoints - totalReduction);
        
        // Determine risk level based on adjusted points
        let riskDetermination = '';
        if (adjustedRiskLevel >= 17) riskDetermination = 'High (17-204 pts)';
        else if (adjustedRiskLevel >= 4) riskDetermination = 'Medium (4-16 pts)';
        else riskDetermination = 'Low (0-3 pts)';
        
        return {
          ...newData,
          internalSubtotal,
          externalSubtotal,
          totalOverallPoints,
          adjustedRiskLevel,
          riskDetermination
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
    setFormData(prev => ({ ...prev, signature: '' }));
  };

  // Save signature as base64
  const saveSignature = () => {
    if (signatureCanvasRef.current) {
      const signatureData = signatureCanvasRef.current.toDataURL();
      setFormData(prev => ({ ...prev, signature: signatureData }));
    }
  };



  const RiskRadioGroup = ({ 
    name, 
    value, 
    onChange, 
    label 
  }: { 
    name: string; 
    value: string; 
    onChange: (value: string) => void; 
    label: string; 
  }) => (
    <div className="space-y-3 pl-4">
      <Label className="text-sm font-medium">{label}</Label>
      <RadioGroup value={value} onValueChange={onChange} className="flex gap-8 pl-2">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="extreme" id={`${name}-extreme`} />
          <Label htmlFor={`${name}-extreme`} className="text-sm">Extreme</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="high" id={`${name}-high`} />
          <Label htmlFor={`${name}-high`} className="text-sm">High</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="medium" id={`${name}-medium`} />
          <Label htmlFor={`${name}-medium`} className="text-sm">Medium</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="low" id={`${name}-low`} />
          <Label htmlFor={`${name}-low`} className="text-sm">Low</Label>
        </div>
      </RadioGroup>
    </div>
  );

  // Validation function for required mitigation actions
  const validateForm = () => {
    if (!formData.mitigationActionA.trim() || !formData.mitigationActionB.trim() || !formData.mitigationActionC.trim()) {
      alert('All Mitigation Actions are required. Please fill in all three mitigation action fields.');
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validateForm()) return;
    
    // Form is valid, proceed with save
    console.log('Form data saved:', formData);
    alert('RFQ Risk Assessment saved successfully!');
  };

  const handlePrint = () => {
    if (!validateForm()) return;
    
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto ml-16">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900">LLC</h1>
            <p className="text-sm text-gray-600">Responsive • Reliable • Supportive</p>
          </div>
          
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

        {/* RFQ Number */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-center">RFQ Risk Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Label htmlFor="rfqNumber" className="font-medium">#</Label>
              <Input
                id="rfqNumber"
                value={formData.rfqNumber}
                onChange={(e) => handleInputChange('rfqNumber', e.target.value)}
                className="w-64 text-center"
                placeholder="Enter RFQ Number"
              />
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <Label htmlFor="description" className="font-medium">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
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
            <p className="text-sm text-gray-600">Score: Extreme - 17 pts, High - 3 pts, Medium - 1 pt, Low - 0 pt</p>
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
              onChange={(value) => handleInputChange('equipmentRequirements', value)}
              label="b. Equipment Requirements"
            />
            
            <RiskRadioGroup
              name="manufacturingSpace"
              value={formData.manufacturingSpace}
              onChange={(value) => handleInputChange('manufacturingSpace', value)}
              label="c. Manufacturing Space"
            />
            
            <RiskRadioGroup
              name="regulatoryRequirements"
              value={formData.regulatoryRequirements}
              onChange={(value) => handleInputChange('regulatoryRequirements', value)}
              label="d. Regulatory Requirements"
            />
            
            <RiskRadioGroup
              name="conflictingPriorities"
              value={formData.conflictingPriorities}
              onChange={(value) => handleInputChange('conflictingPriorities', value)}
              label="e. Conflicting Priorities of Work"
            />
            
            <RiskRadioGroup
              name="customerConcentration"
              value={formData.customerConcentration}
              onChange={(value) => handleInputChange('customerConcentration', value)}
              label="f. Customer Concentration"
            />
            
            <RiskRadioGroup
              name="climateEnvironmental"
              value={formData.climateEnvironmental}
              onChange={(value) => handleInputChange('climateEnvironmental', value)}
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
            <p className="text-sm text-gray-600">Score: Extreme - 17 pts, High - 3 pts, Medium - 1 pts, Low - 0 pt</p>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            <RiskRadioGroup
              name="supplyChainDisruptions"
              value={formData.supplyChainDisruptions}
              onChange={(value) => handleInputChange('supplyChainDisruptions', value)}
              label="a. Supply Chain Disruptions"
            />
            
            <RiskRadioGroup
              name="supplierVariability"
              value={formData.supplierVariability}
              onChange={(value) => handleInputChange('supplierVariability', value)}
              label="b. Supplier Source Variability"
            />
            
            <RiskRadioGroup
              name="contractProvisions"
              value={formData.contractProvisions}
              onChange={(value) => handleInputChange('contractProvisions', value)}
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
              onChange={(value) => handleInputChange('qualityExpectations', value)}
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
            <p className="text-sm text-gray-600">All mitigation actions are required. Enter numeric values to reduce overall risk level.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <Label htmlFor="mitigationA" className="text-red-500">a. * (Required)</Label>
                <Textarea
                  id="mitigationA"
                  value={formData.mitigationActionA}
                  onChange={(e) => handleInputChange('mitigationActionA', e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder="Describe mitigation action..."
                  required
                />
              </div>
              <div className="w-24">
                <Label htmlFor="reductionA" className="text-sm">Risk Reduction</Label>
                <Input
                  id="reductionA"
                  type="number"
                  min="0"
                  max="50"
                  value={formData.mitigationReductionA}
                  onChange={(e) => handleInputChange('mitigationReductionA', (parseInt(e.target.value) || 0).toString())}
                  className="mt-1 text-center"
                  placeholder="0"
                />
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <Label htmlFor="mitigationB" className="text-red-500">b. * (Required)</Label>
                <Textarea
                  id="mitigationB"
                  value={formData.mitigationActionB}
                  onChange={(e) => handleInputChange('mitigationActionB', e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder="Describe mitigation action..."
                  required
                />
              </div>
              <div className="w-24">
                <Label htmlFor="reductionB" className="text-sm">Risk Reduction</Label>
                <Input
                  id="reductionB"
                  type="number"
                  min="0"
                  max="50"
                  value={formData.mitigationReductionB}
                  onChange={(e) => handleInputChange('mitigationReductionB', (parseInt(e.target.value) || 0).toString())}
                  className="mt-1 text-center"
                  placeholder="0"
                />
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <Label htmlFor="mitigationC" className="text-red-500">c. * (Required)</Label>
                <Textarea
                  id="mitigationC"
                  value={formData.mitigationActionC}
                  onChange={(e) => handleInputChange('mitigationActionC', e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder="Describe mitigation action..."
                  required
                />
              </div>
              <div className="w-24">
                <Label htmlFor="reductionC" className="text-sm">Risk Reduction</Label>
                <Input
                  id="reductionC"
                  type="number"
                  min="0"
                  max="50"
                  value={formData.mitigationReductionC}
                  onChange={(e) => handleInputChange('mitigationReductionC', (parseInt(e.target.value) || 0).toString())}
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
                  -{parseInt(formData.mitigationReductionA) + parseInt(formData.mitigationReductionB) + parseInt(formData.mitigationReductionC)}
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
              <Label className="font-medium mb-3 block">Risk Level (automatically calculated with mitigations):</Label>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <span className="font-medium text-blue-800">{formData.riskDetermination}</span>
                <div className="text-sm text-gray-600 mt-1">
                  Based on adjusted risk level: {formData.adjustedRiskLevel} points
                </div>
              </div>
            </div>
            
            <div>
              <Label className="font-medium mb-3 block">Bid Decision:</Label>
              <RadioGroup 
                value={formData.bidDecision} 
                onValueChange={(value) => handleInputChange('bidDecision', value)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="accept" id="bid-accept" />
                  <Label htmlFor="bid-accept">By submitting a bid, I acknowledge and accept the risks associated.</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="abstain" id="bid-abstain" />
                  <Label htmlFor="bid-abstain">Due to risk, I choose to abstain from submitting a bid.</Label>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="printedName">Printed Name</Label>
                <Input
                  id="printedName"
                  value={formData.printedName}
                  onChange={(e) => handleInputChange('printedName', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            
            <div className="mt-6">
              <Label className="block mb-2">Digital Signature</Label>
              <div className="border border-gray-300 rounded-md p-2 bg-white">
                <SignatureCanvas
                  ref={signatureCanvasRef}
                  penColor="black"
                  canvasProps={{
                    width: 400,
                    height: 150,
                    className: 'signature-canvas border rounded w-full'
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
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 mb-8">
          <p>FO Form 11 • Version 1.4 10/23/2024</p>
        </div>
      </div>
    </div>
  );
}