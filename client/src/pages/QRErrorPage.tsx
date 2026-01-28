import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, QrCode, Clock, Ban, HelpCircle, Home } from 'lucide-react';

const ERROR_MESSAGES: Record<string, { title: string; description: string; icon: typeof AlertTriangle }> = {
  invalid_format: {
    title: 'Invalid QR Code',
    description: 'The QR code format is not recognized. Please scan a valid EPOCH QR code.',
    icon: AlertTriangle,
  },
  not_found: {
    title: 'QR Code Not Found',
    description: 'This QR code does not exist in our system. It may have been deleted.',
    icon: HelpCircle,
  },
  disabled: {
    title: 'QR Code Disabled',
    description: 'This QR code has been disabled and is no longer active.',
    icon: Ban,
  },
  expired: {
    title: 'QR Code Expired',
    description: 'This QR code has expired and is no longer valid.',
    icon: Clock,
  },
  environment_mismatch: {
    title: 'Environment Mismatch',
    description: 'This QR code was created for a different environment (dev/prod). Please use the correct environment.',
    icon: AlertTriangle,
  },
  server_error: {
    title: 'Server Error',
    description: 'An error occurred while processing this QR code. Please try again later.',
    icon: AlertTriangle,
  },
};

export default function QRErrorPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('reason') || 'server_error';
  const code = params.get('code');

  const errorInfo = ERROR_MESSAGES[reason] || ERROR_MESSAGES.server_error;
  const Icon = errorInfo.icon;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <Icon className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl">{errorInfo.title}</CardTitle>
          <CardDescription className="mt-2">
            {errorInfo.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {code && (
            <div className="bg-gray-100 rounded-lg p-3 text-center">
              <p className="text-sm text-gray-500">QR Code</p>
              <code className="text-sm font-mono">{code}</code>
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/')}
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => window.history.back()}
            >
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
