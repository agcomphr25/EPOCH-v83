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
          url: `/inventory/enhanced-mrp?partNumber=${item.ag_part_number}`,
          icon: '📦'
        });
      });
      console.log(`✅ Found ${inventoryResults.rows.length} inventory items`);
    } catch (err: any) {
      console.log('⚠️ Inventory search failed:', err.message);
    }

    // Search Central Storage (Media Library) - PDFs, images, documents
    try {
      const mediaResults = await db.execute(sql`
        SELECT id, filename, title, notes, category, mime_type, storage_path, captured_by_name, capture_date, folder_id
        FROM media_library
        WHERE 
          (is_archived IS NULL OR is_archived = false) AND (
            filename ILIKE ${searchTerm} OR
            title ILIKE ${searchTerm} OR
            notes ILIKE ${searchTerm} OR
            category ILIKE ${searchTerm}
          )
        ORDER BY capture_date DESC NULLS LAST
        LIMIT 10
      `);

      mediaResults.rows.forEach((item: any) => {
        const displayTitle = item.title || item.filename || 'Untitled File';
        const fileType = item.mime_type?.includes('pdf') ? 'PDF' : 
                         item.mime_type?.includes('image') ? 'Image' : 'File';
        const isReferenceDoc = item.category === 'document';
        results.push({
          type: isReferenceDoc ? 'Reference Document' : 'Central Storage',
          id: item.id,
          title: displayTitle,
          subtitle: [
            fileType,
            !isReferenceDoc ? (item.category || null) : null,
            item.captured_by_name ? `By: ${item.captured_by_name}` : null,
          ].filter(Boolean).join(' • '),
          matchedField: isReferenceDoc ? 'reference document' : 'file',
          matchedValue: displayTitle,
          url: isReferenceDoc ? `/reference-docs?highlight=${item.id}` : `/media-library?highlight=${item.id}`,
          icon: isReferenceDoc ? '📋' : (item.mime_type?.includes('pdf') ? '📄' : item.mime_type?.includes('image') ? '🖼️' : '📁')
        });
      });
      console.log(`✅ Found ${mediaResults.rows.length} central storage / reference doc items`);
    } catch (err: any) {
      console.log('⚠️ Central Storage search failed:', err.message);
    }

    // Search Vendor POs - match on PO number, vendor name, notes, status
    try {
      const vendorPoResults = await db.execute(sql`
        SELECT vp.id, vp.po_number, vp.status, vp.notes, vp.order_date, vp.total_amount,
               v.name as vendor_name
        FROM vendor_pos vp
        LEFT JOIN vendors v ON vp.vendor_id = v.id
        WHERE 
          (vp.is_current_revision IS NULL OR vp.is_current_revision = true) AND (
            vp.po_number ILIKE ${searchTerm} OR
            v.name ILIKE ${searchTerm} OR
            vp.notes ILIKE ${searchTerm} OR
            vp.barcode ILIKE ${searchTerm} OR
            vp.created_by ILIKE ${searchTerm}
          )
        ORDER BY vp.order_date DESC NULLS LAST
        LIMIT 10
      `);

      vendorPoResults.rows.forEach((po: any) => {
        const statusLabel = po.status ? po.status.replace(/_/g, ' ') : 'Unknown';
        results.push({
          type: 'Vendor PO',
          id: po.id,
          title: `PO ${po.po_number || po.id}`,
          subtitle: [
            po.vendor_name ? `Vendor: ${po.vendor_name}` : null,
            `Status: ${statusLabel}`,
            po.total_amount ? `$${Number(po.total_amount).toFixed(2)}` : null,
          ].filter(Boolean).join(' • '),
          matchedField: 'vendor PO',
          matchedValue: po.po_number || po.vendor_name || '',
          url: `/vendor-pos?poId=${po.id}`,
          icon: '🧾'
        });
      });
      console.log(`✅ Found ${vendorPoResults.rows.length} vendor POs`);
    } catch (err: any) {
      console.log('⚠️ Vendor PO search failed:', err.message);
    }

    // Search Signed Documents
    try {
      const signedDocResults = await db.execute(sql`
        SELECT osd.id, osd.order_id, osd.approval_type, osd.signed_by, osd.signed_at, osd.notes,
               ml.filename, ml.title
        FROM order_signed_documents osd
        LEFT JOIN media_library ml ON osd.media_id = ml.id
        WHERE 
          osd.order_id ILIKE ${searchTerm} OR
          osd.signed_by ILIKE ${searchTerm} OR
          osd.notes ILIKE ${searchTerm} OR
          ml.filename ILIKE ${searchTerm} OR
          ml.title ILIKE ${searchTerm}
        ORDER BY osd.signed_at DESC NULLS LAST
        LIMIT 10
      `);

      signedDocResults.rows.forEach((doc: any) => {
        results.push({
          type: 'Signed Document',
          id: doc.id,
          title: doc.title || doc.filename || `Signed Doc - Order ${doc.order_id}`,
          subtitle: [
            `Order: ${doc.order_id}`,
            `Signed by: ${doc.signed_by}`,
            doc.approval_type?.replace(/_/g, ' '),
          ].filter(Boolean).join(' • '),
          matchedField: 'signed document',
          matchedValue: doc.order_id || doc.signed_by || '',
          url: `/signature-workflow?orderId=${doc.order_id}`,
          icon: '✍️'
        });
      });
      console.log(`✅ Found ${signedDocResults.rows.length} signed documents`);
    } catch (err: any) {
      console.log('⚠️ Signed documents search failed:', err.message);
    }

    // Search P2 Serialized Items — serial number, barcode, part number
    try {
      const serialResults = await db.execute(sql`
        SELECT
          si.id,
          si.serial_number,
          si.barcode,
          si.part_number,
          si.part_name,
          si.status,
          si.current_department,
          si.completed_at,
          si.finalized_at,
          po.po_number,
          po.customer_name,
          ln.id   AS lot_id,
          ln.lot_number
        FROM p2_serialized_items si
        LEFT JOIN p2_purchase_orders po ON po.id = si.po_id
        LEFT JOIN LATERAL (
          SELECT id, lot_number
          FROM p2_lot_numbers
          WHERE po_id = si.po_id
          ORDER BY created_at DESC
          LIMIT 1
        ) ln ON true
        WHERE
          si.serial_number ILIKE ${searchTerm} OR
          si.barcode       ILIKE ${searchTerm} OR
          si.part_number   ILIKE ${searchTerm}
        ORDER BY si.serial_number
        LIMIT 20
      `);

      serialResults.rows.forEach((s: any) => {
        const statusLabel = s.finalized_at ? 'Finalized'
          : s.completed_at ? 'Completed'
          : s.status || 'In Progress';
        const matchedValue = s.serial_number || s.barcode || s.part_number || '';
        const matchedField = s.serial_number?.toLowerCase().includes(query.trim().toLowerCase())
          ? 'Serial Number'
          : s.barcode?.toLowerCase().includes(query.trim().toLowerCase())
            ? 'Barcode'
            : 'Part Number';
        results.push({
          type: 'P2 Serial',
          id: s.id,
          title: s.serial_number || s.barcode || 'Unknown Serial',
          subtitle: [
            s.part_name || s.part_number,
            s.po_number ? `PO: ${s.po_number}` : null,
            s.customer_name || null,
            `Status: ${statusLabel}`,
            s.current_department ? `Dept: ${s.current_department}` : null,
          ].filter(Boolean).join(' • '),
          matchedField,
          matchedValue,
          url: s.lot_id ? `/p2/shipments/${s.lot_id}` : '/p2-control-center',
          icon: '🏷️',
        });
      });
      console.log(`✅ Found ${serialResults.rows.length} P2 serials`);
    } catch (err: any) {
      console.log('⚠️ P2 serial search failed:', err.message);
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
