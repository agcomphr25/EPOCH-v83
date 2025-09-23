import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Shield, Users, Calendar, Clock, Printer, AlertTriangle, Eye, Zap, CheckCircle } from "lucide-react";

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

        {/* Attendance Section */}
        <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mt-6 print:page-break-before">
          <CardHeader className="pb-4 print:border-b print:border-gray-400 print:p-3">
            <CardTitle className="flex items-center gap-2 print:text-lg print:font-bold">
              <Users className="h-5 w-5 print:hidden" />
              Training Attendance
            </CardTitle>
          </CardHeader>
          <CardContent className="print:p-3">
            <div className="space-y-6 print:space-y-4">
              {/* Participant Signature Lines */}
              <div className="space-y-4 print:space-y-3">
                {[...Array(15)].map((_, index) => (
                  <div key={index} className="border-b border-gray-400 h-8 print:h-6"></div>
                ))}
              </div>
            </div>

            <Separator className="my-6 print:my-4 print:border-gray-400" />
            
            {/* Instructor Signature */}
            <div className="grid grid-cols-2 gap-8 print:gap-4">
              <div className="space-y-2">
                <label className="font-semibold text-sm print:text-sm print:text-black">Instructor Signature:</label>
                <div className="border-b-2 border-gray-400 h-12 print:h-8"></div>
                <div className="text-xs text-gray-600 print:text-xs print:text-black">Date: ________________</div>
              </div>
              <div className="space-y-2">
                <label className="font-semibold text-sm print:text-sm print:text-black">Training Coordinator:</label>
                <div className="border-b-2 border-gray-400 h-12 print:h-8"></div>
                <div className="text-xs text-gray-600 print:text-xs print:text-black">Date: ________________</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer with Date */}
        <div className="mt-8 text-center border-t border-gray-400 pt-4 print:mt-6 print:pt-3">
          <p className="text-sm text-gray-600 print:text-black">Date: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 text-center print:hidden">
          <Button 
            onClick={handlePrint} 
            className="bg-red-600 hover:bg-red-700"
            data-testid="button-print-counterfeit-training"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Training Sheet
          </Button>
        </div>
        </div>
      </div>
    </>
  );
}