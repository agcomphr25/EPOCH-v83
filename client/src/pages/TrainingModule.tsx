import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, FileText, CheckCircle, XCircle, Award, Download, Flame, Droplet, ShieldAlert, Shield, ClipboardCheck, AlertTriangle, Scale, PackageX, Power } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Training Content Components
function PreservationFODContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-blue-200 pb-6">
        <h2 className="text-3xl font-bold text-blue-900 mb-2">Preservation & Foreign Object Debris (FOD) Training</h2>
        <p className="text-lg text-gray-600">Summary</p>
      </div>

      <div className="space-y-4">
        <p className="text-lg font-semibold text-blue-800">This procedure applies to:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4 text-lg">
          <li>Preservation of the product to meet customer requirements</li>
          <li>The Prevention of Foreign Object Debris</li>
        </ol>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-3">What is Foreign Object Debris (FOD)?</h3>
        <p className="text-lg leading-relaxed">
          <strong>Foreign Object Debris (FOD)</strong> is any substance alien to the part or assembly that could cause damage. 
          This includes any material that could be accidentally picked up and included in the packaging. 
          It could also be dirt or chemicals that could get in an assembly and cause damage or deterioration.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2">Responsibility</h3>
        
        <div className="space-y-6 ml-4">
          <div className="bg-green-50 p-5 rounded-lg border-l-4 border-green-500">
            <p className="text-lg font-semibold text-green-900 mb-2">1. All Employees:</p>
            <p className="text-lg">It is the responsibility of all employees to ensure parts meet requirements by:</p>
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-lg">
              <li>Preserving the parts</li>
              <li>Not using out of date or expired materials</li>
              <li>Rotating stock to use oldest items before they expire (First in, First Out - "FIFO")</li>
            </ul>
          </div>

          <div className="bg-purple-50 p-5 rounded-lg border-l-4 border-purple-500">
            <p className="text-lg font-semibold text-purple-900 mb-2">2. Management:</p>
            <p className="text-lg">It is the responsibility of management to:</p>
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-lg">
              <li>Maintain a list of all materials with a shelf life (expiration date)</li>
              <li>Write clear identifying dates on materials</li>
              <li>Dispose of expired materials</li>
            </ul>
          </div>

          <div className="bg-orange-50 p-5 rounded-lg border-l-4 border-orange-500">
            <p className="text-lg font-semibold text-orange-900 mb-2">3. All Employees:</p>
            <p className="text-lg">
              It is the responsibility of all employees to see that work areas are cleaned and free of any materials not 
              needed to prevent damage, deterioration, or loss of traceability.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2">Procedure for Preservation</h3>
        
        <div className="bg-blue-50 p-6 rounded-lg space-y-4">
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</span>
            <p className="text-lg pt-1"><strong>Ensure components are not expired or out-of-date before using.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</span>
            <p className="text-lg pt-1"><strong>Any material with a shelf life should be checked.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</span>
            <p className="text-lg pt-1"><strong>Items with a shelf life should have an expiration date listed.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</span>
            <p className="text-lg pt-1"><strong>Expired material will be placed in the collection area and leaders will submit a waste management form for disposal.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">5</span>
            <p className="text-lg pt-1"><strong>Management will determine disposal of expired items.</strong></p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2">Procedure for FOD</h3>
        
        <div className="bg-green-50 p-6 rounded-lg space-y-4">
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">1</span>
            <p className="text-lg pt-1"><strong>Before starting a job check for any special cleanliness requirements.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">2</span>
            <p className="text-lg pt-1"><strong>Clear the work area of any extra material and hardware that could be accidentally used.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">3</span>
            <p className="text-lg pt-1"><strong>Clean the work area to prevent damage from dirt or chemicals.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">4</span>
            <p className="text-lg pt-1"><strong>Check parts when complete for any unnecessary debris, such as poly, shavings, bolts, nuts, etc. and remove any debris.</strong></p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">5</span>
            <p className="text-lg pt-1"><strong>When finished, package or segregate parts to prevent damage, contamination, or loss of traceability.</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChemicalHandlingContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-purple-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Droplet className="h-10 w-10 text-purple-600" />
          <h2 className="text-3xl font-bold text-purple-900">Chemical Handling, Storage, & Disposal</h2>
        </div>
        <p className="text-lg text-gray-600">Environmental, Health, & Safety Program</p>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
        <h3 className="text-xl font-bold text-blue-900 mb-3">Program Purpose</h3>
        <p className="text-lg leading-relaxed">
          To ensure all AG Composites employees work in a <strong>safe environment</strong>. It is paramount that everyone 
          follows established procedures to prevent injuries, illnesses, or death. If you see another employee not following 
          procedures, correct them or immediately notify the department leader or Safety Team.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-purple-900 border-b-2 border-purple-200 pb-2">Chemical Handling Procedures</h3>
        
        <div className="bg-purple-50 p-6 rounded-lg space-y-4">
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
            <p className="text-lg pt-1">When handling chemicals, <strong>always refer to the Safety Data Sheet (SDS)</strong> for best practices</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
            <p className="text-lg pt-1">Know where the <strong>Safety Data Sheets (SDS) and Hazard Communication Program</strong> can be found</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
            <p className="text-lg pt-1">Only two signal words exist: <strong>"Danger"</strong> (more severe) and <strong>"Warning"</strong> (less severe)</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
            <p className="text-lg pt-1">Know what <strong>personal protective equipment (PPE)</strong> is required for each chemical</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</span>
            <p className="text-lg pt-1">Understand <strong>symptoms of overexposure</strong> and proper response procedures</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">Chemical Storage</h3>
          
          <div className="space-y-3">
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
              <p className="text-lg font-semibold text-red-900 mb-1">🔥 Flammable Products</p>
              <p className="text-base">Stored in fire safe cabinet</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
              <p className="text-lg font-semibold text-blue-900 mb-1">🌡️ Temperature Sensitive</p>
              <p className="text-base">Stored in refrigerated container (65°F - 75°F)</p>
            </div>

            <div className="bg-cyan-50 p-4 rounded-lg border-l-4 border-cyan-500">
              <p className="text-lg font-semibold text-cyan-900 mb-1">❄️ Raw Carbon Fiber</p>
              <p className="text-base">Stored in freezer (-1°F to 23°F)</p>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg border-l-4 border-amber-500">
              <p className="text-lg font-semibold text-amber-900 mb-1">📅 FIFO Rule</p>
              <p className="text-base">Use First In, First Out based on manufacture date</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-orange-900 border-b-2 border-orange-200 pb-2">Chemical Disposal</h3>
          
          <div className="space-y-3 text-base">
            <div className="bg-gray-50 p-3 rounded border">
              <p className="font-semibold text-gray-800">Plugging Department:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>Epoxy: Mix with hardener, let harden, throw in dumpster</li>
                <li>Acetone: Allow to evaporate, dispose container</li>
              </ul>
            </div>

            <div className="bg-gray-50 p-3 rounded border">
              <p className="font-semibold text-gray-800">Paint Department:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>Paint/276, Activator, Thinner, Catalyst</li>
                <li>1. Fill out disposal form → Production Manager</li>
                <li>2. Place container in disposal area</li>
              </ul>
            </div>

            <div className="bg-gray-50 p-3 rounded border">
              <p className="font-semibold text-gray-800">CNC & Gunsmith:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>Epoxy, Oil, Lubricant: Fill form, disposal area</li>
                <li>Coolant (CNC): 50 gal drum → designated area</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border-2 border-yellow-400 p-6 rounded-lg">
        <h3 className="text-xl font-bold text-yellow-900 mb-3 flex items-center gap-2">
          <ShieldAlert className="h-6 w-6" />
          Training Success Criteria
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-lg">
          <li>Know location of Safety Data Sheets</li>
          <li>Understand chemical risks and protective procedures</li>
          <li>Know general facility safety measures and evacuation procedures</li>
          <li>Can perform work duties safely and effectively</li>
        </ol>
      </div>
    </div>
  );
}

function FireSafetyContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-red-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Flame className="h-10 w-10 text-red-600" />
          <h2 className="text-3xl font-bold text-red-900">Fire Safety Training</h2>
        </div>
        <p className="text-lg text-gray-600">AG Composites - Composite Manufacturing Environment</p>
      </div>

      <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg">
        <h3 className="text-xl font-bold text-red-900 mb-3">Training Objective</h3>
        <p className="text-lg leading-relaxed">
          To ensure all AG Composites employees understand <strong>fire safety hazards</strong>, <strong>prevention measures</strong>, 
          <strong>emergency response</strong>, and <strong>evacuation procedures</strong>. You will learn to recognize risks, 
          respond appropriately, and follow company protocols to maintain a safe workplace.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">🔥 Fire Hazards in Composite Manufacturing</h3>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-orange-50 p-5 rounded-lg border-2 border-orange-300">
            <h4 className="text-lg font-bold text-orange-900 mb-2">Flammable Materials</h4>
            <ul className="list-disc list-inside space-y-1 text-base">
              <li>Epoxy resins & hardeners</li>
              <li>Solvents (acetone, alcohol)</li>
              <li>Carbon fiber & fiberglass dust</li>
              <li>Paints, primers, adhesives</li>
            </ul>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-2 border-yellow-300">
            <h4 className="text-lg font-bold text-yellow-900 mb-2">Heat & Ignition Sources</h4>
            <ul className="list-disc list-inside space-y-1 text-base">
              <li>Ovens & curing equipment</li>
              <li>Grinding/cutting machines</li>
              <li>CNC machines (sparks)</li>
              <li>Solvent-soaked rags</li>
            </ul>
          </div>

          <div className="bg-blue-50 p-5 rounded-lg border-2 border-blue-300">
            <h4 className="text-lg font-bold text-blue-900 mb-2">Electrical Hazards</h4>
            <ul className="list-disc list-inside space-y-1 text-base">
              <li>Overloaded circuits</li>
              <li>Faulty extension cords</li>
              <li>Exposed wiring</li>
              <li>Improper equipment grounding</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">🛡️ Fire Prevention</h3>
        
        <div className="space-y-4">
          <div className="bg-green-50 p-5 rounded-lg border-l-4 border-green-600">
            <p className="text-lg font-semibold text-green-900 mb-2">Housekeeping</p>
            <ul className="list-disc list-inside ml-4 space-y-1 text-base">
              <li>Keep exits, walkways, and fire extinguishers clear</li>
              <li>Dispose of solvent-soaked rags in fire-safe containers</li>
              <li>Regularly clean carbon/fiberglass dust with explosion-proof vacuums</li>
            </ul>
          </div>

          <div className="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-600">
            <p className="text-lg font-semibold text-blue-900 mb-2">Chemical Storage</p>
            <ul className="list-disc list-inside ml-4 space-y-1 text-base">
              <li>Store chemicals in flammable safety cabinets</li>
              <li>Label all containers properly</li>
              <li>Keep incompatible chemicals separated (oxidizers vs solvents)</li>
            </ul>
          </div>

          <div className="bg-purple-50 p-5 rounded-lg border-l-4 border-purple-600">
            <p className="text-lg font-semibold text-purple-900 mb-2">Equipment & Conduct</p>
            <ul className="list-disc list-inside ml-4 space-y-1 text-base">
              <li>Inspect electrical cords and tools regularly</li>
              <li>Shut down ovens/curing equipment after use</li>
              <li>No smoking in or near production areas</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">🚨 Fire Emergency Procedures</h3>
        
        <div className="bg-red-50 p-6 rounded-lg space-y-4">
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold">1</span>
            <div className="pt-1">
              <p className="text-lg font-bold text-red-900">Raise the Alarm</p>
              <p className="text-base">Activate nearest fire alarm pull station and dial 911</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold">2</span>
            <div className="pt-1">
              <p className="text-lg font-bold text-red-900">Evacuate</p>
              <p className="text-base">Stop work immediately. Follow posted evacuation routes. Move quickly and calmly to assembly area</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold">3</span>
            <div className="pt-1">
              <p className="text-lg font-bold text-red-900">Containment (If Safe)</p>
              <p className="text-base">Small fires may be fought with extinguisher ONLY if trained and safe. Never fight large fires</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold">4</span>
            <div className="pt-1">
              <p className="text-lg font-bold text-red-900">Do NOT Re-Enter</p>
              <p className="text-base">Only re-enter after cleared by Fire Department or Safety Officer</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-300">
          <h3 className="text-xl font-bold text-blue-900 mb-4">🧯 Fire Extinguishers</h3>
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-base">Types at AG Composites:</p>
              <ul className="list-disc list-inside ml-4 mt-1 text-base">
                <li><strong>Class A</strong> – wood, paper, trash</li>
                <li><strong>Class B</strong> – flammable liquids (resins, solvents, paints)</li>
                <li><strong>Class C</strong> – electrical equipment</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-green-50 p-6 rounded-lg border-2 border-green-300">
          <h3 className="text-xl font-bold text-green-900 mb-4">PASS Method</h3>
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">P</span>
              <p className="text-base"><strong>Pull</strong> the pin</p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">A</span>
              <p className="text-base"><strong>Aim</strong> at the base of the fire</p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">S</span>
              <p className="text-base"><strong>Squeeze</strong> the handle</p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">S</span>
              <p className="text-base"><strong>Sweep</strong> side to side</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border-2 border-yellow-400 p-6 rounded-lg">
        <h3 className="text-xl font-bold text-yellow-900 mb-3 flex items-center gap-2">
          <ShieldAlert className="h-6 w-6" />
          Critical Safety Points
        </h3>
        <ul className="space-y-2 text-lg">
          <li className="flex items-start gap-2">
            <span className="text-yellow-600 mt-1">✓</span>
            <span>Always know the location of nearest exits and fire extinguishers</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600 mt-1">✓</span>
            <span>Never block fire exits with materials or equipment</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600 mt-1">✓</span>
            <span>Report frayed cords, overheating machines, or chemical leaks immediately</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600 mt-1">✓</span>
            <span>Participate in quarterly fire drills—treat every drill as real</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 font-bold">★</span>
            <span className="font-bold">Your safety is the priority—equipment and materials can be replaced</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ITARContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-indigo-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Shield className="h-10 w-10 text-indigo-600" />
          <h2 className="text-3xl font-bold text-indigo-900">Annual ITAR Training</h2>
        </div>
        <p className="text-lg text-gray-600">International Traffic in Arms Regulations</p>
      </div>

      <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-lg">
        <h3 className="text-xl font-bold text-indigo-900 mb-3">Welcome & Purpose</h3>
        <p className="text-lg leading-relaxed mb-3">
          Compliance with ITAR is <strong>critical to our business</strong> as a U.S. manufacturer of defense-related products and services.
        </p>
        <p className="text-base font-semibold mb-2">This training ensures all employees:</p>
        <ul className="list-disc list-inside ml-4 space-y-1 text-base">
          <li>Understand their responsibilities under ITAR</li>
          <li>Recognize controlled technical data, defense articles, and defense services</li>
          <li>Know how to properly safeguard export-controlled information</li>
          <li>Prevent unauthorized exports, disclosures, or transfers</li>
        </ul>
      </div>

      <div className="bg-red-50 border-2 border-red-400 p-6 rounded-lg">
        <h3 className="text-xl font-bold text-red-900 mb-2 flex items-center gap-2">
          <ShieldAlert className="h-6 w-6" />
          Critical Warning
        </h3>
        <p className="text-lg">
          Failure to comply with ITAR can result in <strong>severe civil, criminal, and administrative penalties</strong> for both the company and individuals.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">What is ITAR?</h3>
        <ul className="space-y-3 ml-4">
          <li className="flex items-start gap-3">
            <span className="text-indigo-600 mt-1">•</span>
            <p className="text-lg">A set of <strong>U.S. government regulations</strong> administered by the Department of State, Directorate of Defense Trade Controls (DDTC)</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-indigo-600 mt-1">•</span>
            <p className="text-lg">Controls the export and temporary import of <strong>defense articles, technical data, and defense services</strong> listed on the U.S. Munitions List (USML)</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-indigo-600 mt-1">•</span>
            <p className="text-lg">Applies to all U.S. persons and organizations engaged in the manufacture, export, or brokering of defense-related items</p>
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">Key Terms You Must Know</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-500">
            <h4 className="text-lg font-bold text-blue-900 mb-2">Defense Article</h4>
            <p className="text-base">Any item or component specifically designed, developed, or modified for military use and listed on the USML</p>
          </div>

          <div className="bg-purple-50 p-5 rounded-lg border-l-4 border-purple-500">
            <h4 className="text-lg font-bold text-purple-900 mb-2">Technical Data</h4>
            <p className="text-base">Blueprints, drawings, process specifications, test data, and software related to defense articles</p>
          </div>

          <div className="bg-green-50 p-5 rounded-lg border-l-4 border-green-500">
            <h4 className="text-lg font-bold text-green-900 mb-2">Defense Service</h4>
            <p className="text-base">Assistance, training, or technical support related to defense articles</p>
          </div>

          <div className="bg-orange-50 p-5 rounded-lg border-l-4 border-orange-500">
            <h4 className="text-lg font-bold text-orange-900 mb-2">Export (Critical!)</h4>
            <p className="text-base font-semibold mb-2">Not just shipping overseas. Export includes:</p>
            <ul className="list-disc list-inside text-sm ml-2 space-y-1">
              <li>Sending controlled items outside the U.S.</li>
              <li>Sharing technical data with a foreign person (even inside the U.S.)</li>
              <li>Providing defense services to a foreign person</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">Your Employee Responsibilities</h3>
        
        <div className="bg-indigo-50 p-6 rounded-lg space-y-3">
          <p className="text-lg font-semibold text-indigo-900">Every employee must:</p>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <p className="text-base pt-1">Protect ITAR-controlled data and materials</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <p className="text-base pt-1">Verify citizenship status before sharing controlled information</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <p className="text-base pt-1">Mark and store ITAR documents properly</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <p className="text-base pt-1">Use company-approved communication systems for ITAR data</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</span>
              <p className="text-base pt-1">Report potential violations immediately to compliance or management</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">Safeguarding ITAR Data</h3>
        
        <div className="space-y-4">
          <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-500">
            <p className="font-semibold text-yellow-900 mb-1">📝 Marking:</p>
            <p className="text-base">All ITAR-controlled documents must be clearly labeled <strong>"ITAR Controlled – Export Controlled"</strong></p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
            <p className="font-semibold text-blue-900 mb-1">🔒 Access Control:</p>
            <p className="text-base">Only U.S. Persons with a business need may access ITAR data</p>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border-l-4 border-purple-500">
            <p className="font-semibold text-purple-900 mb-1">💾 Storage:</p>
            <p className="text-base">Secure ITAR documents in locked cabinets or restricted-access digital systems</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
            <p className="font-semibold text-green-900 mb-1">📧 Electronic Transmission:</p>
            <p className="text-base">Use encrypted email or secure file transfer only</p>
          </div>

          <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
            <p className="font-semibold text-red-900 mb-1">🚫 Conversations:</p>
            <p className="text-base">Do not discuss ITAR-controlled information in public or with unauthorized personnel</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">🚩 Red Flags - Report Immediately!</h3>
        
        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-300">
          <p className="text-base font-semibold mb-3">You must immediately report if you see:</p>
          <ul className="space-y-2 text-base">
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">⚠️</span>
              <span>Requests for controlled data from non-U.S. persons</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">⚠️</span>
              <span>Pressure to bypass company ITAR procedures</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">⚠️</span>
              <span>Technical discussions with unknown vendors or customers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">⚠️</span>
              <span>Foreign nationals working on ITAR projects without clearance</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">⚖️ Penalties for Non-Compliance</h3>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-red-50 p-5 rounded-lg border-2 border-red-400">
            <h4 className="text-lg font-bold text-red-900 mb-2">Civil Penalties</h4>
            <p className="text-2xl font-bold text-red-600 mb-2">$1,272,251</p>
            <p className="text-sm">per violation</p>
          </div>

          <div className="bg-orange-50 p-5 rounded-lg border-2 border-orange-400">
            <h4 className="text-lg font-bold text-orange-900 mb-2">Criminal Penalties</h4>
            <p className="text-xl font-bold text-orange-600 mb-1">$1,000,000</p>
            <p className="text-xl font-bold text-orange-600 mb-2">20 years prison</p>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-2 border-yellow-400">
            <h4 className="text-lg font-bold text-yellow-900 mb-2">Company Impact</h4>
            <ul className="text-sm space-y-1">
              <li>• Loss of export privileges</li>
              <li>• Loss of government contracts</li>
              <li>• Reputational damage</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg border-l-4 border-gray-500">
        <h3 className="text-xl font-bold text-gray-900 mb-3">Real Case Examples</h3>
        <ul className="space-y-3 text-base">
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 font-bold">→</span>
            <span>An engineer emailed ITAR drawings to a foreign supplier without a license → <strong>$20M fine</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 font-bold">→</span>
            <span>A technician allowed a foreign intern on the shop floor with ITAR parts visible → <strong>company export license revoked</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 font-bold">→</span>
            <span>A manager discussed controlled technical data with a non-U.S. person at a trade show → <strong>DDTC investigation</strong></span>
          </li>
        </ul>
      </div>

      <div className="bg-indigo-50 border-2 border-indigo-400 p-6 rounded-lg">
        <h3 className="text-xl font-bold text-indigo-900 mb-3 flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Key Contacts & Reporting
        </h3>
        <p className="text-lg mb-2">If you have questions about ITAR compliance or suspect a violation:</p>
        <p className="text-base font-semibold">Contact the Business Manager or VP of Operations</p>
        <p className="text-base">Phone: <strong>256-723-8381</strong></p>
        <p className="text-sm mt-3 text-gray-600">No retaliation will occur for reporting in good faith.</p>
      </div>

      <div className="bg-blue-50 border-2 border-blue-300 p-6 rounded-lg">
        <h3 className="text-xl font-bold text-blue-900 mb-3">Who Can Sign ITAR Documents?</h3>
        <p className="text-base">Only the <strong>VP of Operations</strong> and <strong>Business Manager</strong> are authorized to sign and submit ITAR-related documents to the U.S. Department of State.</p>
      </div>
    </div>
  );
}

function AS9100Content() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-blue-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <ClipboardCheck className="h-10 w-10 text-blue-600" />
          <h2 className="text-3xl font-bold text-blue-900">AS9100 Employee Orientation Training</h2>
        </div>
        <p className="text-lg text-gray-600">Quality Management System for Aerospace & Defense</p>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
        <h3 className="text-xl font-bold text-blue-900 mb-3">What is AS9100?</h3>
        <p className="text-lg leading-relaxed mb-3">
          AS9100 is a <strong>quality management system</strong> for companies that design, develop, or provide products for the <strong>aviation, space, and defense industries</strong>.
        </p>
        <p className="text-base font-semibold mb-2">AG Composites, LLC dba AG Advanced Technologies ("AG"):</p>
        <ul className="list-disc list-inside ml-4 space-y-1 text-base">
          <li>Designs, develops, manufactures, and finishes composite components</li>
          <li>Assembles composite structures</li>
          <li>Machines metal and composite components</li>
        </ul>
        <p className="text-base mt-3">All these processes fall under AG's Quality Management System (QMS).</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">Quality Policy</h3>
        
        <div className="bg-green-50 p-6 rounded-lg border-2 border-green-400">
          <p className="text-xl font-bold text-green-900 text-center leading-relaxed">
            "AG Composites will continuously improve while producing quality products in a timely manner to meet customer requirements."
          </p>
          <p className="text-center text-sm text-gray-600 mt-3">This is posted on bulletin boards and on the information slide show.</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-purple-900 border-b-2 border-purple-200 pb-2">Quality Objectives (KPIs)</h3>
        
        <p className="text-base mb-4">Quality objectives are the company's goals. They are also called <strong>Key Performance Indicators (KPIs)</strong> and create a way to evaluate the company's performance.</p>

        <div className="space-y-4">
          <div className="bg-red-50 p-5 rounded-lg border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <p className="text-lg font-bold text-red-900 mb-1">Return Rate</p>
                <p className="text-base">Goal: <strong>3% or less</strong> for OEM and retail products based on manufacturer defect or error</p>
                <p className="text-sm text-gray-600">Measured monthly</p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 p-5 rounded-lg border-l-4 border-orange-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <p className="text-lg font-bold text-orange-900 mb-1">Production Scrap</p>
                <p className="text-base">Goal: <strong>1% or less</strong> for nonconforming items</p>
                <p className="text-sm text-gray-600">Measured monthly</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <p className="text-lg font-bold text-blue-900 mb-1">Retail Shipping Rate</p>
                <p className="text-base">Goal: <strong>90% on-time</strong> shipping</p>
                <p className="text-sm text-gray-600">Measured monthly</p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 p-5 rounded-lg border-l-4 border-green-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <div>
                <p className="text-lg font-bold text-green-900 mb-1">Continuous Improvement</p>
                <p className="text-base">Through training, leader development, audits, reviews, and corrective actions</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">Quality Objectives and Your Position</h3>
        
        <p className="text-base mb-3">How do the quality objectives relate to your current job?</p>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg border">
            <p className="font-semibold text-gray-800 mb-1">1. Customer Satisfaction</p>
            <p className="text-sm">Follow processes to prevent returns and defects</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border">
            <p className="font-semibold text-gray-800 mb-1">2. Scrap/Nonconformities</p>
            <p className="text-sm">Minimize waste by following procedures correctly</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border">
            <p className="font-semibold text-gray-800 mb-1">3. Shipping Deadlines</p>
            <p className="text-sm">Complete work on time to meet shipping goals</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border">
            <p className="font-semibold text-gray-800 mb-1">4. Employee Performance</p>
            <p className="text-sm">Participate in training and development</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border col-span-2">
            <p className="font-semibold text-gray-800 mb-1">5. Continuous Improvement</p>
            <p className="text-sm">Share ideas to improve quality, efficiency, or customer satisfaction</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-yellow-900 border-b-2 border-yellow-200 pb-2">Documents</h3>
        
        <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
          <p className="text-base font-semibold mb-3">There will be certain documents and forms required for your position.</p>
          
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-yellow-900 mb-1">Where can you find documents for your job?</p>
              <ul className="list-disc list-inside ml-4 text-sm">
                <li>Work Orders/Travelers</li>
                <li>Daily/Weekly Production Forms</li>
                <li>Maintenance Checklists</li>
              </ul>
            </div>
            
            <div>
              <p className="font-semibold text-yellow-900 mb-1">Where can you find HR documents?</p>
              <ul className="list-disc list-inside ml-4 text-sm">
                <li>Vacation Request</li>
                <li>Payroll Forms</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2">Quality and Your Job</h3>
        
        <div className="bg-blue-50 border-2 border-blue-400 p-6 rounded-lg">
          <p className="text-2xl font-bold text-blue-900 text-center mb-4">Quality is Everybody's Responsibility</p>
          
          <p className="text-lg font-semibold text-blue-800 mb-3">How do you contribute?</p>
          
          <div className="space-y-4">
            <div className="bg-white p-4 rounded border-l-4 border-blue-600">
              <p className="font-semibold text-blue-900 mb-2">Follow the processes you were trained to do</p>
              <p className="text-sm">If you identify a process being changed or done incorrectly, notify a manager immediately</p>
            </div>

            <div className="bg-white p-4 rounded border-l-4 border-blue-600">
              <p className="font-semibold text-blue-900 mb-2">Only use approved materials</p>
              <p className="text-sm">If you identify expired materials, or different materials being used, notify a manager immediately</p>
            </div>

            <div className="bg-white p-4 rounded border-l-4 border-blue-600">
              <p className="font-semibold text-blue-900 mb-2">Share improvement ideas</p>
              <p className="text-sm">If you have an idea to improve quality, efficiency, or customer satisfaction, share it with management or the quality team</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">⚠️ Negative Actions and Effects</h3>
        
        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-300">
          <ul className="space-y-3 text-base">
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Taking shortcuts</strong> → Creates nonconforming products</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Working in dirty, contaminated space</strong> → Introduces foreign objects or debris</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Speaking rudely to customers</strong> → Upsets customers, affects sales</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Using other employees' tools</strong> → Reduces efficiency</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Not maintaining your tools</strong> → Tools damage products, loss of money</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Forging documents</strong> → Makes materials untraceable, alters performance numbers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Using expired materials</strong> → Creates nonconforming or unsafe products</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Incorrect storage of chemicals</strong> → Creates unsafe environment, potential damage to product</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">Quality is Also "Safe & Clean"</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-orange-50 p-5 rounded-lg border-l-4 border-orange-500">
            <h4 className="text-lg font-bold text-orange-900 mb-3">Safety Questions</h4>
            <ul className="space-y-2 text-base">
              <li className="flex items-start gap-2">
                <span className="text-orange-600">•</span>
                <span>Does your work create an unsafe environment or product?</span>
              </li>
              <li className="ml-6 text-sm">
                <ul className="list-disc list-inside">
                  <li>Slippery floors</li>
                  <li>Hot surfaces</li>
                  <li>Sharp edges</li>
                </ul>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600">•</span>
                <span>What can you do to keep the product safe for other employees and customers?</span>
              </li>
            </ul>
          </div>

          <div className="bg-cyan-50 p-5 rounded-lg border-l-4 border-cyan-500">
            <h4 className="text-lg font-bold text-cyan-900 mb-3">Cleanliness Questions</h4>
            <ul className="space-y-2 text-base">
              <li className="flex items-start gap-2">
                <span className="text-cyan-600">•</span>
                <span>Does your work create a dirty environment?</span>
              </li>
              <li className="ml-6 text-sm">
                <ul className="list-disc list-inside">
                  <li>Trash</li>
                  <li>Dust</li>
                  <li>Debris</li>
                </ul>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-600">•</span>
                <span>What can you do to keep the product safe from FOD (Foreign Object Debris)?</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border-2 border-indigo-400 p-6 rounded-lg">
        <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          Final Checklist - Key Takeaways
        </h3>
        <ol className="space-y-2 text-base list-decimal list-inside">
          <li>Understand the AS9100 Quality Management System and why AG Composites has the certification</li>
          <li>Know the quality policy and where it's located</li>
          <li>Understand the quality objectives (KPIs) and how they relate to your job</li>
          <li>Know where to find documents and forms needed for your job</li>
          <li>Understand how you contribute to the QMS</li>
          <li>Know what problems can happen if you don't follow the QMS</li>
          <li>Understand your role in making a safe product</li>
          <li>Know what FOD is and how it can affect the customer's product</li>
        </ol>
      </div>
    </div>
  );
}

function CounterfeitPreventionContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-red-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <AlertTriangle className="h-10 w-10 text-red-600" />
          <h2 className="text-3xl font-bold text-red-900">Counterfeit Materials Prevention Training</h2>
        </div>
        <p className="text-lg text-gray-600">Protecting Product Integrity & Safety</p>
      </div>

      <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg">
        <h3 className="text-xl font-bold text-red-900 mb-3">⚠️ Introduction</h3>
        <p className="text-lg leading-relaxed mb-3">
          Counterfeiting is growing in <strong>exponential proportions</strong> with respect to:
        </p>
        <ol className="list-decimal list-inside ml-4 space-y-2 text-base">
          <li className="font-semibold">Products being counterfeited</li>
          <li className="font-semibold">Industries affected</li>
          <li className="font-semibold">Potential consequences caused by counterfeits</li>
        </ol>
        <p className="text-base mt-4 font-semibold text-red-800">
          If this threat is not adequately addressed, counterfeit items have the potential to seriously compromise the safety and operational effectiveness of our products.
        </p>
      </div>

      <div className="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-500">
        <h3 className="text-xl font-bold text-blue-900 mb-3">📋 Reference</h3>
        <ul className="space-y-1 text-base">
          <li>• <strong>AS9100(D)</strong> Section 8.1.4</li>
          <li>• <strong>Quality Manual</strong> Section 8.1.4</li>
          <li>• <strong>Process Manual</strong> Section 3.13</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-purple-900 border-b-2 border-purple-200 pb-2">🎯 Purpose</h3>
        
        <p className="text-base mb-3">The objective of this training is to raise awareness of:</p>
        
        <div className="grid gap-4">
          <div className="bg-purple-50 p-5 rounded-lg border-l-4 border-purple-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <p className="text-base pt-1">The <strong>risks and impacts</strong> of counterfeit parts infiltrating the supply chain</p>
            </div>
          </div>

          <div className="bg-purple-50 p-5 rounded-lg border-l-4 border-purple-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <p className="text-base pt-1"><strong>Best practices</strong> to eliminate or mitigate those risks</p>
            </div>
          </div>

          <div className="bg-purple-50 p-5 rounded-lg border-l-4 border-purple-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <p className="text-base pt-1">The <strong>AG Composites counterfeit prevention requirements</strong> for suppliers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">💥 Impact of Counterfeit Parts</h3>
        
        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-300">
          <p className="text-lg font-bold text-red-900 mb-4">Counterfeit parts can cause:</p>
          <ul className="space-y-3 text-base">
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Personal injury</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Mission failure</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Reduced reliability and product recall</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Potential loss of contracts</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Shutdown of manufacturing lines</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Negative cost and schedule impacts</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Penalties for companies and individuals</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1 text-xl">⚠</span>
              <span><strong>Damage to our image</strong></span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">✅ Procedure: AVOIDANCE</h3>
        
        <div className="space-y-4">
          <div className="bg-green-50 p-6 rounded-lg border-2 border-green-400">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">🏆</span>
              <div>
                <p className="text-xl font-bold text-green-900">LOWEST RISK</p>
                <p className="text-lg mt-1">Procuring directly from the <strong>Original Component or Equipment Manufacturer (OCM/OEM)</strong></p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 p-6 rounded-lg border-l-4 border-green-500">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl">🥈</span>
              <div>
                <p className="text-xl font-bold text-green-900">NEXT LOWEST RISK</p>
                <p className="text-lg mt-1"><strong>OCM Authorized Distributors</strong></p>
              </div>
            </div>
            <ul className="ml-12 space-y-2 text-base">
              <li>• OCM Authorized distributors have <strong>documented sales agreements</strong> with manufacturers</li>
              <li>• Inventory manager should <strong>verify authorized distributor status</strong> with the manufacturer</li>
            </ul>
          </div>

          <div className="bg-blue-50 p-5 rounded-lg border-l-4 border-blue-500">
            <p className="text-base font-semibold">
              <strong>AG Purchase Orders</strong> require suppliers to use OCMs or their authorized sources for products that will be delivered to Lockheed Martin.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">📋 AG Supplier Requirements</h3>
        
        <div className="bg-indigo-50 p-6 rounded-lg border-2 border-indigo-400">
          <p className="text-lg font-bold text-indigo-900 mb-3">PREVENTION OF COUNTERFEIT PARTS:</p>
          <div className="text-base space-y-3 leading-relaxed">
            <p>
              Suppliers shall ensure through their <strong>processes and/or a formal program</strong> against the receipt of counterfeit materials into their inventory, against their use in manufacturing, and against their being sold to other suppliers.
            </p>
            <p>
              Supplier shall <strong className="text-red-700">NOT deliver counterfeit work or suspect counterfeit work</strong> to AG Advanced Technologies.
            </p>
            <p>
              All parts and materials shall be procured <strong>only through Original Equipment Manufacturers (OEMs)/Original Component Manufacturers (OCMs) or their franchised dealer or distributors</strong> unless pre-approval has been granted by AG Advanced Technologies.
            </p>
            <p className="text-red-800 font-semibold">
              Knowingly supplying material deemed or suspected as counterfeit will be considered <strong>unethical business practice</strong> and would result in a supplier investigation, reporting and possible <strong>removal from AG Advanced Technologies Approved Supplier list</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-orange-900 border-b-2 border-orange-200 pb-2">🔍 Procedure: DETECTION</h3>
        
        <div className="bg-orange-50 p-6 rounded-lg border-l-4 border-orange-500">
          <p className="text-lg font-semibold text-orange-900 mb-4">
            Identify the issue: Carefully inspect the items and identify any visual discrepancies or inconsistencies that suggest they may be counterfeit.
          </p>
          
          <p className="text-xl font-bold text-red-900 mb-4">🚩 RED FLAGS:</p>
          
          <div className="grid md:grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">🚩 No certificate of conformance</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">🚩 Item marking issues</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">🚩 Package issues</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">🚩 Obsolete item</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">☒ Batch/lot # issues</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">☒ Spelling/return address unknown</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">🚩 Unknown supplier</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">☒ Doesn't match previous items</p>
            </div>
            <div className="bg-white p-3 rounded border-l-2 border-red-500">
              <p className="text-sm font-semibold">☒ Poor quality or materials</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-yellow-900 border-b-2 border-yellow-200 pb-2">🛡️ Procedure: MITIGATION</h3>
        
        <div className="space-y-3">
          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <p className="font-bold text-yellow-900 mb-1">Isolate the parts</p>
                <p className="text-sm">Quarantine the suspect counterfeit parts to prevent them from entering the production line or being used in any product</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <p className="font-bold text-yellow-900 mb-1">Document thoroughly</p>
                <p className="text-sm">Create detailed documentation including photos, part numbers, lot numbers, supplier information, and any evidence of the suspected counterfeiting</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <p className="font-bold text-yellow-900 mb-1">Inform your supplier</p>
                <p className="text-sm">Provide evidence and request an explanation. If necessary, require corrective action from the supplier</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <div>
                <p className="font-bold text-yellow-900 mb-1">Conduct an internal investigation</p>
                <p className="text-sm">Determine the extent of the problem and potential risks within the supply chain</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</span>
              <div>
                <p className="font-bold text-yellow-900 mb-1">Communicate with the customer</p>
                <p className="text-sm">Rework, replace, or repair any fielded product in conjunction with customer input</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">6</span>
              <div>
                <p className="font-bold text-yellow-900 mb-1">Determine if authorities should be notified</p>
                <p className="text-sm">Consider notifying FAA, local police, FBI, etc.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-200 pb-2">📦 Procedure: DISPOSITION</h3>
        
        <div className="space-y-3">
          <div className="bg-gray-50 p-5 rounded-lg border-l-4 border-gray-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-gray-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <p className="text-base pt-1">Store counterfeit parts or materials in <strong>quarantine</strong>, clearly identified as nonconforming/counterfeit product pending a review by your organization's management and legal representation</p>
            </div>
          </div>

          <div className="bg-red-100 p-5 rounded-lg border-2 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <p className="text-base pt-1 font-semibold text-red-900">Do <strong className="underline">NOT</strong> return Counterfeit to the supplier in such a way that they could be reintroduced into the supply chain to be sold again to another victim</p>
            </div>
          </div>

          <div className="bg-gray-50 p-5 rounded-lg border-l-4 border-gray-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-gray-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <p className="text-base pt-1">Legal authorities may be contacted to initiate an investigation into the counterfeiting activity. Parts may be required as evidence</p>
            </div>
          </div>

          <div className="bg-gray-50 p-5 rounded-lg border-l-4 border-gray-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-gray-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <p className="text-base pt-1">Upon conclusion of any investigation, <strong>upper management will authorize the disposition</strong> and method for disposing of any suspect/counterfeit items</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300 p-6 rounded-lg">
        <h3 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
          <CheckCircle className="h-7 w-7" />
          Conclusion - Key Takeaways
        </h3>
        <ul className="space-y-3 text-base">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>Counterfeit materials are a <strong>serious threat</strong> and can compromise the integrity of the important products we provide</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>The use of <strong>Original Component or Equipment manufacturers and their authorized sources</strong> results in the least risk for counterfeit items infiltrating our products</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 font-bold">!</span>
            <span>If you suspect counterfeit items may have been supplied to AG, you must <strong className="text-red-700">notify the Quality Manager immediately</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>Counterfeit risk must be controlled <strong>throughout the entire supply chain</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">✓</span>
            <span>Thank you for your continued efforts to ensure counterfeit components do not infiltrate our supply chains</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function EthicsContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-blue-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Scale className="h-10 w-10 text-blue-600" />
          <h2 className="text-3xl font-bold text-blue-900">Ethics in Aerospace Quality Systems</h2>
        </div>
        <p className="text-lg text-gray-600">Integrity, Honesty, and Transparency in Manufacturing</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2">1. Importance of Ethical Behavior</h3>
        
        <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500">
          <h4 className="text-lg font-bold text-blue-900 mb-3">Definition of Ethical Behavior in Aerospace</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Acting with honesty, integrity, and transparency</strong></li>
            <li>• <strong>Commitment to safety and compliance</strong></li>
          </ul>
        </div>

        <div className="bg-indigo-50 p-6 rounded-lg border-l-4 border-indigo-500">
          <h4 className="text-lg font-bold text-indigo-900 mb-3">Why Ethics Matter in Aerospace</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Direct impact on flight safety and end-user protection</strong></li>
            <li>• <strong>Legal and regulatory consequences</strong> for unethical actions</li>
          </ul>
        </div>

        <div className="bg-purple-50 p-6 rounded-lg border-l-4 border-purple-500">
          <h4 className="text-lg font-bold text-purple-900 mb-3">Connection to AS9100 Requirements</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Clause 7.3:</strong> Awareness of ethical behavior</li>
            <li>• Role in supporting Quality Management Systems (QMS)</li>
          </ul>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-green-50 p-5 rounded-lg border-2 border-green-400">
            <h4 className="text-lg font-bold text-green-900 mb-3">✓ Ethical Behavior Examples</h4>
            <ul className="space-y-2 text-sm">
              <li>• Reporting issues truthfully</li>
              <li>• Maintaining accurate documentation</li>
              <li>• Honest customer and supplier communications</li>
            </ul>
          </div>
          <div className="bg-red-50 p-5 rounded-lg border-2 border-red-400">
            <h4 className="text-lg font-bold text-red-900 mb-3">✗ Unethical Behavior Examples</h4>
            <ul className="space-y-2 text-sm">
              <li>• Concealment of non-conforming parts</li>
              <li>• Falsifying inspection records</li>
              <li>• Dishonest communications</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">2. Falsification of Records</h3>
        
        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-400">
          <h4 className="text-xl font-bold text-red-900 mb-4">Definition and Types of Falsification</h4>
          <ul className="space-y-3 text-base">
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Altering inspection or test results</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Creating fraudulent documentation</strong> (e.g., fake certificates)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-1">✗</span>
              <span><strong>Backdating or pre-dating signatures</strong></span>
            </li>
          </ul>
        </div>

        <div className="bg-orange-50 p-6 rounded-lg border-l-4 border-orange-500">
          <h4 className="text-lg font-bold text-orange-900 mb-3">Common Causes of Falsification</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• Production pressure or tight deadlines</li>
            <li>• Lack of proper oversight</li>
            <li>• Misunderstanding of procedures</li>
          </ul>
        </div>

        <div className="bg-gray-100 p-6 rounded-lg border-2 border-gray-400">
          <h4 className="text-xl font-bold text-gray-900 mb-4">⚠️ Consequences for Individuals and Organizations</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="font-semibold text-gray-800 mb-2">For Individuals:</p>
              <ul className="space-y-1 text-sm ml-4">
                <li>• Termination of employment</li>
                <li>• Legal action and criminal charges</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-800 mb-2">For Organizations:</p>
              <ul className="space-y-1 text-sm ml-4">
                <li>• Loss of customer trust and contracts</li>
                <li>• FAA and government penalties</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-red-100 to-orange-100 p-8 rounded-lg border-2 border-red-400">
        <h3 className="text-2xl font-bold text-red-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-7 w-7" />
          Case Study: Boeing Supplier Incident (Spirit AeroSystems, 2020)
        </h3>
        
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-lg">
            <h4 className="text-lg font-bold text-gray-900 mb-2">Background</h4>
            <p className="text-base leading-relaxed">
              In 2020, a major Boeing supplier, <strong>Spirit AeroSystems</strong>, was found to have <strong className="text-red-700">falsified inspection records</strong> related to structural components for Boeing aircraft, including the <strong>737 MAX and 787 Dreamliner</strong>. The falsification included documentation that certain parts passed quality inspections <strong className="text-red-700">when they had not been properly inspected</strong>.
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg">
            <h4 className="text-lg font-bold text-gray-900 mb-2">What Happened</h4>
            <ul className="space-y-2 text-base ml-4">
              <li>• Employees signed off on inspection reports <strong className="text-red-700">without actually performing the required checks</strong></li>
              <li>• This included <strong>critical structural elements</strong> (fuselage sections, bulkhead assemblies)</li>
              <li>• Initially driven by <strong>pressure to meet production schedules</strong> and avoid delays</li>
              <li>• When uncovered, investigation revealed it had occurred <strong>over several years</strong></li>
            </ul>
          </div>

          <div className="bg-white p-5 rounded-lg">
            <h4 className="text-lg font-bold text-red-900 mb-2">Consequences</h4>
            <ul className="space-y-2 text-base ml-4">
              <li>• Boeing had to <strong className="text-red-700">halt production temporarily</strong> and perform extensive inspections and rework</li>
              <li>• The supplier faced significant <strong>financial penalties</strong> and loss of customer trust</li>
              <li>• Multiple employees were <strong>terminated</strong>, some faced <strong>legal consequences</strong></li>
              <li>• FAA <strong>increased oversight</strong> of both Boeing and its suppliers</li>
              <li>• The incident <strong>damaged Boeing's reputation</strong></li>
            </ul>
          </div>

          <div className="bg-green-50 p-5 rounded-lg border-2 border-green-500">
            <h4 className="text-lg font-bold text-green-900 mb-2">✓ Lessons Learned</h4>
            <ul className="space-y-2 text-base ml-4">
              <li>• <strong>Production speed must never override safety and compliance</strong></li>
              <li>• Falsification <strong>endangers jobs and entire companies</strong></li>
              <li>• Companies must foster a culture where employees <strong>feel safe to report problems</strong></li>
              <li>• <strong>Regular audits and independent verification</strong> are critical</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-yellow-900 border-b-2 border-yellow-200 pb-2">3. Handling Non-Conforming Material</h3>
        
        <div className="bg-yellow-50 p-6 rounded-lg border-l-4 border-yellow-500">
          <h4 className="text-lg font-bold text-yellow-900 mb-3">Definition of Non-Conforming Material</h4>
          <p className="text-base mb-2"><strong>Parts or processes that do not meet specification requirements</strong></p>
          <p className="text-sm font-semibold mb-2">Examples:</p>
          <ul className="ml-4 space-y-1 text-sm">
            <li>• Incorrect dimensions</li>
            <li>• Material defects</li>
            <li>• Missing documentation</li>
          </ul>
        </div>

        <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500">
          <h4 className="text-lg font-bold text-blue-900 mb-4">Proper Steps for Handling</h4>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <p className="font-semibold">Immediate identification and tagging</p>
                <p className="text-sm">Tag defective parts immediately upon discovery</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <p className="font-semibold">Quarantine procedures</p>
                <p className="text-sm">Prevent accidental use in production</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <p className="font-semibold">Document in QMS</p>
                <p className="text-sm">Create proper documentation trail</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 p-6 rounded-lg border-l-4 border-purple-500">
          <h4 className="text-lg font-bold text-purple-900 mb-3">Responsibilities for Reporting</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Who to notify:</strong> Supervisor, quality department</li>
            <li>• <strong>Documentation required:</strong> Non-conformance report</li>
            <li>• <strong>Timeliness and accuracy</strong> in reporting</li>
          </ul>
        </div>

        <div className="bg-green-50 p-6 rounded-lg border-l-4 border-green-500">
          <h4 className="text-lg font-bold text-green-900 mb-3">Preventing Repeat Issues</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• Root cause analysis</li>
            <li>• Corrective actions</li>
            <li>• Continuous improvement processes</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-orange-900 border-b-2 border-orange-200 pb-2">4. Prevention of Counterfeit Parts</h3>
        
        <div className="bg-orange-50 p-6 rounded-lg border-2 border-orange-400">
          <h4 className="text-lg font-bold text-orange-900 mb-3">Definition of Counterfeit Parts</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• Any <strong>unauthorized copy, imitation, or substitute</strong></li>
            <li>• Parts <strong>misrepresented in origin, composition, or certification</strong></li>
          </ul>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-400">
          <h4 className="text-lg font-bold text-red-900 mb-3">⚠️ Risks Associated with Counterfeit Parts</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Safety hazards</strong> leading to equipment failure</li>
            <li>• <strong>Legal and contractual consequences</strong></li>
          </ul>
        </div>

        <div className="bg-indigo-50 p-6 rounded-lg border-l-4 border-indigo-500">
          <h4 className="text-lg font-bold text-indigo-900 mb-3">Supplier Management Controls</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Approved supplier lists</strong> and audits</li>
            <li>• <strong>Receiving inspection processes</strong></li>
            <li>• <strong>Supplier ethical behavior training</strong> requirements</li>
          </ul>
        </div>

        <div className="bg-green-50 p-6 rounded-lg border-l-4 border-green-500">
          <h4 className="text-lg font-bold text-green-900 mb-3">✓ Best Practices for Counterfeit Prevention</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Traceability</strong> of materials and components</li>
            <li>• <strong>Verification of Certificates of Conformity (CoC)</strong></li>
            <li>• Use of <strong>barcodes or QR codes</strong> for tracking</li>
            <li>• <strong>Mandatory reporting</strong> of suspected counterfeit parts to customers and authorities</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-cyan-900 border-b-2 border-cyan-200 pb-2">5. Responsibilities of Employees and Suppliers</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-400">
            <h4 className="text-lg font-bold text-blue-900 mb-3">👤 Employee Responsibilities</h4>
            <ul className="space-y-2 text-base">
              <li>✓ Follow documented procedures at all times</li>
              <li>✓ Report issues or concerns immediately</li>
              <li>✓ Maintain accuracy and integrity in documentation</li>
              <li>✓ Protect company and customer intellectual property</li>
            </ul>
          </div>

          <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-400">
            <h4 className="text-lg font-bold text-purple-900 mb-3">🏢 Supplier Responsibilities</h4>
            <ul className="space-y-2 text-base">
              <li>✓ Adhere to ethical behavior standards in contracts</li>
              <li>✓ Maintain traceability for materials supplied</li>
              <li>✓ Notify customer of any quality escapes or concerns</li>
            </ul>
          </div>
        </div>

        <div className="bg-green-50 p-5 rounded-lg border-l-4 border-green-500">
          <h4 className="text-lg font-bold text-green-900 mb-2">🤝 Joint Responsibility in the Supply Chain</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Shared accountability</strong> for quality and compliance</li>
            <li>• <strong>Collaborative efforts</strong> to prevent defects and unethical practices</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-indigo-900 border-b-2 border-indigo-200 pb-2">6. Whistleblower Policy</h3>
        
        <div className="bg-indigo-50 p-6 rounded-lg border-2 border-indigo-400">
          <h4 className="text-xl font-bold text-indigo-900 mb-4">Purpose of a Whistleblower Policy</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Protect individuals</strong> who report issues in good faith</li>
            <li>• <strong>Encourage early identification</strong> of problems</li>
          </ul>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-400">
          <h4 className="text-lg font-bold text-red-900 mb-4">Types of Reportable Activities</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Falsification of records</strong></li>
            <li>• <strong>Safety hazards</strong> or unsafe work practices</li>
            <li>• <strong>Theft, fraud, or financial misconduct</strong></li>
            <li>• <strong>Retaliation or harassment</strong> against those who report</li>
          </ul>
        </div>

        <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500">
          <h4 className="text-lg font-bold text-blue-900 mb-3">Reporting Channels</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>Internal reporting:</strong> Supervisor, HR, quality manager</li>
            <li>• <strong>Anonymous reporting:</strong> Hotlines or digital forms</li>
            <li>• <strong>External reporting:</strong> Regulatory bodies (FAA, ISO, etc.)</li>
          </ul>
        </div>

        <div className="bg-green-50 p-6 rounded-lg border-2 border-green-400">
          <h4 className="text-lg font-bold text-green-900 mb-4">🛡️ Protection for Whistleblowers</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• <strong>No retaliation policy</strong></li>
            <li>• <strong>Confidential handling</strong> of complaints</li>
            <li>• <strong>Legal protections</strong> under federal and state laws</li>
          </ul>
        </div>

        <div className="bg-gray-100 p-6 rounded-lg border-l-4 border-gray-500">
          <h4 className="text-lg font-bold text-gray-900 mb-3">Follow-up and Resolution</h4>
          <ul className="space-y-2 text-base ml-4">
            <li>• Investigation procedures</li>
            <li>• Corrective and preventive action tracking</li>
          </ul>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 p-8 rounded-lg">
        <h3 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
          <Scale className="h-7 w-7" />
          Key Takeaways - Ethics in Action
        </h3>
        <ul className="space-y-3 text-base">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1 text-xl">✓</span>
            <span><strong>Ethical behavior is everyone's responsibility</strong> and directly impacts flight safety</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 text-xl">!</span>
            <span><strong>Falsification of records has severe consequences</strong> for individuals and organizations</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1 text-xl">✓</span>
            <span><strong>Non-conforming material must be identified, quarantined, and documented</strong> immediately</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1 text-xl">✓</span>
            <span><strong>Counterfeit prevention requires vigilance</strong> throughout the supply chain</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1 text-xl">✓</span>
            <span><strong>Report issues immediately</strong> - Whistleblower policies protect those who speak up</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-1 text-xl">✓</span>
            <span><strong>Production speed must never override safety and compliance</strong></span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function NonconformingItemsContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-orange-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <PackageX className="h-10 w-10 text-orange-600" />
          <h2 className="text-3xl font-bold text-orange-900">Leader Training: Nonconforming Items</h2>
        </div>
        <p className="text-lg text-gray-600">Managing Quality Issues Throughout Production</p>
      </div>

      <div className="bg-red-50 p-6 rounded-lg border-l-4 border-red-500">
        <h3 className="text-xl font-bold text-red-900 mb-3">Definition: Nonconforming Items</h3>
        <p className="text-lg leading-relaxed mb-3">
          <strong>Nonconforming items</strong> are products or materials that <strong className="text-red-700">don't meet the requirements or standards</strong> for their intended use.
        </p>
        <div className="bg-white p-4 rounded-lg mt-4">
          <p className="font-semibold text-gray-800 mb-2">Non-conformances can occur at any stage:</p>
          <div className="grid md:grid-cols-4 gap-2 text-sm">
            <div className="bg-red-50 p-2 rounded">Design</div>
            <div className="bg-red-50 p-2 rounded">Pre-production</div>
            <div className="bg-red-50 p-2 rounded">Production</div>
            <div className="bg-red-50 p-2 rounded">Post-production</div>
            <div className="bg-red-50 p-2 rounded">Packaging</div>
            <div className="bg-red-50 p-2 rounded">Storage</div>
            <div className="bg-red-50 p-2 rounded">Shipping</div>
            <div className="bg-red-50 p-2 rounded">Delivery</div>
          </div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg mt-3">
          <p className="font-semibold text-orange-900 mb-2">Caused by:</p>
          <ul className="space-y-1 text-base ml-4">
            <li>• Quality issues</li>
            <li>• Regulatory non-compliance</li>
            <li>• Production errors</li>
            <li>• Other factors</li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-400">
        <h3 className="text-2xl font-bold text-blue-900 mb-4">Three Categories of Nonconforming Items</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border-l-4 border-red-600">
            <p className="text-xl font-bold text-red-900 text-center">1. Scrap</p>
          </div>
          <div className="bg-white p-4 rounded-lg border-l-4 border-yellow-600">
            <p className="text-xl font-bold text-yellow-900 text-center">2. Returns</p>
          </div>
          <div className="bg-white p-4 rounded-lg border-l-4 border-orange-600">
            <p className="text-xl font-bold text-orange-900 text-center">3. Counterfeit</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-red-900 border-b-2 border-red-200 pb-2">1️⃣ SCRAP</h3>
        
        <div className="space-y-3">
          <div className="bg-red-50 p-5 rounded-lg border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <p className="text-base pt-1">Scrap items are normally created from <strong>neglect, environmental changes, or supply changes</strong></p>
            </div>
          </div>

          <div className="bg-red-50 p-5 rounded-lg border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <p className="text-base pt-1">Scrap items are collected in <strong className="text-red-700">red barrels</strong> at the <strong>line manager's work area</strong></p>
            </div>
          </div>

          <div className="bg-red-50 p-5 rounded-lg border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div className="pt-1">
                <p className="text-base mb-2">Scrap items will be <strong className="text-red-700">red tagged</strong> and uploaded into the <strong>Nonconforming Items spreadsheet</strong> by the production line manager</p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 p-5 rounded-lg border-l-4 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <div className="pt-1">
                <p className="text-base font-semibold mb-2">Examples of scrap:</p>
                <ul className="space-y-1 text-sm ml-4">
                  <li>• Rifle stocks with cracks</li>
                  <li>• Rifle stocks with uncured epoxy</li>
                  <li>• Rifle stocks without plastic or aluminum inserts</li>
                  <li>• Tubes or cones that fail QC</li>
                  <li>• Expired paint, hardener, epoxy</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 text-white p-5 rounded-lg border-2 border-gray-700">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</span>
              <div className="pt-1">
                <p className="text-lg font-bold mb-2">⚠️ DISPOSITION</p>
                <p className="text-base">Scrap items are to be <strong className="text-red-400">rendered unusable and disposed of</strong></p>
                <p className="text-sm mt-2 bg-gray-800 p-3 rounded">
                  <strong>Authorization:</strong> Production Manager, Quality Manager, or Business Manager
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-yellow-900 border-b-2 border-yellow-200 pb-2">2️⃣ RETURNS</h3>
        
        <div className="space-y-3">
          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <p className="text-base pt-1">Returns from customers will be <strong className="text-yellow-700">red tagged by the sales team</strong></p>
            </div>
          </div>

          <div className="bg-yellow-50 p-5 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <p className="text-base pt-1">Returns are logged into the <strong>Nonconforming Items spreadsheet</strong> by the <strong>sales team</strong></p>
            </div>
          </div>

          <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-400">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div className="pt-1 w-full">
                <p className="text-lg font-bold text-blue-900 mb-3">DISPOSITION OPTIONS</p>
                <p className="text-sm mb-3"><strong>Authorization:</strong> Business Manager, Production Manager, or Upper Management</p>
                
                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-lg border-l-4 border-red-500">
                    <p className="font-bold text-red-900 mb-1">A. Scrap</p>
                    <p className="text-sm">Destruction due to defect</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border-l-4 border-green-500">
                    <p className="font-bold text-green-900 mb-1">B. Repair</p>
                    <p className="text-sm">Repair or change the item for return to the customer</p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border-l-4 border-blue-500">
                    <p className="font-bold text-blue-900 mb-1">C. Use As-Is</p>
                    <p className="text-sm">Items that do not meet initial customer requirements but the variation is <strong>approved by the customer</strong></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-orange-900 border-b-2 border-orange-200 pb-2">3️⃣ COUNTERFEIT</h3>
        
        <div className="space-y-3">
          <div className="bg-orange-50 p-5 rounded-lg border-l-4 border-orange-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div className="pt-1">
                <p className="text-base mb-2"><strong>Definition:</strong></p>
                <p className="text-base">Counterfeit items are items that <strong className="text-orange-700">introduced to the supply chain and/or production line</strong> that are <strong>fake or unauthorized replicas</strong> of genuine parts and products</p>
              </div>
            </div>
          </div>

          <div className="bg-red-100 p-5 rounded-lg border-2 border-red-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div className="pt-1">
                <p className="text-lg font-bold text-red-900 mb-2">⚠️ IMMEDIATE ACTION REQUIRED</p>
                <p className="text-base">Items that are suspected to be counterfeit are <strong className="text-red-700">immediately isolated in the business office</strong></p>
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 p-5 rounded-lg border-l-4 border-indigo-500">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div className="pt-1">
                <p className="text-base mb-2"><strong>Investigation & Disposition:</strong></p>
                <ul className="space-y-2 text-base ml-4">
                  <li>• <strong>Trained personnel</strong> will be assigned to investigate the potential counterfeit items</li>
                  <li>• Eventual disposition will be determined by <strong>upper management</strong></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-400 p-8 rounded-lg">
        <h3 className="text-2xl font-bold text-orange-900 mb-4 flex items-center gap-2">
          <PackageX className="h-7 w-7" />
          Key Takeaways - Leader Responsibilities
        </h3>
        <ul className="space-y-3 text-base">
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 text-xl font-bold">1</span>
            <span><strong>Three Categories:</strong> All nonconforming items fall into Scrap, Returns, or Counterfeit</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 text-xl font-bold">2</span>
            <span><strong>Red Tagging:</strong> Scrap (by line manager) and Returns (by sales team) must be red tagged</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 text-xl font-bold">3</span>
            <span><strong>Documentation:</strong> All items must be logged in the Nonconforming Items spreadsheet</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 text-xl font-bold">4</span>
            <span><strong>Scrap = Destroy:</strong> Scrap items have only ONE disposition - render unusable and dispose</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-600 mt-1 text-xl font-bold">5</span>
            <span><strong>Returns have 3 options:</strong> Scrap, Repair, or Use As-Is (with customer approval)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 mt-1 text-xl font-bold">!</span>
            <span><strong>Counterfeit = Immediate Isolation:</strong> Suspected counterfeit items must be immediately isolated in the business office</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1 text-xl">✓</span>
            <span><strong>Authorization matters:</strong> Know who can authorize each type of disposition</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-1 text-xl">✓</span>
            <span><strong>Any stage:</strong> Non-conformances can occur from design through delivery</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function ShutDownProceduresContent() {
  return (
    <div className="bg-white rounded-lg p-8 shadow-sm space-y-8 text-gray-800">
      <div className="text-center border-b-2 border-indigo-200 pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Power className="h-10 w-10 text-indigo-600" />
          <h2 className="text-3xl font-bold text-indigo-900">Leader Training: Shut Down Procedures</h2>
        </div>
        <p className="text-lg text-gray-600">Daily Facility Closing & Security Protocols</p>
        <p className="text-sm text-gray-500 mt-2">Processes and tasks required to correctly lock up the facility each day</p>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2">🔧 CNC Department</h3>
        
        <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Remove all tools from the machine spindles</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn machines to the <strong>OFF home position</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn all machines OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn the air compressors OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Organize the department area</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Ensure there are no overflowing trash cans</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn all fans OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close and lock container doors</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-base font-semibold">Close and lock all doors:</span>
                <ul className="ml-6 mt-1 space-y-1 text-sm">
                  <li>• 3 pedestrian exit doors</li>
                  <li>• Roll down door</li>
                </ul>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn lights OFF</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-green-900 border-b-2 border-green-200 pb-2">🔩 Gunsmith Department</h3>
        
        <div className="bg-green-50 p-6 rounded-lg border-l-4 border-green-500">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn Mill 1 & 2 OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Place all tools and drills in the <strong>correct toolbox</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn all fans OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Shut down the air compressor</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close and latch the roll down door</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close and lock the pedestrian exit door</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-base font-semibold">In the grinding room:</span>
                <ul className="ml-6 mt-1 space-y-1 text-sm">
                  <li>• Turn all grinders OFF</li>
                  <li>• Turn fans OFF</li>
                  <li>• Turn lights OFF</li>
                  <li>• Turn OFF exhaust fans</li>
                  <li>• Close both doors</li>
                </ul>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn off pressure washer</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn off water spigot</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-purple-900 border-b-2 border-purple-200 pb-2">📦 Plugging & Layup Department</h3>
        
        <div className="bg-purple-50 p-6 rounded-lg border-l-4 border-purple-500">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-base font-semibold">Turn OFF fans:</span>
                <ul className="ml-6 mt-1 space-y-1 text-sm">
                  <li>• Break out area</li>
                  <li>• Layup room</li>
                  <li>• Assembly area</li>
                </ul>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close container doors</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-base font-semibold">Turn OFF lights:</span>
                <ul className="ml-6 mt-1 space-y-1 text-sm">
                  <li>• Mixing shed</li>
                  <li>• Break out area</li>
                  <li>• Break room</li>
                  <li>• Hot room</li>
                  <li>• Layup room</li>
                </ul>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close the door to the mixing shed</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <span className="text-base"><strong>Ensure the oven timers are set to turn OFF</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close and latch both roll down doors in the oven area</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close the pedestrian exit door</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-orange-900 border-b-2 border-orange-200 pb-2">🎨 Paint Department</h3>
        
        <div className="bg-orange-50 p-6 rounded-lg border-l-4 border-orange-500">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <span className="text-base"><strong>Clean and break down paint guns</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF paint booth fan and lights</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF air compressor</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF all fans</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF all Z-rack lights</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close all cabinets and the paint closet</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-900 border-b-2 border-gray-200 pb-2">✅ General Tasks</h3>
        
        <div className="bg-gray-50 p-6 rounded-lg border-l-4 border-gray-500">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF bathroom lights</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Make sure the coffee pot is OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Verify all air compressors are OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close and lock all container doors</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Close and latch the roll down doors</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF overhead fans</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Ensure all lights are OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Lock all external doors</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base"><strong>Ensure the security gate closes</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Check the front office - if you are the last person to leave, <strong>set the alarm and lock the front door</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Walk through the sanding shed turn off lights and remove tools</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-cyan-900 border-b-2 border-cyan-200 pb-2">🏢 Front Office</h3>
        
        <div className="bg-cyan-50 p-6 rounded-lg border-l-4 border-cyan-500">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Turn OFF the dehumidifier</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Ensure bathroom and office lights are OFF</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <span className="text-base"><strong>Ensure hall and porch lights are ON</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <span className="text-base">Check the back building - if you are the last person to leave, <strong>set the alarm and lock the front door</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-cyan-600 mt-0.5 flex-shrink-0" />
              <span className="text-base"><strong>Ensure the security gate is closed</strong></span>
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-400 p-8 rounded-lg">
        <h3 className="text-2xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
          <Power className="h-7 w-7" />
          Key Reminders - Leader Responsibilities
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg border-l-4 border-red-500">
            <p className="font-bold text-red-900 mb-2">⚠️ Critical Safety Items</p>
            <ul className="space-y-1 text-sm">
              <li>• Remove tools from CNC spindles</li>
              <li>• Turn machines to OFF home position</li>
              <li>• Verify oven timers set to turn OFF</li>
              <li>• All air compressors OFF</li>
              <li>• Turn off water spigot</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border-l-4 border-blue-500">
            <p className="font-bold text-blue-900 mb-2">🔒 Security Checklist</p>
            <ul className="space-y-1 text-sm">
              <li>• All doors closed and locked</li>
              <li>• Security gate verified closed</li>
              <li>• Alarms set if last to leave</li>
              <li>• Hall and porch lights ON</li>
              <li>• All other lights OFF</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border-l-4 border-green-500">
            <p className="font-bold text-green-900 mb-2">🧹 Organization & Cleanliness</p>
            <ul className="space-y-1 text-sm">
              <li>• Tools in correct toolboxes</li>
              <li>• Department areas organized</li>
              <li>• No overflowing trash cans</li>
              <li>• Sanding shed cleaned</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-lg border-l-4 border-orange-500">
            <p className="font-bold text-orange-900 mb-2">🎨 Paint Department</p>
            <ul className="space-y-1 text-sm">
              <li>• FIRST: Clean and break down paint guns</li>
              <li>• Paint booth fan and lights OFF</li>
              <li>• Z-rack lights OFF</li>
              <li>• All cabinets and paint closet closed</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 bg-yellow-100 border-l-4 border-yellow-500 p-4 rounded">
          <p className="text-base font-semibold text-yellow-900">
            💡 Final Walk Through: Turn off lights in CNC area and verify all shutdown procedures completed
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TrainingModule() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);

  const { data: module, isLoading } = useQuery({
    queryKey: [`/api/training/modules/${id}`],
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { employeeId: string; employeeName: string; answers: Record<number, string> }) => {
      return apiRequest(`/api/training/modules/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      setResults(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: [`/api/training/completions/${employeeId}`] });
      
      if (data.passed) {
        toast({
          title: 'Congratulations!',
          description: `You passed with ${data.score}%! Your certificate has been issued.`,
        });
      } else {
        toast({
          title: 'Training Incomplete',
          description: `You scored ${data.score}%. Please review the material and try again.`,
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Submission Error',
        description: error.message || 'Failed to submit quiz',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!employeeId || !employeeName) {
      toast({
        title: 'Missing Information',
        description: 'Please enter your Employee ID and Name',
        variant: 'destructive',
      });
      return;
    }

    const moduleData = module as any;
    if (!moduleData?.questions || Object.keys(answers).length < moduleData.questions.length) {
      toast({
        title: 'Incomplete Quiz',
        description: 'Please answer all questions before submitting',
        variant: 'destructive',
      });
      return;
    }

    submitMutation.mutate({
      employeeId,
      employeeName,
      answers,
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-center py-12 text-gray-500">Loading training module...</p>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>Training module not found</AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={() => setLocation('/training')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Training
        </Button>
      </div>
    );
  }

  const moduleData = module as any;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Button variant="ghost" onClick={() => setLocation('/training')} className="mb-4" data-testid="button-back">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Training
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-module-title">{moduleData.title}</h1>
        <p className="text-gray-600">{moduleData.description}</p>
      </div>

      {/* Training Material */}
      <Card className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900 text-2xl">
            <FileText className="h-7 w-7 text-blue-600" />
            📖 Step 1: Review Training Material
          </CardTitle>
          <CardDescription className="text-blue-800 text-base">
            Please read through all the information below before taking the quiz
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Dynamic content based on module */}
          {moduleData.title.includes('Preservation') && <PreservationFODContent />}
          {moduleData.title.includes('Chemical Handling') && <ChemicalHandlingContent />}
          {moduleData.title.includes('Fire Safety') && <FireSafetyContent />}
          {moduleData.title.includes('ITAR') && <ITARContent />}
          {moduleData.title.includes('AS9100') && <AS9100Content />}
          {moduleData.title.includes('Counterfeit') && <CounterfeitPreventionContent />}
          {moduleData.title.includes('Ethics') && <EthicsContent />}
          {moduleData.title.includes('Nonconforming') && <NonconformingItemsContent />}
          {moduleData.title.includes('Shut Down') && <ShutDownProceduresContent />}

          {/* Download PDF Option */}
          {moduleData.pdfUrl && (
            <div className="mt-6 pt-6 border-t-2 border-gray-200 text-center bg-white rounded-lg p-4">
              <p className="text-gray-600 mb-3">You can also download the original document:</p>
              <a
                href={moduleData.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" data-testid="button-download-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  Download Original Document
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quiz Section */}
      {!showResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">✍️ Step 2: Complete the Certification Quiz</CardTitle>
            <CardDescription className="text-base">
              Answer all questions below. You need at least {moduleData.passingScore || 80}% to pass and earn your certification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Employee Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-md">
              <div>
                <Label htmlFor="employeeId">Employee ID *</Label>
                <Input
                  id="employeeId"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Enter your employee ID"
                  data-testid="input-employee-id"
                />
              </div>
              <div>
                <Label htmlFor="employeeName">Full Name *</Label>
                <Input
                  id="employeeName"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Enter your full name"
                  data-testid="input-employee-name"
                />
              </div>
            </div>

            {/* Questions */}
            {moduleData.questions?.map((question: any, index: number) => (
              <div key={question.id} className="space-y-3 p-4 border rounded-md" data-testid={`question-${question.id}`}>
                <Label className="text-base font-semibold">
                  {index + 1}. {question.question}
                </Label>
                <RadioGroup
                  value={answers[question.id] || ''}
                  onValueChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                >
                  {question.answers?.map((answer: any) => (
                    <div key={answer.id} className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={answer.answerText}
                        id={`answer-${answer.id}`}
                        data-testid={`radio-answer-${answer.id}`}
                      />
                      <Label htmlFor={`answer-${answer.id}`} className="cursor-pointer">
                        {answer.answerText}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}

            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-full"
              size="lg"
              data-testid="button-submit-quiz"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Quiz'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {showResults && results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {results.passed ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <span className="text-green-600">Congratulations!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-600" />
                  <span className="text-red-600">Training Incomplete</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">Your Score</p>
                <p className="text-3xl font-bold text-primary">{results.score}%</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">Correct Answers</p>
                <p className="text-3xl font-bold text-green-600">
                  {results.correctAnswers}/{results.totalQuestions}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">Passing Score</p>
                <p className="text-3xl font-bold text-gray-700">{results.passingScore}%</p>
              </div>
            </div>

            {results.passed ? (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <Award className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    You have successfully completed this training module and earned your certification!
                    Your certificate has been issued and recorded in your employee profile.
                  </AlertDescription>
                </Alert>
                
                {/* Certificate Display */}
                <div className="border-2 border-green-600 rounded-lg p-8 bg-white text-center">
                  <h2 className="text-3xl font-bold mb-4 text-green-700">Certificate of Completion</h2>
                  <Award className="h-16 w-16 text-green-600 mx-auto mb-4" />
                  <p className="text-xl mb-2">This certifies that</p>
                  <p className="text-2xl font-bold mb-4">{employeeName}</p>
                  <p className="text-lg mb-2">has successfully completed</p>
                  <p className="text-xl font-semibold mb-4">{results.moduleTitle || moduleData.title}</p>
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-4 text-left">
                    <div>
                      <p className="text-sm text-gray-600">Score Achieved:</p>
                      <p className="text-lg font-bold text-green-600">{results.score}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Completion Date:</p>
                      <p className="text-lg font-bold">{new Date().toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-6">Employee ID: {employeeId}</p>
                  <Button 
                    className="mt-4" 
                    onClick={() => window.print()}
                    data-testid="button-print-certificate"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Print Certificate
                  </Button>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  You need at least {results.passingScore}% to pass. Please review the training material
                  and try again.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setLocation('/training')} variant="outline" className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Training
              </Button>
              {!results.passed && (
                <Button
                  onClick={() => {
                    setShowResults(false);
                    setResults(null);
                    setAnswers({});
                  }}
                  className="flex-1"
                  data-testid="button-retake-quiz"
                >
                  Retake Quiz
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
