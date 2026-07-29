export type PrintableBomLine = {
  id: string;
  include?: boolean;
  action?: string;
  category?: string;
  supplier?: string;
  manufacturer?: string;
  supplierItemId?: string;
  agPartNumber?: string;
  description?: string;
  unit?: string;
  unitCost?: number | string;
  actualCost?: number | string;
  qtyNeeded?: number | string;
  status?: string;
  targetNeedDate?: string;
  note?: string;
  service?: boolean;
  partsRequestId?: number | null;
  partsRequestStatus?: string | null;
  customFields?: Record<string, string>;
};

export type PrintableBomDraft = {
  name: string;
  revision?: string;
  project?: string;
  projectCode?: string | null;
  projectName?: string | null;
  owner?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PrintableBomSummary = {
  lineCount: number;
  materialTotal: number;
  laborTotal: number;
  laborHours: number;
  nrcTotal: number;
  selectedTotal: number;
};

type PrintInput = {
  draft: PrintableBomDraft;
  lines: PrintableBomLine[];
  summary: PrintableBomSummary;
  customColumns?: string[];
  printedAt?: Date;
};

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapePrintHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: unknown): string {
  return numberValue(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function display(value: unknown, fallback = '—'): string {
  const text = String(value ?? '').trim();
  return escapePrintHtml(text || fallback);
}

function extendedCost(line: PrintableBomLine): number {
  return numberValue(line.qtyNeeded) * numberValue(line.unitCost);
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? display(value) : escapePrintHtml(parsed.toLocaleString());
}

function documentShell(title: string, body: string, printedAt = new Date(), landscape = false): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapePrintHtml(title)}</title>
  <style>
    @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 0.45in; }
    * { box-sizing: border-box; }
    body { color: #172033; font: 11px/1.35 Arial, sans-serif; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { border-bottom: 2px solid #334155; font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; }
    .muted { color: #64748b; }
    .meta, .summary { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); margin-top: 14px; }
    .box { border: 1px solid #cbd5e1; border-radius: 5px; padding: 7px; }
    .label { color: #64748b; display: block; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .notes { margin-top: 10px; white-space: pre-wrap; }
    table { border-collapse: collapse; width: 100%; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 5px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; font-size: 9px; text-transform: uppercase; }
    .number { text-align: right; white-space: nowrap; }
    .footer { color: #64748b; font-size: 9px; margin-top: 12px; text-align: right; }
    .print-toolbar { align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; display: flex; justify-content: space-between; margin-bottom: 16px; padding: 10px 12px; }
    .print-button { background: #2563eb; border: 0; border-radius: 5px; color: #fff; cursor: pointer; font-size: 12px; font-weight: 700; padding: 8px 16px; }
    .print-button:hover { background: #1d4ed8; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
<div class="print-toolbar no-print">
  <span>Review the document below, then select Print.</span>
  <button class="print-button" type="button" onclick="window.print()">Print</button>
</div>
${body}
<div class="footer">Printed ${escapePrintHtml(printedAt.toLocaleString())}</div>
</body>
</html>`;
}

function heading(draft: PrintableBomDraft, title: string): string {
  const project = draft.projectName || draft.project || 'Unassigned';
  return `<h1>${escapePrintHtml(title)}</h1>
  <div class="muted">${display(draft.name)}${draft.revision ? ` · Rev ${display(draft.revision)}` : ''}</div>
  <div class="meta">
    <div class="box"><span class="label">Project</span>${display(project)}</div>
    <div class="box"><span class="label">Project Code</span>${display(draft.projectCode)}</div>
    <div class="box"><span class="label">Owner</span>${display(draft.owner)}</div>
    <div class="box"><span class="label">Last Updated</span>${formatDate(draft.updatedAt)}</div>
  </div>`;
}

export function buildBomDetailsPrintHtml(input: PrintInput): string {
  const customColumns = input.customColumns ?? [];
  const customHeaders = customColumns.map((column) => `<th>${display(column)}</th>`).join('');
  const rows = input.lines.map((line) => `
    <tr>
      <td>${display(line.agPartNumber)}</td>
      <td>${display(line.description)}</td>
      <td>${display(line.category)}</td>
      <td>${display(line.supplier)}</td>
      <td>${display(line.supplierItemId)}</td>
      <td class="number">${display(line.qtyNeeded)}</td>
      <td>${display(line.unit)}</td>
      <td class="number">${currency(line.unitCost)}</td>
      <td class="number">${currency(extendedCost(line))}</td>
      <td>${display(line.status)}</td>
      <td>${display(line.action)}</td>
      ${customColumns.map((column) => `<td>${display(line.customFields?.[column])}</td>`).join('')}
    </tr>`).join('');
  const summary = input.summary;
  const body = `${heading(input.draft, 'BOM Details')}
  <div class="summary">
    <div class="box"><span class="label">BOM Lines</span>${summary.lineCount}</div>
    <div class="box"><span class="label">Material + NRC</span>${currency(summary.materialTotal)}</div>
    <div class="box"><span class="label">Direct Labor</span>${currency(summary.laborTotal)}</div>
    <div class="box"><span class="label">Labor Hours</span>${numberValue(summary.laborHours).toLocaleString()}</div>
    <div class="box"><span class="label">NRC</span>${currency(summary.nrcTotal)}</div>
    <div class="box"><span class="label">Selected Parts</span>${currency(summary.selectedTotal)}</div>
  </div>
  ${input.draft.notes ? `<div class="box notes"><span class="label">BOM Notes</span>${display(input.draft.notes)}</div>` : ''}
  <h2>Bill of Materials</h2>
  <table>
    <thead><tr><th>AG Part #</th><th>Description</th><th>Category</th><th>Supplier</th><th>Supplier Part #</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Ext. Cost</th><th>Status</th><th>Action</th>${customHeaders}</tr></thead>
    <tbody>${rows || `<tr><td colspan="${11 + customColumns.length}">No BOM lines.</td></tr>`}</tbody>
  </table>`;
  return documentShell(`${input.draft.name} - BOM Details`, body, input.printedAt, true);
}

export function buildPartsRequestPrintHtml(input: PrintInput): string {
  const rows = input.lines.map((line) => `
    <tr>
      <td>${line.include ? 'Yes' : 'No'}</td>
      <td>${line.partsRequestId ? `PR-${escapePrintHtml(line.partsRequestId)}` : '—'}</td>
      <td>${display(line.partsRequestStatus)}</td>
      <td>${display(line.agPartNumber)}</td>
      <td>${display(line.description)}</td>
      <td>${display(line.supplier)}</td>
      <td>${display(line.supplierItemId)}</td>
      <td>${display(line.manufacturer)}</td>
      <td class="number">${display(line.qtyNeeded)}</td>
      <td>${display(line.unit)}</td>
      <td class="number">${currency(line.unitCost)}</td>
      <td class="number">${line.actualCost === '' || line.actualCost == null ? '—' : currency(line.actualCost)}</td>
      <td>${line.service ? 'Yes' : 'No'}</td>
      <td>${display(line.status)}</td>
      <td>${display(line.targetNeedDate)}</td>
      <td>${display(line.note)}</td>
    </tr>`).join('');
  const requestedCount = input.lines.filter((line) => line.include).length;
  const body = `${heading(input.draft, 'Parts Request')}
  <div class="summary">
    <div class="box"><span class="label">Total Lines</span>${input.lines.length}</div>
    <div class="box"><span class="label">Requested Lines</span>${requestedCount}</div>
    <div class="box"><span class="label">Estimated Total</span>${currency(input.lines.reduce((sum, line) => sum + extendedCost(line), 0))}</div>
    <div class="box"><span class="label">Selected Total</span>${currency(input.summary.selectedTotal)}</div>
  </div>
  <h2>Requested Parts and Services</h2>
  <table>
    <thead><tr><th>Request?</th><th>PR #</th><th>PR Status</th><th>AG Part #</th><th>Description</th><th>Supplier</th><th>Supplier Part #</th><th>Manufacturer</th><th>Qty</th><th>Unit</th><th>Est. Cost</th><th>Actual Cost</th><th>Service</th><th>Sourcing Status</th><th>Need Date</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="16">No parts request lines.</td></tr>'}</tbody>
  </table>`;
  return documentShell(`${input.draft.name} - Parts Request`, body, input.printedAt, true);
}

export function openPrintDocument(html: string): boolean {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) return false;
  printWindow.addEventListener('load', () => {
    window.setTimeout(() => printWindow.print(), 150);
  }, { once: true });
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  return true;
}
