import { useState } from 'react';
import { P2POManager } from '@/components/P2POManager';
import { P2POItemsManager } from '@/components/P2POItemsManager';

interface POItemsView {
  poId: number;
  poNumber: string;
}

export default function P2CustomersTab() {
  const [poItemsView, setPOItemsView] = useState<POItemsView | null>(null);

  if (poItemsView) {
    return (
      <P2POItemsManager
        poId={poItemsView.poId}
        poNumber={poItemsView.poNumber}
        onBack={() => setPOItemsView(null)}
      />
    );
  }

  return (
    <P2POManager
      onManageItems={(poId, poNumber) => setPOItemsView({ poId, poNumber })}
    />
  );
}
