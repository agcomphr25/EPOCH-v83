import { pool } from '../../db';

type ProductionSystem = 'P1' | 'P2' | null;

const resolveProductionSystem = (
  row: Record<string, unknown>
): ProductionSystem => {
  if (row.utilized_in_pl1 === true && row.utilized_in_pl2 !== true) return 'P1';
  if (row.utilized_in_pl2 === true && row.utilized_in_pl1 !== true) return 'P2';
  return null;
};

const classificationBlocker = (row: Record<string, unknown>) => {
  if (row.utilized_in_pl1 === true && row.utilized_in_pl2 === true)
    return 'Production system is ambiguous: this part is assigned to both P1 and P2.';
  return 'Production system is missing: assign this manufactured part to P1 or P2.';
};

export async function listActiveManufacturedStockBuildParts() {
  const result = await pool.query(
    `SELECT i.id,i.ag_part_number,i.name,i.description,i.manufactured_category,
            i.manufacturing_level,i.default_department_id,i.utilized_in_pl1,
            i.utilized_in_pl2,d.name AS default_department_name,
            COALESCE((SELECT sum(COALESCE(ib.quantity_available,0))
                      FROM inventory_balances ib
                      WHERE ib.ag_part_number=i.ag_part_number),0) AS available_quantity,
            COALESCE((SELECT count(*) FROM boms b
                      JOIN bom_revisions br ON br.bom_id=b.id
                      WHERE (b.parent_inventory_item_id=i.id OR b.parent_part_ag_number=i.ag_part_number)
                        AND b.is_active=true AND br.is_released=true
                        AND COALESCE(br.lifecycle_status,'RELEASED')='RELEASED'
                        AND (br.effective_from IS NULL OR br.effective_from<=now())
                        AND (br.effective_to IS NULL OR br.effective_to>now())),0)::int AS released_bom_count,
            COALESCE((SELECT count(*) FROM part_routings pr
                      WHERE pr.is_active=true AND pr.project_id IS NULL
                        AND (pr.inventory_item_fk=i.id OR pr.inventory_item_id=i.id::text
                             OR lower(pr.part_number)=lower(i.ag_part_number))),0)::int AS active_routing_count,
            COALESCE((SELECT count(*) FROM inventory_item_traceability_policies tp
                      WHERE tp.inventory_item_id=i.id AND tp.status='RELEASED'
                        AND (tp.effective_from IS NULL OR tp.effective_from<=now())
                        AND (tp.effective_to IS NULL OR tp.effective_to>now())),0)::int AS released_traceability_policy_count
       FROM inventory_items i
       LEFT JOIN inventory_departments d ON d.id=i.default_department_id
      WHERE i.is_active=true AND i.item_type='MANUFACTURED'
      ORDER BY i.ag_part_number,i.name`
  );

  return result.rows.map((row) => {
    const productionSystem = resolveProductionSystem(row);
    const blockers: string[] = [];
    if (!productionSystem) blockers.push(classificationBlocker(row));
    if (!row.default_department_id)
      blockers.push('A default manufacturing department is required.');
    if (Number(row.released_bom_count) !== 1)
      blockers.push(
        Number(row.released_bom_count) === 0
          ? 'A released effective BOM is required.'
          : 'More than one released effective BOM is available; revision authority is ambiguous.'
      );
    if (Number(row.active_routing_count) !== 1)
      blockers.push(
        Number(row.active_routing_count) === 0
          ? 'An active stock routing is required.'
          : 'More than one active stock routing is available; routing authority is ambiguous.'
      );
    if (Number(row.released_traceability_policy_count) !== 1)
      blockers.push(
        Number(row.released_traceability_policy_count) === 0
          ? 'A released traceability or approved no-traceability policy is required.'
          : 'More than one released traceability policy is effective.'
      );
    return {
      id: Number(row.id),
      agPartNumber: row.ag_part_number,
      name: row.name,
      description: row.description,
      manufacturedCategory: row.manufactured_category,
      manufacturingLevel: row.manufacturing_level,
      productionSystem,
      defaultDepartmentId: row.default_department_id,
      defaultDepartmentName: row.default_department_name,
      availableQuantity: Number(row.available_quantity),
      releasedBomCount: Number(row.released_bom_count),
      activeRoutingCount: Number(row.active_routing_count),
      releasedTraceabilityPolicyCount: Number(
        row.released_traceability_policy_count
      ),
      readyForStockBuildPreview: blockers.length === 0,
      blockers,
    };
  });
}
