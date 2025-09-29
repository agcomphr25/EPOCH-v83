import { Router, Request, Response } from 'express';
import { pool } from '../../db';

const router = Router();

interface AGMetalReportData {
  agBottomMetals: Array<{
    bottomMetalType: string;
    displayName: string;
    count: number;
    orders: Array<{
      orderId: string;
      orderDate: string;
      dueDate: string;
      customerId: string;
      currentDepartment: string;
      modelId: string;
      handedness: string;
    }>;
  }>;
  railTypes: Array<{
    railType: string;
    displayName: string;
    count: number;
    orders: Array<{
      orderId: string;
      orderDate: string;
      dueDate: string;
      customerId: string;
      currentDepartment: string;
      modelId: string;
      handedness: string;
    }>;
  }>;
  summary: {
    totalUnfulfilledOrders: number;
    totalAGBottomMetals: number;
    totalRailOrders: number;
    departmentBreakdown: Array<{
      department: string;
      count: number;
    }>;
  };
}

// AG Bottom Metal display name mapping
const AG_BOTTOM_METAL_NAMES: Record<string, string> = {
  'ag_bottom_metel_inlet_only': 'AG Bottom Metal Inlet Only',
  'ag_m5_sa': 'AG-M5-SA',
  'ag_m5_la': 'AG-M5-LA', 
  'ag_m5_la_cip': 'AG-M5-LA-CIP',
  'ag_bdl_sa': 'AG-BDL-SA',
  'ag_bdl_la': 'AG-BDL-LA',
  'ag_m5bdl_sa': 'AG-M5/BDL-SA Custom',
  'ag_m5bdl_la': 'AG-M5/BDL-LA Custom',
  'ag_m5bdl_la_cip': 'AG-M5/BDL-LA CIP Custom',
};

// Rail type display name mapping
const RAIL_TYPE_NAMES: Record<string, string> = {
  'no_rail': 'No Rail',
  'pic_rail': 'Picatinny Rail',
  'pic_intgrated_stud': 'Picatinny Integrated Stud',
  'arca_4': 'ARCA 4-inch',
  'arca_6': 'ARCA 6-inch',
  'arca_8': 'ARCA 8-inch',
  'alamo_rail_spacing': 'Alamo Rail Spacing',
};

function parseRailAccessory(railData: any): string[] {
  if (!railData) return [];
  
  // Handle array format like ["arca_4", "pic_rail"]
  if (Array.isArray(railData)) {
    return railData;
  }
  
  // Handle single string format like "no_rail"
  if (typeof railData === 'string') {
    return [railData];
  }
  
  return [];
}

function formatRailDisplayName(railTypes: string[]): string {
  if (railTypes.length === 0) return 'No Rails';
  if (railTypes.length === 1) {
    return RAIL_TYPE_NAMES[railTypes[0]] || railTypes[0];
  }
  
  // Multiple rails - combine display names
  const displayNames = railTypes.map(rail => RAIL_TYPE_NAMES[rail] || rail);
  return displayNames.join(' + ');
}

router.get('/ag-metal-report', async (req: Request, res: Response) => {
  try {
    console.log('🔍 AG Metal Report: Starting data collection...');

    // Get all unfulfilled orders with AG bottom metals
    const agBottomMetalQuery = `
      SELECT 
        order_id,
        order_date,
        due_date,
        customer_id,
        current_department,
        model_id,
        handedness,
        features,
        jsonb_extract_path_text(features, 'bottom_metal') as bottom_metal_type
      FROM all_orders 
      WHERE features IS NOT NULL 
        AND jsonb_extract_path_text(features, 'bottom_metal') ILIKE '%ag%'
        AND current_department NOT IN ('Shipping', 'Fulfilled')
        AND shipping_completed_at IS NULL
        AND status != 'CANCELLED'
      ORDER BY 
        jsonb_extract_path_text(features, 'bottom_metal'),
        due_date ASC
    `;

    // Get all unfulfilled orders with rail accessories
    const railAccessoryQuery = `
      SELECT 
        order_id,
        order_date,
        due_date,
        customer_id,
        current_department,
        model_id,
        handedness,
        features,
        jsonb_extract_path(features, 'rail_accessory') as rail_accessory
      FROM all_orders 
      WHERE features IS NOT NULL 
        AND jsonb_extract_path(features, 'rail_accessory') IS NOT NULL
        AND current_department NOT IN ('Shipping', 'Fulfilled')
        AND shipping_completed_at IS NULL
        AND status != 'CANCELLED'
      ORDER BY due_date ASC
    `;

    // Get department breakdown for unfulfilled orders
    const departmentQuery = `
      SELECT 
        current_department,
        COUNT(*) as count
      FROM all_orders 
      WHERE current_department NOT IN ('Shipping', 'Fulfilled')
        AND shipping_completed_at IS NULL
        AND status != 'CANCELLED'
      GROUP BY current_department
      ORDER BY count DESC
    `;

    // Get total unfulfilled orders count
    const totalUnfulfilledQuery = `
      SELECT COUNT(*) as total 
      FROM all_orders 
      WHERE current_department NOT IN ('Shipping', 'Fulfilled')
        AND shipping_completed_at IS NULL
        AND status != 'CANCELLED'
    `;

    console.log('🔍 AG Metal Report: Executing queries...');

    const [agBottomMetalResult, railAccessoryResult, departmentResult, totalResult] = await Promise.all([
      pool.query(agBottomMetalQuery),
      pool.query(railAccessoryQuery),
      pool.query(departmentQuery),
      pool.query(totalUnfulfilledQuery)
    ]);

    console.log(`🔍 AG Metal Report: Found ${agBottomMetalResult.length} AG bottom metal orders`);
    console.log(`🔍 AG Metal Report: Found ${railAccessoryResult.length} rail accessory orders`);

    // Process AG bottom metals
    const agBottomMetalGroups: Record<string, any> = {};
    agBottomMetalResult.forEach((row: any) => {
      const bottomMetalType = row.bottom_metal_type;
      if (!agBottomMetalGroups[bottomMetalType]) {
        agBottomMetalGroups[bottomMetalType] = {
          bottomMetalType,
          displayName: AG_BOTTOM_METAL_NAMES[bottomMetalType] || bottomMetalType,
          count: 0,
          orders: []
        };
      }
      
      agBottomMetalGroups[bottomMetalType].count++;
      agBottomMetalGroups[bottomMetalType].orders.push({
        orderId: row.order_id,
        orderDate: row.order_date,
        dueDate: row.due_date,
        customerId: row.customer_id,
        currentDepartment: row.current_department,
        modelId: row.model_id,
        handedness: row.handedness
      });
    });

    // Process rail accessories
    const railGroups: Record<string, any> = {};
    railAccessoryResult.forEach((row: any) => {
      const railTypes = parseRailAccessory(row.rail_accessory);
      const railKey = JSON.stringify(railTypes.sort()); // Create consistent key for grouping
      const displayName = formatRailDisplayName(railTypes);
      
      if (!railGroups[railKey]) {
        railGroups[railKey] = {
          railType: railKey,
          displayName,
          count: 0,
          orders: []
        };
      }
      
      railGroups[railKey].count++;
      railGroups[railKey].orders.push({
        orderId: row.order_id,
        orderDate: row.order_date,
        dueDate: row.due_date,
        customerId: row.customer_id,
        currentDepartment: row.current_department,
        modelId: row.model_id,
        handedness: row.handedness
      });
    });

    // Sort results
    const agBottomMetals = Object.values(agBottomMetalGroups).sort((a: any, b: any) => b.count - a.count);
    const railTypes = Object.values(railGroups).sort((a: any, b: any) => b.count - a.count);

    const reportData: AGMetalReportData = {
      agBottomMetals,
      railTypes,
      summary: {
        totalUnfulfilledOrders: parseInt(totalResult[0]?.total || '0'),
        totalAGBottomMetals: agBottomMetalResult.length,
        totalRailOrders: railAccessoryResult.length,
        departmentBreakdown: departmentResult.map((row: any) => ({
          department: row.current_department,
          count: parseInt(row.count)
        }))
      }
    };

    console.log(`✅ AG Metal Report: Generated report with ${agBottomMetals.length} AG bottom metal types and ${railTypes.length} rail types`);

    res.json(reportData);
  } catch (error) {
    console.error('❌ AG Metal Report Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate AG metal report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;