import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GraduationCap, Users, Calendar, Clock, Printer } from "lucide-react";

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
}`;

export default function ShutdownProceduresTraining() {
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
        
        {/* Title Section */}
        <div className="text-center mb-8 print:mb-8 break-inside-avoid">
          <h1 className="text-4xl font-bold text-center mb-2 print:text-3xl print:mb-4">Shut Down Procedures</h1>
        </div>


        {/* Content Sections */}
        <div className="space-y-6 mb-8">
          
          {/* CNC Department */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-white print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-black print:text-lg print:text-black print:font-bold">CNC Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm print:text-sm print:text-black">
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Remove all tools from the machine spindles.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn machines to the OFF home position.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn all machines OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn the air compressors OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Organize the department area.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure there are no overflowing trash cans.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn all fans OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close and lock container doors.</li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>Close and lock all doors
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>3 pedestrian exit doors</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Roll down door</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn lights OFF.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Gunsmith Department */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-white print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-black print:text-lg print:text-black print:font-bold">Gunsmith Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn Mill 1 & 2 OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Place all tools and drills in the correct toolbox.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn all fans OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Shut down the air compressor.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close and latch the roll down door.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close and lock the pedestrian exit door.</li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>In the grinding room:
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Turn all grinders OFF.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Turn fans OFF.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Turn lights OFF.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Turn OFF exhaust fans.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Close both doors.</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn off pressure washer</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn off water spigot</li>
              </ul>
            </CardContent>
          </Card>

          {/* Plugging & Layup */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-white print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-black print:text-lg print:text-black print:font-bold">Plugging & Layup</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>Turn OFF fans:
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Break out area</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Layup room</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Assembly area</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close container doors</li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>
                  <span>Turn OFF lights:
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Mixing shed</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Break out area</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Break room</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Hot room</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-gray-600 rounded-full mt-2 mr-2 flex-shrink-0 sub-bullet-point print:border-black"></span>Layup room</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close the door to the mixing shed.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure the oven timers are set to turn OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close and latch both roll down doors in the oven area.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close the pedestrian exit door.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Paint Department */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-white print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-black print:text-lg print:text-black print:font-bold">Paint Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Clean and break down paint guns.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF paint booth fan and lights.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF air compressor.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF all fans.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF all Z-rack lights.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close all cabinets and the paint closet.</li>
              </ul>
            </CardContent>
          </Card>

          {/* General Tasks */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-white print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-black print:text-lg print:text-black print:font-bold">General Tasks</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF bathroom lights.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Make sure the coffee pot is OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Verify all air compressors are OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close and lock all container doors.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Close and latch the roll down doors.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF overhead fans.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure all lights are OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Lock all external doors.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure the security gate closes.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Check the front office - if you are the last person to leave, set the alarm and lock the front door.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Walk through the sanding shed turn off lights and remove tools</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Arm stay the security system.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Front Office */}
          <Card className="print:shadow-none print:border print:border-gray-400 break-inside-avoid print:mb-4">
            <CardHeader className="bg-white print:bg-white print:border-b print:border-gray-400 print:p-3">
              <CardTitle className="text-xl text-black print:text-lg print:text-black print:font-bold">Front Office</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 print:p-3 print:pt-2">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Turn OFF the dehumidifier.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure bathroom and office lights are OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure hall and porch lights are ON.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Check the back building - if you are the last person to leave, set the alarm and lock the front door.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Ensure the security gate is closed.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-gray-600 rounded-full mt-2 mr-3 flex-shrink-0 bullet-point print:bg-black"></span>Arm stay the security system.</li>
              </ul>
            </CardContent>
          </Card>

        </div>

        {/* Attendance Section */}
        <Card className="print:shadow-none print:border print:border-gray-400 print:break-inside-avoid print:mt-6 print:page-break-before">
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
            className="bg-gray-900 hover:bg-gray-800"
            data-testid="button-print-training-sheet"
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