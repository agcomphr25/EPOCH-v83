import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, FileCheck2, LockKeyhole, Scale, ShieldCheck } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const QUESTIONS = [
  ['cuiCdi', 'Will the supplier receive or create CUI/CDI?'],
  ['operationallyCriticalSupport', 'Is operationally critical support involved?'],
  ['governmentProperty', 'Will Government property be furnished or accountable?'],
  ['dpasRated', 'Is this a DPAS-rated order?'],
  ['specialtyMetals', 'Could the purchased articles contain specialty metals?'],
  ['electronicParts', 'Are electronic parts or assemblies being purchased?'],
  ['exportControlled', 'Are export-controlled items, data, or services involved?'],
  ['importedItems', 'Will the supplier import items for this purchase?'],
  ['dutyFreeEntry', 'Will duty-free entry be claimed?'],
  ['oceanTransportation', 'Will supplies be transported by sea?'],
  ['technicalDataSoftware', 'Will technical data or software be created or delivered?'],
  ['hazardousOrExplosive', 'Are hazardous materials, ammunition, or explosives involved?'],
] as const;

type Decision = { decision: 'INCLUDE' | 'EXCLUDE'; decisionReason: string };

export default function VendorFlowdownReview({ vendorPoId }: { vendorPoId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [assessment, setAssessment] = useState<any>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const workspace = useQuery<any>({
    queryKey: ['/api/far-flowdown-clauses/po', vendorPoId, 'workspace'],
    queryFn: () => apiRequest(`/api/far-flowdown-clauses/po/${vendorPoId}/workspace`),
  });

  useEffect(() => {
    if (!workspace.data) return;
    setAssessment({ ...workspace.data.assessment, answers: workspace.data.assessment.answers || {} });
    const loaded: Record<number, Decision> = {};
    workspace.data.clauses.forEach((clause: any) => {
      if (clause.savedDecision === 'INCLUDE' || clause.savedDecision === 'EXCLUDE') loaded[clause.id] = { decision: clause.savedDecision, decisionReason: clause.decisionReason || '' };
    });
    setDecisions(loaded);
  }, [workspace.data]);

  const clauses = workspace.data?.clauses || [];
  const included = Object.values(decisions).filter((row) => row.decision === 'INCLUDE').length;
  const unresolved = clauses.length - Object.keys(decisions).length;
  const unknownAnswers = QUESTIONS.filter(([key]) => assessment?.answers?.[key] == null).length;
  const status = assessment?.reviewStatus || 'DRAFT';

  const payload = (reviewStatus: string) => ({
    assessment: { ...assessment, discloseContractReference: false, reviewStatus },
    decisions: clauses.filter((clause: any) => decisions[clause.id]).map((clause: any) => ({
      clauseId: clause.id,
      decision: decisions[clause.id].decision,
      decisionReason: decisions[clause.id].decisionReason,
      recommendation: clause.recommendation,
      triggerReason: clause.triggerReason,
      inclusionMethod: clause.incorporationMethod,
    })),
  });
  const save = useMutation({
    mutationFn: (reviewStatus: string) => apiRequest(`/api/far-flowdown-clauses/po/${vendorPoId}/workspace`, { method: 'PUT', body: payload(reviewStatus) }),
    onSuccess: (_data, reviewStatus) => {
      queryClient.invalidateQueries({ queryKey: ['/api/far-flowdown-clauses/po', vendorPoId, 'workspace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'issue-readiness'] });
      toast({ title: reviewStatus === 'APPROVED' ? 'Flowdown exhibit approved' : 'Flowdown review saved' });
      if (reviewStatus === 'APPROVED') setOpen(false);
    },
    onError: (error: any) => toast({ title: 'Unable to save flowdown review', description: error.message, variant: 'destructive' }),
  });
  const acceptRecommendations = () => {
    const next: Record<number, Decision> = {};
    clauses.forEach((clause: any) => {
      if (clause.recommendation === 'INCLUDE' || clause.recommendation === 'EXCLUDE') next[clause.id] = { decision: clause.recommendation, decisionReason: clause.triggerReason };
    });
    setDecisions(next);
  };
  const canApprove = assessment?.governmentSupported
    ? assessment.procurementClass !== 'UNKNOWN' && assessment.internalContractReference?.trim() && assessment.sourceDocumentReference?.trim() && assessment.reviewNotes?.trim() && unresolved === 0 && Object.values(decisions).every((row) => row.decisionReason.trim())
    : assessment?.reviewNotes?.trim() && unresolved === 0;

  const statusStyle = status === 'APPROVED' ? 'bg-green-100 text-green-800' : status === 'BLOCKED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Government Flowdown Applicability</CardTitle>
            <CardDescription>Classify this purchase, review clause recommendations, and generate a tailored supplier exhibit.</CardDescription>
          </div>
          <Badge className={statusStyle}>{status.replaceAll('_', ' ')}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Approved inclusions</p><p className="text-xl font-semibold">{included}</p></div>
            <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Unresolved clauses</p><p className="text-xl font-semibold">{unresolved}</p></div>
            <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Unknown answers</p><p className="text-xl font-semibold">{unknownAnswers}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setOpen(true)}><ShieldCheck className="mr-2 h-4 w-4" /> {status === 'APPROVED' ? 'Review / Revise' : 'Start Guided Review'}</Button>
            {status === 'APPROVED' && <Button variant="outline" onClick={() => window.open(`/api/far-flowdown-clauses/po/${vendorPoId}/exhibit.pdf`, '_blank', 'noopener,noreferrer')}><FileCheck2 className="mr-2 h-4 w-4" /> View Exhibit R{assessment?.exhibitRevision}</Button>}
          </div>
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><span>The customer contract reference is retained internally and is not printed on the supplier exhibit.</span></div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>Guided Government Flowdown Review</DialogTitle></DialogHeader>
          {!assessment ? <p>Loading review…</p> : <Tabs defaultValue="source" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="source">1. Source & Classification</TabsTrigger><TabsTrigger value="questions">2. Purchase Questions</TabsTrigger><TabsTrigger value="clauses">3. Clause Decisions</TabsTrigger></TabsList>
            <TabsContent value="source" className="space-y-4">
              <div><Label>Does this purchase support a U.S. Government contract?</Label><Select value={assessment.governmentSupported ? 'yes' : 'no'} onValueChange={(value) => setAssessment({ ...assessment, governmentSupported: value === 'yes' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>
              {assessment.governmentSupported && <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Internal customer contract reference *</Label><Input value={assessment.internalContractReference || ''} onChange={(e) => setAssessment({ ...assessment, internalContractReference: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Internal traceability only; omitted from supplier documents.</p></div>
                <div><Label>Customer flowdown source *</Label><Input value={assessment.sourceDocumentReference || ''} onChange={(e) => setAssessment({ ...assessment, sourceDocumentReference: e.target.value })} placeholder="Document name, revision, or attachment" /></div>
                <div className="md:col-span-2"><Label>Procurement classification *</Label><Select value={assessment.procurementClass} onValueChange={(value) => setAssessment({ ...assessment, procurementClass: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['UNKNOWN','COTS','COMMERCIAL_PRODUCT','COMMERCIAL_SERVICE','NONCOMMERCIAL_SUPPLY','SERVICE','CONSTRUCTION','MIXED'].map((value) => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
              </div>}
            </TabsContent>
            <TabsContent value="questions" className="space-y-2">
              {QUESTIONS.map(([key, label]) => <div key={key} className="grid items-center gap-3 rounded-md border p-3 md:grid-cols-[1fr_180px]"><Label>{label}</Label><Select value={assessment.answers?.[key] == null ? 'unknown' : assessment.answers[key] ? 'yes' : 'no'} onValueChange={(value) => setAssessment({ ...assessment, answers: { ...assessment.answers, [key]: value === 'unknown' ? null : value === 'yes' } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Unknown</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>)}
              <div className="flex justify-end pt-2"><Button variant="outline" onClick={() => save.mutate('DRAFT')} disabled={save.isPending}>Save Answers & Refresh Recommendations</Button></div>
            </TabsContent>
            <TabsContent value="clauses" className="space-y-3">
              <div className="flex items-center justify-between gap-3"><div><p className="font-medium">Review every recommendation</p><p className="text-sm text-muted-foreground">Automated recommendations are advisory. Every final decision and reason is retained.</p></div><Button variant="outline" onClick={acceptRecommendations}>Accept clear recommendations</Button></div>
              {clauses.map((clause: any) => {
                const decision = decisions[clause.id];
                return <div key={clause.id} className="space-y-3 rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-sm font-semibold">{clause.clauseNumber}</p><p className="font-medium">{clause.title}</p><p className="mt-1 text-sm text-muted-foreground">{clause.triggerReason}</p></div><div className="flex gap-2"><Badge variant="outline">Recommended: {clause.recommendation}</Badge>{clause.legalReviewRequired && <Badge className="bg-amber-100 text-amber-800"><AlertTriangle className="mr-1 h-3 w-3" /> Specialist review</Badge>}</div></div>
                  <div className="grid gap-3 md:grid-cols-[180px_1fr]"><Select value={decision?.decision || ''} onValueChange={(value: 'INCLUDE' | 'EXCLUDE') => setDecisions({ ...decisions, [clause.id]: { decision: value, decisionReason: decision?.decisionReason || clause.triggerReason } })}><SelectTrigger><SelectValue placeholder="Final decision" /></SelectTrigger><SelectContent><SelectItem value="INCLUDE">Include</SelectItem><SelectItem value="EXCLUDE">Exclude</SelectItem></SelectContent></Select><Input value={decision?.decisionReason || ''} onChange={(e) => decision && setDecisions({ ...decisions, [clause.id]: { ...decision, decisionReason: e.target.value } })} placeholder="Required decision reason" disabled={!decision} /></div>
                  {clause.officialUrl && <a href={clause.officialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs text-primary hover:underline">Official source <ExternalLink className="ml-1 h-3 w-3" /></a>}
                </div>;
              })}
            </TabsContent>
          </Tabs>}
          {assessment && <div className="space-y-2 border-t pt-4"><Label>Reviewer notes *</Label><Textarea value={assessment.reviewNotes || ''} onChange={(e) => setAssessment({ ...assessment, reviewNotes: e.target.value })} placeholder="Summarize the source, assumptions, exceptions, and specialist reviews" /></div>}
          <DialogFooter><Button variant="outline" onClick={() => save.mutate('DRAFT')} disabled={save.isPending}>Save Draft</Button><Button onClick={() => save.mutate('APPROVED')} disabled={!canApprove || save.isPending}><CheckCircle2 className="mr-2 h-4 w-4" /> Approve & Generate Exhibit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
