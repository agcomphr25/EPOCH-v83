export class InsightSuppressor {
  private lastSeen: Map<string, number>;
  private dismissed: Set<string>;
  private cooldownMs: number;

  constructor(cooldownMs = 86400000) {
    this.lastSeen = new Map();
    this.dismissed = new Set();
    this.cooldownMs = cooldownMs;
  }

  private _key(entityId: string, patternType: string): string {
    return `${entityId}::${patternType}`;
  }

  shouldSuppress(entityId: string, patternType: string): boolean {
    const key = this._key(entityId, patternType);
    const last = this.lastSeen.get(key);
    const now = Date.now();

    if (this.dismissed.has(key)) return true;
    if (last && now - last < this.cooldownMs) return true;

    this.lastSeen.set(key, now);
    return false;
  }

  dismiss(entityId: string, patternType: string): void {
    this.dismissed.add(this._key(entityId, patternType));
  }

  undismiss(entityId: string, patternType: string): void {
    this.dismissed.delete(this._key(entityId, patternType));
  }

  clearAll(): void {
    this.lastSeen.clear();
    this.dismissed.clear();
  }
}
