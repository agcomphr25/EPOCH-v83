import { sql } from 'drizzle-orm';
import { db } from '../../../db';

/**
 * Explodes a BOM revision and rolls up quantities, costs, and weights
 * Uses recursive CTE to traverse multi-level BOMs
 */
export async function explodeBOMRevisionWithRollups(revisionId: string) {
  const query = sql`
    WITH RECURSIVE bom_cte AS (
      -- Base case: direct children of this revision
      SELECT 
        bl.child_part_id AS part_id,
        bl.qty_per::numeric * (1 + bl.scrap_pct::numeric/100.0) AS qty_eff,
        1 AS level,
        ARRAY[bl.child_part_id] AS path
      FROM bom_lines bl
      WHERE bl.revision_id = ${revisionId}
      
      UNION ALL
      
      -- Recursive case: children of sub-assemblies
      SELECT 
        bl2.child_part_id AS part_id,
        b.qty_eff * (bl2.qty_per::numeric * (1 + bl2.scrap_pct::numeric/100.0)) AS qty_eff,
        b.level + 1,
        b.path || bl2.child_part_id
      FROM bom_cte b
      JOIN boms bo ON bo.parent_part_id = b.part_id
      JOIN bom_revisions br ON br.bom_id = bo.id AND br.is_released = true
      JOIN bom_lines bl2 ON bl2.revision_id = br.id
      WHERE NOT (bl2.child_part_id = ANY(b.path)) -- Prevent circular references
    )
    SELECT 
      p.id, 
      p.sku, 
      p.name, 
      p.uom, 
      p.std_cost, 
      p.weight,
      SUM(b.qty_eff) AS total_qty,
      MAX(level) AS max_level,
      SUM(b.qty_eff) * COALESCE(p.std_cost::numeric, 0) AS total_cost,
      SUM(b.qty_eff) * COALESCE(p.weight::numeric, 0) AS total_weight
    FROM bom_cte b
    JOIN parts p ON p.id = b.part_id
    GROUP BY p.id, p.sku, p.name, p.uom, p.std_cost, p.weight
    ORDER BY max_level, p.sku;
  `;

  const result = await db.execute(query);
  const rows: any[] = Array.isArray(result) ? result : result.rows || [];
  
  let totalCost = 0;
  let totalWeight = 0;
  
  for (const r of rows) {
    totalCost += Number(r.total_cost || 0);
    totalWeight += Number(r.total_weight || 0);
  }
  
  return {
    items: rows,
    parentTotals: { totalCost, totalWeight }
  };
}

/**
 * Find where a part is used across all released BOM revisions
 */
export async function whereUsed(partId: string) {
  const query = sql`
    SELECT 
      br.id AS revision_id, 
      br.rev_code, 
      bo.id AS bom_id, 
      bo.code AS bom_code, 
      bo.parent_part_id,
      p.sku AS parent_sku,
      p.name AS parent_name
    FROM bom_lines bl
    JOIN bom_revisions br ON br.id = bl.revision_id AND br.is_released = true
    JOIN boms bo ON bo.id = br.bom_id
    JOIN parts p ON p.id = bo.parent_part_id
    WHERE bl.child_part_id = ${partId}
    ORDER BY bo.code, br.rev_code;
  `;
  
  const result = await db.execute(query);
  return Array.isArray(result) ? result : result.rows || [];
}

/**
 * Build hierarchical BOM tree structure for display
 */
export async function buildBOMTree(revisionId: string) {
  async function getLines(revId: string) {
    const query = sql`
      SELECT 
        bl.id, 
        bl.child_part_id, 
        bl.qty_per, 
        bl.scrap_pct, 
        bl.uom, 
        bl.operation_seq, 
        bl.reference,
        bl.notes,
        p.sku, 
        p.name,
        p.is_make
      FROM bom_lines bl
      JOIN parts p ON p.id = bl.child_part_id
      WHERE bl.revision_id = ${revId}
      ORDER BY bl.operation_seq, p.sku;
    `;
    
    const result = await db.execute(query);
    return (Array.isArray(result) ? result : result.rows || []) as any[];
  }
  
  async function findReleasedRevisionForParentPart(partId: string) {
    const query = sql`
      SELECT br.id AS rev_id
      FROM boms bo 
      JOIN bom_revisions br ON br.bom_id = bo.id
      WHERE bo.parent_part_id = ${partId} 
        AND br.is_released = true
      ORDER BY br.effective_from DESC NULLS LAST
      LIMIT 1;
    `;
    
    const result = await db.execute(query);
    const rows = Array.isArray(result) ? result : result.rows || [];
    return rows?.[0]?.rev_id as string | undefined;
  }
  
  async function buildNode(currentRevId: string): Promise<any> {
    const lines = await getLines(currentRevId);
    const children: any[] = [];
    
    for (const line of lines) {
      // Check if this part has a BOM (is a make part / sub-assembly)
      const childRevId = await findReleasedRevisionForParentPart(line.child_part_id);
      
      if (childRevId) {
        // This is a sub-assembly, recurse into it
        const childNode = await buildNode(childRevId);
        children.push({
          type: 'assembly',
          partId: line.child_part_id,
          sku: line.sku,
          name: line.name,
          qtyPer: Number(line.qty_per),
          scrapPct: Number(line.scrap_pct),
          uom: line.uom,
          operationSeq: line.operation_seq,
          reference: line.reference,
          notes: line.notes,
          children: childNode.children
        });
      } else {
        // This is a leaf component (buy or make part without BOM)
        children.push({
          type: 'component',
          partId: line.child_part_id,
          sku: line.sku,
          name: line.name,
          qtyPer: Number(line.qty_per),
          scrapPct: Number(line.scrap_pct),
          uom: line.uom,
          operationSeq: line.operation_seq,
          reference: line.reference,
          notes: line.notes,
          isMake: line.is_make,
          children: []
        });
      }
    }
    
    return {
      revisionId: currentRevId,
      children
    };
  }
  
  return buildNode(revisionId);
}
