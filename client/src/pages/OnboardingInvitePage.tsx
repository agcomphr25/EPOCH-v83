import { useMemo, useState } from 'react';
import { useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import DemographicsIntakeForm from '@/components/onboarding/DemographicsIntakeForm';
import { CheckCircle2, FileText, Loader2, Mail, Phone, ShieldCheck, UserCheck } from 'lucide-react';

interface InviteDocument {
  id: string;
  documentName?: string;
  templateName?: string;
  status: string;
  signedAt?: string | null;
}

interface InviteStatus {
  sessionId: string;
  employeeName: string | null;
  pathName: string;
  sessionStatus: string;
  signatureAuthCompleted?: boolean;
  expiresAt: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  noCellPhoneAvailable: boolean;
  canAccessPaperwork: boolean;
  documents: InviteDocument[];
}

function VerificationPanel({
  channel,
  label,
  destination,
  verified,
  token,
}: {
  channel: 'email' | 'phone';
  label: string;
  destination: string | null;
  verified: boolean;
  token: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const Icon = channel === 'email' ? Mail : Phone;

  const sendCodeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/onboarding/invite/${token}/send-code`, {
      method: 'POST',
      body: { channel },
    }),
    onSuccess: (data: any) => {
      setDevCode(data.devCode || null);
      toast({ title: 'Code sent', description: `Sent to ${data.sentTo || destination}` });
    },
    onError: (error: any) => {
      toast({ title: 'Could not send code', description: error.message, variant: 'destructive' });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/onboarding/invite/${token}/verify-code`, {
      method: 'POST',
      body: { channel, code },
    }),
    onSuccess: () => {
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/invite', token] });
      toast({ title: `${label} verified` });
    },
    onError: (error: any) => {
      toast({ title: 'Verification failed', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-slate-600" />
          <div>
            <div className="font-medium">{label}</div>
            <div className="text-sm text-muted-foreground">{destination || 'Not available'}</div>
          </div>
        </div>
        {verified ? (
          <Badge className="bg-green-100 text-green-800">Verified</Badge>
        ) : (
          <Button variant="outline" onClick={() => sendCodeMutation.mutate()} disabled={!destination || sendCodeMutation.isPending}>
            {sendCodeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send Code
          </Button>
        )}
      </div>
      {!verified && (
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
          />
          <Button onClick={() => verifyCodeMutation.mutate()} disabled={code.length !== 6 || verifyCodeMutation.isPending}>
            {verifyCodeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verify
          </Button>
        </div>
      )}
      {devCode && (
        <div className="text-xs text-muted-foreground">
          Development code: <span className="font-mono">{devCode}</span>
        </div>
      )}
    </div>
  );
}

export default function OnboardingInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [signedName, setSignedName] = useState('');
  const [signatureAcknowledged, setSignatureAcknowledged] = useState(false);
  const [documentSignatureName, setDocumentSignatureName] = useState('');
  const [documentAcknowledged, setDocumentAcknowledged] = useState(false);

  const inviteQuery = useQuery<InviteStatus>({
    queryKey: ['/api/onboarding/invite', token],
    queryFn: () => apiRequest(`/api/onboarding/invite/${token}`),
    enabled: !!token,
  });

  const invite = inviteQuery.data;
  const allDocumentsSigned = useMemo(() => {
    return !!invite && invite.documents.length > 0 && invite.documents.every((doc) => doc.status === 'signed');
  }, [invite]);

  const signatureAuthMutation = useMutation({
    mutationFn: () => apiRequest(`/api/onboarding/sessions/${invite?.sessionId}/signature-auth`, {
      method: 'PATCH',
      body: {
        signedName,
        acknowledged: signatureAcknowledged,
        signedAt: new Date().toISOString(),
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/invite', token] });
      toast({ title: 'Signature authorization saved' });
    },
    onError: (error: any) => {
      toast({ title: 'Could not save authorization', description: error.message, variant: 'destructive' });
    },
  });

  const signDocumentMutation = useMutation({
    mutationFn: (docId: string) => apiRequest(`/api/onboarding/sessions/${invite?.sessionId}/documents/${docId}/sign`, {
      method: 'POST',
      body: {
        signatureData: documentSignatureName,
        initials: { typed: true },
        signedAt: new Date().toISOString(),
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/invite', token] });
      toast({ title: 'Document signed' });
    },
    onError: (error: any) => {
      toast({ title: 'Could not sign document', description: error.message, variant: 'destructive' });
    },
  });

  if (inviteQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (inviteQuery.error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>This onboarding invite may be expired, revoked, or invalid.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Employee Onboarding</Badge>
          <h1 className="text-3xl font-bold text-slate-950">{invite.employeeName || 'New Employee'}</h1>
          <p className="text-muted-foreground">{invite.pathName}</p>
        </div>

        {!invite.canAccessPaperwork && (
          <Card>
            <CardHeader>
              <CardTitle>Verify Contact Information</CardTitle>
              <CardDescription>Enter the codes sent to the employee before opening onboarding paperwork.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <VerificationPanel
                channel="email"
                label="Email"
                destination={invite.email}
                verified={invite.emailVerified}
                token={token}
              />
              {invite.noCellPhoneAvailable ? (
                <div className="border rounded-lg p-4 flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="font-medium">Cell phone verification waived by HR</div>
                    <div className="text-sm text-muted-foreground">This override is recorded in the onboarding audit trail.</div>
                  </div>
                </div>
              ) : (
                <VerificationPanel
                  channel="phone"
                  label="Cell phone"
                  destination={invite.phone}
                  verified={invite.phoneVerified}
                  token={token}
                />
              )}
            </CardContent>
          </Card>
        )}

        {invite.canAccessPaperwork && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Signature Authorization
                </CardTitle>
                <CardDescription>Typed legal name and consent are captured with timestamp and audit metadata.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {invite.signatureAuthCompleted ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    Signature authorization complete
                  </div>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="signed-name">Legal name</Label>
                      <Input id="signed-name" value={signedName} onChange={(event) => setSignedName(event.target.value)} />
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox checked={signatureAcknowledged} onCheckedChange={(checked) => setSignatureAcknowledged(checked === true)} />
                      <span>I agree that my typed name is my electronic signature for this onboarding packet.</span>
                    </label>
                    <Button
                      onClick={() => signatureAuthMutation.mutate()}
                      disabled={signedName.trim().length < 2 || !signatureAcknowledged || signatureAuthMutation.isPending}
                    >
                      {signatureAuthMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Authorization
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <DemographicsIntakeForm
              sessionId={invite.sessionId}
              isLocked={invite.sessionStatus === 'completed'}
              onComplete={() => queryClient.invalidateQueries({ queryKey: ['/api/onboarding/invite', token] })}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Required Documents
                </CardTitle>
                <CardDescription>Each required document is signed separately with a typed signature.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  {invite.documents.map((doc) => (
                    <div key={doc.id} className="border rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{doc.templateName || doc.documentName || 'Onboarding Document'}</div>
                        <div className="text-sm text-muted-foreground">{doc.status === 'signed' ? 'Signed' : 'Pending signature'}</div>
                      </div>
                      {doc.status === 'signed' ? (
                        <Badge className="bg-green-100 text-green-800">Signed</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => signDocumentMutation.mutate(doc.id)}
                          disabled={documentSignatureName.trim().length < 2 || !documentAcknowledged || signDocumentMutation.isPending}
                        >
                          {signDocumentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Sign
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {invite.documents.some((doc) => doc.status !== 'signed') && (
                  <div className="border-t pt-4 space-y-3">
                    <div>
                      <Label htmlFor="document-signature-name">Typed signature for documents</Label>
                      <Input
                        id="document-signature-name"
                        value={documentSignatureName}
                        onChange={(event) => setDocumentSignatureName(event.target.value)}
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox checked={documentAcknowledged} onCheckedChange={(checked) => setDocumentAcknowledged(checked === true)} />
                      <span>I confirm that each document I sign is complete and accurate to the best of my knowledge.</span>
                    </label>
                  </div>
                )}

                {allDocumentsSigned && (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    All required documents are signed and ready for HR approval.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
