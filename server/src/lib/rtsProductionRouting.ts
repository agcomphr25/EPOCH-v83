export const RTS_DEPARTMENT_FLOW = [
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
] as const;

export function getNextRtsDepartment(lastDepartment: string | null | undefined): string | null {
  const lastDepartmentIndex = (RTS_DEPARTMENT_FLOW as readonly string[])
    .indexOf(lastDepartment || '');

  return lastDepartmentIndex >= 0 && lastDepartmentIndex < RTS_DEPARTMENT_FLOW.length - 1
    ? RTS_DEPARTMENT_FLOW[lastDepartmentIndex + 1]
    : null;
}
