export interface DerivedOrderLabels {
  materialLabel: string;
  actionLabel: string;
  actionLengthRaw: string;
  modelBadgeLabel: string | null;
  isTikka: boolean;
  debugReasons: string[];
}

const STOCK_MODEL_ACTION_MAP: Record<string, string> = {
  cf_alpine_hunter: 'short',
  fg_alpine_hunter: 'short',
  cf_privateer: 'short',
  fg_privateer: 'short',
  cf_sportsman: 'short',
  fg_sportsman: 'short',
  cf_armor: 'short',
  fg_armor: 'short',
  cf_chalk_branch: 'short',
  fg_chalk_branch: 'short',
  cf_adj_chalk_branch: 'short',
  cf_adj_alp_hunter: 'short',
  fg_adj_alp_hunter: 'short',
  cf_adj_armor: 'short',
  fg_adj_armor: 'short',
  cf_visigoth: 'long',
  fg_visigoth: 'long',
  cf_k2: 'long',
  fg_k2: 'long',
  cf_adj_k2: 'long',
  fg_adj_k2: 'long',
  cf_ferrata: 'short',
  fg_ferrata: 'short',
  cf_cat: 'short',
  fg_cat: 'short',
  cf_cat_lh: 'short',
  fg_cat_lh: 'short',
  apr_hunter: 'short',
  apr_hunter_lh: 'short',
  apr_hunter_rh: 'short',
  m1a_carbon: 'medium',
  m1a_fiberglass: 'medium',
  mesa_universal: 'short',
  mesa_adjustable: 'short',
  mesa_tikka: 'short',
  alpine_hunter_tikka: 'short',
  alpine_hunter_tikka_fg: 'short',
  cf_adj_alp_hunter_tikka: 'short',
  fg_adj_alp_hunter_tikka: 'short',
  cf_visigoth_tikka: 'long',
  fg_visigoth_tikka: 'long',
  'privateer-tikka': 'short',
  'privateer-tikka_fg': 'short',
  cf_cat_rh: 'short',
  fg_cat_rh: 'short',
};

const MATERIAL_PREFIX_MAP: Record<string, string> = {
  cf_: 'Carbon Fiber',
  fg_: 'Fiberglass',
  m1a_: 'M1A',
  apr_: 'APR',
  mesa_: 'Fiberglass',
};

function deriveMaterial(order: any, debugReasons: string[]): string {
  const features = order.features || {};

  if (features.material) {
    debugReasons.push(`material from features.material: "${features.material}"`);
    return normalizeMaterialLabel(features.material);
  }
  if (features.material_type) {
    debugReasons.push(`material from features.material_type: "${features.material_type}"`);
    return normalizeMaterialLabel(features.material_type);
  }
  if (order.material) {
    debugReasons.push(`material from order.material: "${order.material}"`);
    return normalizeMaterialLabel(order.material);
  }

  const parsedSpecs = order.parsedSpecs || order.specifications;
  if (parsedSpecs && typeof parsedSpecs === 'object') {
    const specMaterial = parsedSpecs.material || parsedSpecs.materialType || parsedSpecs.stockMaterial;
    if (specMaterial) {
      debugReasons.push(`material from parsedSpecs: "${specMaterial}"`);
      return normalizeMaterialLabel(specMaterial);
    }
  }

  const modelId = order.modelId || '';
  const displayName = order.product || order.itemName || '';

  for (const [prefix, label] of Object.entries(MATERIAL_PREFIX_MAP)) {
    if (modelId.startsWith(prefix)) {
      debugReasons.push(`material inferred from modelId prefix "${prefix}": "${modelId}"`);
      return label;
    }
  }

  const lowerModelId = modelId.toLowerCase();

  // Tikka variants: FG ones end with _fg, all others (non-Mesa) are Carbon Fiber
  if (lowerModelId.includes('tikka')) {
    if (lowerModelId.endsWith('_fg') || lowerModelId.includes('_fg_')) {
      debugReasons.push(`material inferred from tikka model with _fg suffix: "${modelId}"`);
      return 'Fiberglass';
    }
    if (!lowerModelId.startsWith('mesa_')) {
      debugReasons.push(`material inferred from bare tikka model (non-mesa, non-fg) → Carbon Fiber: "${modelId}"`);
      return 'Carbon Fiber';
    }
  }

  // Do NOT return 'Tikka' as a material — Tikka is a platform/variant, not a fabric type.

  if (displayName) {
    const dn = displayName.toLowerCase();
    if (dn.includes('m1a')) {
      debugReasons.push(`material inferred from displayName containing "m1a": "${displayName}"`);
      return 'M1A';
    }
    if (dn.includes('apr')) {
      debugReasons.push(`material inferred from displayName containing "apr": "${displayName}"`);
      return 'APR';
    }
    if (dn.startsWith('cf ') || dn.includes('carbon')) {
      debugReasons.push(`material inferred from displayName containing "cf/carbon": "${displayName}"`);
      return 'Carbon Fiber';
    }
    if (dn.startsWith('fg ') || dn.includes('fiberglass')) {
      debugReasons.push(`material inferred from displayName containing "fg/fiberglass": "${displayName}"`);
      return 'Fiberglass';
    }
  }

  debugReasons.push(`material fallback to "Standard" — modelId: "${modelId}", displayName: "${displayName}"`);
  return 'Standard';
}

function normalizeMaterialLabel(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower === 'carbon fiber' || lower === 'carbon' || lower === 'cf') return 'Carbon Fiber';
  if (lower === 'fiberglass' || lower === 'fg') return 'Fiberglass';
  if (lower === 'm1a') return 'M1A';
  if (lower === 'apr') return 'APR';
  return raw;
}

const VALID_ACTION_LENGTHS = ['short', 'medium', 'long'] as const;

function normalizeActionLength(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_ACTION_LENGTHS.includes(lower as any)) return lower;
  if (lower === 'sa' || lower === 'short action') return 'short';
  if (lower === 'la' || lower === 'long action') return 'long';
  if (lower === 'med' || lower === 'medium action') return 'medium';
  return 'unknown';
}

function deriveActionLength(order: any, debugReasons: string[]): string {
  const features = order.features || {};

  const fromFeatures = features.action_length || features.actionLength;
  if (fromFeatures) {
    const normalized = normalizeActionLength(fromFeatures);
    debugReasons.push(`actionLength from features: "${fromFeatures}" -> "${normalized}"`);
    return normalized;
  }

  if (order.actionLength) {
    const normalized = normalizeActionLength(order.actionLength);
    debugReasons.push(`actionLength from order.actionLength: "${order.actionLength}" -> "${normalized}"`);
    return normalized;
  }

  const parsedSpecs = order.parsedSpecs || order.specifications;
  if (parsedSpecs && typeof parsedSpecs === 'object') {
    const specAction = parsedSpecs.action_length || parsedSpecs.actionLength;
    if (specAction) {
      const normalized = normalizeActionLength(specAction);
      debugReasons.push(`actionLength from parsedSpecs: "${specAction}" -> "${normalized}"`);
      return normalized;
    }
  }

  const modelId = order.modelId || '';
  if (modelId && STOCK_MODEL_ACTION_MAP[modelId]) {
    debugReasons.push(`actionLength inferred from stockModelActionMap for "${modelId}": "${STOCK_MODEL_ACTION_MAP[modelId]}"`);
    return STOCK_MODEL_ACTION_MAP[modelId];
  }

  const displayName = order.product || order.itemName || '';
  if (displayName) {
    const dn = displayName.toLowerCase();
    for (const [smId, actionLen] of Object.entries(STOCK_MODEL_ACTION_MAP)) {
      const smName = smId.replace(/_/g, ' ').replace(/-/g, ' ');
      if (dn.includes(smName)) {
        debugReasons.push(`actionLength inferred from displayName match "${smName}": "${actionLen}"`);
        return actionLen;
      }
    }
  }

  debugReasons.push(`actionLength fallback to "unknown" — modelId: "${modelId}", displayName: "${displayName}"`);
  return 'unknown';
}

function deriveTikka(order: any, debugReasons: string[]): boolean {
  if (order.tikkaOption) {
    debugReasons.push('tikka from order.tikkaOption');
    return true;
  }

  const modelId = (order.modelId || '').toLowerCase();
  if (modelId.includes('tikka')) {
    debugReasons.push(`tikka from modelId containing "tikka": "${modelId}"`);
    return true;
  }

  const displayName = (order.product || order.itemName || '').toLowerCase();
  if (displayName.includes('tikka')) {
    debugReasons.push(`tikka from displayName containing "tikka": "${displayName}"`);
    return true;
  }

  const features = order.features || {};
  const actionInlet = (features.action_inlet || '').toLowerCase();
  if (actionInlet.includes('tikka')) {
    debugReasons.push(`tikka from features.action_inlet containing "tikka": "${actionInlet}"`);
    return true;
  }

  const parsedSpecs = order.parsedSpecs || order.specifications;
  if (parsedSpecs && typeof parsedSpecs === 'object') {
    const fields = [parsedSpecs.inlet, parsedSpecs.platform, parsedSpecs.action, parsedSpecs.receiver];
    for (const field of fields) {
      if (field && typeof field === 'string' && field.toLowerCase().includes('tikka')) {
        debugReasons.push(`tikka from parsedSpecs field containing "tikka": "${field}"`);
        return true;
      }
    }
  }

  return false;
}

function deriveModelBadge(order: any, isTikka: boolean, debugReasons: string[]): string | null {
  if (isTikka) return 'Tikka';

  const modelId = (order.modelId || '').toLowerCase();
  const displayName = (order.product || order.itemName || '').toLowerCase();

  if (modelId.includes('m1a') || displayName.includes('m1a')) return 'M1A';
  if (modelId.includes('apr') || displayName.includes('apr')) return 'APR';
  if (modelId.includes('cat') || displayName.includes(' cat')) return 'CAT';

  return null;
}

export function deriveOrderLabels(order: any): DerivedOrderLabels {
  const debugReasons: string[] = [];

  const materialLabel = deriveMaterial(order, debugReasons);
  const actionLengthRaw = deriveActionLength(order, debugReasons);
  const isTikka = deriveTikka(order, debugReasons);
  const modelBadgeLabel = deriveModelBadge(order, isTikka, debugReasons);

  const actionLabel =
    actionLengthRaw === 'short'
      ? 'Short Action'
      : actionLengthRaw === 'medium'
        ? 'Medium Action'
        : actionLengthRaw === 'long'
          ? 'Long Action'
          : 'Unknown Action';

  return {
    materialLabel,
    actionLabel,
    actionLengthRaw,
    modelBadgeLabel,
    isTikka,
    debugReasons,
  };
}

export function logBarcodeDebug(orders: any[]) {
  console.log(`[BARCODE_DEBUG] Deriving labels for ${orders.length} orders in Barcode queue:`);
  for (const order of orders) {
    const labels = deriveOrderLabels(order);
    console.log(`[BARCODE_DEBUG] orderId=${order.orderId} modelId=${order.modelId || 'null'} => material="${labels.materialLabel}" action="${labels.actionLabel}" tikka=${labels.isTikka} reasons=[${labels.debugReasons.join(' | ')}]`);
  }
}
