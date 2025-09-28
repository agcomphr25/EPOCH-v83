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
  ]);

  const [trainingInfo, setTrainingInfo] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    location: '',
    instructor: '',
    duration: '45 minutes',
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
  const generatePDF = () => {
    const element = document.querySelector('.print-content') as HTMLElement;
    if (!element) return;

    const opt = {
      margin: 0.5,
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

    html2pdf().set(opt).from(element).save();
  };

  const handlePrint = () => {
    window.print();
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <style>{printStyles}</style>
      
      <div className="max-w-4xl mx-auto px-4">
        <div className="print:hidden mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Counterfeit Prevention Training</h1>
            <p className="text-gray-600">Manufacturing Safety & Quality Control</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button onClick={generatePDF}>
              <FileText className="h-4 w-4 mr-2" />
              Generate PDF
            </Button>
          </div>
        </div>

        <div className="print-content bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Shield className="h-12 w-12 text-red-600 mr-3" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">COUNTERFEIT PREVENTION TRAINING</h1>
                <p className="text-lg text-gray-600">Manufacturing Safety & Quality Control</p>
              </div>
            </div>
          </div>

          {/* Training Information */}
          <Card className="mb-6 print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Training Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <Input
                  type="date"
                  value={trainingInfo.date}
                  onChange={(e) => setTrainingInfo({...trainingInfo, date: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <Input
                  value={trainingInfo.time}
                  onChange={(e) => setTrainingInfo({...trainingInfo, time: e.target.value})}
                  placeholder="e.g., 9:00 AM - 10:00 AM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <Input
                  value={trainingInfo.location}
                  onChange={(e) => setTrainingInfo({...trainingInfo, location: e.target.value})}
                  placeholder="Conference Room, Shop Floor, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructor</label>
                <Input
                  value={trainingInfo.instructor}
                  onChange={(e) => setTrainingInfo({...trainingInfo, instructor: e.target.value})}
                  placeholder="Instructor Name"
                />
              </div>
            </CardContent>
          </Card>

          {/* Training Content */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
              What Are Counterfeit Materials?
            </h2>
            
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <p className="text-red-700 font-medium">
                    Counterfeit materials are fraudulent parts that are deliberately mislabeled, altered, or substituted 
                    to appear as genuine, authorized components.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Eye className="h-5 w-5 text-blue-600 mr-2" />
                    Visual Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Poor quality markings or labels
                    </li>
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Inconsistent packaging
                    </li>
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Unusual appearance or finish
                    </li>
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Missing or altered date codes
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Zap className="h-5 w-5 text-yellow-600 mr-2" />
                    Performance Issues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Unexpected failures or malfunctions
                    </li>
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Performance below specifications
                    </li>
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Shortened lifespan
                    </li>
                    <li className="flex items-start">
                      <span className="bullet-point w-2 h-2 bg-black rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      Compatibility issues
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Red Flags Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">🚩 RED FLAGS to Watch For</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                "Pricing significantly below market value",
                "Suppliers with limited history or verification",
                "Parts arriving from unexpected sources",
                "Missing certificates of compliance",
                "Unusual payment or shipping terms",
                "Pressure to bypass normal procurement processes"
              ].map((flag, index) => (
                <div key={index} className="red-flag bg-red-100 border border-red-300 rounded-lg p-3">
                  <div className="flex items-center">
                    <span className="text-red-600 font-bold mr-2">⚠️</span>
                    <span className="text-red-800 font-medium">{flag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Steps */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
              Action Steps
            </h2>
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="space-y-4">
                <div className="flex items-start">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mr-3 mt-0.5">1</span>
                  <div>
                    <p className="font-semibold">STOP production immediately</p>
                    <p className="text-gray-600">Do not use suspected counterfeit materials</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mr-3 mt-0.5">2</span>
                  <div>
                    <p className="font-semibold">ISOLATE the suspected materials</p>
                    <p className="text-gray-600">Quarantine and tag all potentially affected inventory</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mr-3 mt-0.5">3</span>
                  <div>
                    <p className="font-semibold">REPORT to supervisor immediately</p>
                    <p className="text-gray-600">Notify quality control and management</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mr-3 mt-0.5">4</span>
                  <div>
                    <p className="font-semibold">DOCUMENT everything</p>
                    <p className="text-gray-600">Record details, take photos, preserve evidence</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendee Sign-In */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
              <Users className="h-6 w-6 text-blue-600 mr-2" />
              Training Attendance
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left">Employee Name</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Department</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Signature</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 px-2 py-2">
                        <Input
                          value={participant.name}
                          onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                          placeholder="Full Name"
                          className="border-0 print:border-0"
                        />
                      </td>
                      <td className="border border-gray-300 px-2 py-2">
                        <Input
                          value={participant.department}
                          onChange={(e) => updateParticipant(index, 'department', e.target.value)}
                          placeholder="Department"
                          className="border-0 print:border-0"
                        />
                      </td>
                      <td className="border border-gray-300 px-2 py-2">
                        <Input
                          value={participant.signature}
                          onChange={(e) => updateParticipant(index, 'signature', e.target.value)}
                          placeholder="Signature"
                          className="border-0 print:border-0"
                        />
                      </td>
                      <td className="border border-gray-300 px-2 py-2">
                        <Input
                          type="date"
                          value={participant.date}
                          onChange={(e) => updateParticipant(index, 'date', e.target.value)}
                          className="border-0 print:border-0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button 
                onClick={addParticipant} 
                variant="outline" 
                className="mt-3 print:hidden"
              >
                Add Participant
              </Button>
            </div>
          </div>

          {/* Training Details Display */}
          <div className="border-t pt-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Training Date:</strong> {trainingInfo.date || '_________________'}
              </div>
              <div>
                <strong>Training Time:</strong> {trainingInfo.time || '_________________'}
              </div>
              <div>
                <strong>Location:</strong> {trainingInfo.location || '_________________'}
              </div>
              <div>
                <strong>Instructor:</strong> {trainingInfo.instructor || '_________________'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
            <p>© 2024 AG Composites - Counterfeit Prevention Training Program</p>
            <p>For questions or to report suspected counterfeit materials, contact Quality Control immediately.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
