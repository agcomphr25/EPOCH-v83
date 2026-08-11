import { createHash } from 'crypto';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  return value;
}

export function demandPlanningChecksum(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function addDemandIdentities(
  nodes: Array<Record<string, unknown>>,
  scope: { projectId: string; poId: number },
  parentDemandIdentity: string | null = null
): Array<Record<string, unknown>> {
  return nodes.map((node) => {
    const demandIdentity = demandPlanningChecksum([
      scope.projectId,
      scope.poId,
      node.path,
      node.partNumber,
      node.revision,
      node.classification,
      node.bomRevisionId,
      node.routingId,
      node.routingRevision,
      node.requiredByDate,
    ]);
    return {
      ...node,
      demandIdentity,
      parentDemandIdentity,
      children: addDemandIdentities(
        (node.children as Array<Record<string, unknown>>) ?? [],
        scope,
        demandIdentity
      ),
    };
  });
}
