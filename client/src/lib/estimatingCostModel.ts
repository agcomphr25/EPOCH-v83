export type NrcCategory =
  | "TOOLING"
  | "NRE_LABOR"
  | "CAPITAL_ASSET"
  | "INSTALLATION"
  | "TRAINING"
  | "OTHER";

export type ChargeTiming = "ONE_TIME" | "FIRST_PO_ONLY" | "FIRST_ARTICLE_ONLY" | "EVERY_ORDER";
export type CostSourceType = "DRAFT" | "MANUAL";

export type NrcCostRow = {
  id?: string;
  category: NrcCategory;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost?: number;
  amortized: boolean;
  amortizationQty?: number | null;
  chargeTiming: ChargeTiming;
  includeInCustomerPrice: boolean;
  internalOnly: boolean;
  notes?: string;
  assetName?: string;
  usefulLifeMonths?: number | null;
  amortizationBasis?: string;
  installationCost?: number;
  trainingCost?: number;
  sourceType?: CostSourceType;
  sourceLabel?: string;
};

export type PricingSettingMode = "FLAT_PERCENT" | "TIERED_PERCENT" | "MANUAL_AMOUNT" | "DISABLED";
export type PricingApplyTo = "MATERIAL" | "LABOR" | "NRC" | "DIRECT_COST" | "TOTAL_COST";
export type PricingSettingKey = "OVERHEAD" | "G_AND_A" | "RISK" | "ESCALATION" | "PROFIT";

export type PricingTierRule = {
  minAmount: number;
  percent: number;
  label?: string;
};

export type PricingSetting = {
  key: PricingSettingKey;
  label: string;
  enabled: boolean;
  mode: PricingSettingMode;
  applyTo: PricingApplyTo;
  defaultPercent: number;
  manualAmount?: number;
  tiers: PricingTierRule[];
  notes?: string;
};

export type CostModelBomLine = {
  rfqPartId?: string;
  quantityPerPart: number;
  estimatedUnitCost: number;
  scrapPercent?: number;
};

export type CostModelProcessRow = {
  rfqPartId?: string;
  setupHours: number;
  hoursPerPart: number;
  hourlyRate: number;
};

export type CostModelToolingRow = {
  quantity: number;
  unitCost: number;
  totalCost?: number;
  pricingTreatment: string;
  amortizationQty?: number | null;
};

export type CostModelAdjustmentRow = {
  rfqPartId?: string | null;
  pricingMode: string;
  amount: number;
  percentValue?: number | null;
  appliesToScope: string;
  includeInCustomerPrice: boolean;
};

export type CostModelShippingRow = {
  rfqPartId?: string | null;
  shippingMode: string;
  amount: number;
  includeInCustomerPrice: boolean;
};

export type CostRollup = {
  materialCost: number;
  laborCost: number;
  nrcCost: number;
  customerFacingNrcCost: number;
  tooling: number;
  nreLabor: number;
  capitalAssets: number;
  installationTraining: number;
  otherNrc: number;
  adjustments: number;
  shipping: number;
  overhead: number;
  gna: number;
  riskContingency: number;
  escalationInflation: number;
  totalCost: number;
  profit: number;
  sellPrice: number;
  marginPercent: number;
  warnings: string[];
};

export type PricingMatrixPartRow = CostRollup & {
  partId?: string;
  partNumber: string;
  materialPerPart: number;
  laborPerPart: number;
  nrcPerPart: number;
  toolingPerPart: number;
  adjustmentPerPart: number;
  shippingPerPart: number;
  totalCostPerPart: number;
  sellPricePerPart: number;
  extendedPrice: number;
};

export type PricingMatrixBreakRow = {
  id?: string;
  label: string;
  quantity: number;
  rows: PricingMatrixPartRow[];
  rollup: CostRollup;
  totalExtended: number;
  separateTooling: number;
};

export function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

export function nrcRowTotal(row: NrcCostRow) {
  const base = Number(row.quantity || 0) * Number(row.unitCost || 0);
  const installTraining = row.category === "CAPITAL_ASSET"
    ? Number(row.installationCost || 0) + Number(row.trainingCost || 0)
    : 0;
  return roundCurrency(base + installTraining);
}

export function nrcCustomerFacingTotal(row: NrcCostRow, breakQty: number) {
  if (row.internalOnly || !row.includeInCustomerPrice) return 0;
  const total = nrcRowTotal(row);
  if (!row.amortized) return total;
  const amortizationQty = Number(row.amortizationQty || 0);
  if (amortizationQty > 0) return total * (breakQty / amortizationQty);
  return 0;
}

export function calculateNrcSummary(rows: NrcCostRow[], breakQty = 1) {
  return rows.reduce(
    (acc, row) => {
      const total = nrcRowTotal(row);
      const customerFacing = nrcCustomerFacingTotal(row, breakQty);
      acc.nrcCost += total;
      acc.customerFacingNrcCost += customerFacing;
      if (row.category === "TOOLING") acc.tooling += total;
      if (row.category === "NRE_LABOR") acc.nreLabor += total;
      if (row.category === "CAPITAL_ASSET") acc.capitalAssets += total;
      if (row.category === "INSTALLATION" || row.category === "TRAINING") acc.installationTraining += total;
      if (row.category === "OTHER") acc.otherNrc += total;
      return acc;
    },
    {
      nrcCost: 0,
      customerFacingNrcCost: 0,
      tooling: 0,
      nreLabor: 0,
      capitalAssets: 0,
      installationTraining: 0,
      otherNrc: 0,
    },
  );
}

export function defaultPricingSettings(): PricingSetting[] {
  return [
    { key: "OVERHEAD", label: "Overhead", enabled: true, mode: "FLAT_PERCENT", applyTo: "LABOR", defaultPercent: 25, tiers: [], notes: "" },
    { key: "G_AND_A", label: "G&A", enabled: true, mode: "FLAT_PERCENT", applyTo: "DIRECT_COST", defaultPercent: 10, tiers: [], notes: "" },
    { key: "RISK", label: "Risk / Contingency", enabled: true, mode: "FLAT_PERCENT", applyTo: "DIRECT_COST", defaultPercent: 5, tiers: [], notes: "" },
    { key: "ESCALATION", label: "Escalation / Inflation", enabled: true, mode: "FLAT_PERCENT", applyTo: "MATERIAL", defaultPercent: 3, tiers: [], notes: "" },
    { key: "PROFIT", label: "Profit", enabled: true, mode: "FLAT_PERCENT", applyTo: "TOTAL_COST", defaultPercent: 20, tiers: [], notes: "" },
  ];
}

function settingBase(setting: PricingSetting, rollup: Pick<CostRollup, "materialCost" | "laborCost" | "customerFacingNrcCost" | "adjustments" | "shipping" | "totalCost">) {
  if (setting.applyTo === "MATERIAL") return rollup.materialCost;
  if (setting.applyTo === "LABOR") return rollup.laborCost;
  if (setting.applyTo === "NRC") return rollup.customerFacingNrcCost;
  if (setting.applyTo === "TOTAL_COST") return rollup.totalCost;
  return rollup.materialCost + rollup.laborCost + rollup.customerFacingNrcCost + rollup.adjustments + rollup.shipping;
}

export function calculateSettingAmount(setting: PricingSetting, rollup: Pick<CostRollup, "materialCost" | "laborCost" | "customerFacingNrcCost" | "adjustments" | "shipping" | "totalCost">) {
  if (!setting.enabled || setting.mode === "DISABLED") return 0;
  if (setting.mode === "MANUAL_AMOUNT") return roundCurrency(Number(setting.manualAmount || 0));

  const base = settingBase(setting, rollup);
  const percent = setting.mode === "TIERED_PERCENT"
    ? [...setting.tiers]
        .filter((tier) => base >= Number(tier.minAmount || 0))
        .sort((a, b) => Number(b.minAmount || 0) - Number(a.minAmount || 0))[0]?.percent ?? setting.defaultPercent
    : setting.defaultPercent;
  return roundCurrency(base * (Number(percent || 0) / 100));
}

export function calculateCostRollup(input: {
  materialCost: number;
  laborCost: number;
  nrcRows: NrcCostRow[];
  settings: PricingSetting[];
  breakQty: number;
  adjustments?: number;
  shipping?: number;
}) {
  const nrc = calculateNrcSummary(input.nrcRows, input.breakQty);
  const warnings: string[] = [];
  const rollup: CostRollup = {
    materialCost: roundCurrency(input.materialCost),
    laborCost: roundCurrency(input.laborCost),
    nrcCost: roundCurrency(nrc.nrcCost),
    customerFacingNrcCost: roundCurrency(nrc.customerFacingNrcCost),
    tooling: roundCurrency(nrc.tooling),
    nreLabor: roundCurrency(nrc.nreLabor),
    capitalAssets: roundCurrency(nrc.capitalAssets),
    installationTraining: roundCurrency(nrc.installationTraining),
    otherNrc: roundCurrency(nrc.otherNrc),
    adjustments: roundCurrency(input.adjustments ?? 0),
    shipping: roundCurrency(input.shipping ?? 0),
    overhead: 0,
    gna: 0,
    riskContingency: 0,
    escalationInflation: 0,
    totalCost: 0,
    profit: 0,
    sellPrice: 0,
    marginPercent: 0,
    warnings,
  };

  const disabled = input.settings.filter((setting) => !setting.enabled || setting.mode === "DISABLED");
  disabled.forEach((setting) => warnings.push(`${setting.label} pricing setting is disabled.`));

  const directCost = rollup.materialCost + rollup.laborCost + rollup.customerFacingNrcCost + rollup.adjustments + rollup.shipping;
  rollup.totalCost = roundCurrency(directCost);
  for (const key of ["OVERHEAD", "G_AND_A", "RISK", "ESCALATION"] as const) {
    const setting = input.settings.find((item) => item.key === key);
    const amount = setting ? calculateSettingAmount(setting, rollup) : 0;
    if (key === "OVERHEAD") rollup.overhead = amount;
    if (key === "G_AND_A") rollup.gna = amount;
    if (key === "RISK") rollup.riskContingency = amount;
    if (key === "ESCALATION") rollup.escalationInflation = amount;
    rollup.totalCost = roundCurrency(rollup.totalCost + amount);
  }

  const profitSetting = input.settings.find((item) => item.key === "PROFIT");
  rollup.profit = profitSetting ? calculateSettingAmount(profitSetting, rollup) : 0;
  rollup.sellPrice = roundCurrency(rollup.totalCost + rollup.profit);
  rollup.marginPercent = rollup.sellPrice > 0 ? roundCurrency((rollup.profit / rollup.sellPrice) * 100) : 0;
  return rollup;
}

export function materialCostPerPart(lines: CostModelBomLine[], partId?: string) {
  return roundCurrency(lines
    .filter((line) => !partId || line.rfqPartId === partId)
    .reduce((sum, line) => {
      return sum + Number(line.quantityPerPart || 0) * Number(line.estimatedUnitCost || 0) * (1 + Number(line.scrapPercent || 0) / 100);
    }, 0));
}

export function laborCostPerPart(rows: CostModelProcessRow[], partId: string | undefined, breakQty: number) {
  const applicable = rows.filter((row) => row.rfqPartId === partId);
  const setupCost = applicable.reduce((sum, row) => sum + Number(row.setupHours || 0) * Number(row.hourlyRate || 0), 0);
  const recurringCost = applicable.reduce((sum, row) => sum + Number(row.hoursPerPart || 0) * Number(row.hourlyRate || 0), 0);
  return roundCurrency(recurringCost + (breakQty > 0 ? setupCost / breakQty : 0));
}

export function toolingCostPerPart(rows: CostModelToolingRow[], breakQty: number) {
  return roundCurrency(rows.reduce((sum, row) => {
    const total = Number(row.totalCost ?? 0) || Number(row.quantity || 0) * Number(row.unitCost || 0);
    if (row.pricingTreatment === "BLENDED_UNIT_PRICE") return sum + (breakQty > 0 ? total / breakQty : 0);
    if (row.pricingTreatment === "AMORTIZED") {
      const amortizationQty = Number(row.amortizationQty || 0);
      return sum + (amortizationQty > 0 ? total / amortizationQty : 0);
    }
    return sum;
  }, 0));
}

export function separateToolingTotal(rows: CostModelToolingRow[]) {
  return roundCurrency(rows
    .filter((row) => row.pricingTreatment === "SEPARATE_LINE")
    .reduce((sum, row) => sum + (Number(row.totalCost ?? 0) || Number(row.quantity || 0) * Number(row.unitCost || 0)), 0));
}

export function adjustmentCostPerPart(
  rows: CostModelAdjustmentRow[],
  partId: string | undefined,
  breakQty: number,
  material: number,
  labor: number,
) {
  return roundCurrency(rows
    .filter((row) => row.includeInCustomerPrice && row.pricingMode !== "INTERNAL_ONLY")
    .filter((row) => row.appliesToScope === "RFQ" || (row.appliesToScope === "PART" && row.rfqPartId === partId))
    .reduce((sum, row) => {
      if (row.pricingMode === "FLAT") return sum + (breakQty > 0 ? Number(row.amount || 0) / breakQty : 0);
      if (row.pricingMode === "PER_PART") return sum + Number(row.amount || 0);
      if (row.pricingMode === "PERCENT_OF_MATERIAL") return sum + material * (Number(row.percentValue || 0) / 100);
      if (row.pricingMode === "PERCENT_OF_LABOR") return sum + labor * (Number(row.percentValue || 0) / 100);
      return sum;
    }, 0));
}

export function shippingCostPerPart(rows: CostModelShippingRow[], partId: string | undefined, breakQty: number) {
  return roundCurrency(rows
    .filter((row) => row.includeInCustomerPrice && row.shippingMode !== "INTERNAL_ONLY")
    .filter((row) => !row.rfqPartId || row.rfqPartId === partId)
    .reduce((sum, row) => {
      if (row.shippingMode === "PER_PART") return sum + Number(row.amount || 0);
      if (row.shippingMode === "PER_PO") return sum + (breakQty > 0 ? Number(row.amount || 0) / breakQty : 0);
      return sum;
    }, 0));
}

export function validationMessages(input: {
  bomLines: CostModelBomLine[];
  processRows: CostModelProcessRow[];
  nrcRows: NrcCostRow[];
  settings: PricingSetting[];
}) {
  const messages: string[] = [];
  if (input.bomLines.some((line) => Number(line.quantityPerPart || 0) > 0 && Number(line.estimatedUnitCost || 0) <= 0)) {
    messages.push("One or more BOM rows are missing unit cost.");
  }
  if (input.processRows.some((row) => (Number(row.setupHours || 0) > 0 || Number(row.hoursPerPart || 0) > 0) && Number(row.hourlyRate || 0) <= 0)) {
    messages.push("One or more labor rows are missing labor rate.");
  }
  if (input.nrcRows.some((row) => Number(row.quantity || 0) > 0 && Number(row.unitCost || 0) <= 0)) {
    messages.push("One or more NRC rows are missing unit cost.");
  }
  if (input.nrcRows.some((row) => row.amortized && Number(row.amortizationQty || 0) <= 0)) {
    messages.push("One or more amortized NRC rows are missing amortization quantity.");
  }
  input.settings
    .filter((setting) => !setting.enabled || setting.mode === "DISABLED")
    .forEach((setting) => messages.push(`${setting.label} pricing setting is disabled.`));
  return messages;
}
