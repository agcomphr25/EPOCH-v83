import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GraduationCap, Users, Calendar, Clock, Printer } from "lucide-react";

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
    <div className="min-h-screen bg-gray-50 p-4 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-8 print:mb-6">
          <div className="flex items-center justify-center mb-4 print:hidden">
            <GraduationCap className="h-8 w-8 text-indigo-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Leader Training</h1>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-8 print:shadow-none print:border print:border-gray-300">
            <h1 className="text-4xl font-bold text-center mb-2 print:text-3xl">Leader Training Topic:</h1>
            <h2 className="text-5xl font-bold text-indigo-600 mb-4 print:text-4xl">Shut Down Procedures</h2>
            <p className="text-xl text-gray-600 mb-6 print:text-lg">
              These procedures cover the processes and tasks required to correctly lock up the facility each day.
            </p>
          </div>
        </div>


        {/* Content Sections */}
        <div className="space-y-6 mb-8">
          
          {/* CNC Department */}
          <Card className="print:shadow-none print:border print:border-gray-300">
            <CardHeader className="bg-blue-50 print:bg-white">
              <CardTitle className="text-xl text-blue-800">CNC Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Remove all tools from the machine spindles.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn machines to the OFF home position.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn all machines OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn the air compressors OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Organize the department area.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure there are no overflowing trash cans.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn all fans OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close and lock container doors.</li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span>Close and lock all doors
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-blue-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>3 pedestrian exit doors</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-blue-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Roll down door</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn lights OFF.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Gunsmith Department */}
          <Card className="print:shadow-none print:border print:border-gray-300">
            <CardHeader className="bg-green-50 print:bg-white">
              <CardTitle className="text-xl text-green-800">Gunsmith Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn Mill 1 & 2 OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Place all tools and drills in the correct toolbox.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn all fans OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Shut down the air compressor.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close and latch the roll down door.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close and lock the pedestrian exit door.</li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span>In the grinding room:
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Turn all grinders OFF.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Turn fans OFF.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Turn lights OFF.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Turn OFF exhaust fans.</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-green-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Close both doors.</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn off pressure washer</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn off water spigot</li>
              </ul>
            </CardContent>
          </Card>

          {/* Plugging & Layup */}
          <Card className="print:shadow-none print:border print:border-gray-300">
            <CardHeader className="bg-purple-50 print:bg-white">
              <CardTitle className="text-xl text-purple-800">Plugging & Layup</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span>Turn OFF fans:
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Break out area</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Layup room</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Assembly area</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close container doors</li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span>Turn OFF lights:
                    <ul className="ml-4 mt-1 space-y-1">
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Mixing shed</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Break out area</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Break room</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Hot room</li>
                      <li className="flex items-start"><span className="w-1.5 h-1.5 border border-purple-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>Layup room</li>
                    </ul>
                  </span>
                </li>
                <li className="flex items-start"><span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close the door to the mixing shed.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure the oven timers are set to turn OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close and latch both roll down doors in the oven area.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close the pedestrian exit door.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Paint Department */}
          <Card className="print:shadow-none print:border print:border-gray-300">
            <CardHeader className="bg-orange-50 print:bg-white">
              <CardTitle className="text-xl text-orange-800">Paint Department</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Clean and break down paint guns.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF paint booth fan and lights.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF air compressor.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF all fans.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF all Z-rack lights.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-orange-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close all cabinets and the paint closet.</li>
              </ul>
            </CardContent>
          </Card>

          {/* General Tasks */}
          <Card className="print:shadow-none print:border print:border-gray-300">
            <CardHeader className="bg-red-50 print:bg-white">
              <CardTitle className="text-xl text-red-800">General Tasks</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF bathroom lights.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Make sure the coffee pot is OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Verify all air compressors are OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close and lock all container doors.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Close and latch the roll down doors.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF overhead fans.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure all lights are OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Lock all external doors.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure the security gate closes.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Check the front office - if you are the last person to leave, set the alarm and lock the front door.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-red-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Walk through the sanding shed turn off lights and remove tools</li>
              </ul>
            </CardContent>
          </Card>

          {/* Front Office */}
          <Card className="print:shadow-none print:border print:border-gray-300">
            <CardHeader className="bg-teal-50 print:bg-white">
              <CardTitle className="text-xl text-teal-800">Front Office</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start"><span className="w-2 h-2 bg-teal-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Turn OFF the dehumidifier.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-teal-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure bathroom and office lights are OFF.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-teal-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure hall and porch lights are ON.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-teal-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Check the back building - if you are the last person to leave, set the alarm and lock the front door.</li>
                <li className="flex items-start"><span className="w-2 h-2 bg-teal-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>Ensure the security gate is closed.</li>
              </ul>
            </CardContent>
          </Card>

        </div>

        {/* Attendance Section */}
        <Card className="print:shadow-none print:border print:border-gray-300 print:break-inside-avoid">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Training Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 font-semibold text-sm border-b pb-2">
                <div>Print Name</div>
                <div>Signature</div>
                <div>Date</div>
                <div>Department</div>
              </div>
              
              {participants.map((participant, index) => (
                <div key={index} className="grid grid-cols-4 gap-2 items-center">
                  <Input
                    placeholder="Full Name"
                    value={participant.name}
                    onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                    className="print:border-0 print:border-b print:border-gray-400 print:rounded-none text-sm"
                  />
                  <Input
                    placeholder="Signature"
                    value={participant.signature}
                    onChange={(e) => updateParticipant(index, 'signature', e.target.value)}
                    className="print:border-0 print:border-b print:border-gray-400 print:rounded-none text-sm font-cursive"
                  />
                  <Input
                    type="date"
                    value={participant.date}
                    onChange={(e) => updateParticipant(index, 'date', e.target.value)}
                    className="print:border-0 print:border-b print:border-gray-400 print:rounded-none text-sm"
                  />
                  <Input
                    placeholder="Department"
                    value={participant.department}
                    onChange={(e) => updateParticipant(index, 'department', e.target.value)}
                    className="print:border-0 print:border-b print:border-gray-400 print:rounded-none text-sm"
                  />
                </div>
              ))}
              
              <Button 
                onClick={addParticipant} 
                variant="outline" 
                size="sm"
                className="print:hidden"
              >
                + Add Participant
              </Button>
            </div>

            <Separator className="my-6" />
            
            {/* Instructor Signature */}
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="font-semibold text-sm">Instructor Signature:</label>
                <div className="border-b-2 border-gray-300 h-12 print:border-gray-400"></div>
                <div className="text-xs text-gray-600">Date: ________________</div>
              </div>
              <div className="space-y-2">
                <label className="font-semibold text-sm">Training Coordinator:</label>
                <div className="border-b-2 border-gray-300 h-12 print:border-gray-400"></div>
                <div className="text-xs text-gray-600">Date: ________________</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="mt-6 text-center print:hidden">
          <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
            <Printer className="h-4 w-4 mr-2" />
            Print Training Sheet
          </Button>
        </div>
      </div>
    </div>
  );
}