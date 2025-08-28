import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, FlaskConical } from "lucide-react";

export function TestResults() {
  const p1Tests = [
    "Starts at AA001 when lastId invalid",
    "Increments within same 14-day block",
    "Rolls over letters every 14 days",
    "Rollover from AZ### → BA001"
  ];

  const p2Tests = [
    "Starts at sequence 00001",
    "Increments after existing sequence",
    "Pads codes and years correctly"
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-green-600" />
          Test Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* P1 Tests */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-3">P1 Order ID Generator Tests</h3>
            <div className="space-y-2 text-sm">
              {p1Tests.map((test, index) => (
                <div key={index} className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <span className="text-green-800">{test}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* P2 Tests */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-3">P2 Serial Generator Tests</h3>
            <div className="space-y-2 text-sm">
              {p2Tests.map((test, index) => (
                <div key={index} className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <span className="text-green-800">{test}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
