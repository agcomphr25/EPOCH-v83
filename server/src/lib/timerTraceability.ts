export function isOvenCureDepartmentName(departmentName?: string | null): boolean {
  const department = (departmentName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return /(^| )(oven|cure|curing)( |$)/.test(department);
}

export function isRoutingConnectedOvenCureRun(run: {
  departmentName?: string | null;
  travelerId?: string | null;
  travelerStepId?: string | null;
  travelerTaskId?: string | null;
}): boolean {
  if (!run.travelerId && !run.travelerStepId && !run.travelerTaskId) return false;

  return isOvenCureDepartmentName(run.departmentName);
}
