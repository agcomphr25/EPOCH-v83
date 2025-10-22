import { Router } from 'express';
import { eq, and, gte, lt, sql, or, inArray, lte, desc } from 'drizzle-orm';

import { db } from '../../db';
import { allOrders, stockModels, features, orderFilterPresets } from '../../schema';
import { insertOrderFilterPresetSchema } from '@shared/schema';
import { storage } from '../../storage';

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
          lt(allOrders.updatedAt, endDate)
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
router.get('/filter-options', async (req, res) => {
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

    // Rail accessory options (extracted from features JSON)
    const railOptions = [
      { value: 'no_rail', label: 'No Rail' },
      { value: 'pic_rail', label: 'AG Pic Rail' },
      { value: 'arca_4', label: 'ARCA 4"' },
      { value: 'arca_6', label: 'ARCA 6"' },
      { value: 'arca_8', label: 'ARCA 8"' },
      { value: 'arca_10', label: 'ARCA 10"' },
      { value: 'arca_12', label: 'ARCA 12"' },
      { value: 'arca_15', label: 'ARCA 15"' },
    ];

    res.json({
      stockModels: models,
      barrelInlets: barrelOptions,
      paintOptions,
      railAccessories: railOptions,
      departments,
      statuses,
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// Execute custom query with filters
router.post('/query', async (req, res) => {
  try {
    const {
      stockModels: selectedModels,
      barrelInlets,
      paintOptions: selectedPaints,
      railAccessories,
      departments,
      statuses,
      dateRange,
      logicMode, // 'AND' or 'OR'
    } = req.body;

    // Build dynamic WHERE conditions
    const conditions: any[] = [];

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
router.post('/export-csv', async (req, res) => {
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
router.get('/presets', async (req, res) => {
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
router.post('/presets', async (req, res) => {
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
router.delete('/presets/:id', async (req, res) => {
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

export default router;
