import { Router } from 'express';
import { db } from '../../db';
import { 
  customers, 
  vendors, 
  allOrders,
  employees,
  inventoryItems,
} from '../../schema';
import { or, ilike, sql } from 'drizzle-orm';

const router = Router();

interface SearchResult {
  type: string;
  id: string | number;
  title: string;
  subtitle: string;
  matchedField: string;
  matchedValue: string;
  url: string;
  icon: string;
}

router.get('/global-search', async (req, res) => {
  try {
    const query = req.query.q as string;
    
    console.log('🔍 Global Search - Query received:', query);
    
    if (!query || query.trim().length === 0) {
      console.log('⚠️ Global Search - Empty query, returning empty results');
      return res.json({ results: [], totalCount: 0, query: '' });
    }

    const searchTerm = `%${query.trim()}%`;
    console.log('🔍 Global Search - Search term:', searchTerm);
    const results: SearchResult[] = [];

    // Search Customers - using raw SQL to avoid schema issues
    try {
      const customerResults = await db.execute(sql`
        SELECT id, name, company, email, phone
        FROM customers
        WHERE 
          name ILIKE ${searchTerm} OR
          company ILIKE ${searchTerm} OR
          email ILIKE ${searchTerm} OR
          phone ILIKE ${searchTerm}
        LIMIT 10
      `);

      customerResults.rows.forEach((customer: any) => {
        results.push({
          type: 'Customer',
          id: customer.id,
          title: customer.name || customer.company || 'Unnamed Customer',
          subtitle: [customer.company, customer.email, customer.phone].filter(Boolean).join(' • '),
          matchedField: 'customer',
          matchedValue: customer.name || customer.company || '',
          url: `/customer-management?id=${customer.id}`,
          icon: '👤'
        });
      });
      console.log(`✅ Found ${customerResults.rows.length} customers`);
    } catch (err: any) {
      console.log('⚠️ Customer search failed:', err.message);
    }

    // Search Vendors - using raw SQL
    try {
      const vendorResults = await db.execute(sql`
        SELECT id, name, email, phone, address
        FROM vendors
        WHERE 
          name ILIKE ${searchTerm} OR
          email ILIKE ${searchTerm} OR
          phone ILIKE ${searchTerm} OR
          address ILIKE ${searchTerm}
        LIMIT 10
      `);

      vendorResults.rows.forEach((vendor: any) => {
        results.push({
          type: 'Vendor',
          id: vendor.id,
          title: vendor.name || 'Unnamed Vendor',
          subtitle: [vendor.email, vendor.phone, vendor.address].filter(Boolean).join(' • '),
          matchedField: 'vendor',
          matchedValue: vendor.name || '',
          url: `/purchase-orders?vendorId=${vendor.id}`,
          icon: '🏭'
        });
      });
      console.log(`✅ Found ${vendorResults.rows.length} vendors`);
    } catch (err: any) {
      console.log('⚠️ Vendor search failed:', err.message);
    }

    // Search Orders - using raw SQL
    try {
      const orderResults = await db.execute(sql`
        SELECT order_id, customer_id, customer_po, fb_order_number, tracking_number
        FROM all_orders
        WHERE 
          order_id ILIKE ${searchTerm} OR
          customer_id ILIKE ${searchTerm} OR
          customer_po ILIKE ${searchTerm} OR
          fb_order_number ILIKE ${searchTerm} OR
          tracking_number ILIKE ${searchTerm}
        LIMIT 15
      `);

      orderResults.rows.forEach((order: any) => {
        results.push({
          type: 'Order',
          id: order.order_id,
          title: `Order ${order.order_id}`,
          subtitle: [
            order.fb_order_number ? `FB# ${order.fb_order_number}` : null,
            order.customer_po ? `PO: ${order.customer_po}` : null,
            order.customer_id ? `Customer: ${order.customer_id}` : null
          ].filter(Boolean).join(' • '),
          matchedField: 'order',
          matchedValue: order.order_id || '',
          url: `/order-entry?orderId=${order.order_id}`,
          icon: '📋'
        });
      });
      console.log(`✅ Found ${orderResults.rows.length} orders`);
    } catch (err: any) {
      console.log('⚠️ Order search failed:', err.message);
    }

    // Search Employees - using raw SQL
    try {
      const employeeResults = await db.execute(sql`
        SELECT id, name, email, phone, job_title, department
        FROM employees
        WHERE 
          name ILIKE ${searchTerm} OR
          email ILIKE ${searchTerm} OR
          phone ILIKE ${searchTerm} OR
          job_title ILIKE ${searchTerm}
        LIMIT 10
      `);

      employeeResults.rows.forEach((employee: any) => {
        results.push({
          type: 'Employee',
          id: employee.id,
          title: employee.name || 'Unnamed Employee',
          subtitle: [employee.job_title, employee.department, employee.email].filter(Boolean).join(' • '),
          matchedField: 'employee',
          matchedValue: employee.name || '',
          url: `/employee-detail/${employee.id}`,
          icon: '👨‍💼'
        });
      });
      console.log(`✅ Found ${employeeResults.rows.length} employees`);
    } catch (err: any) {
      console.log('⚠️ Employee search failed:', err.message);
    }

    // Search Inventory - using raw SQL with only columns that exist
    try {
      const inventoryResults = await db.execute(sql`
        SELECT id, ag_part_number, name, source, supplier_part_number
        FROM inventory_items
        WHERE 
          ag_part_number ILIKE ${searchTerm} OR
          name ILIKE ${searchTerm} OR
          source ILIKE ${searchTerm} OR
          supplier_part_number ILIKE ${searchTerm}
        LIMIT 10
      `);

      inventoryResults.rows.forEach((item: any) => {
        results.push({
          type: 'Inventory Item',
          id: item.id,
          title: item.name || 'Unnamed Item',
          subtitle: `Part #: ${item.ag_part_number || 'N/A'} • Source: ${item.source || 'N/A'}`,
          matchedField: 'inventory',
          matchedValue: item.ag_part_number || item.name || '',
          url: `/inventory-manager?partNumber=${item.ag_part_number}`,
          icon: '📦'
        });
      });
      console.log(`✅ Found ${inventoryResults.rows.length} inventory items`);
    } catch (err: any) {
      console.log('⚠️ Inventory search failed:', err.message);
    }

    console.log(`🎯 Global Search - Returning ${results.length} total results`);
    
    return res.json({
      results,
      totalCount: results.length,
      query: query.trim()
    });

  } catch (error: any) {
    console.error('Global search error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
