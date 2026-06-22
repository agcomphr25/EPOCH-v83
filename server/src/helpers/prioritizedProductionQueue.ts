import { computeEffectivePriority } from '../../../shared/utils/computeEffectivePriority';

function normalizeProductionOrderFeatures(features: any): any {
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    return features || {};
  }

  return {
    ...features,
    action_length: features.action_length ?? features.actionLength,
    bottom_metal: features.bottom_metal ?? features.bottomMetal,
    length_of_pull: features.length_of_pull ?? features.lengthOfPull,
    other_options: features.other_options ?? features.otherOptions,
  };
}

export function mapPrioritizedQueueRow(order: any, index: number) {
  const dueDate = new Date(order.duedate || order.orderdate);
  const daysToDue = Math.floor(
    (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  let urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
  if (order.ismanualurgency && order.urgency) {
    urgencyLevel = order.urgency === 'critical' ? 'critical'
      : order.urgency === 'high' ? 'high'
      : order.urgency === 'medium' ? 'medium'
      : 'normal';
  } else {
    urgencyLevel = daysToDue < 0 ? 'critical'
      : daysToDue <= 7 ? 'high'
      : daysToDue <= 14 ? 'medium'
      : 'normal';
  }

  const priorityResult = computeEffectivePriority({
    dueDate: order.duedate,
    urgency: order.urgency,
    isManualUrgency: order.ismanualurgency,
    manualPriorityOverride: order.manual_priority_override,
  });

  return {
    orderId: order.orderid,
    fbOrderNumber: order.fbordernumber,
    modelId: order.modelid,
    stockModelId: order.stockmodelid || order.modelid,
    dueDate: order.duedate,
    orderDate: order.orderdate,
    currentDepartment: order.currentdepartment,
    status: order.status,
    customerId: order.customerid,
    customerName: order.customername,
    features: normalizeProductionOrderFeatures(order.features),
    priorityScore: priorityResult.score,
    prioritySource: priorityResult.source,
    priorityReason: priorityResult.reason,
    urgency: order.urgency,
    isManualUrgency: order.ismanualurgency,
    queuePosition: index + 1,
    daysToDue,
    isOverdue: daysToDue < 0,
    urgencyLevel,
    orderSource: order.ordersource || 'SALES',
    poNumber: order.ponumber || null,
    poItemId: order.poitemid || null,
  };
}
