import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Download, FileText, Shield } from 'lucide-react';
import html2pdf from 'html2pdf.js';

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

  const generatePDF = () => {
    const element = document.getElementById('training-content');
    if (!element) return;

    const opt = {
      margin: 1,
      filename: `Counterfeit_Prevention_Training_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Counterfeit Prevention Training</h1>
          </div>
          <Button onClick={generatePDF} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>

        <div id="training-content" className="bg-white p-8">
          {/* Training Content */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Training Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Learning Objectives</h3>
                <ul className="space-y-2 list-disc pl-6">
                  <li>Understand the risks associated with counterfeit materials in manufacturing</li>
                  <li>Learn to identify potential indicators of counterfeit parts and components</li>
                  <li>Know proper procedures for reporting and handling suspected counterfeit materials</li>
                  <li>Understand verification processes for supplier authenticity</li>
                  <li>Learn quality control measures to prevent counterfeit materials from entering production</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Key Points</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium">Risk Awareness</h4>
                    <p className="text-sm text-gray-600">
                      Counterfeit materials pose serious safety, quality, and legal risks. They can lead to product failures, safety incidents, and regulatory violations.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium">Detection Methods</h4>
                    <p className="text-sm text-gray-600">
                      Watch for unusual pricing, questionable documentation, unfamiliar suppliers, and parts that don't match specifications or quality standards.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium">Supplier Verification</h4>
                    <p className="text-sm text-gray-600">
                      Always verify suppliers through authorized distributor networks, check certifications, and maintain detailed documentation of the supply chain.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium">Reporting Procedures</h4>
                    <p className="text-sm text-gray-600">
                      Immediately report any suspected counterfeit materials to quality control and management. Do not use questionable parts in production.
                    </p>
                  </div>
                </div>
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