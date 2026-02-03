import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, FileSignature, Shield, AlertCircle, Loader2, Pen, Type, Trash2 } from 'lucide-react';

interface SignatureAuthorizationStepProps {
  sessionId: string;
  employeeName?: string;
  isCompleted?: boolean;
  onComplete?: () => void;
}

interface SignatureAuthData {
  signatureAuthCompleted: boolean;
  signatureAuthData?: {
    signedName?: string;
    signatureImage?: string;
    acknowledged: boolean;
    signedAt: string;
  };
}

type SignatureMode = 'draw' | 'type';

export default function SignatureAuthorizationStep({
  sessionId,
  employeeName = '',
  isCompleted = false,
  onComplete,
}: SignatureAuthorizationStepProps) {
  const { toast } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
  const [signedName, setSignedName] = useState('');
  
  const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const [signatureMode, setSignatureMode] = useState<SignatureMode>(isTouchDevice ? 'draw' : 'type');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  const { data: authStatus, isLoading: isLoadingStatus } = useQuery<SignatureAuthData>({
    queryKey: ['/api/onboarding/sessions', sessionId, 'signature-auth'],
    enabled: !!sessionId,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        acknowledged: true,
        signedAt: new Date().toISOString(),
      };

      if (signatureMode === 'type') {
        payload.signedName = signedName.trim();
      } else {
        const canvas = canvasRef.current;
        if (canvas) {
          payload.signatureImage = canvas.toDataURL('image/png');
        }
      }

      return apiRequest(`/api/onboarding/sessions/${sessionId}/signature-auth`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId, 'signature-auth'] });
      toast({
        title: 'Authorization Complete',
        description: 'Your electronic signature authorization has been saved.',
      });
      onComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save authorization',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const isAlreadyCompleted = isCompleted || authStatus?.signatureAuthCompleted;
  
  const canSign = acknowledged && (
    (signatureMode === 'type' && signedName.trim().length > 2) ||
    (signatureMode === 'draw' && hasDrawnSignature)
  );

  const handleSign = async () => {
    if (!canSign) return;
    signMutation.mutate();
  };

  const hasCalledComplete = useRef(false);
  
  useEffect(() => {
    if (authStatus?.signatureAuthCompleted && !isCompleted && !hasCalledComplete.current) {
      hasCalledComplete.current = true;
      onComplete?.();
    }
  }, [authStatus?.signatureAuthCompleted, isCompleted, onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && signatureMode === 'draw') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [signatureMode]);

  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [getCanvasCoordinates]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getCanvasCoordinates]);

  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setHasDrawnSignature(true);
    }
  }, [isDrawing]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    setHasDrawnSignature(false);
  }, []);

  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isAlreadyCompleted) {
    const savedName = authStatus?.signatureAuthData?.signedName || employeeName || 'Employee';
    const hasImage = !!authStatus?.signatureAuthData?.signatureImage;
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Electronic Signature Authorized</p>
              <p className="text-sm text-green-600">
                {hasImage ? 'Signature captured' : savedName} has authorized electronic signatures for this session.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <CardTitle>Electronic Signature Authorization</CardTitle>
          </div>
          <CardDescription>
            Before signing any documents, please authorize the use of electronic signatures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg border text-sm space-y-3">
            <p className="font-medium">By signing below, I acknowledge and agree that:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>I consent to use electronic signatures for all onboarding documents</li>
              <li>My electronic signature is legally binding and equivalent to a handwritten signature</li>
              <li>I understand that all signed documents will be stored securely</li>
              <li>I may request paper copies of any documents I sign electronically</li>
            </ul>
          </div>

          <div className="flex items-start gap-3 p-4 border rounded-lg">
            <Checkbox
              id="acknowledge"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              className="mt-0.5 h-5 w-5"
            />
            <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
              I have read and understand the electronic signature authorization terms above,
              and I consent to use electronic signatures for this onboarding session.
            </Label>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Your Signature</Label>
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSignatureMode('draw')}
                  className={`px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    signatureMode === 'draw' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Pen className="h-4 w-4" />
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureMode('type')}
                  className={`px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    signatureMode === 'type' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Type className="h-4 w-4" />
                  Type
                </button>
              </div>
            </div>

            {signatureMode === 'draw' ? (
              <div className="space-y-2">
                <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={180}
                    className="w-full touch-none"
                    style={{ height: '180px' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!hasDrawnSignature && (
                    <p className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
                      Sign here with finger or stylus
                    </p>
                  )}
                </div>
                {hasDrawnSignature && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearCanvas}
                    className="text-gray-500"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear Signature
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  id="signedName"
                  placeholder="Type your full legal name"
                  value={signedName}
                  onChange={(e) => setSignedName(e.target.value)}
                  className="max-w-md h-14 text-lg"
                />
                {signedName && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <FileSignature className="h-3 w-3" />
                    Your signature: <span className="italic font-medium">{signedName}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {!acknowledged && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              Please acknowledge the terms above to continue
            </div>
          )}

          <Button
            onClick={handleSign}
            disabled={!canSign || signMutation.isPending}
            size="lg"
            className="w-full max-w-md h-14"
          >
            {signMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Signing...
              </>
            ) : (
              'Sign Authorization'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
