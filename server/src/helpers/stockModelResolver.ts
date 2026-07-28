export interface StockModelRecord {
  id: string;
  name: string;
  displayName: string;
}

export interface ResolvedStockModel {
  id: string;
  name: string;
  displayName: string;
  canonicalKey: string;
}

const APPROVED_ALIASES: Record<string, string[]> = {
  adjustable_gladius: [
    'adj_amor',
    'adj_gladius',
    'adjustable_amor',
    'cf_adj_armor',
    'cf_adj_gladius',
    'fg_adj_armor',
    'fg_adj_gladius',
  ],
  adjustable_alpine_hunter: [
    'adj_alpine_hunter',
    'adj_alpine',
    'cf_adj_alp_hunter',
    'cf_adj_alpine_hunter',
    'cf_adj_alpine',
    'fg_adj_alp_hunter',
    'fg_adj_alpine_hunter',
    'fg_adj_alpine',
  ],
  alpine_hunter: ['cf_alpine_hunter', 'fg_alpine_hunter'],
};

export function normalizeStockModelReference(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function approvedAliasKey(value: string): string | null {
  const normalized = normalizeStockModelReference(value);
  for (const [canonical, aliases] of Object.entries(APPROVED_ALIASES)) {
    if (canonical === normalized || aliases.includes(normalized)) return canonical;
  }
  return null;
}

export class StockModelResolver {
  private readonly models: ResolvedStockModel[];
  private readonly byId = new Map<string, ResolvedStockModel>();
  private readonly byName = new Map<string, ResolvedStockModel[]>();
  private readonly byDisplayName = new Map<string, ResolvedStockModel[]>();
  private readonly byAlias = new Map<string, ResolvedStockModel[]>();

  constructor(records: StockModelRecord[]) {
    this.models = records.map(record => ({
      id: String(record.id),
      name: record.name,
      displayName: record.displayName,
      canonicalKey: normalizeStockModelReference(record.name),
    }));

    for (const model of this.models) {
      this.byId.set(model.id.trim().toLowerCase(), model);
      this.add(this.byName, model.canonicalKey, model);
      this.add(this.byDisplayName, normalizeStockModelReference(model.displayName), model);
      const alias = approvedAliasKey(model.name);
      if (alias) this.add(this.byAlias, alias, model);
    }
  }

  resolve(reference: unknown): ResolvedStockModel | null {
    const original = String(reference ?? '').trim();
    if (!original) return null;

    const idMatch = this.byId.get(original.toLowerCase());
    if (idMatch) return idMatch;

    const normalized = normalizeStockModelReference(original);
    return (
      this.unique(this.byName.get(normalized)) ??
      this.unique(this.byAlias.get(approvedAliasKey(normalized) ?? '')) ??
      this.unique(this.byDisplayName.get(normalized))
    );
  }

  areCompatible(left: ResolvedStockModel, right: ResolvedStockModel): boolean {
    if (left.id === right.id) return true;
    if (left.canonicalKey === right.canonicalKey) return true;

    const leftAlias = approvedAliasKey(left.name);
    const rightAlias = approvedAliasKey(right.name);
    if (leftAlias && leftAlias === rightAlias) return true;

    return (
      normalizeStockModelReference(left.displayName) ===
      normalizeStockModelReference(right.displayName)
    );
  }

  private add(
    map: Map<string, ResolvedStockModel[]>,
    key: string,
    model: ResolvedStockModel,
  ): void {
    const matches = map.get(key) ?? [];
    if (!matches.some(match => match.id === model.id)) matches.push(model);
    map.set(key, matches);
  }

  private unique(matches: ResolvedStockModel[] | undefined): ResolvedStockModel | null {
    return matches?.length === 1 ? matches[0] : null;
  }
}

export function firstStockModelReference(
  candidates: Array<{ source: string; value: unknown }>,
): { source: string; value: string } | null {
  for (const candidate of candidates) {
    const value = String(candidate.value ?? '').trim();
    if (value) return { source: candidate.source, value };
  }
  return null;
}
