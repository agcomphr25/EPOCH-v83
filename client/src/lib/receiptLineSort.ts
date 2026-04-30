export interface ReceiptLineSortable {
  orderedQty?: string | number | null;
  receivedQty?: string | number | null;
  agPartNumber?: string | null;
  description?: string | null;
}

export type ReceiptLineSortCol = 'partNumber' | 'description' | 'ordered' | 'received' | 'status';

export interface ReceiptLineSortOptions {
  sortCol?: ReceiptLineSortCol | null;
  sortDir?: 'asc' | 'desc';
}

export function receiptLineStatusRank(line: ReceiptLineSortable): number {
  const ord = Number(line.orderedQty ?? 0);
  const rcv = Number(line.receivedQty ?? 0);
  if (ord > 0 && rcv === 0) return 0;  // Pending
  if (rcv < ord && rcv > 0) return 1;  // Partial
  if (rcv > ord && ord > 0) return 2;  // Over-received
  return 3;                             // Complete
}

export function compareReceiptLines(
  a: ReceiptLineSortable,
  b: ReceiptLineSortable,
  options?: ReceiptLineSortOptions,
): number {
  const { sortCol, sortDir } = options ?? {};

  if (sortCol === 'status') {
    const dir = sortDir === 'desc' ? -1 : 1;
    const rankDiff = receiptLineStatusRank(a) - receiptLineStatusRank(b);
    if (rankDiff !== 0) return dir * rankDiff;
    return (a.agPartNumber ?? '').localeCompare(b.agPartNumber ?? '');
  }

  const rankDiff = receiptLineStatusRank(a) - receiptLineStatusRank(b);
  if (rankDiff !== 0) return rankDiff;
  if (sortCol) {
    const dir = sortDir === 'desc' ? -1 : 1;
    if (sortCol === 'partNumber') {
      return dir * (a.agPartNumber ?? '').localeCompare(b.agPartNumber ?? '');
    }
    if (sortCol === 'description') {
      return dir * (a.description ?? '').localeCompare(b.description ?? '');
    }
    if (sortCol === 'ordered') {
      return dir * (Number(a.orderedQty ?? 0) - Number(b.orderedQty ?? 0));
    }
    if (sortCol === 'received') {
      return dir * (Number(a.receivedQty ?? 0) - Number(b.receivedQty ?? 0));
    }
  }

  const rank = receiptLineStatusRank(a);
  const aOrd = Number(a.orderedQty ?? 0);
  const aRcv = Number(a.receivedQty ?? 0);
  const bOrd = Number(b.orderedQty ?? 0);
  const bRcv = Number(b.receivedQty ?? 0);

  const partCmp = (a.agPartNumber ?? '').localeCompare(b.agPartNumber ?? '');
  if (rank === 0) {
    const diff = bOrd - aOrd;
    return diff !== 0 ? diff : partCmp;
  }
  if (rank === 1) {
    const diff = (bOrd - bRcv) - (aOrd - aRcv);
    return diff !== 0 ? diff : partCmp;
  }
  if (rank === 2) {
    const diff = (bRcv - bOrd) - (aRcv - aOrd);
    return diff !== 0 ? diff : partCmp;
  }
  return partCmp;
}
