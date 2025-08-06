
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CommunicationInbox from '@/components/CommunicationInbox';
import { Mail } from 'lucide-react';

export default function CommunicationInboxPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-8 w-8" />
          Communication Inbox
        </h1>
        <p className="text-muted-foreground mt-2">
          View and respond to customer messages and inquiries
        </p>
      </div>

      <CommunicationInbox />
    </div>
  );
}
