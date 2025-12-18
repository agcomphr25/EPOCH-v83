import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import SignatureWorkflow from '@/components/SignatureWorkflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileSignature, Loader2 } from 'lucide-react';

interface SessionUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  employeeId: number;
}

export default function SignatureWorkflowPage() {
  const [, setLocation] = useLocation();

  const { data: session, isLoading } = useQuery<SessionUser>({
    queryKey: ['/api/auth/session'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4" data-testid="signature-workflow-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="h-6 w-6" />
          Digital Signature Routing
        </h1>
        <p className="text-muted-foreground mt-1">
          Create and manage signature requests for documents
        </p>
      </div>

      <SignatureWorkflow
        employeeId={session.employeeId || session.id}
        employeeName={`${session.firstName} ${session.lastName}`}
      />
    </div>
  );
}
