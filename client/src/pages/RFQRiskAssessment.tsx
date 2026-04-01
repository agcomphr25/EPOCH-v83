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
import { Save, Printer, Download, List, Plus, Eye, Search, Upload, Trash2, FileText } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import type { P2Customer } from '@shared/schema';
import { COMPANY_INFO } from '@shared/company-config';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

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
  status: string;
  submittedBy: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function RFQRiskAssessment() {
  // Tab and search state
  const [activeTab, setActiveTab] = useState('create');
  const [userSwitchedTab, setUserSwitchedTab] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAssessmentId, setEditingAssessmentId] = useState<number | null>(null);
  const [isViewingSubmitted, setIsViewingSubmitted] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Signature canvas reference
  const signatureCanvasRef = useRef<SignatureCanvas>(null);
  
  const { toast } = useToast();

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
  });

  // Default to "view" tab when assessments exist and the user hasn't manually switched tabs
  useEffect(() => {
    if (!userSwitchedTab && assessments.length > 0) {
      setActiveTab('view');
    }
  }, [assessments.length, userSwitchedTab]);

  // Authorization logic for high-risk RFQs (score > 16)
  const isHighRisk = formData.totalOverallPoints > 16;
  const isAuthorizedSigner = session?.username === 'tandyd' || session?.username === 'tandym';
  const requiresExecutiveApproval = isHighRisk;
  const canApprove = !requiresExecutiveApproval || isAuthorizedSigner;
  const canEditSignature = (!requiresExecutiveApproval || isAuthorizedSigner) && !isViewingSubmitted;

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

  // Effect to load signature into canvas when signature data changes
  useEffect(() => {
    // Use a small delay to ensure canvas is fully mounted
    const loadSignature = setTimeout(() => {
      if (formData.signature && signatureCanvasRef.current) {
        try {
          // Clear the canvas first to prevent duplicates
          signatureCanvasRef.current.clear();
          // Load the signature
          signatureCanvasRef.current.fromDataURL(formData.signature);
        } catch (error) {
          console.error('Error loading signature:', error);
        }
      } else if (!formData.signature && signatureCanvasRef.current) {
        // If there's no signature data, ensure canvas is clear
        signatureCanvasRef.current.clear();
      }
    }, 100);

    return () => clearTimeout(loadSignature);
  }, [formData.signature]);

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
    toast({
      title: 'Signature Cleared',
      description: 'The signature has been removed.',
    });
  };

  // Save signature as base64
  const saveSignature = () => {
    if (signatureCanvasRef.current) {
      const signatureData = signatureCanvasRef.current.toDataURL();
      setFormData((prev) => ({ ...prev, signature: signatureData }));
      toast({
        title: 'Signature Saved',
        description: 'Your signature has been saved to the form.',
      });
    }
  };

  // Handle form submission
  const handleSubmitAssessment = async () => {
    // Check authorization for high-risk RFQs
    if (requiresExecutiveApproval && !canApprove) {
      alert(
        `Authorization Required\n\n` +
        `This RFQ has a risk score of ${formData.totalOverallPoints} (exceeds threshold of 16).\n` +
        `Only Dave Tandy or Matt Tandy are authorized to approve and submit high-risk RFQs.\n\n` +
        `Current user: ${session?.username || 'Not logged in'}`
      );
      return;
    }

    // Validate signature is present
    if (!formData.signature) {
      alert('Please sign the form before submitting.');
      return;
    }

    // Validate form fields
    if (!validateForm()) return;

    // Check if assessment exists (needs to be saved first)
    if (!editingAssessmentId) {
      const proceed = confirm(
        'This assessment has not been saved yet.\n\n' +
        'Would you like to save and submit it now?'
      );
      if (!proceed) return;
      
      // Save first, then submit
      try {
        const saveResponse = await fetch('/api/customers/rfq-assessments', {
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

        if (!saveResponse.ok) {
          throw new Error('Failed to save RFQ Risk Assessment');
        }

        const savedAssessment = await saveResponse.json();
        setEditingAssessmentId(savedAssessment.id);
        
        // Now submit it
        const submitResponse = await fetch(`/api/customers/rfq-assessments/${savedAssessment.id}/submit`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (!submitResponse.ok) {
          const error = await submitResponse.json();
          if (submitResponse.status === 401) {
            throw new Error('You must be logged in to submit assessments');
          }
          throw new Error(error.error || 'Failed to submit RFQ Risk Assessment');
        }

        alert('RFQ Risk Assessment saved and submitted successfully!');
        clearForm();
        await refetchAssessments();
        setActiveTab('view');
      } catch (error) {
        console.error('Error submitting RFQ Risk Assessment:', error);
        alert(`Failed to submit RFQ Risk Assessment: ${error instanceof Error ? error.message : 'Please try again.'}`);
      }
    } else {
      // Assessment already exists, just submit it
      try {
        const response = await fetch(`/api/customers/rfq-assessments/${editingAssessmentId}/submit`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 401) {
            throw new Error('You must be logged in to submit assessments');
          }
          throw new Error(error.error || 'Failed to submit RFQ Risk Assessment');
        }

        alert('RFQ Risk Assessment submitted successfully!');
        clearForm();
        await refetchAssessments();
        setActiveTab('view');
      } catch (error) {
        console.error('Error submitting RFQ Risk Assessment:', error);
        alert(`Failed to submit RFQ Risk Assessment: ${error instanceof Error ? error.message : 'Please try again.'}`);
      }
    }
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
    if (!validateForm()) return;
    
    // Show warning for high-risk RFQs being saved by non-authorized users
    if (requiresExecutiveApproval && !isAuthorizedSigner) {
      const proceed = confirm(
        `⚠️ High-Risk Assessment Warning\n\n` +
        `This RFQ has a risk score of ${formData.totalOverallPoints} (exceeds threshold of 16).\n\n` +
        `You can save this assessment as a draft, but only Dave Tandy or Matt Tandy can sign and approve it.\n\n` +
        `Current user: ${session?.username || 'Not logged in'}\n\n` +
        `Click OK to save as draft, or Cancel to go back.`
      );
      if (!proceed) return;
    }

    try {
      let response;
      const payload = {
        rfqNumber: formData.rfqNumber,
        customerId: formData.customerId,
        description: formData.description,
        formData: formData,
        totalOverallPoints: formData.totalOverallPoints,
        adjustedRiskLevel: formData.adjustedRiskLevel,
        riskDetermination: formData.riskDetermination,
        bidDecision: formData.bidDecision,
      };

      if (editingAssessmentId) {
        // Update existing assessment
        response = await fetch(`/api/customers/rfq-assessments/${editingAssessmentId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new assessment
        response = await fetch('/api/customers/rfq-assessments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        throw new Error('Failed to save RFQ Risk Assessment');
      }

      const savedAssessment = await response.json();
      console.log('Form data saved:', savedAssessment);
      
      // Keep the assessment loaded so user can upload PDFs immediately
      setEditingAssessmentId(savedAssessment.id);
      setAttachments(savedAssessment.attachments || []);
      
      // Refresh the assessments list in background
      await refetchAssessments();
      
      if (editingAssessmentId) {
        toast({
          title: 'Assessment Updated',
          description: 'RFQ Risk Assessment updated successfully! You can now upload PDF attachments.',
        });
      } else {
        toast({
          title: 'Assessment Saved',
          description: 'RFQ Risk Assessment saved successfully! You can now upload PDF attachments.',
        });
      }
    } catch (error) {
      console.error('Error saving RFQ Risk Assessment:', error);
      alert('Failed to save RFQ Risk Assessment. Please try again.');
    }
  };

  const handlePrint = () => {
    // Check authorization for high-risk RFQs
    if (requiresExecutiveApproval && !canApprove) {
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

  const handleViewPdf = () => {
    if (!editingAssessmentId) {
      toast({
        title: 'Save Required',
        description: 'Please save the assessment before viewing the PDF.',
        variant: 'destructive',
      });
      return;
    }

    // Open PDF in new tab
    const pdfUrl = `/api/customers/rfq-assessments/${editingAssessmentId}/pdf`;
    window.open(pdfUrl, '_blank');
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

  // File upload handlers
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Validate PDF files only
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') {
        toast({
          title: 'Invalid File Type',
          description: 'Only PDF files are allowed.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsUploadingFile(true);

    try {
      let assessmentId = editingAssessmentId;
      let wasAutoSaved = false;

      // Auto-save assessment if not already saved
      if (!assessmentId) {
        // Validate required fields before auto-saving
        if (!formData.customerId || !formData.rfqNumber) {
          toast({
            title: 'Missing Information',
            description: 'Please select a customer first before uploading files.',
            variant: 'destructive',
          });
          setIsUploadingFile(false);
          return;
        }

        // Validate mitigation actions if needed
        if (!validateForm()) {
          setIsUploadingFile(false);
          return;
        }

        toast({
          title: 'Auto-saving Assessment',
          description: 'Saving assessment before uploading files...',
        });

        const payload = {
          rfqNumber: formData.rfqNumber,
          customerId: formData.customerId,
          description: formData.description,
          formData: formData,
          totalOverallPoints: formData.totalOverallPoints,
          adjustedRiskLevel: formData.adjustedRiskLevel,
          riskDetermination: formData.riskDetermination,
          bidDecision: formData.bidDecision,
        };

        const saveResponse = await fetch('/api/customers/rfq-assessments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!saveResponse.ok) {
          const errorData = await saveResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to auto-save assessment');
        }

        const savedAssessment = await saveResponse.json();
        assessmentId = savedAssessment.id;
        setEditingAssessmentId(assessmentId);
        wasAutoSaved = true;
        await refetchAssessments();
      }

      // Now upload the files
      const uploadFormData = new FormData();
      for (const file of Array.from(files)) {
        uploadFormData.append('files', file);
      }

      const response = await fetch(`/api/customers/rfq-assessments/${assessmentId}/attachments`, {
        method: 'POST',
        body: uploadFormData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();
      setAttachments(result.attachments || []);
      
      toast({
        title: 'Success',
        description: wasAutoSaved 
          ? 'Assessment saved and files uploaded successfully.' 
          : 'Files uploaded successfully.',
      });
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload files. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (fileName: string) => {
    if (!editingAssessmentId) return;

    try {
      const response = await fetch(`/api/customers/rfq-assessments/${editingAssessmentId}/attachments/${fileName}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');

      const result = await response.json();
      setAttachments(result.assessment?.attachments || []);
      toast({
        title: 'Success',
        description: 'Attachment deleted successfully.',
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete attachment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Function to load an assessment into the form for editing or viewing
  const loadAssessmentForEditing = async (rfqNumber: string) => {
    try {
      const response = await fetch(`/api/customers/rfq-assessments/${rfqNumber}`);
      if (!response.ok) {
        throw new Error('Failed to load assessment');
      }
      
      const assessment = await response.json();
      
      // Populate form with saved data
      if (assessment.formData) {
        setFormData(assessment.formData);
        setEditingAssessmentId(assessment.id);
        setIsViewingSubmitted(assessment.status === 'submitted');
        setAttachments(assessment.attachments || []);
        
        // Signature will be loaded automatically by the useEffect hook
        
        // Switch to create tab to show the loaded form
        setActiveTab('create');
        
        // Check if assessment is already submitted
        if (assessment.status === 'submitted') {
          alert(
            `Viewing submitted assessment - This is read-only.\n\n` +
            `Submitted by: ${assessment.submittedBy || 'Unknown'}\n` +
            `Submitted on: ${assessment.submittedAt ? format(new Date(assessment.submittedAt), 'MM/dd/yyyy') : 'Unknown'}`
          );
        } else {
          alert(`Loaded RFQ ${rfqNumber} for editing. Make your changes and click "Save Form" to update.`);
        }
      }
    } catch (error) {
      console.error('Error loading assessment:', error);
      alert('Failed to load assessment. Please try again.');
    }
  };

  // Function to clear the form and start fresh
  const clearForm = () => {
    setFormData({
      customerId: '',
      customerName: '',
      rfqNumber: '',
      description: '',
      trainedStaff: '',
      equipmentRequirements: '',
      manufacturingSpace: '',
      regulatoryRequirements: '',
      conflictingPriorities: '',
      customerConcentration: '',
      climateEnvironmental: '',
      internalSubtotal: 0,
      supplyChainDisruptions: '',
      supplierVariability: '',
      contractProvisions: '',
      timelines: '',
      qualityExpectations: '',
      externalSubtotal: 0,
      mitigationActionA: '',
      mitigationActionB: '',
      mitigationActionC: '',
      mitigationReductionA: '0',
      mitigationReductionB: '0',
      mitigationReductionC: '0',
      totalOverallPoints: 0,
      adjustedRiskLevel: 0,
      riskDetermination: '',
      bidDecision: '',
      date: '',
      printedName: '',
      signature: '',
    });
    setEditingAssessmentId(null);
    setIsViewingSubmitted(false);
    setAttachments([]);
    
    // Clear signature canvas
    if (signatureCanvasRef.current) {
      signatureCanvasRef.current.clear();
    }
  };

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

        <Tabs value={activeTab} onValueChange={(tab) => { setUserSwitchedTab(true); setActiveTab(tab); }} className="w-full">
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
            {/* Read-Only Banner for Submitted Assessments */}
            {isViewingSubmitted && (
              <div className="bg-gray-100 border-2 border-gray-400 rounded-lg p-4 mb-4 text-center">
                <p className="text-gray-900 font-bold text-lg">
                  👁️ VIEWING SUBMITTED ASSESSMENT (READ-ONLY)
                </p>
                <p className="text-gray-700 mt-1">
                  This assessment has been submitted and cannot be modified. All form fields are disabled.
                </p>
              </div>
            )}

            {/* High-Risk Warning Banner */}
            {requiresExecutiveApproval && !isViewingSubmitted && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 text-center">
                <p className="text-red-800 font-bold text-lg">
                  ⚠️ HIGH-RISK ASSESSMENT (Score: {formData.totalOverallPoints})
                </p>
                <p className="text-red-700 mt-1">
                  Executive approval required - Only Dave Tandy or Matt Tandy can sign and approve this assessment
                </p>
              </div>
            )}

            {/* Editing indicator and action buttons */}
            {editingAssessmentId && !isViewingSubmitted && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-center">
                <p className="text-blue-800 font-medium">
                  ✏️ Editing RFQ {formData.rfqNumber} - Make changes and click "Save Form" to update
                </p>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex justify-center gap-3 mb-6">
              {(editingAssessmentId || isViewingSubmitted) && (
                <Button 
                  onClick={clearForm} 
                  variant="secondary"
                  className="flex items-center gap-2"
                  data-testid="button-new-assessment"
                >
                  <Plus className="h-4 w-4" />
                  New Assessment
                </Button>
              )}
              <Button 
                onClick={handleSave} 
                className="flex items-center gap-2"
                data-testid="button-save-form"
                disabled={isViewingSubmitted}
              >
                <Save className="h-4 w-4" />
                {editingAssessmentId ? 'Update Form' : 'Save Form'}
              </Button>
              <Button
                onClick={handlePrint}
                variant="outline"
                className="flex items-center gap-2"
                data-testid="button-print-form"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button 
                onClick={handleViewPdf}
                variant="outline" 
                className="flex items-center gap-2"
                data-testid="button-view-pdf"
                disabled={!editingAssessmentId}
              >
                <Eye className="h-4 w-4" />
                View PDF
              </Button>
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
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
                  disabled={isViewingSubmitted}
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
                Risk Score (automatically calculated with mitigations):
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

        {/* PDF Attachments Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              PDF Attachments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              data-testid="input-file-upload"
            />

            {/* Upload button */}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingFile || isViewingSubmitted}
                className="flex items-center gap-2"
                data-testid="button-upload-pdf"
              >
                <Upload className="h-4 w-4" />
                {isUploadingFile ? 'Uploading...' : 'Upload PDF Files'}
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                {!editingAssessmentId 
                  ? 'Assessment will be auto-saved when you upload files.' 
                  : 'Upload one or more PDF files (max 5 files, 10MB each).'}
              </p>
            </div>

            {/* Attachments list */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium">Attached Files ({attachments.length})</Label>
                <div className="space-y-2">
                  {attachments.map((attachment, index) => {
                    const fileName = attachment.split('/').pop() || attachment;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 border rounded-md"
                        data-testid={`attachment-${index}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-600" />
                          <a
                            href={`/api/customers/rfq-assessments/${editingAssessmentId}/attachments/${fileName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                            data-testid={`link-attachment-${index}`}
                          >
                            {fileName}
                          </a>
                        </div>
                        {!isViewingSubmitted && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAttachment(fileName)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-attachment-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signature Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Signature</CardTitle>
          </CardHeader>
          <CardContent>
            {requiresExecutiveApproval && !canApprove && (
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
                  disabled={!canEditSignature}
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
                  disabled={!canEditSignature}
                  data-testid="input-printed-name"
                />
              </div>
            </div>

            <div className="mt-6">
              <Label className="block mb-2">
                Digital Signature
                {!canEditSignature && (
                  <span className="ml-2 text-sm text-red-600 font-normal">
                    (Executive approval required for high-risk assessments)
                  </span>
                )}
              </Label>
              <div
                className={`border border-gray-300 rounded-md p-2 ${
                  canEditSignature ? 'bg-white' : 'bg-gray-100'
                }`}
                style={{ width: '100%', maxWidth: '500px' }}
              >
                <SignatureCanvas
                  ref={signatureCanvasRef}
                  penColor="black"
                  clearOnResize={false}
                  canvasProps={{
                    width: 500,
                    height: 200,
                    style: {
                      width: '100%',
                      height: '200px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      opacity: canEditSignature ? 1 : 0.5,
                      pointerEvents: canEditSignature ? 'auto' : 'none',
                      touchAction: 'none',
                    },
                  }}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={clearSignature}
                  disabled={!canEditSignature}
                  data-testid="button-clear-signature"
                >
                  Clear
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={saveSignature}
                  disabled={!canEditSignature}
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
            disabled={!canApprove || isViewingSubmitted}
            data-testid="button-submit-assessment"
          >
            Submit Assessment
            {!canApprove && ' (Executive Approval Required)'}
            {isViewingSubmitted && ' (Already Submitted)'}
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
                        <TableHead className="text-center">Risk Score</TableHead>
                        <TableHead>Risk Determination</TableHead>
                        <TableHead>Bid Decision</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Date Created</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssessments.map((assessment) => {
                        const isSubmitted = assessment.status === 'submitted';
                        return (
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
                            <TableCell className="text-center" data-testid={`text-status-${assessment.id}`}>
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant={isSubmitted ? 'default' : 'secondary'}>
                                  {isSubmitted ? 'Submitted' : 'Draft'}
                                </Badge>
                                {isSubmitted && assessment.submittedBy && (
                                  <span className="text-xs text-gray-500">
                                    by {assessment.submittedBy}
                                  </span>
                                )}
                                {isSubmitted && assessment.submittedAt && (
                                  <span className="text-xs text-gray-500">
                                    {format(new Date(assessment.submittedAt), 'MM/dd/yyyy')}
                                  </span>
                                )}
                              </div>
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
                                onClick={() => loadAssessmentForEditing(assessment.rfqNumber)}
                              >
                                <Eye className="h-3 w-3" />
                                {isSubmitted ? 'View' : 'Edit'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
