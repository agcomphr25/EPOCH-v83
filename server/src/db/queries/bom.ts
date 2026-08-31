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
        bl.child_part_ag_number, 
        bl.qty_per, 
        bl.scrap_pct, 
        bl.uom, 
        bl.operation_seq, 
        bl.reference,
        bl.notes,
        i.ag_part_number as sku, 
        i.name,
        COALESCE(i.cogs_per_unit, i.cost_per, i.unit_cost, 0) as unit_cost
      FROM bom_lines bl
      JOIN inventory_items i ON i.ag_part_number = bl.child_part_ag_number
      WHERE bl.revision_id = ${revId}
      ORDER BY bl.operation_seq, i.ag_part_number;
    `;
    
    const result = await db.execute(query);
    return (Array.isArray(result) ? result : result.rows || []) as any[];
  }
  
  async function findPreferredRevisionForParentPart(partAgNumber: string) {
    const releasedQuery = sql`
      SELECT br.id AS rev_id
      FROM boms bo 
      JOIN bom_revisions br ON br.bom_id = bo.id
      WHERE bo.parent_part_ag_number = ${partAgNumber} 
        AND br.is_released = true
      ORDER BY br.effective_from DESC NULLS LAST
      LIMIT 1;
    `;
    
    const releasedResult = await db.execute(releasedQuery);
    const releasedRows = Array.isArray(releasedResult) ? releasedResult : releasedResult.rows || [];
    if (releasedRows?.[0]?.rev_id) {
      return releasedRows[0].rev_id as string;
    }

    // Match the explosion dialog's root-revision selection: when a child BOM has
    // not been released yet, use its newest revision instead of treating the
    // manufactured child as a zero-cost leaf component.
    const latestQuery = sql`
      SELECT br.id AS rev_id
      FROM boms bo
      JOIN bom_revisions br ON br.bom_id = bo.id
      WHERE bo.parent_part_ag_number = ${partAgNumber}
      ORDER BY br.created_at DESC NULLS LAST
      LIMIT 1;
    `;

    const latestResult = await db.execute(latestQuery);
    const latestRows = Array.isArray(latestResult) ? latestResult : latestResult.rows || [];
    return latestRows?.[0]?.rev_id as string | undefined;
  }
  
  async function buildNode(currentRevId: string): Promise<any> {
    const lines = await getLines(currentRevId);
    const children: any[] = [];
    let totalCost = 0;
    
    for (const line of lines) {
      const unitCost = Number(line.unit_cost) || 0;
      const qtyPer = Number(line.qty_per);
      const scrapPct = Number(line.scrap_pct);
      
      // Calculate effective quantity including scrap
      const effectiveQty = qtyPer * (1 + scrapPct / 100);
      
      // Check if this part has a BOM (is a make part / sub-assembly)
      const childRevId = await findPreferredRevisionForParentPart(line.child_part_ag_number);
      
      if (childRevId) {
        // This is a sub-assembly, recurse into it
        const childNode = await buildNode(childRevId);
        const childTotalCost = childNode.totalCost || 0;
        const extendedCost = childTotalCost * effectiveQty;
        
        children.push({
          type: 'assembly',
          partId: line.child_part_ag_number,
          sku: line.sku,
          name: line.name,
          qtyPer,
          scrapPct,
          uom: line.uom,
          operationSeq: line.operation_seq,
          reference: line.reference,
          notes: line.notes,
          unitCost: childTotalCost,
          extendedCost,
          children: childNode.children
        });
        
        totalCost += extendedCost;
      } else {
        // This is a leaf component (buy or make part without BOM)
        const extendedCost = unitCost * effectiveQty;
        
        children.push({
          type: 'component',
          partId: line.child_part_ag_number,
          sku: line.sku,
          name: line.name,
          qtyPer,
          scrapPct,
          uom: line.uom,
          operationSeq: line.operation_seq,
          reference: line.reference,
          notes: line.notes,
          unitCost,
          extendedCost,
          children: []
        });
        
        totalCost += extendedCost;
      }
    }
    
    return {
      revisionId: currentRevId,
      children,
      totalCost
    };
  }
  
  return buildNode(revisionId);
}

/**
 * Build simplified Stock BOM structure (for stock models with optional items and labor)
 * Returns structure with material costs, labor costs, and optional item flags
 */
export async function buildStockBOMTree(bomDefinitionId: string) {
  const query = sql`
    SELECT 
      bi.id,
      bi.part_name,
      bi.quantity,
      bi.first_dept,
      bi.item_type,
      bi.is_optional,
      bi.labor_hours,
      bi.hourly_rate,
      bi.notes,
      bi.assembly_level
    FROM bom_items bi
    WHERE bi.bom_id = ${bomDefinitionId} 
      AND bi.is_active = true
    ORDER BY bi.assembly_level, bi.part_name;
  `;
  
  const result = await db.execute(query);
  const items = (Array.isArray(result) ? result : result.rows || []) as any[];
  
  let materialCost = 0;
  let laborCost = 0;
  let optionalMaterialCost = 0;
  let optionalLaborCost = 0;
  
  const processedItems = items.map(item => {
    const qty = Number(item.quantity) || 1;
    const isLabor = item.item_type === 'labor';
    const isOptional = item.is_optional === true;
    
    let itemCost = 0;
    
    if (isLabor) {
      const hours = Number(item.labor_hours) || 0;
      const rate = Number(item.hourly_rate) || 0;
      itemCost = hours * rate;
      
      if (isOptional) {
        optionalLaborCost += itemCost;
      } else {
        laborCost += itemCost;
      }
    } else {
      // For materials, we would look up cost from inventory_items
      // For now, set to 0 - will be enhanced later when integrated with inventory
      itemCost = 0;
      
      if (isOptional) {
        optionalMaterialCost += itemCost * qty;
      } else {
        materialCost += itemCost * qty;
      }
    }
    
    return {
      id: item.id,
      partName: item.part_name,
      quantity: qty,
      firstDept: item.first_dept,
      itemType: item.item_type,
      isOptional,
      laborHours: isLabor ? Number(item.labor_hours) || 0 : null,
      hourlyRate: isLabor ? Number(item.hourly_rate) || 0 : null,
      itemCost,
      notes: item.notes,
      assemblyLevel: item.assembly_level
    };
  });
  
  return {
    items: processedItems,
    costSummary: {
      baseMaterialCost: materialCost,
      baseLaborCost: laborCost,
      optionalMaterialCost,
      optionalLaborCost,
      totalBaseCost: materialCost + laborCost,
      totalWithOptional: materialCost + laborCost + optionalMaterialCost + optionalLaborCost
    }
  };
}
