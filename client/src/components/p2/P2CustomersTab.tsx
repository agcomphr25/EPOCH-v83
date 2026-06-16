import { useState } from 'react';
import { P2POManager } from '@/components/P2POManager';
import { P2POItemsManager } from '@/components/P2POItemsManager';
import P2POCreationWizard, { SourcePO } from '@/components/p2/P2POCreationWizard';

interface POItemsView {
  poId: number;
  poNumber: string;
}

export default function P2CustomersTab() {
  const [poItemsView, setPOItemsView] = useState<POItemsView | null>(null);
  const [revisePO, setRevisePO] = useState<SourcePO | null>(null);

  const handleRevise = (po: any) => {
    setRevisePO({
      id: po.id,
      poNumber: po.poNumber,
      customerId: po.customerId,
      expectedDelivery: po.expectedDelivery,
      toleranceAuthorizerId: po.toleranceAuthorizerId ?? null,
      notes: po.notes ?? null,
      assignedToId: po.assignedToId ?? null,
      productionLeadId: po.productionLeadId ?? null,
      projectId: po.projectId ?? null,
      revisionNumber: po.revisionNumber ?? 0,
    });
  };

  if (revisePO) {
    return (
      <P2POCreationWizard
        onComplete={() => setRevisePO(null)}
        onCancel={() => setRevisePO(null)}
        sourcePO={revisePO}
      />
    );
  }

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
      onRevise={handleRevise}
    />
  );
}
