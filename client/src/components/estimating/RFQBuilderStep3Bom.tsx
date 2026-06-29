import { useMemo } from "react";

export type BomLineRow = {
  id?: string;
  rfqPartId: string;
  inventoryItemId?: number | null;
  childPartAgNumber?: string;
  description: string;
  category: string;
  quantityPerPart: number;
  uom: string;
  estimatedUnitCost: number;
  scrapPercent: number;
  isEstimated: boolean;
  isDraftInventoryItem: boolean;
  vendorNameSnapshot?: string;
  materialSpec?: string;
  notes?: string;
  sourceType?: "DRAFT" | "MANUAL";
  sourceLabel?: string;
};

type PartOption = {
  id?: string;
  lineNumber: number;
  partNumber: string;
  quantity: number;
};

type Props = {
  parts: PartOption[];
  selectedBomPartId: string;
  setSelectedBomPartId: (value: string) => void;
  filteredBomLines: BomLineRow[];
  bomMessage: string;
  bomSummary: {
    totalPerPart: number;
    prepreg: number;
    consumables: number;
    paint: number;
    hardware: number;
    packaging: number;
    adhesive: number;
    other: number;
  };
  bomExtendedTotal: number;
  onAddBomLine: () => void;
  onUpdateBomLine: (
    index: number,
    field: keyof BomLineRow,
    value: string | number | boolean | null
  ) => void;
  onSaveBomLine: (row: BomLineRow) => void;
  onDeleteBomLine: (index: number, row: BomLineRow) => void;
};

export default function RFQBuilderStep3Bom({
  parts,
  selectedBomPartId,
  setSelectedBomPartId,
  filteredBomLines,
  bomMessage,
  bomSummary,
  bomExtendedTotal,
  onAddBomLine,
  onUpdateBomLine,
  onSaveBomLine,
  onDeleteBomLine,
}: Props) {
  const selectedBomPart = useMemo(
    () => parts.find((p) => p.id === selectedBomPartId),
    [parts, selectedBomPartId]
  );

  return (
    <div className="border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Step 3 — BOM Builder</h2>
          <p className="text-sm text-muted-foreground">
            Add estimated material lines for the selected quoted part.
          </p>
        </div>

        <button className="border rounded px-4 py-2" onClick={onAddBomLine} type="button">
          + Add BOM Line
        </button>
      </div>

      {bomMessage && (
        <div className="rounded border px-3 py-2 text-sm">{bomMessage}</div>
      )}

      <div className="flex items-end gap-4">
        <div className="min-w-[320px]">
          <label className="block text-sm mb-1">Selected RFQ Part</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={selectedBomPartId}
            onChange={(e) => setSelectedBomPartId(e.target.value)}
          >
            <option value="">Select a part</option>
            {parts
              .filter((p) => p.id)
              .map((part) => (
                <option key={part.id} value={part.id}>
                  {part.lineNumber} - {part.partNumber} ({part.quantity})
                </option>
              ))}
          </select>
        </div>

        {selectedBomPart && (
          <div className="text-sm text-muted-foreground">
            Material cost will be calculated for <strong>{selectedBomPart.partNumber}</strong>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 overflow-x-auto">
          <table className="w-full border-collapse min-w-[1550px]">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Source</th>
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">Category</th>
                <th className="text-left p-2">Qty / Part</th>
                <th className="text-left p-2">UOM</th>
                <th className="text-left p-2">Unit Cost</th>
                <th className="text-left p-2">Scrap %</th>
                <th className="text-left p-2">Cost / Part</th>
                <th className="text-left p-2">AG Part #</th>
                <th className="text-left p-2">Vendor</th>
                <th className="text-left p-2">Material Spec</th>
                <th className="text-left p-2">Estimated</th>
                <th className="text-left p-2">Draft Item</th>
                <th className="text-left p-2">Notes</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!selectedBomPartId ? (
                <tr>
                  <td colSpan={15} className="p-4 text-sm text-muted-foreground">
                    Select an RFQ part to begin adding BOM lines.
                  </td>
                </tr>
              ) : filteredBomLines.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-4 text-sm text-muted-foreground">
                    No BOM lines yet for this part.
                  </td>
                </tr>
              ) : (
                filteredBomLines.map((row, index) => {
                  const costPerPart =
                    Number(row.quantityPerPart || 0) *
                    Number(row.estimatedUnitCost || 0) *
                    (1 + Number(row.scrapPercent || 0) / 100);

                  return (
                    <tr key={`${row.id ?? "new"}-${index}`} className="border-b align-top">
                      <td className="p-2">
                        <span className="rounded border px-2 py-1 text-xs">
                          {row.sourceType === "DRAFT" ? "Draft sourced" : "Manual"}
                        </span>
                      </td>
                      <td className="p-2">
                        <input
                          className="w-[180px] border rounded px-2 py-1"
                          value={row.description}
                          onChange={(e) => onUpdateBomLine(index, "description", e.target.value)}
                        />
                      </td>

                      <td className="p-2">
                        <select
                          className="w-[150px] border rounded px-2 py-1"
                          value={row.category}
                          onChange={(e) => onUpdateBomLine(index, "category", e.target.value)}
                        >
                          <option value="PREPREG">Prepreg</option>
                          <option value="CONSUMABLE">Consumable</option>
                          <option value="PAINT">Paint</option>
                          <option value="HARDWARE">Hardware</option>
                          <option value="PACKAGING">Packaging</option>
                          <option value="ADHESIVE">Adhesive</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          className="w-[110px] border rounded px-2 py-1"
                          value={row.quantityPerPart}
                          onChange={(e) =>
                            onUpdateBomLine(index, "quantityPerPart", Number(e.target.value))
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          className="w-[90px] border rounded px-2 py-1"
                          value={row.uom}
                          onChange={(e) => onUpdateBomLine(index, "uom", e.target.value)}
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          className="w-[110px] border rounded px-2 py-1"
                          value={row.estimatedUnitCost}
                          onChange={(e) =>
                            onUpdateBomLine(index, "estimatedUnitCost", Number(e.target.value))
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="w-[90px] border rounded px-2 py-1"
                          value={row.scrapPercent}
                          onChange={(e) =>
                            onUpdateBomLine(index, "scrapPercent", Number(e.target.value))
                          }
                        />
                      </td>

                      <td className="p-2">${costPerPart.toFixed(4)}</td>

                      <td className="p-2">
                        <input
                          className="w-[130px] border rounded px-2 py-1"
                          value={row.childPartAgNumber ?? ""}
                          onChange={(e) =>
                            onUpdateBomLine(index, "childPartAgNumber", e.target.value)
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          className="w-[130px] border rounded px-2 py-1"
                          value={row.vendorNameSnapshot ?? ""}
                          onChange={(e) =>
                            onUpdateBomLine(index, "vendorNameSnapshot", e.target.value)
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          className="w-[150px] border rounded px-2 py-1"
                          value={row.materialSpec ?? ""}
                          onChange={(e) =>
                            onUpdateBomLine(index, "materialSpec", e.target.value)
                          }
                        />
                      </td>

                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!row.isEstimated}
                          onChange={(e) => onUpdateBomLine(index, "isEstimated", e.target.checked)}
                        />
                      </td>

                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!row.isDraftInventoryItem}
                          onChange={(e) =>
                            onUpdateBomLine(index, "isDraftInventoryItem", e.target.checked)
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          className="w-[160px] border rounded px-2 py-1"
                          value={row.notes ?? ""}
                          onChange={(e) => onUpdateBomLine(index, "notes", e.target.value)}
                        />
                      </td>

                      <td className="p-2">
                        <div className="flex gap-2">
                          <button
                            className="border rounded px-3 py-1"
                            onClick={() => onSaveBomLine(row)}
                            type="button"
                          >
                            Save
                          </button>
                          <button
                            className="border rounded px-3 py-1"
                            onClick={() => onDeleteBomLine(index, row)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-4 h-fit">
          <h3 className="font-semibold mb-3">Material Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Prepreg</span><span>${bomSummary.prepreg.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Consumables</span><span>${bomSummary.consumables.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Paint</span><span>${bomSummary.paint.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Hardware</span><span>${bomSummary.hardware.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Packaging</span><span>${bomSummary.packaging.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Adhesive</span><span>${bomSummary.adhesive.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>Other</span><span>${bomSummary.other.toFixed(4)}</span></div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Cost / Part</span>
              <span>${bomSummary.totalPerPart.toFixed(4)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total @ Qty</span>
              <span>${bomExtendedTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
