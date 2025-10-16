import React from 'react';
import { useLocation } from 'wouter';

import { Button } from '@/components/ui/button';

export default function ShutdownProceduresTraining() {
  const [, setLocation] = useLocation();
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Shutdown Procedures Training</h1>
      <p>
        This standalone page has been consolidated into the Training module.
      </p>
      <Button onClick={() => setLocation('/training')}>Go to Training</Button>
    </div>
  );
}
