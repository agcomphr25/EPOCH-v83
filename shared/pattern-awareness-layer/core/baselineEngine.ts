const defaultWindowSize = 10;

interface DataPoint {
  timestamp: number;
  value: number;
}

export interface BaselineSummary {
  mean: number;
  variance: number;
  count: number;
}

export class BaselineEngine {
  private windowSize: number;
  private history: Map<string, DataPoint[]>;

  constructor(windowSize = defaultWindowSize) {
    this.windowSize = windowSize;
    this.history = new Map();
  }

  addEvent(entityId: string, value: number, timestamp = Date.now()): void {
    if (!this.history.has(entityId)) {
      this.history.set(entityId, []);
    }

    const data = this.history.get(entityId)!;
    data.push({ timestamp, value });

    if (data.length > this.windowSize) {
      data.shift();
    }
  }

  getBaseline(entityId: string): BaselineSummary {
    const data = this.history.get(entityId) || [];
    const values = data.map(d => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length || 1);

    return { mean, variance, count: values.length };
  }

  clearEntity(entityId: string): void {
    this.history.delete(entityId);
  }

  clearAll(): void {
    this.history.clear();
  }
}
