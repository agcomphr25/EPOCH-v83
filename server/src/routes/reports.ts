import { Router } from 'express';
import { eq, and, gte, lt, sql, or, inArray, lte, desc } from 'drizzle-orm';

import { db } from '../../db';
import { allOrders, stockModels, features, orderFilterPresets } from '../../schema';
import { insertOrderFilterPresetSchema } from '@shared/schema';
import { storage } from '../../storage';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

// Monthly FULFILLED Orders Report
router.get('/monthly-fulfilled', async (req, res) => {
  try {
    const { month, year } = req.query;

    // Default to September 2025 if not provided
    const reportMonth = month ? parseInt(month as string) : 9;
    const reportYear = year ? parseInt(year as string) : 2025;

    // Calculate date range for the selected month
    const startDate = new Date(reportYear, reportMonth - 1, 1);
    const endDate = new Date(reportYear, reportMonth, 1);

    const orders = await db
      .select({
        orderId: allOrders.orderId,
        customerId: allOrders.customerId,
        orderDate: allOrders.orderDate,
        updatedAt: allOrders.updatedAt,
        basePrice:
          sql<number>`COALESCE(${allOrders.priceOverride}, ${stockModels.price}, 0)`.as(
            'base_price'
          ),
        shipping: allOrders.shipping,
        customDiscountType: allOrders.customDiscountType,
        customDiscountValue: allOrders.customDiscountValue,
        showCustomDiscount: allOrders.showCustomDiscount,
        features: allOrders.features,
        modelId: allOrders.modelId,
      })
      .from(allOrders)
      .leftJoin(stockModels, eq(allOrders.modelId, stockModels.id))
      .where(
        and(
          eq(allOrders.status, 'FULFILLED'),
          gte(allOrders.updatedAt, startDate),
          lt(allOrders.updatedAt, endDate),
          // Exclude Production-Only Orders (PO_RELEASE) from financial reports
          or(
            eq(allOrders.orderSource, 'SALES'),
            sql`${allOrders.orderSource} IS NULL`
          )
        )
      )
      .orderBy(allOrders.updatedAt);

    // Get all feature definitions to calculate prices
    const { storage } = await import('../../storage');
    const allFeatures = await storage.getAllFeatures();

    // Calculate features total for each order
    const ordersWithTotals = orders.map((order) => {
      let featuresTotal = 0;

      if (order.features && typeof order.features === 'object') {
        // Loop through each feature selection in the order
        Object.entries(order.features).forEach(
          ([featureCategory, selectedValue]) => {
            // Find the feature definition for this category
            const featureDef = allFeatures.find(
              (f) => f.id === featureCategory || f.name === featureCategory
            );

            if (featureDef && featureDef.options) {
              // Handle both single values and arrays
              const values = Array.isArray(selectedValue)
                ? selectedValue
                : [selectedValue];

              values.forEach((value) => {
                if (value && value !== 'none') {
                  // Find the option that matches the selected value
                  const options = featureDef.options as any[];
                  const option = options?.find(
                    (opt: any) => opt.value === value
                  );
                  if (option && option.price) {
                    featuresTotal += Number(option.price);
                  }
                }
              });
            }
          }
        );
      }

      const basePrice = Number(order.basePrice) || 0;
      const shipping = Number(order.shipping) || 0;

      let orderTotal = basePrice + featuresTotal + shipping;
      let discountAmount = 0;

      // Apply discount if applicable
      if (order.showCustomDiscount && order.customDiscountValue) {
        if (order.customDiscountType === 'percent') {
          discountAmount =
            (basePrice + featuresTotal) * (order.customDiscountValue / 100);
          orderTotal =
            (basePrice + featuresTotal) *
              (1 - order.customDiscountValue / 100) +
            shipping;
        } else if (
          order.customDiscountType === 'fixed' ||
          order.customDiscountType === 'amount'
        ) {
          discountAmount = order.customDiscountValue;
          orderTotal =
            basePrice + featuresTotal - order.customDiscountValue + shipping;
        }
      }

      return {
        orderId: order.orderId,
        customerId: order.customerId,
        orderDate: order.orderDate,
        updatedAt: order.updatedAt,
        basePrice,
        featuresTotal,
        shipping,
        discountAmount,
        customDiscountType: order.customDiscountType,
        customDiscountValue: order.customDiscountValue,
        showCustomDiscount: order.showCustomDiscount,
        orderTotal,
      };
    });

    // Calculate column totals
    const columnTotals = ordersWithTotals.reduce(
      (totals, order) => ({
        basePrice: totals.basePrice + order.basePrice,
        featuresTotal: totals.featuresTotal + order.featuresTotal,
        shipping: totals.shipping + order.shipping,
        discountAmount: totals.discountAmount + order.discountAmount,
        orderTotal: totals.orderTotal + order.orderTotal,
      }),
      {
        basePrice: 0,
        featuresTotal: 0,
        shipping: 0,
        discountAmount: 0,
        orderTotal: 0,
      }
    );

    res.json({
      orderCount: ordersWithTotals.length,
      totalAmountDue: columnTotals.orderTotal,
      columnTotals,
      orders: ordersWithTotals,
    });
  } catch (error) {
    console.error('Error fetching monthly FULFILLED orders:', error);
    res.status(500).json({ error: 'Failed to fetch report data' });
  }
});

// Get all available filter options (stock models, barrels, paints, etc.)
router.get('/filter-options', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    // Get all active stock models
    const models = await db
      .select({
        id: stockModels.id,
        name: stockModels.name,
        displayName: stockModels.displayName,
      })
      .from(stockModels)
      .where(eq(stockModels.isActive, true))
      .orderBy(stockModels.displayName);

    // Get features for filtering (barrel inlet, paint options, rails, etc.)
    const allFeatures = await db
      .select({
        id: features.id,
        name: features.name,
        displayName: features.displayName,
        type: features.type,
        options: features.options,
        category: features.category,
      })
      .from(features)
      .where(eq(features.isActive, true))
      .orderBy(features.sortOrder);

    // Extract barrel inlet options
    const barrelInlet = allFeatures.find((f) => f.id === 'barrel_inlet');
    const barrelOptions = barrelInlet?.options as any[] || [];

    // Extract action inlet options (feature ID is 'action' in database)
    const actionInlet = allFeatures.find((f) => f.id === 'action');
    const actionInletOptions = actionInlet?.options as any[] || [];

    // Extract action length options
    const actionLength = allFeatures.find((f) => f.id === 'action_length');
    const actionLengthOptions = actionLength?.options as any[] || [];

    // Extract rail accessory options
    const railAccessory = allFeatures.find((f) => f.id === 'rail_accessory');
    const railOptions = railAccessory?.options as any[] || [];

    // Extract bottom metal options
    const bottomMetal = allFeatures.find((f) => f.id === 'bottom_metal');
    const bottomMetalOptions = bottomMetal?.options as any[] || [];

    // Extract other options
    const otherOptions = allFeatures.find((f) => f.id === 'other_options');
    const otherOptionsOptions = otherOptions?.options as any[] || [];

    // Extract paint options by category
    const paintFeatures = allFeatures.filter((f) =>
      ['base_colors', 'custom_graphics', 'special_effects', 'camo_patterns', 'premium_patterns', 'protective_coatings'].includes(f.id)
    );

    const paintOptions = paintFeatures.map((f) => ({
      category: f.id,
      displayName: f.displayName,
      options: (f.options as any[]) || [],
    }));

    // Get distinct departments from orders
    const departmentsResult = await db
      .selectDistinct({ department: allOrders.currentDepartment })
      .from(allOrders)
      .where(sql`${allOrders.currentDepartment} IS NOT NULL`);
    
    const departments = departmentsResult
      .map((d) => d.department)
      .filter((d): d is string => d !== null)
      .sort();

    // Get distinct statuses
    const statusesResult = await db
      .selectDistinct({ status: allOrders.status })
      .from(allOrders)
      .where(sql`${allOrders.status} IS NOT NULL`);
    
    const statuses = statusesResult
      .map((s) => s.status)
      .filter((s): s is string => s !== null)
      .sort();

    res.json({
      stockModels: models,
      barrelInlets: barrelOptions,
      actionInlets: actionInletOptions,
      actionLengths: actionLengthOptions,
      paintOptions,
      railAccessories: railOptions,
      bottomMetalOptions: bottomMetalOptions,
      otherOptions: otherOptionsOptions,
      departments,
      statuses,
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// Execute custom query with filters
router.post('/query', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const {
      stockModels: selectedModels,
      barrelInlets,
      actionInlets,
      actionLengths,
      paintOptions: selectedPaints,
      railAccessories,
      bottomMetalOptions,
      otherOptions,
      departments,
      statuses,
      customerName,
      dateRange,
      logicMode, // 'AND' or 'OR'
    } = req.body;

    // Build dynamic WHERE conditions
    const conditions: any[] = [];

    // Customer name filter (case-insensitive partial match via subquery)
    if (customerName && customerName.trim()) {
      const searchTerm = `%${customerName.trim()}%`;
      conditions.push(
        sql`${allOrders.customerId}::integer IN (SELECT id FROM customers WHERE LOWER(name) LIKE LOWER(${searchTerm}))`
      );
    }

    // Stock model filter
    if (selectedModels && selectedModels.length > 0) {
      conditions.push(inArray(allOrders.modelId, selectedModels));
    }

    // Department filter
    if (departments && departments.length > 0) {
      conditions.push(inArray(allOrders.currentDepartment, departments));
    }

    // Status filter
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(allOrders.status, statuses));
    }

    // Date range filter
    if (dateRange?.start) {
      conditions.push(gte(allOrders.orderDate, new Date(dateRange.start)));
    }
    if (dateRange?.end) {
      conditions.push(lte(allOrders.orderDate, new Date(dateRange.end)));
    }

    // Features-based filters (barrel, paint, rails) - need to query JSON
    const featureConditions: any[] = [];

    if (barrelInlets && barrelInlets.length > 0) {
      barrelInlets.forEach((barrel: string) => {
        featureConditions.push(
          sql`${allOrders.features}->>'barrel_inlet' = ${barrel}`
        );
      });
    }

    if (actionInlets && actionInlets.length > 0) {
      actionInlets.forEach((action: string) => {
        featureConditions.push(
          sql`${allOrders.features}->>'action_inlet' = ${action}`
        );
      });
    }

    if (actionLengths && actionLengths.length > 0) {
      actionLengths.forEach((length: string) => {
        featureConditions.push(
          sql`${allOrders.features}->>'action_length' = ${length}`
        );
      });
    }

    if (selectedPaints && selectedPaints.length > 0) {
      selectedPaints.forEach((paint: string) => {
        // Paint can be in paint_options or paint_options_combined
        featureConditions.push(
          or(
            sql`${allOrders.features}->>'paint_options' = ${paint}`,
            sql`${allOrders.features}->>'paint_options_combined' LIKE ${`%${paint}%`}`
          )!
        );
      });
    }

    if (railAccessories && railAccessories.length > 0) {
      railAccessories.forEach((rail: string) => {
        featureConditions.push(
          sql`${allOrders.features}->'rail_accessory' ? ${rail}`
        );
      });
    }

    if (bottomMetalOptions && bottomMetalOptions.length > 0) {
      bottomMetalOptions.forEach((bottom: string) => {
        featureConditions.push(
          sql`${allOrders.features}->>'bottom_metal' = ${bottom}`
        );
      });
    }

    if (otherOptions && otherOptions.length > 0) {
      otherOptions.forEach((option: string) => {
        featureConditions.push(
          sql`${allOrders.features}->'other_options' ? ${option}`
        );
      });
    }

    // Combine feature conditions
    if (featureConditions.length > 0) {
      if (logicMode === 'OR') {
        conditions.push(or(...featureConditions));
      } else {
        conditions.push(and(...featureConditions));
      }
    }

    // Execute query
    let query = db.select().from(allOrders);

    if (conditions.length > 0) {
      const whereClause = logicMode === 'OR' ? or(...conditions) : and(...conditions);
      query = query.where(whereClause) as any;
    }

    const results = await query.orderBy(desc(allOrders.orderDate));

    // Enrich with customer and model data
    const enrichedResults = await Promise.all(
      results.map(async (order) => {
        const customer = order.customerId
          ? await storage.getCustomerById(order.customerId)
          : null;

        const model = order.modelId
          ? await db
              .select()
              .from(stockModels)
              .where(eq(stockModels.id, order.modelId))
              .limit(1)
          : null;

        return {
          ...order,
          customer: customer?.name || null,
          modelDisplayName: model?.[0]?.displayName || order.modelId,
        };
      })
    );

    res.json({
      orders: enrichedResults,
      total: enrichedResults.length,
    });
  } catch (error) {
    console.error('Error executing filter query:', error);
    res.status(500).json({ error: 'Failed to execute query', details: (error as any).message });
  }
});

// Export filtered orders to CSV
router.post('/export-csv', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { orders } = req.body;

    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: 'Invalid orders data' });
    }

    // CSV headers
    const csvHeaders = [
      'Order ID',
      'Order Date',
      'Due Date',
      'Customer ID',
      'Customer Name',
      'Stock Model',
      'Current Department',
      'Status',
      'FB Order Number',
      'Handedness',
      'Barrel Inlet',
      'Paint Option',
      'Rail Accessory',
      'Created At',
    ];

    // Generate CSV rows
    const csvRows = orders.map((order: any) => {
      const features = order.features || {};
      const railAccessory = Array.isArray(features.rail_accessory)
        ? features.rail_accessory.join(', ')
        : features.rail_accessory || '';
      
      const paintOption = features.paint_options_combined || features.paint_options || '';

      return [
        order.orderId || '',
        order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '',
        order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '',
        order.customerId || '',
        order.customer || '',
        order.modelDisplayName || order.modelId || '',
        order.currentDepartment || '',
        order.status || '',
        order.fbOrderNumber || '',
        features.handedness || '',
        features.barrel_inlet || '',
        paintOption,
        railAccessory,
        order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '',
      ].map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    // Combine headers and rows
    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orders_report_${timestamp}.csv"`
    );

    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export to CSV' });
  }
});

// Get all saved filter presets
router.get('/presets', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const presets = await db
      .select()
      .from(orderFilterPresets)
      .orderBy(desc(orderFilterPresets.createdAt));

    res.json(presets);
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

// Save a new filter preset
router.post('/presets', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const validatedData = insertOrderFilterPresetSchema.parse(req.body);

    const [preset] = await db
      .insert(orderFilterPresets)
      .values(validatedData)
      .returning();

    res.status(201).json(preset);
  } catch (error) {
    console.error('Error saving preset:', error);
    res.status(500).json({ error: 'Failed to save preset', details: (error as any).message });
  }
});

// Delete a filter preset
router.delete('/presets/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    await db
      .delete(orderFilterPresets)
      .where(eq(orderFilterPresets.id, parseInt(id)));

    res.json({ success: true, message: 'Preset deleted successfully' });
  } catch (error) {
    console.error('Error deleting preset:', error);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

// Analytics metrics endpoint - Provides summary metrics for a date range
router.get('/analytics/metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    // Add 1 day to end date to make it inclusive of the entire end day
    // This ensures orders fulfilled any time on the end date are included
    const endInclusive = new Date(end);
    endInclusive.setDate(endInclusive.getDate() + 1);

    // Get orders fulfilled in the date range
    const orders = await db
      .select({
        orderId: allOrders.orderId,
        customerId: allOrders.customerId,
        orderDate: allOrders.orderDate,
        updatedAt: allOrders.updatedAt,
        basePrice: sql<number>`COALESCE(${allOrders.priceOverride}, ${stockModels.price}, 0)`.as('base_price'),
        shipping: allOrders.shipping,
        customDiscountType: allOrders.customDiscountType,
        customDiscountValue: allOrders.customDiscountValue,
        showCustomDiscount: allOrders.showCustomDiscount,
        features: allOrders.features,
        modelId: allOrders.modelId,
        status: allOrders.status,
      })
      .from(allOrders)
      .leftJoin(stockModels, eq(allOrders.modelId, stockModels.id))
      .where(
        and(
          eq(allOrders.status, 'FULFILLED'),
          gte(allOrders.updatedAt, start),
          lt(allOrders.updatedAt, endInclusive),
          // Exclude Production-Only Orders (PO_RELEASE) from financial reports
          or(
            eq(allOrders.orderSource, 'SALES'),
            sql`${allOrders.orderSource} IS NULL`
          )
        )
      )
      .orderBy(allOrders.updatedAt);

    // Get all feature definitions to calculate prices
    const { storage } = await import('../../storage');
    const allFeatures = await storage.getAllFeatures();

    // Calculate totals for each order
    let totalDiscounts = 0;
    let totalRevenue = 0;
    let totalOrderValue = 0;
    const orderDetails: any[] = [];

    orders.forEach((order) => {
      let featuresTotal = 0;

      if (order.features && typeof order.features === 'object') {
        Object.entries(order.features).forEach(([featureCategory, selectedValue]) => {
          const featureDef = allFeatures.find(
            (f) => f.id === featureCategory || f.name === featureCategory
          );

          if (featureDef && featureDef.options) {
            const values = Array.isArray(selectedValue) ? selectedValue : [selectedValue];
            values.forEach((value) => {
              if (value && value !== 'none') {
                const options = featureDef.options as any[];
                const option = options?.find((opt: any) => opt.value === value);
                if (option && option.price) {
                  featuresTotal += Number(option.price);
                }
              }
            });
          }
        });
      }

      const basePrice = Number(order.basePrice) || 0;
      const shipping = Number(order.shipping) || 0;
      let orderTotal = basePrice + featuresTotal + shipping;
      let discountAmount = 0;

      // Apply discount if applicable
      if (order.showCustomDiscount && order.customDiscountValue) {
        if (order.customDiscountType === 'percent') {
          discountAmount = (basePrice + featuresTotal) * (order.customDiscountValue / 100);
          orderTotal = (basePrice + featuresTotal) * (1 - order.customDiscountValue / 100) + shipping;
        } else if (order.customDiscountType === 'fixed' || order.customDiscountType === 'amount') {
          discountAmount = order.customDiscountValue;
          orderTotal = basePrice + featuresTotal - order.customDiscountValue + shipping;
        }
      }

      totalDiscounts += discountAmount;
      totalRevenue += orderTotal;
      totalOrderValue += (basePrice + featuresTotal + shipping);

      orderDetails.push({
        orderId: order.orderId,
        customerId: order.customerId,
        orderDate: order.orderDate,
        updatedAt: order.updatedAt,
        basePrice,
        featuresTotal,
        shipping,
        discountAmount,
        orderTotal,
      });
    });

    res.json({
      summary: {
        totalOrders: orders.length,
        totalDiscounts: parseFloat(totalDiscounts.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalOrderValue: parseFloat(totalOrderValue.toFixed(2)),
        averageDiscount: orders.length > 0 ? parseFloat((totalDiscounts / orders.length).toFixed(2)) : 0,
        averageOrderValue: orders.length > 0 ? parseFloat((totalRevenue / orders.length).toFixed(2)) : 0,
      },
      orders: orderDetails,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics metrics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics metrics', details: (error as any).message });
  }
});

// PO Production Orders Report - Temporary report for viewing all PO-released production orders
router.get('/po-production-orders', async (req, res) => {
  try {
    const pool = (await import('../../db')).pool;
    
    // Get all production orders that came from POs
    const productionOrdersQuery = `
      SELECT 
        order_id,
        po_id,
        po_number,
        customer_name,
        item_name,
        current_department,
        production_status,
        created_at,
        updated_at
      FROM production_orders
      WHERE po_id IS NOT NULL
      ORDER BY created_at DESC
    `;
    const productionOrdersResult = await pool.query(productionOrdersQuery);
    const productionOrders = Array.isArray(productionOrdersResult) ? productionOrdersResult : productionOrdersResult.rows || [];

    // Get summary by department
    const summaryQuery = `
      SELECT 
        current_department,
        production_status,
        COUNT(*) as count
      FROM production_orders
      WHERE po_id IS NOT NULL
      GROUP BY current_department, production_status
      ORDER BY count DESC
    `;
    const summaryResult = await pool.query(summaryQuery);
    const summary = Array.isArray(summaryResult) ? summaryResult : summaryResult.rows || [];

    // Check for any with order_source = 'PO_RELEASE' in all_orders (new Phase 1B orders)
    const newSystemOrdersQuery = `
      SELECT 
        order_id,
        order_source,
        source_po_id,
        current_department,
        status,
        created_at
      FROM all_orders 
      WHERE order_source = 'PO_RELEASE' 
         OR source_po_id IS NOT NULL
      ORDER BY created_at DESC
    `;
    const newSystemOrdersResult = await pool.query(newSystemOrdersQuery);
    const newSystemOrders = Array.isArray(newSystemOrdersResult) ? newSystemOrdersResult : newSystemOrdersResult.rows || [];

    res.json({
      productionOrders,
      summary,
      newSystemOrders,
      totalCount: productionOrders.length,
      newSystemCount: newSystemOrders.length,
    });
  } catch (error) {
    console.error('Error fetching PO production orders:', error);
    res.status(500).json({ error: 'Failed to fetch PO production orders', details: (error as any).message });
  }
});

// Due Date Capacity Report - Shows FINALIZED and IN_PROGRESS orders grouped by week
router.get('/due-date-capacity', async (req, res) => {
  try {
    // Query orders with FINALIZED, IN_PROGRESS, or PENDING_SIGNATURE status, joined with customer info
    const ordersResult = await db.execute(sql`
      SELECT 
        o.id,
        o.order_id as "orderId",
        o.due_date as "dueDate",
        o.customer_id as "customerId",
        o.current_department as "currentDepartment",
        o.status,
        'SALES' as "orderSource",
        COALESCE(c.name, c.company, 'Unknown Customer') as "customerName"
      FROM all_orders o
      LEFT JOIN customers c ON CASE 
        WHEN o.customer_id ~ '^[0-9]+$' THEN o.customer_id::integer 
        ELSE NULL 
      END = c.id
      WHERE o.status IN ('FINALIZED', 'IN_PROGRESS', 'PENDING_SIGNATURE')
        AND o.is_cancelled = false
        AND o.due_date IS NOT NULL
      ORDER BY o.due_date ASC
    `);
    
    const orders = ordersResult.rows || [];
    
    // Group orders by week (Monday start)
    const weekGroups: Record<string, {
      weekStart: string;
      weekEnd: string;
      weekLabel: string;
      orders: any[];
      regularOrderCount: number;
      poOrderCount: number;
    }> = {};
    
    orders.forEach((order: any) => {
      if (!order.dueDate) return;
      
      const dueDate = new Date(order.dueDate);
      // Get Monday of the week
      const dayOfWeek = dueDate.getDay();
      const diff = dueDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(dueDate);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = {
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          weekLabel: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          orders: [],
          regularOrderCount: 0,
          poOrderCount: 0,
        };
      }
      
      weekGroups[weekKey].orders.push({
        id: order.id,
        orderId: order.orderId,
        dueDate: order.dueDate,
        customerName: order.customerName,
        currentDepartment: order.currentDepartment,
        status: order.status,
        orderSource: order.orderSource,
      });
      
      // Count regular vs PO orders
      if (order.orderSource === 'PO_RELEASE') {
        weekGroups[weekKey].poOrderCount++;
      } else {
        weekGroups[weekKey].regularOrderCount++;
      }
    });
    
    // Convert to array and sort by week
    const weeks = Object.entries(weekGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
    
    res.json({
      weeks,
      totalOrders: orders.length,
    });
  } catch (error) {
    console.error('Error fetching due date capacity report:', error);
    res.status(500).json({ error: 'Failed to fetch due date capacity report', details: (error as any).message });
  }
});

export default router;
