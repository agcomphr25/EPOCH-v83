export const DEPARTMENT_QUEUE_ROUTES: Record<string, string> = {
  'barcode': '/department-queue/barcode',
  'cnc': '/department-queue/cnc',
  'finish': '/department-queue/finish',
  'finish qc': '/department-queue/finish-qc',
  'gunsmith': '/department-queue/gunsmith',
  'paint': '/department-queue/paint',
  'shipping qc': '/department-queue/qc-shipping',
  'qc shipping': '/department-queue/qc-shipping',
  'shipping': '/department-queue/shipping',
  'layup plugging': '/department-queue/layup-plugging',
  'layup-plugging': '/department-queue/layup-plugging',
  'production queue': '/department-queue/production-queue',
  'p1 production queue': '/department-queue/production-queue',
};

export function getDepartmentQueueUrl(department: string | null | undefined, orderId: string): string {
  if (!department) return `/admin/locate-order?search=${encodeURIComponent(orderId)}`;
  const route = DEPARTMENT_QUEUE_ROUTES[department.toLowerCase().trim()];
  if (route) return `${route}?highlight=${encodeURIComponent(orderId)}`;
  return `/admin/locate-order?search=${encodeURIComponent(orderId)}`;
}
