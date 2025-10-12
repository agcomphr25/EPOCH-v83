import { MessageSquare } from 'lucide-react';
import InternalCommunicationBoard from '@/components/InternalCommunicationBoard';

export default function CommunicationInboxPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="h-8 w-8" />
          Internal Communication Board
        </h1>
        <p className="text-muted-foreground mt-2">
          Send messages to departments or specific people with attachments,
          track read status, and manage urgent communications
        </p>
      </div>

      <InternalCommunicationBoard />
    </div>
  );
}
