import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Download, Shield, Printer } from 'lucide-react';
import {
  generateQuizPDF,
  generateAnswerKeyPDF,
  generateAttendancePDF,
  generateCombinedPDF,
} from '@/components/TrainingPDF';

interface QuizAnswer {
  questionId: string;
  answer: string;
}

export default function SafetyPPETraining() {
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [employeeSignature, setEmployeeSignature] = useState('');
  const [employeeDate, setEmployeeDate] = useState('');
  const [instructorSignature, setInstructorSignature] = useState('');
  const [instructorDate, setInstructorDate] = useState('');

  const questions = [
    {
      id: 'q1',
      question: 'When is Personal Protective Equipment (PPE) required?',
      options: [
        'A) Only when supervisors are present',
        'B) At all times in designated areas',
        'C) Only during inspections',
        'D) Only when working with chemicals',
      ],
      correctAnswer: 'B',
    },
    {
      id: 'q2',
      question: 'What is the primary purpose of safety glasses?',
      options: [
        'A) To improve vision',
        'B) To protect eyes from impact and debris',
        'C) To block sunlight',
        'D) For style and appearance',
      ],
      correctAnswer: 'B',
    },
    {
      id: 'q3',
      question: 'Steel-toed boots are required in which areas?',
      options: [
        'A) Office areas only',
        'B) Break rooms',
        'C) All production and warehouse areas',
        'D) Only when lifting heavy objects',
      ],
      correctAnswer: 'C',
    },
    {
      id: 'q4',
      question: 'What should you do if your PPE is damaged or worn?',
      options: [
        'A) Continue using it until end of shift',
        'B) Report it immediately and get replacement',
        'C) Try to repair it yourself',
        'D) Share with another employee',
      ],
      correctAnswer: 'B',
    },
    {
      id: 'q5',
      question:
        'Hearing protection must be worn in areas where noise levels exceed:',
      options: [
        'A) 50 decibels',
        'B) 65 decibels',
        'C) 85 decibels',
        'D) 100 decibels',
      ],
      correctAnswer: 'C',
    },
  ];

  const handleAnswerChange = (questionId: string, answer: string) => {
    setQuizAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === questionId);
      if (existing) {
        return prev.map((a) =>
          a.questionId === questionId ? { questionId, answer } : a
        );
      }
      return [...prev, { questionId, answer }];
    });
  };

  const handleGeneratePDF = async (
    type: 'quiz' | 'answers' | 'attendance' | 'combined'
  ) => {
    const trainingInfo = {
      title: 'Safety and PPE Training',
      date: new Date().toLocaleDateString(),
      instructor: instructorSignature,
      content:
        'Safety and Personal Protective Equipment procedures and requirements.',
    };

    try {
      if (type === 'quiz') {
        await generateQuizPDF(trainingInfo, questions);
      } else if (type === 'answers') {
        await generateAnswerKeyPDF(trainingInfo, questions);
      } else if (type === 'attendance') {
        await generateAttendancePDF(trainingInfo);
      } else {
        await generateCombinedPDF(trainingInfo, questions);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold" data-testid="text-title">
              Safety and PPE Training
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleGeneratePDF('quiz')}
              variant="outline"
              size="sm"
              data-testid="button-generate-quiz"
            >
              <Download className="w-4 h-4 mr-2" />
              Quiz PDF
            </Button>
            <Button
              onClick={() => handleGeneratePDF('answers')}
              variant="outline"
              size="sm"
              data-testid="button-generate-answers"
            >
              <Download className="w-4 h-4 mr-2" />
              Answer Key
            </Button>
            <Button
              onClick={() => handleGeneratePDF('attendance')}
              variant="outline"
              size="sm"
              data-testid="button-generate-attendance"
            >
              <Download className="w-4 h-4 mr-2" />
              Attendance
            </Button>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Training Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">
                Personal Protective Equipment Requirements
              </h3>
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  Safety glasses with side shields in all production areas
                </li>
                <li>Steel-toed boots in warehouse and manufacturing zones</li>
                <li>
                  Hard hats in designated construction and overhead work areas
                </li>
                <li>Hearing protection in high-noise environments (85+ dB)</li>
                <li>Cut-resistant gloves when handling sharp materials</li>
                <li>Chemical-resistant gloves and aprons for hazmat work</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-semibold mb-3">
                PPE Inspection and Maintenance
              </h3>
              <ul className="space-y-2 list-disc list-inside">
                <li>Inspect all PPE before each use for damage or wear</li>
                <li>Report damaged equipment immediately to supervisor</li>
                <li>Never use damaged or modified PPE</li>
                <li>Clean and store PPE properly after use</li>
                <li>Replace PPE according to manufacturer guidelines</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-semibold mb-3">
                Employee Responsibilities
              </h3>
              <ul className="space-y-2 list-disc list-inside">
                <li>Wear all required PPE at all times in designated areas</li>
                <li>Ensure proper fit and adjustment of equipment</li>
                <li>Understand limitations of each type of PPE</li>
                <li>Participate in PPE training and refresher courses</li>
                <li>Report any safety concerns or hazards immediately</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Knowledge Assessment Quiz</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {questions.map((q, index) => (
                <div key={q.id} className="space-y-3">
                  <p className="font-medium">
                    {index + 1}. {q.question}
                  </p>
                  <RadioGroup
                    onValueChange={(value) => handleAnswerChange(q.id, value)}
                    value={
                      quizAnswers.find((a) => a.questionId === q.id)?.answer ||
                      ''
                    }
                  >
                    {q.options.map((option) => (
                      <div key={option} className="flex items-center space-x-2">
                        <RadioGroupItem
                          value={option.charAt(0)}
                          id={`${q.id}-${option.charAt(0)}`}
                          data-testid={`radio-${q.id}-${option.charAt(0)}`}
                        />
                        <Label htmlFor={`${q.id}-${option.charAt(0)}`}>
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Training Acknowledgment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold">Employee Acknowledgment</h3>
                <div>
                  <Label htmlFor="employee-signature">Signature</Label>
                  <Input
                    id="employee-signature"
                    placeholder="Type your name"
                    value={employeeSignature}
                    onChange={(e) => setEmployeeSignature(e.target.value)}
                    data-testid="input-employee-signature"
                  />
                </div>
                <div>
                  <Label htmlFor="employee-date">Date</Label>
                  <Input
                    id="employee-date"
                    type="date"
                    value={employeeDate}
                    onChange={(e) => setEmployeeDate(e.target.value)}
                    data-testid="input-employee-date"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Instructor Verification</h3>
                <div>
                  <Label htmlFor="instructor-signature">Signature</Label>
                  <Input
                    id="instructor-signature"
                    placeholder="Type your name"
                    value={instructorSignature}
                    onChange={(e) => setInstructorSignature(e.target.value)}
                    data-testid="input-instructor-signature"
                  />
                </div>
                <div>
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

            <div className="mt-6 flex justify-end gap-3">
              <Button
                onClick={() => handleGeneratePDF('combined')}
                data-testid="button-generate-complete"
              >
                <Printer className="w-4 h-4 mr-2" />
                Generate Complete Training Package
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
