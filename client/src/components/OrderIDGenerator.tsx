import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Settings, BarChart3, CheckCircle } from "lucide-react";
import { generateP1OrderId, generateP2Serial } from "@/utils/orderUtils";

export function OrderIDGenerator() {
  const [p1Date, setP1Date] = useState("2025-07-13");
  const [lastP1Id, setLastP1Id] = useState("AG001");
  const [generatedP1Id, setGeneratedP1Id] = useState("");
  const [testResults, setTestResults] = useState<Array<{test: string, input: string, expected: string, actual: string, pass: boolean}>>([]);

  const [customerCode, setCustomerCode] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [lastSeq, setLastSeq] = useState<number>(0);
  const [generatedP2Serial, setGeneratedP2Serial] = useState("");

  const handleGenerateP1 = () => {
    const date = new Date(p1Date);
    const newId = generateP1OrderId(date, lastP1Id.trim());
    console.log('Generated P1 ID:', newId);
    setGeneratedP1Id(newId);
  };

  const handleGenerateP2 = () => {
    const newSerial = generateP2Serial(customerCode, year, lastSeq);
    setGeneratedP2Serial(newSerial);
  };

  const runP1Tests = () => {
    const tests = [
      // Same month tests
      { test: "Same month increment", date: "2025-07-15", lastId: "AG005", expected: "AG006" },
      { test: "Same month from 999 to 1000", date: "2025-07-15", lastId: "AG999", expected: "AG1000" },
      { test: "Same month high number", date: "2025-07-15", lastId: "AG1500", expected: "AG1501" },
      
      // Monthly reset tests
      { test: "Month change reset", date: "2025-08-01", lastId: "AG999", expected: "AH001" },
      { test: "Year change", date: "2026-01-01", lastId: "AL500", expected: "BA001" },
      { test: "Different month reset", date: "2025-12-01", lastId: "AG100", expected: "AL001" },
      
      // Year progression tests
      { test: "2025 January", date: "2025-01-01", lastId: "", expected: "AA001" },
      { test: "2026 January", date: "2026-01-01", lastId: "", expected: "BA001" },
      { test: "2027 January", date: "2027-01-01", lastId: "", expected: "CA001" },
      { test: "2047 January", date: "2047-01-01", lastId: "", expected: "WA001" },
      { test: "2048 January", date: "2048-01-01", lastId: "", expected: "AAA001" },
      { test: "2049 January", date: "2049-01-01", lastId: "", expected: "ABA001" },
      
      // Edge cases
      { test: "Empty lastId", date: "2025-07-15", lastId: "", expected: "AG001" },
      { test: "Invalid lastId format", date: "2025-07-15", lastId: "INVALID", expected: "AG001" },
      { test: "Old format lastId", date: "2025-07-15", lastId: "AP001", expected: "AG001" },
    ];

    const results = tests.map(({ test, date, lastId, expected }) => {
      const actual = generateP1OrderId(new Date(date), lastId);
      return {
        test,
        input: `Date: ${date}, LastId: ${lastId || 'empty'}`,
        expected,
        actual,
        pass: actual === expected
      };
    });

    setTestResults(results);
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Hash className="h-5 w-5 text-primary" />
          Order ID Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* P1 Order ID Generator */}
        <div>
          <h3 className="text-base font-medium text-gray-700 mb-4">P1 Order ID (Year-Month Format)</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="p1-date">Current Date</Label>
                <Input
                  id="p1-date"
                  type="date"
                  value={p1Date}
                  onChange={(e) => setP1Date(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="last-p1-id">Last Order ID</Label>
                <Input
                  id="last-p1-id"
                  placeholder="e.g., AA001"
                  value={lastP1Id}
                  onChange={(e) => setLastP1Id(e.target.value)}
                />
              </div>
            </div>
            
            <Button 
              onClick={handleGenerateP1}
              className="w-full bg-primary hover:bg-primary/90"
            >
              <Settings className="h-4 w-4 mr-2" />
              Generate P1 Order ID
            </Button>
            
            {generatedP1Id && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">Generated ID:</span>
                  <span className="ml-2 text-lg font-mono font-semibold text-primary">
                    {generatedP1Id}
                  </span>
                </div>
              </div>
            )}
            
            <Button 
              onClick={runP1Tests}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              variant="outline"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Run P1 Algorithm Tests
            </Button>
            
            {testResults.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-96 overflow-y-auto">
                <h4 className="font-medium text-gray-700 mb-3">Test Results</h4>
                <div className="space-y-2">
                  {testResults.map((result, index) => (
                    <div key={index} className={`p-3 rounded text-sm ${
                      result.pass ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'
                    } border`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{result.test}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          result.pass ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                        }`}>
                          {result.pass ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{result.input}</div>
                      <div className="text-xs mt-1">
                        Expected: <span className="font-mono font-semibold">{result.expected}</span>
                      </div>
                      <div className="text-xs">
                        Actual: <span className="font-mono font-semibold">{result.actual}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-sm text-gray-600">
                  Passed: {testResults.filter(r => r.pass).length} / {testResults.length}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* P2 Serial Generator */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-base font-medium text-gray-700 mb-4">P2 Serial Number</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="customer-code">Customer Code</Label>
                <Input
                  id="customer-code"
                  placeholder="e.g., Strive"
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
                />
              </div>
              <div>
                <Label htmlFor="last-seq">Last Sequence</Label>
                <Input
                  id="last-seq"
                  type="number"
                  value={lastSeq}
                  onChange={(e) => setLastSeq(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            
            <Button 
              onClick={handleGenerateP2}
              className="w-full bg-secondary hover:bg-secondary/90"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Generate P2 Serial
            </Button>
            
            {generatedP2Serial && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">Generated Serial:</span>
                  <span className="ml-2 text-lg font-mono font-semibold text-secondary">
                    {generatedP2Serial}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
