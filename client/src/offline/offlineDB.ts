import Dexie, { type Table } from 'dexie';

export type MutationStatus = 'pending' | 'synced' | 'failed';

export interface OfflineMutation {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  idempotencyKey: string;
  status: MutationStatus;
}

class EpochOfflineDB extends Dexie {
  mutationQueue!: Table<OfflineMutation, string>;

  constructor() {
    super('epochOfflineDB');
    this.version(1).stores({
      mutation_queue: 'id, eventType, status, createdAt, idempotencyKey',
    });
    this.mutationQueue = this.table('mutation_queue');
  }
}

export const db = new EpochOfflineDB();
