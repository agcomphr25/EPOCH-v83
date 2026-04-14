import { useMemo } from "react";

export type ToolingRow = {
  id?: string;
  description: string;
  toolingType: string;
  quantity: number;
  unitCost: number;
  totalCost?: number;
  appliesToScope: string;
  pricingTreatment: string;
  amortizationQty?: number | null;
  chargeTiming: string;
  customerOwnedTooling?: boolean;
  notes?: string;
};

type Props = {
  toolingRows: ToolingRow[];
  toolingMessage: string;
  onAddToolingRow: () => void;
  onUpdateToolingRow: (
    index: number,
    field: keyof ToolingRow,
    value: string | number | boolean | null
  ) => void;
  onSaveToolingRow: (row: ToolingRow) => void;
  onDeleteToolingRow: (index: number, row: ToolingRow) => void;
};

export default function RFQBuilderStep2Tooling({
  toolingRows,
  toolingMessage,
  onAddToolingRow,
  onUpdateToolingRow,
  onSaveToolingRow,
  onDeleteToolingRow,
}: Props) {
  const toolingSummary = useMemo(() => {
    return toolingRows.reduce(
      (acc, row) => {
        const total =
          Number(row.totalCost ?? 0) ||
          Number(row.quantity || 0) * Number(row.unitCost || 0);
        acc.total += total;
        if (row.pricingTreatment === "SEPARATE_LINE") acc.separate += total;
        if (row.pricingTreatment === "BLENDED_UNIT_PRICE") acc.blended += total;
        if (row.pricingTreatment === "AMORTIZED") acc.amortized += total;
        if (row.pricingTreatment === "INTERNAL_ONLY") acc.internal += total;
        return acc;
      },
      { total: 0, separate: 0, blended: 0, amortized: 0, internal: 0 }
    );
  }, [toolingRows]);

  return (
    <div className="border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Step 2 — Tooling</h2>
          <p className="text-sm text-muted-foreground">
            Add mandrels, molds, fixtures, inserts, setup tooling, and one-time production costs.
          </p>
        </div>

        <button className="border rounded px-4 py-2" onClick={onAddToolingRow} type="button">
          + Add Tooling
        </button>
      </div>

      {toolingMessage && (
        <div className="rounded border px-3 py-2 text-sm">{toolingMessage}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 overflow-x-auto">
          <table className="w-full border-collapse min-w-[1400px]">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Qty</th>
                <th className="text-left p-2">Unit Cost</th>
                <th className="text-left p-2">Total</th>
                <th className="text-left p-2">Applies To</th>
                <th className="text-left p-2">Pricing Treatment</th>
                <th className="text-left p-2">Amortization Qty</th>
                <th className="text-left p-2">Charge Timing</th>
                <th className="text-left p-2">Customer Owned</th>
                <th className="text-left p-2">Notes</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {toolingRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-4 text-sm text-muted-foreground">
                    No tooling rows yet.
                  </td>
                </tr>
              ) : (
                toolingRows.map((row, index) => (
                  <tr key={`${row.id ?? "new"}-${index}`} className="border-b align-top">
                    <td className="p-2">
                      <input
                        className="w-[180px] border rounded px-2 py-1"
                        value={row.description}
                        onChange={(e) => onUpdateToolingRow(index, "description", e.target.value)}
                      />
                    </td>

                    <td className="p-2">
                      <select
                        className="w-[160px] border rounded px-2 py-1"
                        value={row.toolingType}
                        onChange={(e) => onUpdateToolingRow(index, "toolingType", e.target.value)}
                      >
                        <option value="MANDREL">Mandrel</option>
                        <option value="MOLD">Mold</option>
                        <option value="FIXTURE">Fixture</option>
                        <option value="INSERT_TOOLING">Insert Tooling</option>
                        <option value="CNC_SETUP_TOOLING">CNC Setup Tooling</option>
                        <option value="POLISHING_TOOLING">Polishing Tooling</option>
                        <option value="INSPECTION_TOOLING">Inspection Tooling</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        className="w-[90px] border rounded px-2 py-1"
                        value={row.quantity}
                        onChange={(e) =>
                          onUpdateToolingRow(index, "quantity", Number(e.target.value))
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-[120px] border rounded px-2 py-1"
                        value={row.unitCost}
                        onChange={(e) =>
                          onUpdateToolingRow(index, "unitCost", Number(e.target.value))
                        }
                      />
                    </td>

                    <td className="p-2">${Number(row.totalCost ?? 0).toFixed(2)}</td>

                    <td className="p-2">
                      <select
                        className="w-[140px] border rounded px-2 py-1"
                        value={row.appliesToScope}
                        onChange={(e) =>
                          onUpdateToolingRow(index, "appliesToScope", e.target.value)
                        }
                      >
                        <option value="ALL_PARTS">All Parts</option>
                        <option value="PART">This Part Only</option>
                        <option value="SELECTED_PARTS">Selected Parts</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <select
                        className="w-[170px] border rounded px-2 py-1"
                        value={row.pricingTreatment}
                        onChange={(e) =>
                          onUpdateToolingRow(index, "pricingTreatment", e.target.value)
                        }
                      >
                        <option value="SEPARATE_LINE">Separate Line Item</option>
                        <option value="BLENDED_UNIT_PRICE">Blend Into Unit Price</option>
                        <option value="AMORTIZED">Amortized</option>
                        <option value="INTERNAL_ONLY">Internal Only</option>
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        className="w-[120px] border rounded px-2 py-1"
                        value={row.amortizationQty ?? ""}
                        onChange={(e) =>
                          onUpdateToolingRow(
                            index,
                            "amortizationQty",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </td>

                    <td className="p-2">
                      <select
                        className="w-[150px] border rounded px-2 py-1"
                        value={row.chargeTiming}
                        onChange={(e) =>
                          onUpdateToolingRow(index, "chargeTiming", e.target.value)
                        }
                      >
                        <option value="ONE_TIME">One-Time</option>
                        <option value="FIRST_PO_ONLY">First PO Only</option>
                        <option value="FIRST_ARTICLE_ONLY">First Article Only</option>
                        <option value="EVERY_ORDER">Every Order</option>
                      </select>
                    </td>

                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!row.customerOwnedTooling}
                        onChange={(e) =>
                          onUpdateToolingRow(index, "customerOwnedTooling", e.target.checked)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        className="w-[180px] border rounded px-2 py-1"
                        value={row.notes ?? ""}
                        onChange={(e) => onUpdateToolingRow(index, "notes", e.target.value)}
                      />
                    </td>

                    <td className="p-2">
                      <div className="flex gap-2">
                        <button
                          className="border rounded px-3 py-1"
                          onClick={() => onSaveToolingRow(row)}
                          type="button"
                        >
                          Save
                        </button>
                        <button
                          className="border rounded px-3 py-1"
                          onClick={() => onDeleteToolingRow(index, row)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-4 h-fit">
          <h3 className="font-semibold mb-3">Tooling Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Tooling</span>
              <span>${toolingSummary.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Separate Line</span>
              <span>${toolingSummary.separate.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Blended</span>
              <span>${toolingSummary.blended.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Amortized</span>
              <span>${toolingSummary.amortized.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Internal Only</span>
              <span>${toolingSummary.internal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
