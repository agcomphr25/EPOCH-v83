import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import SignatureSigningInterface from './SignatureSigningInterface';
import {
  FileSignature,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { format, isBefore } from 'date-fns';

interface DocumentSignatureTask {
  id: string;
  type: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  requestId: string;
  signOrder: number;
  initiatedBy: string;
  createdAt: string;
  status: string;
}

interface DocumentSignatureTasksProps {
  employeeId: number;
  employeeName: string;
  compact?: boolean;
}

export default function DocumentSignatureTasks({
  employeeId,
  employeeName,
  compact = false,
}: DocumentSignatureTasksProps) {
  const queryClient = useQueryClient();
  const [signingTask, setSigningTask] = useState<DocumentSignatureTask | null>(null);

  const { data: tasks = [], isLoading, refetch } = useQuery<DocumentSignatureTask[]>({
    queryKey: ['/api/signature-workflow/pending', employeeId],
    queryFn: () => apiRequest(`/api/signature-workflow/pending/${employeeId}`),
    enabled: !!employeeId,
  });

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return isBefore(new Date(dueDate), new Date());
  };

  if (compact) {
    return (
      <>
        <Card data-testid="signature-tasks-compact">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Document Signatures
              {tasks.length > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {tasks.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No documents awaiting your signature
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50 ${
                      isOverdue(task.dueDate) ? 'border-red-300 bg-red-50' : ''
                    }`}
                    onClick={() => setSigningTask(task)}
                    data-testid={`signature-task-compact-${task.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        From: {task.initiatedBy}
                      </p>
                    </div>
                    {isOverdue(task.dueDate) && (
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
                {tasks.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{tasks.length - 3} more signatures pending
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {signingTask && (
          <SignatureSigningInterface
            open={!!signingTask}
            onClose={() => setSigningTask(null)}
            requestId={signingTask.requestId}
            signerId={signingTask.id}
            employeeId={employeeId}
            employeeName={employeeName}
            documentTitle={signingTask.title}
            onSuccess={() => {
              setSigningTask(null);
              queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow/pending', employeeId] });
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Card data-testid="pending-signature-tasks">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Documents Awaiting Your Signature
            {tasks.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {tasks.length}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No documents awaiting your signature</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                      isOverdue(task.dueDate) ? 'border-red-300 bg-red-50' : ''
                    }`}
                    onClick={() => setSigningTask(task)}
                    data-testid={`signature-task-${task.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-blue-100">
                        <FileSignature className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>From: {task.initiatedBy}</span>
                          <span>Signer #{task.signOrder}</span>
                          {task.dueDate && (
                            <span className={isOverdue(task.dueDate) ? 'text-red-500 font-medium' : ''}>
                              <Clock className="h-3 w-3 inline mr-1" />
                              Due: {format(new Date(task.dueDate), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverdue(task.dueDate) && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Overdue
                        </Badge>
                      )}
                      <Button size="sm" data-testid={`sign-btn-${task.id}`}>
                        Sign Now
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {signingTask && (
        <SignatureSigningInterface
          open={!!signingTask}
          onClose={() => setSigningTask(null)}
          requestId={signingTask.requestId}
          signerId={signingTask.id}
          employeeId={employeeId}
          employeeName={employeeName}
          documentTitle={signingTask.title}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/signature-workflow/pending', employeeId] });
          }}
        />
      )}
    </>
  );
}
