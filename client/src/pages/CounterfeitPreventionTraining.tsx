
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Shield, Users, Calendar, Clock, Printer, AlertTriangle, Eye, Zap, CheckCircle, FileText } from "lucide-react";
// @ts-ignore - html2pdf.js doesn't have type definitions
import html2pdf from 'html2pdf.js';

// Print-specific styles
const printStyles = `
@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  
  body * {
    visibility: hidden;
  }
  
  .print-content, .print-content * {
    visibility: visible;
  }
  
  .print-content {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
  
  nav, header, .print\\:hidden {
    display: none !important;
  }
  
  .bullet-point {
    background-color: #000 !important;
  }
  
  .sub-bullet-point {
    border-color: #000 !important;
  }
  
  .red-flag {
    background-color: #dc2626 !important;
  }
}`;

export default function CounterfeitPreventionTraining() {
  const [participants, setParticipants] = useState<Array<{name: string, signature: string, date: string, department: string}>>([
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
    {name: '', signature: '', date: '', department: ''},
  ]);

  const [trainingInfo, setTrainingInfo] = useState({
    date: new Date().toISOString().split('T')[0],
    instructor: '',
    location: '',
    startTime: '',
    endTime: ''
  });

  const [quizAnswers, setQuizAnswers] = useState({
    question1: '',
    question2: '',
    question3: '',
    question4: '',
    question5: '',
    question6: ''
  });

  const addParticipant = () => {
    setParticipants([...participants, {name: '', signature: '', date: '', department: ''}]);
  };

  const updateParticipant = (index: number, field: string, value: string) => {
    const updated = [...participants];
    updated[index] = {...updated[index], [field]: value};
    setParticipants(updated);
  };

  const handlePrint = () => {
    window.print();
  };

  const generatePDF = () => {
    const element = document.querySelector('.print-content') as HTMLElement;
    if (!element) return;

    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: `Counterfeit_Prevention_Training_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        height: element.scrollHeight,
        width: element.scrollWidth
      },
      jsPDF: { 
        unit: 'in', 
        format: 'letter', 
        orientation: 'portrait' 
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Temporarily hide interactive elements for cleaner PDF
    const interactiveElements = document.querySelectorAll('.print\\:hidden, input[type="radio"]:not(:checked)');
    const originalDisplay: string[] = [];
    
    interactiveElements.forEach((el, index) => {
      originalDisplay[index] = (el as HTMLElement).style.display;
      (el as HTMLElement).style.display = 'none';
    });

    // Generate PDF
    html2pdf().set(opt).from(element).save().then(() => {
      // Restore original display
      interactiveElements.forEach((el, index) => {
        (el as HTMLElement).style.display = originalDisplay[index] || '';
      });
=======
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Download, FileText, Shield, Printer } from 'lucide-react';
import { generateQuizPDF, generateAnswerKeyPDF, generateAttendancePDF, generateCombinedPDF } from '@/components/TrainingPDF';

interface QuizAnswer {
  questionId: string;
  answer: string;
}

const CounterfeitPreventionTraining: React.FC = () => {
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [employeeSignature, setEmployeeSignature] = useState('');
  const [employeeDate, setEmployeeDate] = useState('');
  const [instructorSignature, setInstructorSignature] = useState('');
  const [instructorDate, setInstructorDate] = useState('');

  const questions = [
    {
      id: 'q1',
      question: 'What is the primary concern when dealing with counterfeit materials in manufacturing?',
      options: [
        'A) Cost savings from cheaper materials',
        'B) Safety hazards and quality control failures',
        'C) Improved production efficiency',
        'D) Better supplier relationships'
      ],
      correctAnswer: 'B'
    },
    {
      id: 'q2', 
      question: 'Which of the following is a key indicator of potentially counterfeit parts?',
      options: [
        'A) Parts arrive ahead of schedule',
        'B) Pricing significantly below market value',
        'C) Parts have extra documentation',
        'D) Supplier offers extended warranty'
      ],
      correctAnswer: 'B'
    },
    {
      id: 'q3',
      question: 'When should you report suspected counterfeit materials?',
      options: [
        'A) Only after completing production',
        'B) At the end of the work week',
        'C) Immediately upon discovery',
        'D) During the next scheduled meeting'
      ],
      correctAnswer: 'C'
    },
    {
      id: 'q4',
      question: 'What is the best practice for verifying supplier authenticity?',
      options: [
        'A) Accept all documentation at face value',
        'B) Verify through authorized distributor networks',
        'C) Only check pricing information',
        'D) Rely solely on supplier reputation'
      ],
      correctAnswer: 'B'
    },
    {
      id: 'q5',
      question: 'Which documentation should be carefully inspected for counterfeits?',
      options: [
        'A) Only shipping manifests',
        'B) Certificates of compliance and test reports',
        'C) Only purchase orders',
        'D) Only invoices and receipts'
      ],
      correctAnswer: 'B'
    },
    {
      id: 'q6',
      question: 'What should you do if you discover counterfeit materials after they have been used in production?',
      options: [
        'A) Continue using them to avoid waste',
        'B) Quarantine affected products and notify quality control',
        'C) Use them only for non-critical applications',
        'D) Return them after completing the current batch'
      ],
      correctAnswer: 'B'
    }
  ];

  const handleAnswerChange = (questionId: string, answer: string) => {
    setQuizAnswers(prev => {
      const existing = prev.findIndex(a => a.questionId === questionId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { questionId, answer };
        return updated;
      }
      return [...prev, { questionId, answer }];
    });
  };

  const handleGenerateQuizPDF = async () => {
    await generateQuizPDF({
      title: 'Counterfeit Prevention Training - Assessment',
      companyName: 'AG Advanced Technologies LLC',
      questions: questions
    });
  };

  const handleGenerateAnswerKeyPDF = async () => {
    await generateAnswerKeyPDF({
      title: 'Counterfeit Prevention Training - Assessment',
      companyName: 'AG Advanced Technologies LLC',
      questions: questions
    });
  };

  const handleGenerateAttendancePDF = async () => {
    await generateAttendancePDF({
      title: 'Counterfeit Prevention Training - Attendance',
      companyName: 'AG Advanced Technologies LLC',
      attendeeCount: 15
    });
  };

  const handlePrint = async () => {
    // Extract training content text for PDF
    const trainingContent = [
      'INTRODUCTION',
      'Counterfeiting is growing in exponential proportions with respect to the types of:',
      '1. Products being counterfeited',
      '2. Industries affected', 
      '3. Potential consequences caused by counterfeits',
      'If this threat is not adequately addressed, counterfeit items have the potential to seriously compromise the safety and operational effectiveness of our products.',
      '',
      'REFERENCE',
      '• AS9100(D) Section 8.1.4',
      '• Quality Manual Section 8.1.4',
      '• Process Manual Section 3.13',
      '',
      'PURPOSE',
      'The objective of this training is to raise awareness of:',
      '1. The risks and impacts of counterfeit parts infiltrating the supply chain',
      '2. Best practices to eliminate or mitigate those risks',
      '3. The AG Composites counterfeit prevention requirements for suppliers',
      '',
      'IMPACT OF COUNTERFEIT PARTS',
      'Counterfeit parts can cause:',
      '1. Personal injury',
      '2. Mission failure',
      '3. Reduced reliability and product recall',
      '4. Potential loss of contracts',
      '5. Shutdown of manufacturing lines',
      '6. Negative cost and schedule impacts',
      '7. Penalties for companies and individuals',
      '8. Damage to our image',
      '',
      'PROCEDURE - AVOIDANCE',
      '1. Procuring directly from the Original Component or Equipment manufacturer (OCM/OEM) is the lowest risk.',
      '2. OCM Authorized Distributors are the next lowest risk.',
      '   a. OCM Authorized distributors have documented sales agreements with manufacturers.',
      '   b. Inventory manager should verify authorized distributor status with the manufacturer.',
      '3. AG POs require suppliers to use OCMs or their authorized sources for products that will be delivered to Lockheed Martin.',
      '',
      'AG SUPPLIER REQUIREMENTS',
      'PREVENTION OF COUNTERFEIT PARTS: Suppliers shall ensure through their processes and/or a formal program against the receipt of counterfeit materials into their inventory, against their use in manufacturing, and against their being sold to other suppliers. Supplier shall not deliver counterfeit work or suspect counterfeit work to AG Advanced Technologies. All parts and materials shall be procured only through Original Equipment Manufacturers (OEMs)/Original Component Manufacturers (OCMs) or their franchised dealer or distributors unless pre-approval has been granted by AG Advanced Technologies. Knowingly supplying material deemed or suspected as counterfeit will be considered unethical business practice and would result in a supplier investigation, reporting and possible removal from AG Advanced Technologies Approved Supplier list.',
      '',
      'PROCEDURE - DETECTION',
      'Identify the issue: Carefully inspect the items and identify any visual discrepancies or inconsistencies that suggest they may be counterfeit.',
      'Red Flags:',
      '• No certificate of conformance',
      '• Item marking issues',
      '• Package issues',
      '• Obsolete item',
      '• Unknown supplier',
      '• Batch/lot # issues',
      '• Spelling/return address unknown',
      '• Doesn\'t match previous items',
      '• Poor quality or materials',
      '',
      'PROCEDURE - MITIGATION',
      '1. Isolate the parts: Quarantine the suspect counterfeit parts to prevent them from entering the production line or being used in any product.',
      '2. Document thoroughly: Create detailed documentation including photos, part numbers, lot numbers, supplier information, and any evidence of the suspected counterfeiting.',
      '3. Inform your supplier: Provide evidence and request an explanation. If necessary, require corrective action from the supplier.',
      '4. Conduct an internal investigation: Determine the extent of the problem and potential risks within the supply chain.',
      '5. Communicate with the customer: Rework, replace, or repair any fielded product in conjunction with customer input.',
      '6. Determine if the authorities should be notified and which authorities. (FAA, local police, FBI, etc.)',
      '',
      'PROCEDURE - DISPOSITION',
      '1. Store counterfeit parts or materials in quarantine, clearly identified as nonconforming/counterfeit product pending a review by your organization\'s management and legal representation.',
      '2. Do not return Counterfeit to the supplier in such a way that they could be reintroduced into the supply chain to be sold again to another victim.',
      '3. Legal authorities may be contacted to initiate an investigation into the counterfeiting activity. Parts may be required as evidence.',
      '4. Upon conclusion of any investigation, upper management will authorize the disposition and method for disposing of any suspect/counterfeit items.',
      '',
      'CONCLUSION',
      '• Counterfeit materials are a serious threat and can compromise the integrity of the important products we provide.',
      '• The use of Original Component or Equipment manufacturers and their authorized sources results in the least risk for counterfeit items infiltrating our products.',
      '• If you suspect counterfeit items may have been supplied to AG, you must notify the quality manager immediately.',
      '• Counterfeit risk must be controlled throughout the entire supply chain.',
      '• Thank you for your continued efforts to ensure counterfeit components do not infiltrate our supply chains.'
    ];

    await generateCombinedPDF({
      title: 'Counterfeit Prevention Training - Complete',
      companyName: 'AG Advanced Technologies LLC',
      questions: questions,
      content: trainingContent,
      includeAnswerKey: false,
      attendeeCount: 15

    });
  };

  return (

    <>
      <style>{printStyles}</style>
      <div className="min-h-screen bg-gray-50 p-4 print:bg-white print:p-8 print:m-0">
        <div className="max-w-4xl mx-auto print:max-w-none print-content">
        
        {/* Header Section */}
        <div className="text-center mb-8 print:mb-8 break-inside-avoid">
          <div className="flex items-center justify-center mb-4 print:hidden">
            <Shield className="h-8 w-8 text-red-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">AG Advanced Technologies LLC</h1>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-8 print:shadow-none print:border-0 print:rounded-none print:p-0">
            <h1 className="text-4xl font-bold text-center mb-3 print:text-2xl print:mb-2">AG Advanced Technologies LLC</h1>
            <h2 className="text-3xl font-bold text-gray-600 mb-2 print:text-xl print:text-black print:mb-2">Responsive Reliable Supportive</h2>
            <h3 className="text-5xl font-bold text-red-600 mb-4 print:text-3xl print:text-black print:mb-4">Counterfeit Materials Prevention</h3>
            <p className="text-xl text-gray-600 mb-6 print:text-base print:text-black print:mb-6">
              Training on identifying, preventing, and managing counterfeit materials in the supply chain.
            </p>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-6 mb-8">
          
          {/* Introduction */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-red-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-red-800 print:text-lg print:text-black print:font-bold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 print:hidden" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <p className="text-sm print:text-sm print:text-black mb-4">
                Counterfeiting is growing in exponential proportions with respect to the types of:
              </p>
              <ul className="space-y-2 text-sm print:text-sm print:text-black ml-4">
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Products being counterfeited</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Industries affected</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Potential consequences caused by counterfeits</li>
              </ul>
              <p className="text-sm print:text-sm print:text-black mt-4">
                If this threat is not adequately addressed, counterfeit items have the potential to seriously compromise 
                the safety and operational effectiveness of our products.
              </p>
            </CardContent>
          </Card>

          {/* Purpose */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-blue-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-blue-800 print:text-lg print:text-black print:font-bold">Purpose</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <p className="text-sm print:text-sm print:text-black mb-4">
                The objective of this training is to raise awareness of:
              </p>
              <ul className="space-y-2 text-sm print:text-sm print:text-black">
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>The risks and impacts of counterfeit parts infiltrating the supply chain</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Best practices to eliminate or mitigate those risks</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>The AG Composites counterfeit prevention requirements for suppliers</li>
              </ul>
            </CardContent>
          </Card>

          {/* Impact of Counterfeit Parts */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-orange-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-orange-800 print:text-lg print:text-black print:font-bold">Impact of Counterfeit Parts</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <p className="text-sm print:text-sm print:text-black mb-4">
                Counterfeit parts can cause:
              </p>
              <ul className="space-y-2 text-sm print:text-sm print:text-black">
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Personal injury</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Mission failure</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Reduced reliability and product recall</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Potential loss of contracts</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Shutdown of manufacturing lines</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Negative cost and schedule impacts</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Penalties for companies and individuals</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Damage to our image</li>
              </ul>
            </CardContent>
          </Card>

          {/* Procedure: Avoidance */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-green-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-green-800 print:text-lg print:text-black print:font-bold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 print:hidden" />
                Procedure: Avoidance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-3 text-sm print:text-sm print:text-black">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>
                    <strong>Procuring directly from the Original Component or Equipment manufacturer (OCM/OEM) is the lowest risk.</strong>
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>
                    OCM Authorized Distributors are the next lowest risk.
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>OCM Authorized distributors have documented sales agreements with manufacturers.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Inventory manager should verify authorized distributor status with the manufacturer.</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>AG POs require suppliers to use OCMs or their authorized sources for products that will be delivered to Lockheed Martin.</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* AG Supplier Requirements */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-purple-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-purple-800 print:text-lg print:text-black print:font-bold">AG Supplier Requirements</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <div className="bg-purple-100 p-4 rounded print:bg-white print:border print:border-gray-400 print:p-3">
                <p className="text-sm print:text-sm print:text-black font-semibold mb-2">PREVENTION OF COUNTERFEIT PARTS:</p>
                <p className="text-sm print:text-sm print:text-black">
                  Suppliers shall ensure through their processes and/or a formal program against the receipt of counterfeit materials into their inventory, 
                  against their use in manufacturing, and against their being sold to other suppliers. Supplier shall not deliver counterfeit work or 
                  suspect counterfeit work to AG Advanced Technologies. All parts and materials shall be procured only through Original Equipment 
                  Manufacturers (OEMs)/Original Component Manufacturers (OCMs) or their franchised dealer or distributors unless pre-approval has 
                  been granted by AG Advanced Technologies. Knowingly supplying material deemed or suspected as counterfeit will be considered 
                  unethical business practice and would result in a supplier investigation, reporting and possible removal from AG Advanced 
                  Technologies Approved Supplier list.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Procedure: Detection */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-yellow-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-yellow-800 print:text-lg print:text-black print:font-bold flex items-center gap-2">
                <Eye className="h-5 w-5 print:hidden" />
                Procedure: Detection
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <p className="text-sm print:text-sm print:text-black mb-4">
                <strong>Identify the issue:</strong> Carefully inspect the items and identify any visual discrepancies or inconsistencies that suggest they may be counterfeit.
              </p>
              <h4 className="font-semibold text-sm print:text-sm print:text-black mb-3 flex items-center gap-2">
                <span className="text-red-600 print:text-black">🚩</span> Red Flags:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm print:text-sm print:text-black">
                <ul className="space-y-1">
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">🚩</span>No certificate of conformance</li>
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">🚩</span>Item marking issues</li>
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">🚩</span>Package issues</li>
                </ul>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">🚩</span>Obsolete item</li>
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">☒</span>Batch/lot # issues</li>
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">☒</span>Spelling/return address unknown</li>
                </ul>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">🚩</span>Unknown supplier</li>
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">☒</span>Doesn't match previous items</li>
                  <li className="flex items-center gap-2"><span className="text-red-600 print:text-black red-flag w-4 h-4 flex items-center justify-center rounded text-xs">☒</span>Poor quality or materials</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Procedure: Mitigation */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-indigo-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-indigo-800 print:text-lg print:text-black print:font-bold flex items-center gap-2">
                <Zap className="h-5 w-5 print:hidden" />
                Procedure: Mitigation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm print:text-sm print:text-black">
                <li className="flex items-start"><span className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span><strong>Isolate the parts:</strong> Quarantine the suspect counterfeit parts to prevent them from entering the production line or being used in any product.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span><strong>Document thoroughly:</strong> Create detailed documentation including photos, part numbers, lot numbers, supplier information, and any evidence of the suspected counterfeiting.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span><strong>Inform your supplier:</strong> Provide evidence and request an explanation. If necessary, require corrective action from the supplier.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span><strong>Conduct an internal investigation:</strong> Determine the extent of the problem and potential risks within the supply chain.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span><strong>Communicate with the customer:</strong> Rework, replace, or repair any fielded product in conjunction with customer input.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-indigo-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span><strong>Determine if the authorities should be notified</strong> and which authorities. (FAA, local police, FBI, etc.)</li>
              </ul>
            </CardContent>
          </Card>

          {/* Procedure: Disposition */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-gray-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-gray-800 print:text-lg print:text-black print:font-bold">Procedure: Disposition</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm print:text-sm print:text-black">
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Store counterfeit parts or materials in quarantine, clearly identified as nonconforming/counterfeit product pending a review by your organization's management and legal representation.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Do not return Counterfeit to the supplier in such a way that they could be reintroduced into the supply chain to be sold again to another victim.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Legal authorities may be contacted to initiate an investigation into the counterfeiting activity. Parts may be required as evidence.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Upon conclusion of any investigation, upper management will authorize the disposition and method for disposing of any suspect/counterfeit items.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Conclusion */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-teal-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-teal-800 print:text-lg print:text-black print:font-bold">Conclusion</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm print:text-sm print:text-black">
                <li className="flex items-start"><span className="text-teal-600 print:text-black mr-3 flex-shrink-0 font-bold">➔</span>Counterfeit materials are a serious threat and can compromise the integrity of the important products we provide.</li>
                <li className="flex items-start"><span className="text-teal-600 print:text-black mr-3 flex-shrink-0 font-bold">➔</span>The use of Original Component or Equipment manufacturers and their authorized sources results in the least risk for counterfeit items infiltrating our products.</li>
                <li className="flex items-start"><span className="text-teal-600 print:text-black mr-3 flex-shrink-0 font-bold">➔</span>If you suspect counterfeit items may have been supplied to AG, you must notify the quality manager immediately.</li>
                <li className="flex items-start"><span className="text-teal-600 print:text-black mr-3 flex-shrink-0 font-bold">➔</span>Counterfeit risk must be controlled throughout the entire supply chain.</li>
                <li className="flex items-start"><span className="text-teal-600 print:text-black mr-3 flex-shrink-0 font-bold">➔</span>Thank you for your continued efforts to ensure counterfeit components do not infiltrate our supply chains.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Quiz Section */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-slate-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-slate-800 print:text-lg print:text-black print:font-bold">Multiple Choice Quiz</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <div className="space-y-6 text-sm print:text-sm print:text-black">
                
                {/* Question 1 */}
                <div>
                  <p className="font-semibold mb-3">1. Which TWO are negative impacts of counterfeit parts?</p>
                  <div className="space-y-2 ml-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question1" 
                        value="a" 
                        checked={quizAnswers.question1 === 'a'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question1: e.target.value})}
                        data-testid="quiz-q1-option-a"
                      />
                      <span>A) Personal injury and mission failure</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question1" 
                        value="b" 
                        checked={quizAnswers.question1 === 'b'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question1: e.target.value})}
                        data-testid="quiz-q1-option-b"
                      />
                      <span>B) Lower costs and faster delivery</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question1" 
                        value="c" 
                        checked={quizAnswers.question1 === 'c'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question1: e.target.value})}
                        data-testid="quiz-q1-option-c"
                      />
                      <span>C) Better product quality and reliability</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question1" 
                        value="d" 
                        checked={quizAnswers.question1 === 'd'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question1: e.target.value})}
                        data-testid="quiz-q1-option-d"
                      />
                      <span>D) Increased customer satisfaction</span>
                    </label>
                  </div>
                </div>
                
                {/* Question 2 */}
                <div>
                  <p className="font-semibold mb-3">2. What is the best way to avoid receiving counterfeit parts?</p>
                  <div className="space-y-2 ml-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question2" 
                        value="a" 
                        checked={quizAnswers.question2 === 'a'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question2: e.target.value})}
                        data-testid="quiz-q2-option-a"
                      />
                      <span>A) Buy from the cheapest supplier available</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question2" 
                        value="b" 
                        checked={quizAnswers.question2 === 'b'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question2: e.target.value})}
                        data-testid="quiz-q2-option-b"
                      />
                      <span>B) Procure directly from Original Component/Equipment Manufacturers (OCM/OEM)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question2" 
                        value="c" 
                        checked={quizAnswers.question2 === 'c'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question2: e.target.value})}
                        data-testid="quiz-q2-option-c"
                      />
                      <span>C) Purchase from online auction sites</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question2" 
                        value="d" 
                        checked={quizAnswers.question2 === 'd'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question2: e.target.value})}
                        data-testid="quiz-q2-option-d"
                      />
                      <span>D) Always buy used parts to save money</span>
                    </label>
                  </div>
                </div>
                
                {/* Question 3 */}
                <div>
                  <p className="font-semibold mb-3">3. Does AG require their suppliers to have a counterfeit prevention program?</p>
                  <div className="space-y-2 ml-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question3" 
                        value="a" 
                        checked={quizAnswers.question3 === 'a'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question3: e.target.value})}
                        data-testid="quiz-q3-option-a"
                      />
                      <span>A) Yes, suppliers must ensure through processes and/or formal programs against counterfeit materials</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question3" 
                        value="b" 
                        checked={quizAnswers.question3 === 'b'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question3: e.target.value})}
                        data-testid="quiz-q3-option-b"
                      />
                      <span>B) No, it's optional for suppliers</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question3" 
                        value="c" 
                        checked={quizAnswers.question3 === 'c'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question3: e.target.value})}
                        data-testid="quiz-q3-option-c"
                      />
                      <span>C) Only large suppliers need counterfeit prevention programs</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question3" 
                        value="d" 
                        checked={quizAnswers.question3 === 'd'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question3: e.target.value})}
                        data-testid="quiz-q3-option-d"
                      />
                      <span>D) AG handles all counterfeit prevention internally</span>
                    </label>
                  </div>
                </div>
                
                {/* Question 4 */}
                <div>
                  <p className="font-semibold mb-3">4. Which are red flags that could indicate counterfeit parts?</p>
                  <div className="space-y-2 ml-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question4" 
                        value="a" 
                        checked={quizAnswers.question4 === 'a'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question4: e.target.value})}
                        data-testid="quiz-q4-option-a"
                      />
                      <span>A) No certificate of conformance and unknown supplier</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question4" 
                        value="b" 
                        checked={quizAnswers.question4 === 'b'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question4: e.target.value})}
                        data-testid="quiz-q4-option-b"
                      />
                      <span>B) Parts arrive quickly and cost less than expected</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question4" 
                        value="c" 
                        checked={quizAnswers.question4 === 'c'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question4: e.target.value})}
                        data-testid="quiz-q4-option-c"
                      />
                      <span>C) Perfect packaging and documentation</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question4" 
                        value="d" 
                        checked={quizAnswers.question4 === 'd'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question4: e.target.value})}
                        data-testid="quiz-q4-option-d"
                      />
                      <span>D) Parts from authorized distributors</span>
                    </label>
                  </div>
                </div>
                
                {/* Question 5 */}
                <div>
                  <p className="font-semibold mb-3">5. What is the first thing you do if you suspect a part is counterfeit?</p>
                  <div className="space-y-2 ml-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question5" 
                        value="a" 
                        checked={quizAnswers.question5 === 'a'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question5: e.target.value})}
                        data-testid="quiz-q5-option-a"
                      />
                      <span>A) Use the part anyway since it might be fine</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question5" 
                        value="b" 
                        checked={quizAnswers.question5 === 'b'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question5: e.target.value})}
                        data-testid="quiz-q5-option-b"
                      />
                      <span>B) Isolate and quarantine the parts to prevent them from entering production</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question5" 
                        value="c" 
                        checked={quizAnswers.question5 === 'c'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question5: e.target.value})}
                        data-testid="quiz-q5-option-c"
                      />
                      <span>C) Return the parts to the supplier immediately</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question5" 
                        value="d" 
                        checked={quizAnswers.question5 === 'd'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question5: e.target.value})}
                        data-testid="quiz-q5-option-d"
                      />
                      <span>D) Throw the parts in the regular trash</span>
                    </label>
                  </div>
                </div>
                
                {/* Question 6 */}
                <div>
                  <p className="font-semibold mb-3">6. What should you do with items you suspect are counterfeit?</p>
                  <div className="space-y-2 ml-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question6" 
                        value="a" 
                        checked={quizAnswers.question6 === 'a'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question6: e.target.value})}
                        data-testid="quiz-q6-option-a"
                      />
                      <span>A) Throw them away immediately</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question6" 
                        value="b" 
                        checked={quizAnswers.question6 === 'b'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question6: e.target.value})}
                        data-testid="quiz-q6-option-b"
                      />
                      <span>B) Return them to the supplier so they can investigate</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question6" 
                        value="c" 
                        checked={quizAnswers.question6 === 'c'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question6: e.target.value})}
                        data-testid="quiz-q6-option-c"
                      />
                      <span>C) Store in quarantine as nonconforming/counterfeit product pending management review</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="question6" 
                        value="d" 
                        checked={quizAnswers.question6 === 'd'}
                        onChange={(e) => setQuizAnswers({...quizAnswers, question6: e.target.value})}
                        data-testid="quiz-q6-option-d"
                      />
                      <span>D) Sell them to another company</span>
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Signature Section */}
              <div className="mt-8 pt-6 border-t border-gray-400">
                <div className="grid grid-cols-2 gap-8 print:gap-4">
                  <div className="space-y-2">
                    <label className="font-semibold text-sm print:text-sm print:text-black">Employee Signature:</label>
                    <div className="border-b-2 border-gray-400 h-12 print:h-8"></div>
                    <div className="text-xs text-gray-600 print:text-xs print:text-black">Date: ________________</div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-semibold text-sm print:text-sm print:text-black">Training Instructor:</label>
                    <div className="border-b-2 border-gray-400 h-12 print:h-8"></div>
                    <div className="text-xs text-gray-600 print:text-xs print:text-black">Date: ________________</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Training Information Section */}
        <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4 print:hidden">
          <CardHeader className="pb-4 print:border-b print:border-gray-400 print:p-3">
            <CardTitle className="flex items-center gap-2 print:text-lg print:font-bold">
              <Calendar className="h-5 w-5" />
              Training Information
            </CardTitle>
          </CardHeader>
          <CardContent className="print:p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={trainingInfo.date}
                  onChange={(e) => setTrainingInfo({...trainingInfo, date: e.target.value})}
                  data-testid="input-training-date"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Instructor</label>
                <Input
                  type="text"
                  placeholder="Instructor name"
                  value={trainingInfo.instructor}
                  onChange={(e) => setTrainingInfo({...trainingInfo, instructor: e.target.value})}
                  data-testid="input-training-instructor"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Location</label>
                <Input
                  type="text"
                  placeholder="Training location"
                  value={trainingInfo.location}
                  onChange={(e) => setTrainingInfo({...trainingInfo, location: e.target.value})}
                  data-testid="input-training-location"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Time</label>
                <Input
                  type="time"
                  value={trainingInfo.startTime}
                  onChange={(e) => setTrainingInfo({...trainingInfo, startTime: e.target.value})}
                  data-testid="input-training-start-time"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Time</label>
                <Input
                  type="time"
                  value={trainingInfo.endTime}
                  onChange={(e) => setTrainingInfo({...trainingInfo, endTime: e.target.value})}
                  data-testid="input-training-end-time"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Participant Management Section */}
        <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4 print:hidden">
          <CardHeader className="pb-4 print:border-b print:border-gray-400 print:p-3">
            <CardTitle className="flex items-center gap-2 print:text-lg print:font-bold">
              <Users className="h-5 w-5" />
              Participant Management
            </CardTitle>
          </CardHeader>
          <CardContent className="print:p-3">
            <div className="space-y-4 mb-6">
              {participants.map((participant, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      type="text"
                      placeholder="Participant name"
                      value={participant.name}
                      onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                      data-testid={`input-participant-name-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Department</label>
                    <Input
                      type="text"
                      placeholder="Department"
                      value={participant.department}
                      onChange={(e) => updateParticipant(index, 'department', e.target.value)}
                      data-testid={`input-participant-department-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Signature</label>
                    <Input
                      type="text"
                      placeholder="Digital signature"
                      value={participant.signature}
                      onChange={(e) => updateParticipant(index, 'signature', e.target.value)}
                      data-testid={`input-participant-signature-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input
                      type="date"
                      value={participant.date}
                      onChange={(e) => updateParticipant(index, 'date', e.target.value)}
                      data-testid={`input-participant-date-${index}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button 
              onClick={addParticipant} 
              variant="outline" 
              className="w-full"
              data-testid="button-add-participant"
            >
              <Users className="h-4 w-4 mr-2" />
              Add Participant
            </Button>
          </CardContent>
        </Card>


        {/* Footer with Date */}
        <div className="mt-8 text-center border-t border-gray-400 pt-4 print:mt-6 print:pt-3">
          <p className="text-sm text-gray-600 print:text-black">Date: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 text-center print:hidden space-x-4">
          <Button 
            onClick={handlePrint} 
            className="bg-red-600 hover:bg-red-700"
            data-testid="button-print-counterfeit-training"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Training Sheet
          </Button>
          <Button 
            onClick={generatePDF} 
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="button-pdf-counterfeit-training"
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate PDF
          </Button>
        </div>
        </div>
      </div>
    </>
  );
}

    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Counterfeit Prevention Training</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleGenerateQuizPDF} variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Quiz PDF
            </Button>
            <Button onClick={handleGenerateAnswerKeyPDF} variant="outline" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Answer Key
            </Button>
            <Button onClick={handleGenerateAttendancePDF} variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Attendance PDF
            </Button>
            <Button onClick={handlePrint} className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print All
            </Button>
          </div>
        </div>

        <div id="training-content" className="bg-white p-8">
          {/* Training Content */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-center w-full">
                <div className="w-full">
                  <div className="text-sm text-gray-600 mb-2">AG Advanced Technologies LLC</div>
                  <div className="text-lg font-bold text-blue-600 mb-1">Counterfeit Materials Prevention</div>
                  <div className="text-sm italic">Responsive • Reliable • Supportive</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              
              {/* Introduction */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Introduction</h3>
                <p className="mb-3">Counterfeiting is growing in exponential proportions with respect to the types of:</p>
                <ol className="list-decimal pl-6 space-y-1">
                  <li>Products being counterfeited</li>
                  <li>Industries affected</li>
                  <li>Potential consequences caused by counterfeits</li>
                </ol>
                <p className="mt-3 text-sm text-gray-700">
                  If this threat is not adequately addressed, counterfeit items have the potential to seriously compromise the safety and operational effectiveness of our products.
                </p>
              </div>

              {/* Reference */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Reference</h3>
                <ul className="space-y-1 list-disc pl-6">
                  <li>AS9100(D) Section 8.1.4</li>
                  <li>Quality Manual Section 8.1.4</li>
                  <li>Process Manual Section 3.13</li>
                </ul>
              </div>

              {/* Purpose */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Purpose</h3>
                <p className="mb-3">The objective of this training is to raise awareness of:</p>
                <ol className="list-decimal pl-6 space-y-1">
                  <li>The risks and impacts of counterfeit parts infiltrating the supply chain</li>
                  <li>Best practices to eliminate or mitigate those risks</li>
                  <li>The AG Composites counterfeit prevention requirements for suppliers</li>
                </ol>
              </div>

              {/* Impact of Counterfeit Parts */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Impact of Counterfeit Parts</h3>
                <p className="mb-3">Counterfeit parts can cause:</p>
                <ol className="list-decimal pl-6 space-y-1">
                  <li>Personal injury</li>
                  <li>Mission failure</li>
                  <li>Reduced reliability and product recall</li>
                  <li>Potential loss of contracts</li>
                  <li>Shutdown of manufacturing lines</li>
                  <li>Negative cost and schedule impacts</li>
                  <li>Penalties for companies and individuals</li>
                  <li>Damage to our image</li>
                </ol>
              </div>

              {/* Procedure - Avoidance */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Procedure - Avoidance</h3>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>Procuring directly from the Original Component or Equipment manufacturer (OCM/OEM) is the lowest risk.</li>
                  <li>OCM Authorized Distributors are the next lowest risk.
                    <ol className="list-[lower-alpha] pl-6 mt-1 space-y-1">
                      <li>OCM Authorized distributors have documented sales agreements with manufacturers.</li>
                      <li>Inventory manager should verify authorized distributor status with the manufacturer.</li>
                    </ol>
                  </li>
                  <li>AG POs require suppliers to use OCMs or their authorized sources for products that will be delivered to Lockheed Martin.</li>
                </ol>
              </div>

              {/* AG Supplier Requirements */}
              <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                <h3 className="text-lg font-semibold mb-3 text-blue-600">AG Supplier Requirements</h3>
                <div className="text-sm">
                  <strong>PREVENTION OF COUNTERFEIT PARTS:</strong> Suppliers shall ensure through their processes and/or a formal program against the receipt of counterfeit materials into their inventory, against their use in manufacturing, and against their being sold to other suppliers. Supplier shall not deliver counterfeit work or suspect counterfeit work to AG Advanced Technologies. All parts and materials shall be procured only through Original Equipment Manufacturers (OEMs)/Original Component Manufacturers (OCMs) or their franchised dealer or distributors unless pre-approval has been granted by AG Advanced Technologies. Knowingly supplying material deemed or suspected as counterfeit will be considered unethical business practice and would result in a supplier investigation, reporting and possible removal from AG Advanced Technologies Approved Supplier list.
                </div>
              </div>

              {/* Procedure - Detection */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Procedure - Detection</h3>
                <p className="mb-3">Identify the issue: Carefully inspect the items and identify any visual discrepancies or inconsistencies that suggest they may be counterfeit.</p>
                
                <h4 className="font-semibold mb-3 text-red-600">Red Flags:</h4>
                <div className="grid md:grid-cols-2 gap-2 text-sm">
                  <div className="space-y-1">
                    <div>🚩 No certificate of conformance</div>
                    <div>🚩 Item marking issues</div>
                    <div>🚩 Package issues</div>
                    <div>🚩 Obsolete item</div>
                    <div>🚩 Unknown supplier</div>
                  </div>
                  <div className="space-y-1">
                    <div>❌ Batch/lot # issues</div>
                    <div>❌ Spelling/return address unknown</div>
                    <div>❌ Doesn't match previous items</div>
                    <div>❌ Poor quality or materials</div>
                  </div>
                </div>
              </div>

              {/* Procedure - Mitigation */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Procedure - Mitigation</h3>
                <ol className="list-decimal pl-6 space-y-2 text-sm">
                  <li><strong>Isolate the parts:</strong> Quarantine the suspect counterfeit parts to prevent them from entering the production line or being used in any product.</li>
                  <li><strong>Document thoroughly:</strong> Create detailed documentation including photos, part numbers, lot numbers, supplier information, and any evidence of the suspected counterfeiting.</li>
                  <li><strong>Inform your supplier:</strong> Provide evidence and request an explanation. If necessary, require corrective action from the supplier.</li>
                  <li><strong>Conduct an internal investigation:</strong> Determine the extent of the problem and potential risks within the supply chain.</li>
                  <li><strong>Communicate with the customer:</strong> Rework, replace, or repair any fielded product in conjunction with customer input.</li>
                  <li><strong>Determine if the authorities should be notified</strong> and which authorities. (FAA, local police, FBI, etc.)</li>
                </ol>
              </div>

              {/* Procedure - Disposition */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-blue-600">Procedure - Disposition</h3>
                <ol className="list-decimal pl-6 space-y-2 text-sm">
                  <li>Store counterfeit parts or materials in quarantine, clearly identified as nonconforming/counterfeit product pending a review by your organization's management and legal representation.</li>
                  <li>Do not return Counterfeit to the supplier in such a way that they could be reintroduced into the supply chain to be sold again to another victim.</li>
                  <li>Legal authorities may be contacted to initiate an investigation into the counterfeiting activity. Parts may be required as evidence.</li>
                  <li>Upon conclusion of any investigation, upper management will authorize the disposition and method for disposing of any suspect/counterfeit items.</li>
                </ol>
              </div>

              {/* Conclusion */}
              <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
                <h3 className="text-lg font-semibold mb-3 text-green-600">Conclusion</h3>
                <ul className="space-y-2 text-sm">
                  <li>➔ Counterfeit materials are a serious threat and can compromise the integrity of the important products we provide.</li>
                  <li>➔ The use of Original Component or Equipment manufacturers and their authorized sources results in the least risk for counterfeit items infiltrating our products.</li>
                  <li>➔ If you suspect counterfeit items may have been supplied to AG, you must notify the quality manager immediately.</li>
                  <li>➔ Counterfeit risk must be controlled throughout the entire supply chain.</li>
                  <li>➔ Thank you for your continued efforts to ensure counterfeit components do not infiltrate our supply chains.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Quiz Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Knowledge Assessment Quiz</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {questions.map((question, index) => (
                  <div key={question.id} className="space-y-3">
                    <h4 className="font-medium">
                      {index + 1}. {question.question}
                    </h4>
                    <RadioGroup
                      value={quizAnswers.find(a => a.questionId === question.id)?.answer || ''}
                      onValueChange={(value) => handleAnswerChange(question.id, value)}
                    >
                      {question.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center space-x-2">
                          <RadioGroupItem 
                            value={option.charAt(0)} 
                            id={`${question.id}-${optionIndex}`}
                            data-testid={`radio-${question.id}-${option.charAt(0)}`}
                          />
                          <Label 
                            htmlFor={`${question.id}-${optionIndex}`} 
                            className="cursor-pointer"
                          >
                            {option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
              </div>

              <Separator className="my-8" />

              {/* Signatures Section */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Training Completion Signatures</h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="employee-signature">Employee Signature</Label>
                    <Input
                      id="employee-signature"
                      value={employeeSignature}
                      onChange={(e) => setEmployeeSignature(e.target.value)}
                      placeholder="Employee signature"
                      data-testid="input-employee-signature"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="employee-date">Date</Label>
                    <Input
                      id="employee-date"
                      type="date"
                      value={employeeDate}
                      onChange={(e) => setEmployeeDate(e.target.value)}
                      data-testid="input-employee-date"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="instructor-signature">Training Instructor</Label>
                    <Input
                      id="instructor-signature"
                      value={instructorSignature}
                      onChange={(e) => setInstructorSignature(e.target.value)}
                      placeholder="Instructor signature"
                      data-testid="input-instructor-signature"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="instructor-date">Date</Label>
                    <Input
                      id="instructor-date"
                      type="date"
                      value={instructorDate}
                      onChange={(e) => setInstructorDate(e.target.value)}
                      data-testid="input-instructor-date"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default CounterfeitPreventionTraining;

