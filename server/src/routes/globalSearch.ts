import { Router } from 'express';
import { db } from '../../db';
import { 
  customers, 
  customerAddresses,
  vendors, 
  vendorContacts,
  allOrders,
  payments,
  creditCardTransactions,
  employees,
  inventoryItems,
  partsRequests,
  purchaseOrders,
  p2PurchaseOrders,
  documents,
  productionOrders,
  p2ProductionOrders,
  taskItems,
  kickbacks,
  refundRequests,
  internalMessages,
  communicationLogs,
  users,
  forms,
  trainingModules,
  nonconformanceRecords,
  metalAccessories
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
    
    if (!query || query.trim().length === 0) {
      return res.json({ results: [] });
    }

    const searchTerm = `%${query.trim()}%`;
    const results: SearchResult[] = [];

    // Search Customers
    const customerResults = await db
      .select()
      .from(customers)
      .where(
        or(
          ilike(customers.name, searchTerm),
          ilike(customers.company, searchTerm),
          ilike(customers.email, searchTerm),
          ilike(customers.phone, searchTerm),
          ilike(customers.contact, searchTerm),
          ilike(customers.notes, searchTerm)
        )
      )
      .limit(10);

    customerResults.forEach((customer) => {
      const matchedField = 
        customer.name?.toLowerCase().includes(query.toLowerCase()) ? 'name' :
        customer.company?.toLowerCase().includes(query.toLowerCase()) ? 'company' :
        customer.email?.toLowerCase().includes(query.toLowerCase()) ? 'email' :
        customer.phone?.toLowerCase().includes(query.toLowerCase()) ? 'phone' :
        customer.contact?.toLowerCase().includes(query.toLowerCase()) ? 'contact' : 'notes';
      
      results.push({
        type: 'Customer',
        id: customer.id,
        title: customer.name || customer.company || 'Unnamed Customer',
        subtitle: customer.company ? `${customer.company} • ${customer.email || customer.phone || ''}` : (customer.email || customer.phone || ''),
        matchedField,
        matchedValue: customer[matchedField as keyof typeof customer] as string || '',
        url: `/customer-management?id=${customer.id}`,
        icon: '👤'
      });
    });

    // Search Customer Addresses
    const addressResults = await db
      .select()
      .from(customerAddresses)
      .where(
        or(
          ilike(customerAddresses.street, searchTerm),
          ilike(customerAddresses.city, searchTerm),
          ilike(customerAddresses.state, searchTerm),
          ilike(customerAddresses.zipCode, searchTerm)
        )
      )
      .limit(5);

    addressResults.forEach((address) => {
      results.push({
        type: 'Customer Address',
        id: address.id,
        title: `${address.street}, ${address.city}`,
        subtitle: `${address.state} ${address.zipCode} • Customer: ${address.customerId}`,
        matchedField: 'address',
        matchedValue: `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`,
        url: `/customer-management?id=${address.customerId}`,
        icon: '📍'
      });
    });

    // Search Vendors
    const vendorResults = await db
      .select()
      .from(vendors)
      .where(
        or(
          ilike(vendors.name, searchTerm),
          ilike(vendors.email, searchTerm),
          ilike(vendors.phone, searchTerm),
          ilike(vendors.address, searchTerm),
          ilike(vendors.notes, searchTerm)
        )
      )
      .limit(10);

    vendorResults.forEach((vendor) => {
      const matchedField = 
        vendor.name?.toLowerCase().includes(query.toLowerCase()) ? 'name' :
        vendor.email?.toLowerCase().includes(query.toLowerCase()) ? 'email' :
        vendor.phone?.toLowerCase().includes(query.toLowerCase()) ? 'phone' : 'notes';
      
      results.push({
        type: 'Vendor',
        id: vendor.id,
        title: vendor.name || 'Unnamed Vendor',
        subtitle: `${vendor.email || ''} • ${vendor.phone || ''}`,
        matchedField,
        matchedValue: vendor[matchedField as keyof typeof vendor] as string || '',
        url: `/vendor-management?id=${vendor.id}`,
        icon: '🏢'
      });
    });

    // Search Vendor Contacts
    const vendorContactResults = await db
      .select()
      .from(vendorContacts)
      .where(
        or(
          ilike(vendorContacts.name, searchTerm),
          ilike(vendorContacts.email, searchTerm),
          ilike(vendorContacts.phone, searchTerm),
          ilike(vendorContacts.title, searchTerm)
        )
      )
      .limit(5);

    vendorContactResults.forEach((contact) => {
      results.push({
        type: 'Vendor Contact',
        id: contact.id,
        title: contact.name || 'Unnamed Contact',
        subtitle: `${contact.title || ''} • Vendor ID: ${contact.vendorId}`,
        matchedField: 'contact',
        matchedValue: `${contact.name} - ${contact.email || contact.phone || ''}`,
        url: `/vendor-management?id=${contact.vendorId}`,
        icon: '📞'
      });
    });

    // Search Orders
    const orderResults = await db
      .select()
      .from(allOrders)
      .where(
        or(
          ilike(allOrders.orderId, searchTerm),
          ilike(allOrders.customerId, searchTerm),
          ilike(allOrders.customerPO, searchTerm),
          ilike(allOrders.fbOrderNumber, searchTerm),
          ilike(allOrders.trackingNumber, searchTerm),
          ilike(allOrders.barcode, searchTerm),
          ilike(allOrders.notes, searchTerm)
        )
      )
      .limit(15);

    orderResults.forEach((order) => {
      const matchedField = 
        order.orderId?.toLowerCase().includes(query.toLowerCase()) ? 'orderId' :
        order.customerPO?.toLowerCase().includes(query.toLowerCase()) ? 'customerPO' :
        order.fbOrderNumber?.toLowerCase().includes(query.toLowerCase()) ? 'fbOrderNumber' :
        order.trackingNumber?.toLowerCase().includes(query.toLowerCase()) ? 'trackingNumber' :
        order.barcode?.toLowerCase().includes(query.toLowerCase()) ? 'barcode' : 'notes';
      
      results.push({
        type: 'Order',
        id: order.id,
        title: `Order ${order.orderId}`,
        subtitle: `Customer: ${order.customerId || 'N/A'} • Status: ${order.status} • ${order.customerPO ? `PO: ${order.customerPO}` : ''}`,
        matchedField,
        matchedValue: order[matchedField as keyof typeof order] as string || '',
        url: `/all-orders?orderId=${order.orderId}`,
        icon: '📦'
      });
    });

    // Search Payments
    const paymentResults = await db
      .select()
      .from(payments)
      .where(
        or(
          ilike(payments.orderId, searchTerm),
          ilike(payments.paymentType, searchTerm),
          ilike(payments.notes, searchTerm)
        )
      )
      .limit(10);

    paymentResults.forEach((payment) => {
      results.push({
        type: 'Payment',
        id: payment.id,
        title: `Payment - ${payment.paymentType}`,
        subtitle: `Order: ${payment.orderId} • Amount: $${payment.paymentAmount?.toFixed(2) || '0.00'}`,
        matchedField: 'payment',
        matchedValue: `${payment.paymentType} - $${payment.paymentAmount}`,
        url: `/payment-management?orderId=${payment.orderId}`,
        icon: '💳'
      });
    });

    // Search Credit Card Transactions
    const transactionResults = await db
      .select()
      .from(creditCardTransactions)
      .where(
        or(
          ilike(creditCardTransactions.orderId, searchTerm),
          ilike(creditCardTransactions.transactionId, searchTerm),
          ilike(creditCardTransactions.lastFourDigits, searchTerm),
          ilike(creditCardTransactions.customerEmail, searchTerm),
          ilike(creditCardTransactions.billingZip, searchTerm)
        )
      )
      .limit(10);

    transactionResults.forEach((transaction) => {
      results.push({
        type: 'Credit Card Transaction',
        id: transaction.id,
        title: `Transaction ${transaction.transactionId}`,
        subtitle: `Order: ${transaction.orderId} • Card: ****${transaction.lastFourDigits} • $${transaction.amount?.toFixed(2)}`,
        matchedField: 'transaction',
        matchedValue: transaction.transactionId || '',
        url: `/payment-management?orderId=${transaction.orderId}`,
        icon: '💰'
      });
    });

    // Search Employees
    const employeeResults = await db
      .select()
      .from(employees)
      .where(
        or(
          ilike(employees.name, searchTerm),
          ilike(employees.email, searchTerm),
          ilike(employees.phone, searchTerm),
          ilike(employees.employeeCode, searchTerm),
          ilike(employees.jobTitle, searchTerm),
          ilike(employees.department, searchTerm)
        )
      )
      .limit(10);

    employeeResults.forEach((employee) => {
      const matchedField = 
        employee.name?.toLowerCase().includes(query.toLowerCase()) ? 'name' :
        employee.email?.toLowerCase().includes(query.toLowerCase()) ? 'email' :
        employee.phone?.toLowerCase().includes(query.toLowerCase()) ? 'phone' : 'jobTitle';
      
      results.push({
        type: 'Employee',
        id: employee.id,
        title: employee.name || 'Unnamed Employee',
        subtitle: `${employee.jobTitle || ''} • ${employee.department || ''} • ${employee.email || ''}`,
        matchedField,
        matchedValue: employee[matchedField as keyof typeof employee] as string || '',
        url: `/employee-detail/${employee.id}`,
        icon: '👨‍💼'
      });
    });

    // Search Inventory Items
    const inventoryResults = await db
      .select()
      .from(inventoryItems)
      .where(
        or(
          ilike(inventoryItems.agPartNumber, searchTerm),
          ilike(inventoryItems.name, searchTerm),
          ilike(inventoryItems.source, searchTerm),
          ilike(inventoryItems.supplierPartNumber, searchTerm),
          ilike(inventoryItems.notes, searchTerm)
        )
      )
      .limit(10);

    inventoryResults.forEach((item) => {
      const matchedField = 
        item.agPartNumber?.toLowerCase().includes(query.toLowerCase()) ? 'agPartNumber' :
        item.name?.toLowerCase().includes(query.toLowerCase()) ? 'name' : 'source';
      
      results.push({
        type: 'Inventory Item',
        id: item.id,
        title: item.name || 'Unnamed Item',
        subtitle: `Part #: ${item.agPartNumber} • ${item.source || ''}`,
        matchedField,
        matchedValue: item[matchedField as keyof typeof item] as string || '',
        url: `/inventory-manager?partNumber=${item.agPartNumber}`,
        icon: '📦'
      });
    });

    // Search Parts Requests
    const partsRequestResults = await db
      .select()
      .from(partsRequests)
      .where(
        or(
          ilike(partsRequests.partNumber, searchTerm),
          ilike(partsRequests.partName, searchTerm),
          ilike(partsRequests.requestedBy, searchTerm),
          ilike(partsRequests.supplier, searchTerm),
          ilike(partsRequests.reason, searchTerm)
        )
      )
      .limit(10);

    partsRequestResults.forEach((request) => {
      results.push({
        type: 'Parts Request',
        id: request.id,
        title: request.partName || 'Unnamed Part',
        subtitle: `Part #: ${request.partNumber} • Status: ${request.status} • Requested by: ${request.requestedBy}`,
        matchedField: 'partName',
        matchedValue: request.partName || '',
        url: `/inventory-manager?requestId=${request.id}`,
        icon: '🔧'
      });
    });

    // Search Purchase Orders
    const poResults = await db
      .select()
      .from(purchaseOrders)
      .where(
        or(
          ilike(purchaseOrders.poNumber, searchTerm),
          ilike(purchaseOrders.customerName, searchTerm),
          ilike(purchaseOrders.notes, searchTerm)
        )
      )
      .limit(10);

    poResults.forEach((po) => {
      results.push({
        type: 'Purchase Order',
        id: po.id,
        title: `PO ${po.poNumber}`,
        subtitle: `Customer: ${po.customerName} • Status: ${po.status}`,
        matchedField: 'poNumber',
        matchedValue: po.poNumber || '',
        url: `/purchase-orders?poId=${po.id}`,
        icon: '📄'
      });
    });

    // Search Documents
    const documentResults = await db
      .select()
      .from(documents)
      .where(
        or(
          ilike(documents.title, searchTerm),
          ilike(documents.description, searchTerm),
          ilike(documents.fileName, searchTerm)
        )
      )
      .limit(10);

    documentResults.forEach((doc) => {
      results.push({
        type: 'Document',
        id: doc.id,
        title: doc.title || doc.fileName || 'Unnamed Document',
        subtitle: doc.description || `Type: ${doc.documentType || 'N/A'}`,
        matchedField: 'title',
        matchedValue: doc.title || '',
        url: `/document-management?docId=${doc.id}`,
        icon: '📋'
      });
    });

    // Search Task Items
    const taskResults = await db
      .select()
      .from(taskItems)
      .where(
        or(
          ilike(taskItems.title, searchTerm),
          ilike(taskItems.description, searchTerm),
          ilike(taskItems.assignedTo, searchTerm),
          ilike(taskItems.createdBy, searchTerm)
        )
      )
      .limit(10);

    taskResults.forEach((task) => {
      const status = task.finishedStatus ? 'Finished' : task.tmStatus ? 'TM Complete' : task.gjStatus ? 'GJ Complete' : 'Pending';
      results.push({
        type: 'Task',
        id: task.id,
        title: task.title || 'Unnamed Task',
        subtitle: `Assigned to: ${task.assignedTo || 'Unassigned'} • Status: ${status}`,
        matchedField: 'title',
        matchedValue: task.title || '',
        url: `/task-tracker?taskId=${task.id}`,
        icon: '✅'
      });
    });

    // Search Users
    const userResults = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role
      })
      .from(users)
      .where(
        or(
          ilike(users.username, searchTerm),
          ilike(users.firstName, searchTerm),
          ilike(users.lastName, searchTerm),
          ilike(users.email, searchTerm)
        )
      )
      .limit(10);

    userResults.forEach((user) => {
      results.push({
        type: 'User',
        id: user.id,
        title: user.username || 'Unnamed User',
        subtitle: `${user.firstName || ''} ${user.lastName || ''} • ${user.role || ''}`,
        matchedField: 'username',
        matchedValue: user.username || '',
        url: `/user-management?userId=${user.id}`,
        icon: '👥'
      });
    });

    // Search Training Modules
    const trainingResults = await db
      .select()
      .from(trainingModules)
      .where(
        or(
          ilike(trainingModules.title, searchTerm),
          ilike(trainingModules.description, searchTerm),
          ilike(trainingModules.category, searchTerm)
        )
      )
      .limit(10);

    trainingResults.forEach((training) => {
      results.push({
        type: 'Training Module',
        id: training.id,
        title: training.title || 'Unnamed Training',
        subtitle: `Category: ${training.category || 'N/A'} • ${training.estimatedMinutes || 0} minutes`,
        matchedField: 'title',
        matchedValue: training.title || '',
        url: `/training/${training.id}`,
        icon: '📚'
      });
    });

    // Search Refund Requests
    const refundResults = await db
      .select()
      .from(refundRequests)
      .where(
        or(
          ilike(refundRequests.orderId, searchTerm),
          ilike(refundRequests.customerId, searchTerm),
          ilike(refundRequests.reason, searchTerm),
          ilike(refundRequests.transactionId, searchTerm)
        )
      )
      .limit(10);

    refundResults.forEach((refund) => {
      results.push({
        type: 'Refund Request',
        id: refund.id,
        title: `Refund Request #${refund.id}`,
        subtitle: `Order: ${refund.orderId} • Status: ${refund.status} • Amount: $${refund.refundAmount?.toFixed(2) || '0.00'}`,
        matchedField: 'refund',
        matchedValue: refund.reason || '',
        url: `/refund-queue?refundId=${refund.id}`,
        icon: '💸'
      });
    });

    // Sort results by relevance (exact matches first)
    results.sort((a, b) => {
      const aExact = a.matchedValue.toLowerCase() === query.toLowerCase();
      const bExact = b.matchedValue.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });

    res.json({ 
      results,
      totalCount: results.length,
      query: query.trim()
    });
  } catch (error: any) {
    console.error('Global search error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
