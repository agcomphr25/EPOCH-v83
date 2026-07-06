import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, PenTool, FileText, Clock, Check, Loader2, User, Calendar, Pen, Type, X, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';

interface PendingDocument {
  instanceId: string;
  recipientName: string;
  employeeSignedAt: string;
  employerSignatureRequired: boolean;
  employerSignedAt: string | null;
  templateName: string;
  sessionId: string | null;
  sessionStatus: string | null;
  employeeName: string | null;
}

interface AuthorizationCheck {
  isAuthorized: boolean;
  displayName: string;
  userId: number;
}

type SignatureMode = 'draw' | 'type';

export default function EmployerSignaturesPage() {
  const { toast } = useToast();
  const [signingDoc, setSigningDoc] = useState<PendingDocument | null>(null);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [agreedToSign, setAgreedToSign] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasData, setCanvasData] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: authCheck } = useQuery<AuthorizationCheck>({
    queryKey: ['/api/onboarding/settings/employer-signers/check-authorization'],
  });

  const { data: pendingDocs = [], isLoading } = useQuery<PendingDocument[]>({
    queryKey: ['/api/onboarding/pending-employer-signatures'],
    enabled: authCheck?.isAuthorized,
  });

  const signMutation = useMutation({
    mutationFn: async ({ sessionId, docId, signatureData, signerName }: { 
      sessionId: string; 
      docId: string; 
      signatureData: string; 
      signerName: string 
    }) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/documents/${docId}/employer-sign`, {
        method: 'POST',
        body: JSON.stringify({ signatureData, signerName }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/pending-employer-signatures'] });
      toast({ title: 'Document signed successfully' });
      closeSigningDialog();
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to sign document', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const closeSigningDialog = () => {
    setSigningDoc(null);
    setTypedSignature('');
    setAgreedToSign(false);
    setCanvasData(null);
    clearCanvas();
  };

  const getSignatureData = (): string | null => {
    if (signatureMode === 'type') {
      return typedSignature.trim() ? `typed:${typedSignature}` : null;
    }
    return canvasData;
  };

  const canSign = () => {
    if (!agreedToSign) return false;
    if (signatureMode === 'type') {
      return typedSignature.trim().length > 0;
    }
    return !!canvasData;
  };

  const handleSign = () => {
    if (!signingDoc || !signingDoc.sessionId) return;
    const signatureData = getSignatureData();
    if (!signatureData) return;

    signMutation.mutate({
      sessionId: signingDoc.sessionId,
      docId: signingDoc.instanceId,
      signatureData,
      signerName: authCheck?.displayName || 'Employer',
    });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    setCanvasData(null);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1a365d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setCanvasData(canvasRef.current.toDataURL());
    }
    setIsDrawing(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && signingDoc) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [signingDoc]);

  if (!authCheck?.isAuthorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Not Authorized</h3>
            <p className="text-muted-foreground">
              You are not authorized to sign documents as an employer representative.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Contact an administrator to be added as an authorized signer.
            </p>
            <Link href="/onboarding">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Onboarding
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/onboarding">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PenTool className="h-6 w-6" />
            Employer Signatures
          </h1>
          <p className="text-muted-foreground">
            Documents awaiting your signature as {authCheck.displayName}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents Requiring Signature
          </CardTitle>
          <CardDescription>
            These documents have been signed by employees and require your employer signature.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-2" />
              Loading...
            </div>
          ) : pendingDocs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="font-medium">All caught up!</p>
              <p className="text-sm mt-2">No documents are awaiting your signature.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Employee Signed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingDocs.map((doc) => (
                  <TableRow key={doc.instanceId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{doc.templateName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {doc.employeeName || doc.recipientName || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(doc.employeeSignedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => setSigningDoc(doc)}
                        disabled={!doc.sessionId}
                      >
                        <PenTool className="h-4 w-4 mr-2" />
                        Sign
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!signingDoc} onOpenChange={(open) => !open && closeSigningDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Sign Document as Employer
            </DialogTitle>
            <DialogDescription>
              Sign "{signingDoc?.templateName}" for {signingDoc?.employeeName || signingDoc?.recipientName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex gap-2 mb-4">
              <Button
                variant={signatureMode === 'draw' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSignatureMode('draw')}
              >
                <Pen className="h-4 w-4 mr-1" />
                Draw
              </Button>
              <Button
                variant={signatureMode === 'type' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSignatureMode('type')}
              >
                <Type className="h-4 w-4 mr-1" />
                Type
              </Button>
            </div>

            {signatureMode === 'draw' ? (
              <div className="space-y-2">
                <Label>Draw your signature</Label>
                <div className="relative border-2 border-dashed rounded-lg bg-white">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    className="cursor-crosshair touch-none w-full"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={clearCanvas}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {!canvasData && (
                  <p className="text-sm text-muted-foreground">
                    Draw your signature in the box above
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Type your name</Label>
                <Input
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Type your full name"
                  className="h-12 text-xl italic font-serif"
                />
              </div>
            )}

            <div className="flex items-center gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Date</Label>
                <p className="font-medium">
                  {new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Signing as</Label>
                <p className="font-medium">{authCheck?.displayName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t">
              <Checkbox
                id="agree"
                checked={agreedToSign}
                onCheckedChange={(checked) => setAgreedToSign(checked === true)}
              />
              <Label htmlFor="agree" className="text-sm">
                I am authorized to sign this document on behalf of the employer and confirm the information is accurate.
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeSigningDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSign}
              disabled={!canSign() || signMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {signMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Sign Document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
