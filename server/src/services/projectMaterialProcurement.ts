type ProcurementRow = Record<string, unknown>;

const normalized = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const quantity = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface ProjectMaterialProcurement {
  status:
    | 'Not Requested'
    | 'Pending Request'
    | 'Approved'
    | 'PO Draft'
    | 'On PO'
    | 'Pending Acceptance'
    | 'Partially Received'
    | 'Received';
  quantity_ordered: number;
  quantity_received: number;
  quantity_available: number;
  quantity_pending_acceptance: number;
  vendor_po_ids: number[];
  po_numbers: string[];
}

export function deriveProjectMaterialProcurement(
  partNumber: string,
  partsRequests: ProcurementRow[],
  vendorPoLines: ProcurementRow[],
  projectReceiptRows: ProcurementRow[] = []
): ProjectMaterialProcurement {
  const key = normalized(partNumber);
  const requests = partsRequests.filter(
    (row) => normalized(row.ag_part_number ?? row.part_number) === key
  );
  const poLines = vendorPoLines.filter(
    (row) => normalized(row.ag_part_number) === key
  );
  const receipts = projectReceiptRows.filter(
    (row) => normalized(row.ag_part_number) === key
  );
  const orderedFromLines = poLines.reduce(
    (sum, row) => sum + quantity(row.quantity),
    0
  );
  const acceptedReceipts = receipts.filter(
    (row) =>
      ['accepted', 'accepted_transferred'].includes(normalized(row.status)) &&
      normalized(row.disposition) === 'accepted'
  );
  const receivedFromProject = acceptedReceipts.reduce(
    (sum, row) => sum + quantity(row.quantity),
    0
  );
  const availableFromProject = acceptedReceipts.reduce(
    (sum, row) => sum + quantity(row.quantity_available),
    0
  );
  const pendingAcceptance = receipts
    .filter(
      (row) =>
        normalized(row.status) === 'pending_pm_acceptance' &&
        normalized(row.disposition) === 'accepted'
    )
    .reduce((sum, row) => sum + quantity(row.quantity), 0);
  const orderedFromRequests = requests.reduce(
    (sum, row) => sum + quantity(row.qty_ordered),
    0
  );
  const quantityOrdered =
    poLines.length > 0 ? orderedFromLines : orderedFromRequests;
  const quantityReceived = receivedFromProject;
  const poStatuses = poLines.map((row) => normalized(row.po_status));
  const requestStatuses = requests.map((row) => normalized(row.status));
  const vendorPoIds = Array.from(
    new Set(
      [...poLines, ...requests]
        .map((row) => row.vendor_po_id)
        .filter(
          (value) => value !== null && value !== undefined && value !== ''
        )
        .map(Number)
        .filter(Number.isFinite)
    )
  );
  const poNumbers = Array.from(
    new Set(
      poLines.map((row) => String(row.po_number ?? '').trim()).filter(Boolean)
    )
  );

  let status: ProjectMaterialProcurement['status'] = 'Not Requested';
  if (quantityOrdered > 0 && quantityReceived >= quantityOrdered)
    status = 'Received';
  else if (quantityReceived > 0) status = 'Partially Received';
  else if (pendingAcceptance > 0) status = 'Pending Acceptance';
  else if (
    poLines.length > 0 ||
    vendorPoIds.length > 0 ||
    requestStatuses.includes('ordered')
  ) {
    status =
      poStatuses.length > 0 && poStatuses.every((value) => value === 'draft')
        ? 'PO Draft'
        : 'On PO';
  } else if (requestStatuses.includes('approved')) status = 'Approved';
  else if (requests.length > 0) status = 'Pending Request';

  return {
    status,
    quantity_ordered: quantityOrdered,
    quantity_received: quantityReceived,
    quantity_available: availableFromProject,
    quantity_pending_acceptance: pendingAcceptance,
    vendor_po_ids: vendorPoIds,
    po_numbers: poNumbers,
  };
}
