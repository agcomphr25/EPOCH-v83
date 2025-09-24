import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Download, FileText, Shield, Printer } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { PrintLayout } from '@/components/PrintLayout';

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

  const generatePrintablePDF = () => {
    const element = document.getElementById('printable-training-content');
    if (!element) return;

    // Temporarily make the element visible for PDF generation
    const originalClasses = element.className;
    element.className = element.className.replace('hidden', '').replace('print:block', 'block');
    
    const opt = {
      margin: 0.5,
      filename: `Counterfeit_Prevention_Training_Printable_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      // Restore original classes after PDF generation
      element.className = originalClasses;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Counterfeit Prevention Training</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={generatePrintablePDF} variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download Printable PDF
            </Button>
            <Button onClick={handlePrint} className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print
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

        {/* Printable Content - Hidden on screen, visible in print */}
        <div id="printable-training-content" className="hidden print:block">
          <PrintLayout
            title="Counterfeit Materials Prevention Training"
            companyName="AG Advanced Technologies LLC"
            includeSignatures={true}
            attendeeCount={15}
          >
            {/* Introduction */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Introduction</h2>
              <p className="mb-3">Counterfeiting is growing in exponential proportions with respect to the types of:</p>
              <ol className="list-decimal pl-6 space-y-1">
                <li>Products being counterfeited</li>
                <li>Industries affected</li>
                <li>Potential consequences caused by counterfeits</li>
              </ol>
              <p className="mt-3">
                If this threat is not adequately addressed, counterfeit items have the potential to seriously compromise the safety and operational effectiveness of our products.
              </p>
            </div>

            {/* Reference */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Reference</h2>
              <ul className="space-y-1 list-disc pl-6">
                <li>AS9100(D) Section 8.1.4</li>
                <li>Quality Manual Section 8.1.4</li>
                <li>Process Manual Section 3.13</li>
              </ul>
            </div>

            {/* Purpose */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Purpose</h2>
              <p className="mb-3">The objective of this training is to raise awareness of:</p>
              <ol className="list-decimal pl-6 space-y-1">
                <li>The risks and impacts of counterfeit parts infiltrating the supply chain</li>
                <li>Best practices to eliminate or mitigate those risks</li>
                <li>The AG Composites counterfeit prevention requirements for suppliers</li>
              </ol>
            </div>

            {/* Impact of Counterfeit Parts */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Impact of Counterfeit Parts</h2>
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
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Procedure - Avoidance</h2>
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
            <div className="mb-6 p-4 border border-gray-800 rounded">
              <h2 className="text-lg font-semibold mb-3">AG Supplier Requirements</h2>
              <p className="text-sm">
                <strong>PREVENTION OF COUNTERFEIT PARTS:</strong> Suppliers shall ensure through their processes and/or a formal program against the receipt of counterfeit materials into their inventory, against their use in manufacturing, and against their being sold to other suppliers. Supplier shall not deliver counterfeit work or suspect counterfeit work to AG Advanced Technologies. All parts and materials shall be procured only through Original Equipment Manufacturers (OEMs)/Original Component Manufacturers (OCMs) or their franchised dealer or distributors unless pre-approval has been granted by AG Advanced Technologies. Knowingly supplying material deemed or suspected as counterfeit will be considered unethical business practice and would result in a supplier investigation, reporting and possible removal from AG Advanced Technologies Approved Supplier list.
              </p>
            </div>

            {/* Procedure - Detection */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Procedure - Detection</h2>
              <p className="mb-3">Identify the issue: Carefully inspect the items and identify any visual discrepancies or inconsistencies that suggest they may be counterfeit.</p>
              
              <h3 className="font-semibold mb-3">Red Flags:</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
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
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Procedure - Mitigation</h2>
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
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Procedure - Disposition</h2>
              <ol className="list-decimal pl-6 space-y-2 text-sm">
                <li>Store counterfeit parts or materials in quarantine, clearly identified as nonconforming/counterfeit product pending a review by your organization's management and legal representation.</li>
                <li>Do not return Counterfeit to the supplier in such a way that they could be reintroduced into the supply chain to be sold again to another victim.</li>
                <li>Legal authorities may be contacted to initiate an investigation into the counterfeiting activity. Parts may be required as evidence.</li>
                <li>Upon conclusion of any investigation, upper management will authorize the disposition and method for disposing of any suspect/counterfeit items.</li>
              </ol>
            </div>

            {/* Conclusion */}
            <div className="mb-8 p-4 border border-gray-800 rounded">
              <h2 className="text-lg font-semibold mb-3">Conclusion</h2>
              <ul className="space-y-2 text-sm">
                <li>➔ Counterfeit materials are a serious threat and can compromise the integrity of the important products we provide.</li>
                <li>➔ The use of Original Component or Equipment manufacturers and their authorized sources results in the least risk for counterfeit items infiltrating our products.</li>
                <li>➔ If you suspect counterfeit items may have been supplied to AG, you must notify the quality manager immediately.</li>
                <li>➔ Counterfeit risk must be controlled throughout the entire supply chain.</li>
                <li>➔ Thank you for your continued efforts to ensure counterfeit components do not infiltrate our supply chains.</li>
              </ul>
            </div>

            {/* Training Assessment Section */}
            <div className="page-break">
              <h2 className="text-lg font-semibold mb-4">Training Assessment</h2>
              <p className="mb-6 text-sm">Please complete this assessment to demonstrate understanding of counterfeit prevention procedures. Circle the correct answer for each question.</p>
              
              <div className="space-y-6">
                <div>
                  <p className="font-medium mb-2">1. What is the primary concern when dealing with counterfeit materials in manufacturing?</p>
                  <div className="pl-4 space-y-1 text-sm">
                    <div>A) Cost savings from cheaper materials</div>
                    <div>B) Safety hazards and quality control failures</div>
                    <div>C) Improved production efficiency</div>
                    <div>D) Better supplier relationships</div>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-2">2. Which of the following is a key indicator of potentially counterfeit parts?</p>
                  <div className="pl-4 space-y-1 text-sm">
                    <div>A) Parts arrive ahead of schedule</div>
                    <div>B) Pricing significantly below market value</div>
                    <div>C) Parts have extra documentation</div>
                    <div>D) Supplier offers extended warranty</div>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-2">3. When should you report suspected counterfeit materials?</p>
                  <div className="pl-4 space-y-1 text-sm">
                    <div>A) Only after completing production</div>
                    <div>B) At the end of the work week</div>
                    <div>C) Immediately upon discovery</div>
                    <div>D) During the next scheduled meeting</div>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-2">4. What is the lowest risk method for parts procurement?</p>
                  <div className="pl-4 space-y-1 text-sm">
                    <div>A) Online marketplaces</div>
                    <div>B) Lowest bidder regardless of source</div>
                    <div>C) Original Component or Equipment manufacturers (OCM/OEM)</div>
                    <div>D) Unauthorized distributors with good prices</div>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-2">5. If you suspect a part is counterfeit, what should you do first?</p>
                  <div className="pl-4 space-y-1 text-sm">
                    <div>A) Use it anyway if it looks close enough</div>
                    <div>B) Quarantine the part and document thoroughly</div>
                    <div>C) Return it to the supplier immediately</div>
                    <div>D) Ask a coworker for their opinion</div>
                  </div>
                </div>

                <div>
                  <p className="font-medium mb-2">6. According to AG policy, what happens to suppliers who knowingly provide counterfeit materials?</p>
                  <div className="pl-4 space-y-1 text-sm">
                    <div>A) They receive a warning letter</div>
                    <div>B) They get a discount on future orders</div>
                    <div>C) Investigation and possible removal from approved supplier list</div>
                    <div>D) Nothing, as long as they provide a refund</div>
                  </div>
                </div>
              </div>
            </div>
          </PrintLayout>
        </div>
      </div>
    </div>
  );
};

export default CounterfeitPreventionTraining;