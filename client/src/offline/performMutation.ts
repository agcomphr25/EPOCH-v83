import { apiRequest, generateIdempotencyKey } from '@/lib/queryClient';
import { queueMutation } from './mutationQueue';

export type OfflineEventType =
  | 'MOVE_ORDER'
  | 'COMPLETE_OPERATION'
  | 'QC_PASS'
  | 'SHIP_PACKAGE'
  | 'CLOCK_IN'
  | 'CLOCK_OUT';

interface ApiConfig {
  url: string;
  method: string;
  body?: unknown;
}

function resolveApiConfig(eventType: OfflineEventType, payload: Record<string, unknown>): ApiConfig {
  switch (eventType) {
    case 'MOVE_ORDER':
      return {
        url: `/api/orders/${payload.orderId}/progress`,
        method: 'POST',
        body: { nextDepartment: payload.nextDepartment },
      };
    case 'COMPLETE_OPERATION':
      return {
        url: `/api/travelers/${payload.travelerId}/tasks/${payload.taskId}/complete`,
        method: 'POST',
        body: payload.data ?? {},
      };
    case 'QC_PASS':
      return {
        url: `/api/orders/${payload.orderId}/progress`,
        method: 'POST',
        body: { nextDepartment: payload.nextDepartment },
      };
    case 'SHIP_PACKAGE':
      return {
        url: `/api/po-orders/progress-to-shipping`,
        method: 'POST',
        body: { orderIds: payload.orderIds },
      };
    case 'CLOCK_IN':
      return {
        url: '/api/timeclock',
        method: 'POST',
        body: { employeeId: payload.employeeId, action: 'IN', timestamp: payload.timestamp },
      };
    case 'CLOCK_OUT':
      return {
        url: '/api/timeclock',
        method: 'POST',
        body: { employeeId: payload.employeeId, action: 'OUT', timestamp: payload.timestamp },
      };
    default:
      throw new Error(`[EPOCH] Unknown offline event type: ${eventType}`);
  }
}

interface PerformMutationOptions {
  onOfflineOptimistic?: () => void;
}

export async function performMutation(
  eventType: OfflineEventType,
  payload: Record<string, unknown>,
  options?: PerformMutationOptions,
): Promise<any> {
  const idempotencyKey = generateIdempotencyKey();

  if (navigator.onLine) {
    try {
      const config = resolveApiConfig(eventType, payload);
      const result = await apiRequest(config.url, {
        method: config.method,
        body: config.body ? JSON.stringify(config.body) : undefined,
        idempotencyKey,
      });
      console.info(`[EPOCH] Mutation executed online: ${eventType}`);
      return result;
    } catch (error) {
      if (!navigator.onLine) {
        console.info(`[EPOCH] Connection lost during mutation, queuing: ${eventType}`);
        await queueMutation(eventType, payload, idempotencyKey);
        options?.onOfflineOptimistic?.();
        return { queued: true, eventType };
      }
      throw error;
    }
  }

  console.info(`[EPOCH] Offline — queuing mutation: ${eventType}`);
  await queueMutation(eventType, payload, idempotencyKey);
  options?.onOfflineOptimistic?.();
  return { queued: true, eventType };
}
