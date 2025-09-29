import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Shield, Users, Calendar, Clock, Printer, AlertTriangle, Eye, Zap, CheckCircle, FileText, Download } from "lucide-react";
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

interface QuizAnswer {
  questionId: string;
  answer: string;
}

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
      question: 'What should you do if you suspect a part is counterfeit?',
      options: [
        'A) Use it anyway since it looks similar',
        'B) Immediately quarantine the part and notify management',
        'C) Test it first before deciding',
        'D) Return it to inventory for later use'
      ],
      correctAnswer: 'B'
    }
  ];

  const addParticipant = () => {
    setParticipants([...participants, {name: '', signature: '', date: '', department: ''}]);
  };

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const updateParticipant = (index: number, field: string, value: string) => {
    const updated = [...participants];
    updated[index] = {...updated[index], [field]: value};
    setParticipants(updated);
  };

  const updateTrainingInfo = (field: string, value: string) => {
    setTrainingInfo(prev => ({...prev, [field]: value}));
  };

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

  const generatePDF = () => {
    const element = document.getElementById('training-content');
    if (!element) return;

    const opt = {
      margin: [0.75, 0.75, 0.75, 0.75],
      filename: `counterfeit-prevention-training-${trainingInfo.date}.pdf`,

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
    });
  };

  return (
    <>
      <style>{printStyles}</style>

      <div className="min-h-screen bg-gray-50 p-4">
        {/* Control Panel */}
        <div className="max-w-4xl mx-auto mb-6 print:hidden">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Counterfeit Prevention Training Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button onClick={generatePDF} className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Download PDF
                </Button>

              </div>
            </CardContent>
          </Card>
        </div>


        {/* Training Content */}
        <div id="training-content" className="print-content">
          <div className="max-w-4xl mx-auto bg-white p-8 shadow-lg rounded-lg space-y-8">
            
            {/* Header */}
            <div className="text-center border-b-2 border-gray-200 pb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                COUNTERFEIT PREVENTION TRAINING
              </h1>
              <p className="text-lg text-gray-600">
                Employee Education & Awareness Program
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Shield className="w-6 h-6 text-red-600" />
                <span className="text-red-600 font-semibold">CRITICAL SAFETY TRAINING</span>
              </div>
            </div>

            {/* Training Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Training Session Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={trainingInfo.date}
                      onChange={(e) => updateTrainingInfo('date', e.target.value)}
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                  <div>
                    <Label>Instructor</Label>
                    <Input
                      value={trainingInfo.instructor}
                      onChange={(e) => updateTrainingInfo('instructor', e.target.value)}
                      placeholder="Instructor Name"
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={trainingInfo.location}
                      onChange={(e) => updateTrainingInfo('location', e.target.value)}
                      placeholder="Training Location"
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={trainingInfo.startTime}
                        onChange={(e) => updateTrainingInfo('startTime', e.target.value)}
                        className="print:border-0 print:border-b print:rounded-none print:px-1"
                      />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={trainingInfo.endTime}
                        onChange={(e) => updateTrainingInfo('endTime', e.target.value)}
                        className="print:border-0 print:border-b print:rounded-none print:px-1"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Training Content Sections */}
            <div className="space-y-6">
              
              {/* Introduction */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    What Are Counterfeit Materials?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-700 leading-relaxed">
                    Counterfeit materials are fraudulent parts, components, or materials that are deliberately misrepresented 
                    as genuine products from legitimate manufacturers. These materials pose significant safety, quality, and 
                    legal risks to manufacturing operations.
                  </p>
                  
                  <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
                    <h4 className="font-semibold text-red-800 mb-2">Key Characteristics of Counterfeit Materials:</h4>
                    <ul className="space-y-2 text-red-700">
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0 bullet-point"></div>
                        Falsified documentation or markings
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0 bullet-point"></div>
                        Substandard materials or manufacturing processes
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0 bullet-point"></div>
                        Unusually low pricing compared to genuine parts
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0 bullet-point"></div>
                        Questionable supply chain sources
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Risks and Consequences */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-orange-600" />
                    Risks and Consequences
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Safety Risks</h4>
                      <ul className="space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 border border-gray-400 rounded-full mt-2 flex-shrink-0 sub-bullet-point"></div>
                          Product failures during operation
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 border border-gray-400 rounded-full mt-2 flex-shrink-0 sub-bullet-point"></div>
                          Workplace accidents and injuries
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 border border-gray-400 rounded-full mt-2 flex-shrink-0 sub-bullet-point"></div>
                          Customer safety compromises
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Business Impact</h4>
                      <ul className="space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 border border-gray-400 rounded-full mt-2 flex-shrink-0 sub-bullet-point"></div>
                          Legal liability and lawsuits
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 border border-gray-400 rounded-full mt-2 flex-shrink-0 sub-bullet-point"></div>
                          Reputation damage
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 border border-gray-400 rounded-full mt-2 flex-shrink-0 sub-bullet-point"></div>
                          Financial losses and recalls
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detection Methods */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-blue-600" />
                    Detection and Prevention Methods
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-3">Visual Inspection Checklist:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ul className="space-y-2 text-blue-700">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          Part markings and logos
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          Surface finish quality
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          Dimensional accuracy
                        </li>
                      </ul>
                      <ul className="space-y-2 text-blue-700">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          Packaging consistency
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          Documentation integrity
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          Certificate authenticity
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-3">Supply Chain Best Practices:</h4>
                    <ul className="space-y-2 text-green-700">
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                        Use only authorized distributors and suppliers
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                        Verify supplier credentials and certifications
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                        Maintain clear chain of custody documentation
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                        Implement incoming inspection procedures
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Red Flags */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    Red Flags to Watch For
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold text-red-800 mb-3">Supplier Red Flags:</h4>
                        <ul className="space-y-2 text-red-700">
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Unusually low pricing
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Pressure for quick decisions
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Reluctance to provide documentation
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Unknown or unverified suppliers
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold text-red-800 mb-3">Product Red Flags:</h4>
                        <ul className="space-y-2 text-red-700">
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Poor surface finish or quality
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Inconsistent markings or fonts
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Missing or altered certificates
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded-full mt-1.5 flex-shrink-0 red-flag"></div>
                            Unusual packaging or labeling
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quiz Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Knowledge Assessment Quiz
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {questions.map((question, index) => (
                  <div key={question.id} className="space-y-3">
                    <h4 className="font-semibold text-gray-900">
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
                          />
                          <Label htmlFor={`${question.id}-${optionIndex}`} className="cursor-pointer">
                            {option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Signature Section */}
            <Card>
              <CardHeader>
                <CardTitle>Training Completion Signatures</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="employee-signature">Employee Signature</Label>
                    <Input
                      id="employee-signature"
                      value={employeeSignature}
                      onChange={(e) => setEmployeeSignature(e.target.value)}
                      placeholder="Employee Signature"
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee-date">Date</Label>
                    <Input
                      id="employee-date"
                      type="date"
                      value={employeeDate}
                      onChange={(e) => setEmployeeDate(e.target.value)}
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="instructor-signature">Instructor Signature</Label>
                    <Input
                      id="instructor-signature"
                      value={instructorSignature}
                      onChange={(e) => setInstructorSignature(e.target.value)}
                      placeholder="Instructor Signature"
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="instructor-date">Date</Label>
                    <Input
                      id="instructor-date"
                      type="date"
                      value={instructorDate}
                      onChange={(e) => setInstructorDate(e.target.value)}
                      className="print:border-0 print:border-b print:rounded-none print:px-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Attendance Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Training Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 font-semibold text-sm text-gray-700 border-b pb-2">
                    <div>Name</div>
                    <div>Department</div>
                    <div>Signature</div>
                    <div>Date</div>
                  </div>
                  
                  {participants.map((participant, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2">
                      <Input
                        value={participant.name}
                        onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                        placeholder="Full Name"
                        className="print:border-0 print:border-b print:rounded-none print:px-1"
                      />
                      <Input
                        value={participant.department}
                        onChange={(e) => updateParticipant(index, 'department', e.target.value)}
                        placeholder="Department"
                        className="print:border-0 print:border-b print:rounded-none print:px-1"
                      />
                      <Input
                        value={participant.signature}
                        onChange={(e) => updateParticipant(index, 'signature', e.target.value)}
                        placeholder="Signature"
                        className="print:border-0 print:border-b print:rounded-none print:px-1"
                      />
                      <Input
                        type="date"
                        value={participant.date}
                        onChange={(e) => updateParticipant(index, 'date', e.target.value)}
                        className="print:border-0 print:border-b print:rounded-none print:px-1"
                      />
                    </div>
                  ))}
                  
                  <div className="flex gap-2 print:hidden">
                    <Button onClick={addParticipant} variant="outline" size="sm">
                      Add Participant
                    </Button>
                    {participants.length > 1 && (
                      <Button 
                        onClick={() => removeParticipant(participants.length - 1)} 
                        variant="outline" 
                        size="sm"
                      >
                        Remove Last
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 border-t pt-4">
              <p>This training is required for all personnel handling materials and components.</p>
              <p>Questions or concerns should be directed to the Quality Assurance Department.</p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
