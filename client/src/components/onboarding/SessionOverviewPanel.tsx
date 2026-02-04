import { 
  Check, Circle, Clock, SkipForward, 
  FileText, User, Edit3, ChevronRight 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SessionDocument {
  id: string;
  templateId?: string | null;
  instanceId?: string | null;
  mediaItemId?: string | null;
  isFillable?: boolean;
  templateName?: string;
  documentName?: string;
  status: string;
  signedAt?: string | null;
  orderIndex?: number;
}

interface SessionOverviewPanelProps {
  currentStep: string;
  signatureAuthStatus: 'completed' | 'pending';
  demographicsStatus: 'completed' | 'pending';
  demographicsSkippedCount?: number;
  documents: SessionDocument[];
  onStepClick?: (step: string) => void;
  onDocumentClick?: (docId: string, index: number) => void;
}

type ItemStatus = 'completed' | 'deferred' | 'skipped' | 'pending';

function getDocumentStatus(doc: SessionDocument): ItemStatus {
  if (doc.status === 'signed') return 'completed';
  if (doc.status === 'deferred') return 'deferred';
  if (doc.status === 'skipped') return 'skipped';
  return 'pending';
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const config = {
    completed: { label: 'Completed', className: 'bg-green-100 text-green-800 border-green-200' },
    deferred: { label: 'Deferred', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    pending: { label: 'Pending', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', className)}>
      {label}
    </Badge>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'completed':
      return <Check className="h-5 w-5 text-green-600" />;
    case 'deferred':
      return <Clock className="h-5 w-5 text-amber-600" />;
    case 'skipped':
      return <SkipForward className="h-5 w-5 text-gray-500" />;
    default:
      return <Circle className="h-5 w-5 text-blue-400" />;
  }
}

interface OverviewItemProps {
  icon: React.ReactNode;
  label: string;
  status: ItemStatus;
  isActive: boolean;
  onClick?: () => void;
}

function OverviewItem({ icon, label, status, isActive, onClick }: OverviewItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left',
        'min-h-[64px] touch-manipulation',
        isActive 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-transparent bg-gray-50 hover:bg-gray-100',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'font-medium truncate',
          isActive ? 'text-blue-900' : 'text-gray-900'
        )}>
          {label}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={status} />
        <ChevronRight className={cn(
          'h-5 w-5',
          isActive ? 'text-blue-500' : 'text-gray-400'
        )} />
      </div>
    </button>
  );
}

export default function SessionOverviewPanel({
  currentStep,
  signatureAuthStatus,
  demographicsStatus,
  demographicsSkippedCount = 0,
  documents,
  onStepClick,
  onDocumentClick,
}: SessionOverviewPanelProps) {
  const sortedDocs = [...documents].sort((a, b) => 
    (a.orderIndex || 0) - (b.orderIndex || 0)
  );

  const allDocsCompleted = documents.every(
    d => d.status === 'signed' || d.status === 'skipped' || d.status === 'deferred'
  );
  const documentsStepStatus: ItemStatus = allDocsCompleted && documents.length > 0 
    ? 'completed' 
    : 'pending';

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 px-1">
        Session Overview
      </h3>

      <div className="space-y-2">
        <OverviewItem
          icon={<Edit3 className="h-5 w-5 text-indigo-600" />}
          label="Signature Authorization"
          status={signatureAuthStatus}
          isActive={currentStep === 'signature'}
          onClick={() => onStepClick?.('signature')}
        />

        <div className="relative">
          <OverviewItem
            icon={<User className="h-5 w-5 text-purple-600" />}
            label="Demographics"
            status={demographicsSkippedCount > 0 ? 'deferred' : demographicsStatus}
            isActive={currentStep === 'demographics'}
            onClick={() => onStepClick?.('demographics')}
          />
          {demographicsSkippedCount > 0 && demographicsStatus === 'completed' && (
            <div className="absolute -bottom-1 left-16 text-xs text-orange-600">
              {demographicsSkippedCount} section{demographicsSkippedCount > 1 ? 's' : ''} skipped
            </div>
          )}
        </div>

        <div className="py-2">
          <div className="flex items-center gap-2 px-1 mb-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">
              Documents ({documents.length})
            </span>
            {documents.length > 0 && (
              <StatusBadge status={documentsStepStatus} />
            )}
          </div>

          {sortedDocs.length > 0 ? (
            <div className="space-y-1 pl-2">
              {sortedDocs.map((doc, index) => {
                const docStatus = getDocumentStatus(doc);
                const docName = doc.templateName || doc.documentName || `Document ${index + 1}`;
                const isCurrentDoc = currentStep === 'documents';

                return (
                  <button
                    key={doc.id}
                    onClick={() => onDocumentClick?.(doc.id, index)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left',
                      'min-h-[52px] touch-manipulation',
                      isCurrentDoc
                        ? 'bg-blue-50 hover:bg-blue-100'
                        : 'bg-gray-50 hover:bg-gray-100'
                    )}
                  >
                    <StatusIcon status={docStatus} />
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                      {docName}
                    </span>
                    <StatusBadge status={docStatus} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 px-3 py-2">
              No documents configured
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between text-sm text-gray-600 px-1">
          <span>Progress</span>
          <span className="font-medium">
            {[
              signatureAuthStatus === 'completed',
              demographicsStatus === 'completed',
              documentsStepStatus === 'completed',
            ].filter(Boolean).length} / 3 steps
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all duration-300"
            style={{
              width: `${([
                signatureAuthStatus === 'completed',
                demographicsStatus === 'completed',
                documentsStepStatus === 'completed',
              ].filter(Boolean).length / 3) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}
