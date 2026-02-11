import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, ClipboardList, Info, AlertTriangle, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type InspectionLevel = 'I' | 'II' | 'III' | 'S-1' | 'S-2' | 'S-3' | 'S-4';
type AqlValue = 0.065 | 0.10 | 0.15 | 0.25 | 0.40 | 0.65 | 1.0 | 1.5 | 2.5 | 4.0 | 6.5;
type CodeLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M' | 'N' | 'P' | 'Q' | 'R';

interface LotRange {
  min: number;
  max: number;
  codes: Record<InspectionLevel, CodeLetter>;
}

const LOT_RANGES: LotRange[] = [
  { min: 2, max: 8, codes: { 'I': 'A', 'II': 'A', 'III': 'B', 'S-1': 'A', 'S-2': 'A', 'S-3': 'A', 'S-4': 'A' } },
  { min: 9, max: 15, codes: { 'I': 'A', 'II': 'B', 'III': 'C', 'S-1': 'A', 'S-2': 'A', 'S-3': 'A', 'S-4': 'A' } },
  { min: 16, max: 25, codes: { 'I': 'B', 'II': 'C', 'III': 'D', 'S-1': 'A', 'S-2': 'A', 'S-3': 'B', 'S-4': 'B' } },
  { min: 26, max: 50, codes: { 'I': 'C', 'II': 'D', 'III': 'E', 'S-1': 'A', 'S-2': 'B', 'S-3': 'B', 'S-4': 'C' } },
  { min: 51, max: 90, codes: { 'I': 'C', 'II': 'E', 'III': 'F', 'S-1': 'B', 'S-2': 'B', 'S-3': 'C', 'S-4': 'C' } },
  { min: 91, max: 150, codes: { 'I': 'D', 'II': 'F', 'III': 'G', 'S-1': 'B', 'S-2': 'B', 'S-3': 'C', 'S-4': 'D' } },
  { min: 151, max: 280, codes: { 'I': 'E', 'II': 'G', 'III': 'H', 'S-1': 'B', 'S-2': 'C', 'S-3': 'D', 'S-4': 'E' } },
  { min: 281, max: 500, codes: { 'I': 'F', 'II': 'H', 'III': 'J', 'S-1': 'B', 'S-2': 'C', 'S-3': 'D', 'S-4': 'E' } },
  { min: 501, max: 1200, codes: { 'I': 'G', 'II': 'J', 'III': 'K', 'S-1': 'C', 'S-2': 'C', 'S-3': 'E', 'S-4': 'F' } },
  { min: 1201, max: 3200, codes: { 'I': 'H', 'II': 'K', 'III': 'L', 'S-1': 'C', 'S-2': 'D', 'S-3': 'E', 'S-4': 'G' } },
  { min: 3201, max: 10000, codes: { 'I': 'J', 'II': 'L', 'III': 'M', 'S-1': 'C', 'S-2': 'D', 'S-3': 'F', 'S-4': 'G' } },
  { min: 10001, max: 35000, codes: { 'I': 'K', 'II': 'M', 'III': 'N', 'S-1': 'C', 'S-2': 'D', 'S-3': 'F', 'S-4': 'H' } },
  { min: 35001, max: 150000, codes: { 'I': 'L', 'II': 'N', 'III': 'P', 'S-1': 'D', 'S-2': 'E', 'S-3': 'G', 'S-4': 'J' } },
  { min: 150001, max: 500000, codes: { 'I': 'M', 'II': 'P', 'III': 'Q', 'S-1': 'D', 'S-2': 'E', 'S-3': 'G', 'S-4': 'J' } },
  { min: 500001, max: Infinity, codes: { 'I': 'N', 'II': 'Q', 'III': 'R', 'S-1': 'D', 'S-2': 'E', 'S-3': 'H', 'S-4': 'K' } },
];

const CODE_TO_SAMPLE_SIZE: Record<CodeLetter, number> = {
  'A': 2, 'B': 3, 'C': 5, 'D': 8, 'E': 13, 'F': 20, 'G': 32,
  'H': 50, 'J': 80, 'K': 125, 'L': 200, 'M': 315, 'N': 500,
  'P': 800, 'Q': 1250, 'R': 2000,
};

type AcceptReject = { ac: number; re: number } | 'use_next' | 'use_prev';

const NORMAL_PLANS: Record<CodeLetter, Partial<Record<AqlValue, AcceptReject>>> = {
  'A': {},
  'B': {},
  'C': { 6.5: { ac: 0, re: 1 } },
  'D': { 4.0: { ac: 0, re: 1 }, 6.5: { ac: 1, re: 2 } },
  'E': { 2.5: { ac: 0, re: 1 }, 4.0: { ac: 1, re: 2 }, 6.5: { ac: 2, re: 3 } },
  'F': { 1.5: { ac: 0, re: 1 }, 2.5: { ac: 1, re: 2 }, 4.0: { ac: 2, re: 3 }, 6.5: { ac: 3, re: 4 } },
  'G': { 1.0: { ac: 0, re: 1 }, 1.5: { ac: 1, re: 2 }, 2.5: { ac: 2, re: 3 }, 4.0: { ac: 3, re: 4 }, 6.5: { ac: 5, re: 6 } },
  'H': { 0.65: { ac: 0, re: 1 }, 1.0: { ac: 1, re: 2 }, 1.5: { ac: 2, re: 3 }, 2.5: { ac: 3, re: 4 }, 4.0: { ac: 5, re: 6 }, 6.5: { ac: 7, re: 8 } },
  'J': { 0.40: { ac: 0, re: 1 }, 0.65: { ac: 1, re: 2 }, 1.0: { ac: 2, re: 3 }, 1.5: { ac: 3, re: 4 }, 2.5: { ac: 5, re: 6 }, 4.0: { ac: 7, re: 8 }, 6.5: { ac: 10, re: 11 } },
  'K': { 0.25: { ac: 0, re: 1 }, 0.40: { ac: 1, re: 2 }, 0.65: { ac: 2, re: 3 }, 1.0: { ac: 3, re: 4 }, 1.5: { ac: 5, re: 6 }, 2.5: { ac: 7, re: 8 }, 4.0: { ac: 10, re: 11 }, 6.5: { ac: 14, re: 15 } },
  'L': { 0.15: { ac: 0, re: 1 }, 0.25: { ac: 1, re: 2 }, 0.40: { ac: 2, re: 3 }, 0.65: { ac: 3, re: 4 }, 1.0: { ac: 5, re: 6 }, 1.5: { ac: 7, re: 8 }, 2.5: { ac: 10, re: 11 }, 4.0: { ac: 14, re: 15 }, 6.5: { ac: 21, re: 22 } },
  'M': { 0.10: { ac: 0, re: 1 }, 0.15: { ac: 1, re: 2 }, 0.25: { ac: 2, re: 3 }, 0.40: { ac: 3, re: 4 }, 0.65: { ac: 5, re: 6 }, 1.0: { ac: 7, re: 8 }, 1.5: { ac: 10, re: 11 }, 2.5: { ac: 14, re: 15 }, 4.0: { ac: 21, re: 22 } },
  'N': { 0.065: { ac: 0, re: 1 }, 0.10: { ac: 1, re: 2 }, 0.15: { ac: 2, re: 3 }, 0.25: { ac: 3, re: 4 }, 0.40: { ac: 5, re: 6 }, 0.65: { ac: 7, re: 8 }, 1.0: { ac: 10, re: 11 }, 1.5: { ac: 14, re: 15 }, 2.5: { ac: 21, re: 22 } },
  'P': { 0.065: { ac: 1, re: 2 }, 0.10: { ac: 2, re: 3 }, 0.15: { ac: 3, re: 4 }, 0.25: { ac: 5, re: 6 }, 0.40: { ac: 7, re: 8 }, 0.65: { ac: 10, re: 11 }, 1.0: { ac: 14, re: 15 }, 1.5: { ac: 21, re: 22 } },
  'Q': { 0.065: { ac: 2, re: 3 }, 0.10: { ac: 3, re: 4 }, 0.15: { ac: 5, re: 6 }, 0.25: { ac: 7, re: 8 }, 0.40: { ac: 10, re: 11 }, 0.65: { ac: 14, re: 15 }, 1.0: { ac: 21, re: 22 } },
  'R': { 0.065: { ac: 3, re: 4 }, 0.10: { ac: 5, re: 6 }, 0.15: { ac: 7, re: 8 }, 0.25: { ac: 10, re: 11 }, 0.40: { ac: 14, re: 15 }, 0.65: { ac: 21, re: 22 } },
};

const AQL_VALUES: AqlValue[] = [0.065, 0.10, 0.15, 0.25, 0.40, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5];

const GENERAL_LEVELS: InspectionLevel[] = ['I', 'II', 'III'];
const SPECIAL_LEVELS: InspectionLevel[] = ['S-1', 'S-2', 'S-3', 'S-4'];

interface CalculationResult {
  lotSize: number;
  inspectionLevel: InspectionLevel;
  codeLetter: CodeLetter;
  sampleSize: number;
  lotRange: { min: number; max: number };
  aqlResults: {
    aql: AqlValue;
    accept: number;
    reject: number;
    available: boolean;
  }[];
}

function findLotRange(lotSize: number): LotRange | null {
  return LOT_RANGES.find(r => lotSize >= r.min && lotSize <= r.max) || null;
}

function getAcceptReject(code: CodeLetter, aql: AqlValue): { ac: number; re: number } | null {
  const plan = NORMAL_PLANS[code]?.[aql];
  if (!plan || plan === 'use_next' || plan === 'use_prev') return null;
  return plan;
}

function calculate(lotSize: number, level: InspectionLevel): CalculationResult | null {
  const range = findLotRange(lotSize);
  if (!range) return null;

  const code = range.codes[level];
  const sampleSize = CODE_TO_SAMPLE_SIZE[code];

  const aqlResults = AQL_VALUES.map(aql => {
    const ar = getAcceptReject(code, aql);
    return {
      aql,
      accept: ar?.ac ?? -1,
      reject: ar?.re ?? -1,
      available: ar !== null,
    };
  });

  return {
    lotSize,
    inspectionLevel: level,
    codeLetter: code,
    sampleSize,
    lotRange: { min: range.min, max: range.max },
    aqlResults,
  };
}

export default function AQLSamplingReference() {
  const [lotSizeInput, setLotSizeInput] = useState('');
  const [inspectionLevel, setInspectionLevel] = useState<InspectionLevel>('II');
  const [selectedAql, setSelectedAql] = useState<string>('2.5');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [defectsFound, setDefectsFound] = useState('');

  const handleCalculate = () => {
    const lotSize = parseInt(lotSizeInput);
    if (isNaN(lotSize) || lotSize < 2) return;
    setResult(calculate(lotSize, inspectionLevel));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCalculate();
  };

  const selectedAqlResult = useMemo(() => {
    if (!result) return null;
    const aqlNum = parseFloat(selectedAql) as AqlValue;
    return result.aqlResults.find(r => r.aql === aqlNum) || null;
  }, [result, selectedAql]);

  const verdict = useMemo(() => {
    if (!selectedAqlResult || !selectedAqlResult.available || defectsFound === '') return null;
    const defects = parseInt(defectsFound);
    if (isNaN(defects) || defects < 0) return null;
    if (defects <= selectedAqlResult.accept) return 'ACCEPT';
    if (defects >= selectedAqlResult.reject) return 'REJECT';
    return null;
  }, [selectedAqlResult, defectsFound]);

  const quickReference = useMemo(() => {
    return LOT_RANGES.map(range => {
      const code = range.codes[inspectionLevel];
      const sampleSize = CODE_TO_SAMPLE_SIZE[code];
      const aqlNum = parseFloat(selectedAql) as AqlValue;
      const ar = getAcceptReject(code, aqlNum);
      return {
        range: range.max === Infinity ? `${range.min.toLocaleString()}+` : `${range.min.toLocaleString()} - ${range.max.toLocaleString()}`,
        code,
        sampleSize,
        accept: ar?.ac ?? null,
        reject: ar?.re ?? null,
        isHighlighted: result ? (result.lotSize >= range.min && result.lotSize <= range.max) : false,
      };
    });
  }, [inspectionLevel, selectedAql, result]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            <CardTitle>AQL Sample Size Calculator</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>Based on ANSI/ASQ Z1.4 (MIL-STD-105E). Enter your batch size to determine how many samples to inspect and how many defects are acceptable.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>
            Calculate required sample sizes and accept/reject criteria per ANSI/ASQ Z1.4
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted/50 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Batch / Lot Size</label>
                <Input
                  type="number"
                  placeholder="e.g., 200"
                  value={lotSizeInput}
                  onChange={(e) => setLotSizeInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  min="2"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Inspection Level</label>
                <Select value={inspectionLevel} onValueChange={(v) => setInspectionLevel(v as InspectionLevel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="II">Level II (Standard)</SelectItem>
                    <SelectItem value="I">Level I (Reduced)</SelectItem>
                    <SelectItem value="III">Level III (Tightened)</SelectItem>
                    <SelectItem value="S-1">S-1 (Special - Destructive)</SelectItem>
                    <SelectItem value="S-2">S-2 (Special)</SelectItem>
                    <SelectItem value="S-3">S-3 (Special)</SelectItem>
                    <SelectItem value="S-4">S-4 (Special)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">AQL Level</label>
                <Select value={selectedAql} onValueChange={setSelectedAql}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.065">0.065 (Critical)</SelectItem>
                    <SelectItem value="0.1">0.10 (Critical)</SelectItem>
                    <SelectItem value="0.15">0.15</SelectItem>
                    <SelectItem value="0.25">0.25</SelectItem>
                    <SelectItem value="0.4">0.40</SelectItem>
                    <SelectItem value="0.65">0.65</SelectItem>
                    <SelectItem value="1">1.0 (Major)</SelectItem>
                    <SelectItem value="1.5">1.5 (Major)</SelectItem>
                    <SelectItem value="2.5">2.5 (Major - Standard)</SelectItem>
                    <SelectItem value="4">4.0 (Minor)</SelectItem>
                    <SelectItem value="6.5">6.5 (Minor)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleCalculate} disabled={!lotSizeInput || parseInt(lotSizeInput) < 2} className="w-full md:w-auto">
              <Calculator className="h-4 w-4 mr-2" />
              Calculate Sample Size
            </Button>

            {result && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground mb-1">Sample Size</div>
                    <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{result.sampleSize}</div>
                    <div className="text-xs text-muted-foreground mt-1">Code Letter: {result.codeLetter}</div>
                  </div>

                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground mb-1">Accept if defects ≤</div>
                    <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                      {selectedAqlResult?.available ? selectedAqlResult.accept : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">AQL {selectedAql}</div>
                  </div>

                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground mb-1">Reject if defects ≥</div>
                    <div className="text-3xl font-bold text-red-700 dark:text-red-400">
                      {selectedAqlResult?.available ? selectedAqlResult.reject : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">AQL {selectedAql}</div>
                  </div>
                </div>

                {selectedAqlResult?.available && (
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-4 w-4 text-purple-600" />
                      <span className="font-medium text-sm">Quick Verdict: Enter defects found</span>
                    </div>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1 max-w-xs">
                        <Input
                          type="number"
                          placeholder="Number of defects found"
                          value={defectsFound}
                          onChange={(e) => setDefectsFound(e.target.value)}
                          min="0"
                        />
                      </div>
                      {verdict && (
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-md font-semibold ${
                          verdict === 'ACCEPT'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {verdict === 'ACCEPT' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                          {verdict} BATCH
                        </div>
                      )}
                    </div>
                    {verdict === 'ACCEPT' && (
                      <p className="text-sm text-green-700 dark:text-green-400 mt-2">
                        {defectsFound} defect(s) found is within the acceptance limit of {selectedAqlResult.accept}. Batch passes inspection.
                      </p>
                    )}
                    {verdict === 'REJECT' && (
                      <p className="text-sm text-red-700 dark:text-red-400 mt-2">
                        {defectsFound} defect(s) found meets or exceeds the rejection threshold of {selectedAqlResult.reject}. Batch fails inspection.
                      </p>
                    )}
                  </div>
                )}

                {!selectedAqlResult?.available && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-700 dark:text-amber-400">
                      AQL {selectedAql} is not available for code letter {result.codeLetter} (sample size {result.sampleSize}).
                      Try a different AQL level or inspection level.
                    </span>
                  </div>
                )}

                <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-md">
                  <strong>Summary:</strong> For a batch of <strong>{result.lotSize.toLocaleString()}</strong> units
                  (range: {result.lotRange.min.toLocaleString()} - {result.lotRange.max === Infinity ? '∞' : result.lotRange.max.toLocaleString()})
                  at Inspection Level <strong>{result.inspectionLevel}</strong>,
                  randomly select <strong>{result.sampleSize}</strong> samples for testing.
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            <CardTitle>Complete Sampling Reference Table</CardTitle>
          </div>
          <CardDescription>
            ANSI/ASQ Z1.4 — Normal Inspection, Level {inspectionLevel}, AQL {selectedAql}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot Size Range</TableHead>
                  <TableHead className="text-center">Code</TableHead>
                  <TableHead className="text-center">Sample Size</TableHead>
                  <TableHead className="text-center">Accept (Ac)</TableHead>
                  <TableHead className="text-center">Reject (Re)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quickReference.map((row, i) => (
                  <TableRow key={i} className={row.isHighlighted ? 'bg-blue-50 dark:bg-blue-900/20 font-medium' : ''}>
                    <TableCell>{row.range}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{row.code}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-base px-3 py-0.5">{row.sampleSize}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {row.accept !== null ? (
                        <span className="text-green-700 dark:text-green-400 font-medium">≤ {row.accept}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.reject !== null ? (
                        <span className="text-red-700 dark:text-red-400 font-medium">≥ {row.reject}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            <CardTitle>AQL Quick Guide</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <h4 className="font-semibold">Critical Defects</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">Safety hazards, regulatory violations</p>
              <Badge variant="destructive">AQL 0.0 — 0.065</Badge>
              <p className="text-xs text-muted-foreground mt-2">Zero tolerance. Any defect = reject the batch.</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h4 className="font-semibold">Major Defects</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">Functional problems, performance failures</p>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">AQL 1.0 — 2.5</Badge>
              <p className="text-xs text-muted-foreground mt-2">Limited tolerance. A few defects may be acceptable depending on sample size.</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-blue-600" />
                <h4 className="font-semibold">Minor Defects</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">Cosmetic issues, slight blemishes</p>
              <Badge className="bg-blue-100 text-blue-800 border-blue-200">AQL 4.0 — 6.5</Badge>
              <p className="text-xs text-muted-foreground mt-2">Higher tolerance for non-functional issues.</p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <h4 className="font-semibold mb-2">Inspection Level Guide</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <strong>Level I (Reduced):</strong> Fewer samples. Use when quality is consistently good over 10+ consecutive batches.
              </div>
              <div>
                <strong>Level II (Standard):</strong> Default for most inspections. Use this unless you have a specific reason not to.
              </div>
              <div>
                <strong>Level III (Tightened):</strong> More samples. Use after 2 out of 5 batches fail, or for new suppliers.
              </div>
              <div>
                <strong>Special (S-1 to S-4):</strong> Smallest sample sizes. Use for destructive testing or when testing is expensive/time-consuming.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
