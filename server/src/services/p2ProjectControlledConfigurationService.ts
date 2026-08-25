import crypto from 'crypto';
import { pool } from '../../db';

export class ProjectConfigurationError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export type ConfigurationActor = { userId: number; displayName: string; role: string };
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function createProjectControlledConfiguration(input: {
  projectId: string; inventoryItemId: number; bomRevisionId: string; routingId: string;
  effectivity: Record<string, unknown>; customerConfiguration: Record<string, unknown>;
}, actor: ConfigurationActor) {
  if (!Object.keys(input.effectivity).length) throw new ProjectConfigurationError('EFFECTIVITY_REQUIRED','Configuration effectivity is required.');
  if (!Object.keys(input.customerConfiguration).length) throw new ProjectConfigurationError('CUSTOMER_CONFIGURATION_REQUIRED','Customer configuration identity is required.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query(`SELECT p.id project_id,i.id inventory_item_id,i.ag_part_number,i.name,
      b.id bom_id,br.id bom_revision_id,br.rev_code,br.content_checksum,
      pr.id routing_id,pr.routing_revision,pr.department_sequence,pr.department_config
      FROM projects p CROSS JOIN inventory_items i
      JOIN boms b ON b.parent_inventory_item_id=i.id
      JOIN bom_revisions br ON br.bom_id=b.id AND br.lifecycle_status='RELEASED' AND br.is_released=true
      JOIN part_routings pr ON pr.inventory_item_fk=i.id AND pr.lifecycle_status='RELEASED' AND pr.is_active=true
      WHERE p.id=$1 AND i.id=$2 AND br.id=$3 AND pr.id=$4`,[input.projectId,input.inventoryItemId,input.bomRevisionId,input.routingId]);
    if (!source.rows[0]) throw new ProjectConfigurationError('RELEASED_CONFIGURATION_REQUIRED','Project configuration must use matching released Inventory Item, BOM and routing identities.',409);
    const row=source.rows[0];
    const routingSnapshot={departmentSequence:row.department_sequence,departmentConfig:row.department_config};
    const checksum=digest({projectId:input.projectId,itemId:row.inventory_item_id,bomRevisionId:row.bom_revision_id,routingId:row.routing_id,effectivity:input.effectivity,customerConfiguration:input.customerConfiguration,routingSnapshot});
    const saved=await client.query(`INSERT INTO p2_project_controlled_configurations
      (project_id,revision_number,inventory_item_id,inventory_part_number_snapshot,inventory_name_snapshot,
       bom_id,bom_revision_id,bom_revision_snapshot,bom_checksum_snapshot,routing_id,routing_revision_snapshot,
       routing_snapshot,effectivity,customer_configuration,content_checksum,created_by,created_by_display_name,created_by_role)
      SELECT $1,COALESCE(MAX(revision_number),0)+1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
      FROM p2_project_controlled_configurations WHERE project_id=$1 RETURNING *`,
      [input.projectId,row.inventory_item_id,row.ag_part_number,row.name,row.bom_id,row.bom_revision_id,row.rev_code,row.content_checksum,row.routing_id,String(row.routing_revision),JSON.stringify(routingSnapshot),JSON.stringify(input.effectivity),JSON.stringify(input.customerConfiguration),checksum,actor.userId,actor.displayName,actor.role]);
    await client.query('COMMIT'); return saved.rows[0];
  } catch(e){await client.query('ROLLBACK'); throw e;} finally {client.release();}
}

export async function releaseProjectControlledConfiguration(id:string, expectedVersion:number, signatureMeaning:string, actor:ConfigurationActor){
  const result=await pool.query(`UPDATE p2_project_controlled_configurations SET status='RELEASED',concurrency_version=concurrency_version+1,
    released_by=$3,released_by_display_name=$4,released_by_role=$5,release_signature_meaning=$6,released_at=now(),updated_at=now()
    WHERE id=$1 AND status='DRAFT' AND concurrency_version=$2 AND created_by<>$3 RETURNING *`,[id,expectedVersion,actor.userId,actor.displayName,actor.role,signatureMeaning]);
  if(!result.rows[0]) throw new ProjectConfigurationError('STALE_OR_NOT_DRAFT','Configuration is stale or is not a draft.',409);
  return result.rows[0];
}

export async function listProjectControlledConfigurations(projectId:string){
  return (await pool.query('SELECT * FROM p2_project_controlled_configurations WHERE project_id=$1 ORDER BY revision_number DESC',[projectId])).rows;
}
