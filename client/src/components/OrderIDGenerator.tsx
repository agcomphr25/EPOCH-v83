import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Settings, BarChart3, CheckCircle } from "lucide-react";
import { generateP1OrderId, generateP2Serial } from "@/utils/orderUtils";

export function OrderIDGenerator() {
  const [p1Date, setP1Date] = useState(() => new Date().toISOString().split('T')[0]);
  const [lastP1Id, setLastP1Id] = useState("");
  const [generatedP1Id, setGeneratedP1Id] = useState("");

  const [customerCode, setCustomerCode] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [lastSeq, setLastSeq] = useState<number>(0);
  const [generatedP2Serial, setGeneratedP2Serial] = useState("");

  const handleGenerateP1 = () => {
    console.log('DEBUG: handleGenerateP1 called');
    console.log('DEBUG: p1Date =', p1Date);
    console.log('DEBUG: lastP1Id =', lastP1Id);
    const date = new Date(p1Date);
    console.log('DEBUG: date object =', date);
    const newId = generateP1OrderId(date, lastP1Id);
    console.log('DEBUG: generated newId =', newId);
    setGeneratedP1Id(newId);
  };

  const handleGenerateP2 = () => {
    const newSerial = generateP2Serial(customerCode, year, lastSeq);
    setGeneratedP2Serial(newSerial);
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
          <h3 className="text-base font-medium text-gray-700 mb-4">P1 Order ID (Bi-weekly Cycle)</h3>
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
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">Generated ID:</span>
                  <span className="ml-2 text-lg font-mono font-semibold text-primary">
                    {generatedP1Id}
                  </span>
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
