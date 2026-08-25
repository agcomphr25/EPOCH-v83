const clean = (value: unknown) => String(value ?? '').trim();

export function evaluateWadTravelerCoverage(
  manufacturedItems: Array<Record<string, unknown>>,
  decisions: Array<Record<string, unknown>>
) {
  const expected = manufacturedItems.filter(
    (item) => item.is_manufactured === true
  );
  const key = (itemId: unknown, path: unknown) =>
    `${String(itemId)}::${clean(path)}`;
  const expectedKeys = new Set(
    expected.map((item) => key(item.inventory_item_id, item.assembly_path))
  );
  const byIdentity = new Map<string, Array<Record<string, unknown>>>();
  for (const decision of decisions) {
    const identity = key(
      decision.inventory_item_id,
      decision.assembly_path_identity
    );
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), decision]);
  }
  const blockers: string[] = [];
  for (const item of expected) {
    const identity = key(item.inventory_item_id, item.assembly_path);
    const matches = byIdentity.get(identity) ?? [];
    if (matches.length !== 1) {
      blockers.push(
        `${identity}: exactly one traveler decision is required; found ${matches.length}.`
      );
      continue;
    }
    const decision = matches[0];
    const required = Number(item.extended_project_quantity);
    if (decision.status !== 'VALIDATED')
      blockers.push(`${identity}: traveler decision is not validated.`);
    if (Number(decision.required_quantity) !== required)
      blockers.push(
        `${identity}: traveler decision quantity does not match released demand ${required}.`
      );
    if (
      decision.traveler_type === 'BATCH' &&
      (Number(decision.batch_approved_quantity) < required ||
        !clean(decision.batch_coverage_scope))
    )
      blockers.push(
        `${identity}: approved batch coverage does not cover released demand ${required}.`
      );
  }
  for (const identity of Array.from(byIdentity.keys()))
    if (!expectedKeys.has(identity))
      blockers.push(
        `${identity}: traveler decision is outside the released manufactured-demand set.`
      );
  return blockers;
}
