export class StabilityGate {
  private windowSize: number;
  private requiredMatches: number;
  private matchHistory: Map<string, boolean[]>;

  constructor(requiredMatches = 3, windowSize = 5) {
    this.windowSize = windowSize;
    this.requiredMatches = requiredMatches;
    this.matchHistory = new Map();
  }

  record(entityId: string, match: boolean): boolean {
    if (!this.matchHistory.has(entityId)) {
      this.matchHistory.set(entityId, []);
    }

    const history = this.matchHistory.get(entityId)!;
    history.push(match);
    if (history.length > this.windowSize) {
      history.shift();
    }

    const count = history.filter(Boolean).length;
    return count >= this.requiredMatches;
  }

  clearEntity(entityId: string): void {
    this.matchHistory.delete(entityId);
  }

  clearAll(): void {
    this.matchHistory.clear();
  }
}
