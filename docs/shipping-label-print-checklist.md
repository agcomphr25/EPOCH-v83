# Shipping Label Print Smoke Test

Use this checklist whenever the label-printing code path (`client/src/lib/labelPrint.ts`) changes, or after any jsPDF / orientation configuration update.

## Background

UPS GIF labels are 6" wide × 4" tall. The PDF is generated in **landscape** orientation with a `[4, 6]` page format so the image fills the stock with no rotation. This checklist verifies the end-to-end path from the app to a physical label.

---

## Pre-flight

- [ ] The app is running and you can reach the shipping workflow.
- [ ] You have a test shipment (real or staging) ready to generate a label.
- [ ] Your label printer is loaded with 4×6 thermal stock and is online.

---

## Step 1 — Open Print Preview

1. Navigate to a shipment and click **Print Label**.
2. A new browser window/tab opens showing the label PDF preview.
3. **Pass**: The label appears right-side up (carrier logo top-left, barcode below the address, no rotation).
4. **Fail**: Label is rotated 90° — check that the printer driver is not adding an extra rotation on top of the landscape PDF.

---

## Step 2 — Browser Print Dialog Settings

1. In the print preview window, click **Print**.
2. In the system print dialog:
   - Set **Paper size** to `4 x 6 in` (or equivalent).
   - Set **Scale / Fit** to **Actual size** (not "Fit to page").
   - Disable any "Auto-rotate" option if present.
3. **Pass**: The preview thumbnail in the dialog shows the label filling the full page without white borders or clipping.

---

## Step 3 — Zebra ZP450 / ZD420 / GK420d

1. Select the Zebra printer in the print dialog.
2. Under printer properties, confirm paper is set to `4x6`.
3. Print one label.
4. **Pass**: Label prints right-side up, text is fully legible, barcode scans correctly, no content is cut off at the edges.
5. **Fail**: If content is cut off, recheck that "Actual size" was selected and that the Zebra driver is not scaling to letter paper.

---

## Step 4 — Dymo 4XL

1. Open **Dymo Connect** (or use the system dialog if Dymo Connect is not available).
2. Select the **4 x 6 in** label template.
3. Print one label.
4. **Pass**: Label prints right-side up, carrier logo visible, barcode present and scannable, ship-to address fully legible.

---

## Step 5 — ZPL Labels (smoke test only)

For shipments that return a ZPL label instead of a GIF:

1. Click **Print Label** — a plain-text popup should appear showing the raw ZPL.
2. The popup offers a **Print** button.
3. **Pass**: ZPL text is visible and the print button triggers a browser print of the raw ZPL content.

---

## Pass Criteria

All checked steps pass with no rotated, clipped, or blank labels produced.

## Known Printer-Side Gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| Label prints sideways | Printer driver adding 90° rotation | Disable auto-rotate in printer properties |
| Content clipped on right edge | "Fit to page" scaling selected | Switch to "Actual size" in print dialog |
| Blank label printed | Popup blocked by browser | Allow popups for this site |
| Tiny label in corner of sheet | Paper size set to Letter instead of 4×6 | Change paper size in printer dialog |
