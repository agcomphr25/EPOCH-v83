import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Flame, Phone, MapPin } from 'lucide-react';
import { Link } from 'wouter';

export default function FireSafetyTraining() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Flame className="h-8 w-8 text-red-500" />
            Fire Safety Training
          </h1>
          <p className="text-gray-600 mt-1">Fire prevention, emergency response, and evacuation procedures</p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6">
        {/* Emergency Contacts */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <Phone className="h-5 w-5" />
              Emergency Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="text-center p-3 bg-white rounded border">
                <div className="font-bold text-lg text-red-600">911</div>
                <div className="text-gray-600">Emergency Services</div>
              </div>
              <div className="text-center p-3 bg-white rounded border">
                <div className="font-bold text-lg text-red-600">(555) 123-4567</div>
                <div className="text-gray-600">Plant Security</div>
              </div>
              <div className="text-center p-3 bg-white rounded border">
                <div className="font-bold text-lg text-red-600">(555) 765-4321</div>
                <div className="text-gray-600">Safety Manager</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Fire Safety Overview
            </CardTitle>
            <CardDescription>
              Comprehensive fire safety training for manufacturing personnel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Key Topics Covered</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    Fire prevention and hazard identification
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    Proper use of fire extinguishers and suppression systems
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    Evacuation routes and assembly points
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    Emergency communication procedures
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                    Chemical fire safety and material handling
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Fire Extinguisher Types</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 border rounded">
                    <span className="font-medium text-red-600">Class A</span>
                    <span>Ordinary combustibles (wood, paper)</span>
                  </div>
                  <div className="flex justify-between p-2 border rounded">
                    <span className="font-medium text-red-600">Class B</span>
                    <span>Flammable liquids (oil, gasoline)</span>
                  </div>
                  <div className="flex justify-between p-2 border rounded">
                    <span className="font-medium text-red-600">Class C</span>
                    <span>Electrical equipment</span>
                  </div>
                  <div className="flex justify-between p-2 border rounded">
                    <span className="font-medium text-red-600">Class D</span>
                    <span>Combustible metals</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Modules */}
        <Card>
          <CardHeader>
            <CardTitle>Interactive Training Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Fire Prevention</h3>
                <p className="text-sm text-gray-600 mb-3">Identify and eliminate fire hazards in the workplace</p>
                <Button variant="outline" size="sm" data-testid="button-prevention">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Emergency Response</h3>
                <p className="text-sm text-gray-600 mb-3">Proper response procedures when fire is detected</p>
                <Button variant="outline" size="sm" data-testid="button-response">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Evacuation Procedures</h3>
                <p className="text-sm text-gray-600 mb-3">Safe evacuation routes and assembly procedures</p>
                <Button variant="outline" size="sm" data-testid="button-evacuation">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Equipment Operation</h3>
                <p className="text-sm text-gray-600 mb-3">Hands-on fire extinguisher and safety equipment training</p>
                <Button variant="outline" size="sm" data-testid="button-equipment">
                  Start Module
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Evacuation Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Evacuation Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 p-4 rounded border">
              <h3 className="font-semibold mb-2">Assembly Points</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Primary Assembly Point:</strong><br />
                  North parking lot near the main entrance
                </div>
                <div>
                  <strong>Secondary Assembly Point:</strong><br />
                  South parking lot by the loading dock
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-3">
                <strong>Remember:</strong> Do not use elevators during fire emergencies. Follow marked exit routes and report to your designated assembly point for headcount.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}