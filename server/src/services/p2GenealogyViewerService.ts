import { pool } from '../../db';

export class P2GenealogyViewerError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const normalize = (value: string) => value.trim();

export async function searchP2Genealogy(rawQuery: string) {
  const query = normalize(rawQuery);
  if (query.length < 2 || query.length > 200)
    throw new P2GenealogyViewerError(
      'INVALID_GENEALOGY_SEARCH',
      'Search text must contain between 2 and 200 characters.'
    );

  const seeds = await pool.query(
    `SELECT o.id,o.work_order_authority_id,o.project_id,o.inventory_item_id,o.output_identity,
            o.output_quantity,o.assembly_path_identity,o.part_number_snapshot,o.traceability_snapshot,
            o.status,o.authority_checksum,o.created_at,o.released_at,w.production_work_order_id,w.traveler_id
       FROM p2_manufactured_output_authorities o
       JOIN p2_manufacturing_work_order_authorities w ON w.id=o.work_order_authority_id
      WHERE o.id::text=$1 OR o.project_id::text=$1 OR o.work_order_authority_id::text=$1
         OR COALESCE(w.production_work_order_id::text,'')=$1 OR COALESCE(w.traveler_id::text,'')=$1
         OR lower(o.output_identity)=lower($1)
         OR lower(o.part_number_snapshot) LIKE lower('%'||$1||'%')
         OR lower(o.assembly_path_identity) LIKE lower('%'||$1||'%')
      ORDER BY o.created_at DESC LIMIT 101`,
    [query]
  );

  if (!seeds.rows.length)
    return {
      query,
      generatedAt: new Date().toISOString(),
      outputs: [],
      componentEdges: [],
      materialEdges: [],
      summary: { outputs: 0, componentEdges: 0, materialEdges: 0 },
    };
  if (seeds.rows.length > 100)
    throw new P2GenealogyViewerError(
      'GENEALOGY_SEARCH_TOO_BROAD',
      'Search matched more than 100 authoritative outputs. Use a more specific identity.'
    );

  const projectIds = Array.from(
    new Set(seeds.rows.map((row) => row.project_id))
  );
  const outputs = await pool.query(
    `SELECT o.id,o.work_order_authority_id,o.project_id,o.inventory_item_id,o.output_identity,
            o.output_quantity,o.assembly_path_identity,o.part_number_snapshot,o.traceability_snapshot,
            o.status,o.authority_checksum,o.created_at,o.released_at,w.production_work_order_id,w.traveler_id,
            c.id custody_id,c.custody_status,c.received_quantity,c.issued_quantity,c.reversed_quantity,c.available_quantity,
            q.id quality_acceptance_id,q.disposition quality_disposition,q.inspection_reference,q.authority_checksum quality_checksum,
            s.id shipment_release_id,s.release_scope,s.release_reference,s.authority_checksum shipment_release_checksum
       FROM p2_manufactured_output_authorities o
       JOIN p2_manufacturing_work_order_authorities w ON w.id=o.work_order_authority_id
       LEFT JOIN p2_manufactured_output_custodies c ON c.output_authority_id=o.id
       LEFT JOIN p2_manufactured_output_quality_acceptances q ON q.output_authority_id=o.id
       LEFT JOIN p2_manufactured_output_shipment_releases s ON s.output_authority_id=o.id
      WHERE o.project_id=ANY($1::uuid[])
      ORDER BY o.assembly_path_identity,o.created_at LIMIT 501`,
    [projectIds]
  );
  if (outputs.rows.length > 500)
    throw new P2GenealogyViewerError(
      'GENEALOGY_PROJECT_TOO_LARGE',
      'The genealogy exceeds the 500-output review boundary and cannot be reported partially.'
    );
  const outputIds = outputs.rows.map((row) => row.id);
  const authorityIds = outputs.rows.map((row) => row.work_order_authority_id);

  const [componentEdges, materialEdges] = await Promise.all([
    pool.query(
      `SELECT g.*,i.status issue_status,i.output_identity
         FROM p2_manufactured_component_genealogy_edges g
         JOIN p2_manufactured_component_issues i ON i.id=g.issue_id
        WHERE g.child_output_authority_id=ANY($1::uuid[])
           OR g.parent_work_order_authority_id=ANY($2::uuid[])
        ORDER BY g.created_at`,
      [outputIds, authorityIds]
    ),
    pool.query(
      `SELECT g.* FROM p2_material_genealogy_edges g
        WHERE g.output_authority_id=ANY($1::uuid[]) ORDER BY g.created_at`,
      [outputIds]
    ),
  ]);

  return {
    query,
    generatedAt: new Date().toISOString(),
    outputs: outputs.rows,
    componentEdges: componentEdges.rows,
    materialEdges: materialEdges.rows,
    summary: {
      outputs: outputs.rows.length,
      componentEdges: componentEdges.rows.length,
      materialEdges: materialEdges.rows.length,
    },
  };
}
