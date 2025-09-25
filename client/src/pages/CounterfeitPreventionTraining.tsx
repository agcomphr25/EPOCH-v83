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

  const exportToPDF = async () => {
    const element = document.getElementById('training-content');
    if (!element) {
      alert('Content not found for PDF generation');
      return;
    }

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
    });
  };

  return (
    <>
      <style>{printStyles}</style>
      <div className="min-h-screen bg-gray-50 p-4 print:bg-white print:p-8 print:m-0">
        <div className="max-w-4xl mx-auto print:max-w-none print-content" id="training-content">
        
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

        {/* Print/Export Controls */}
        <div className="flex justify-center gap-4 mb-8 print:hidden">
          <Button onClick={exportToPDF} className="bg-red-600 hover:bg-red-700">
            <Printer className="h-4 w-4 mr-2" />
            Export to PDF
          </Button>
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

          {/* Training Information Form */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-gray-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-gray-800 print:text-lg print:text-black print:font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 print:hidden" />
                Training Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium print:text-sm print:text-black">Training Date</label>
                  <Input
                    type="date"
                    value={trainingInfo.date}
                    onChange={(e) => setTrainingInfo({...trainingInfo, date: e.target.value})}
                    className="print:border print:border-gray-400 print:text-black"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium print:text-sm print:text-black">Instructor</label>
                  <Input
                    value={trainingInfo.instructor}
                    onChange={(e) => setTrainingInfo({...trainingInfo, instructor: e.target.value})}
                    placeholder="Instructor name"
                    className="print:border print:border-gray-400 print:text-black"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium print:text-sm print:text-black">Location</label>
                  <Input
                    value={trainingInfo.location}
                    onChange={(e) => setTrainingInfo({...trainingInfo, location: e.target.value})}
                    placeholder="Training location"
                    className="print:border print:border-gray-400 print:text-black"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium print:text-sm print:text-black">Time</label>
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={trainingInfo.startTime}
                      onChange={(e) => setTrainingInfo({...trainingInfo, startTime: e.target.value})}
                      className="print:border print:border-gray-400 print:text-black"
                    />
                    <span className="flex items-center text-sm print:text-black">to</span>
                    <Input
                      type="time"
                      value={trainingInfo.endTime}
                      onChange={(e) => setTrainingInfo({...trainingInfo, endTime: e.target.value})}
                      className="print:border print:border-gray-400 print:text-black"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attendance Sheet */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-green-50 print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-green-800 print:text-lg print:text-black print:font-bold flex items-center gap-2">
                <Users className="h-5 w-5 print:hidden" />
                Attendance Sheet
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm print:text-sm print:text-black">
                  <thead>
                    <tr className="border-b print:border-gray-400">
                      <th className="text-left p-2 print:p-1 print:border-r print:border-gray-400">Name</th>
                      <th className="text-left p-2 print:p-1 print:border-r print:border-gray-400">Department</th>
                      <th className="text-left p-2 print:p-1 print:border-r print:border-gray-400">Signature</th>
                      <th className="text-left p-2 print:p-1">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((participant, index) => (
                      <tr key={index} className="border-b print:border-gray-400">
                        <td className="p-2 print:p-1 print:border-r print:border-gray-400">
                          <Input
                            value={participant.name}
                            onChange={(e) => {
                              const updated = [...participants];
                              updated[index].name = e.target.value;
                              setParticipants(updated);
                            }}
                            className="h-8 text-xs print:border-none print:text-black print:bg-white"
                            placeholder="Employee name"
                          />
                        </td>
                        <td className="p-2 print:p-1 print:border-r print:border-gray-400">
                          <Input
                            value={participant.department}
                            onChange={(e) => {
                              const updated = [...participants];
                              updated[index].department = e.target.value;
                              setParticipants(updated);
                            }}
                            className="h-8 text-xs print:border-none print:text-black print:bg-white"
                            placeholder="Department"
                          />
                        </td>
                        <td className="p-2 print:p-1 print:border-r print:border-gray-400">
                          <Input
                            value={participant.signature}
                            onChange={(e) => {
                              const updated = [...participants];
                              updated[index].signature = e.target.value;
                              setParticipants(updated);
                            }}
                            className="h-8 text-xs print:border-none print:text-black print:bg-white"
                            placeholder="Signature"
                          />
                        </td>
                        <td className="p-2 print:p-1">
                          <Input
                            type="date"
                            value={participant.date}
                            onChange={(e) => {
                              const updated = [...participants];
                              updated[index].date = e.target.value;
                              setParticipants(updated);
                            }}
                            className="h-8 text-xs print:border-none print:text-black print:bg-white"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        </div>
      </div>
    </>
  );
};