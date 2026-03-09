# EPOCH v8 - Quick Start How To Guide

This guide covers the essential steps for common tasks in EPOCH v8.

---

## Order Entry

### Creating a New Order

1. **Navigate to Order Entry** - Click "Order Entry" in the navigation menu

2. **Select a Customer**
   - Use the customer search box to find an existing customer
   - Type the customer name and select from the dropdown
   - If the customer doesn't exist, create them first in Customer Management

3. **Choose a Stock Model**
   - Select the stock model from the dropdown (e.g., CF Ferrata, Mesa Universal)
   - The base price will automatically populate

4. **Configure Features**
   - Select options for each feature category:
     - Action Inlet
     - Barrel Inlet
     - Bottom Metal
     - Paint Options
     - Rails
     - Texture Options
   - Prices update automatically as you make selections

5. **Set Order Details**
   - Order Date (defaults to today)
   - Due Date (calculated automatically, or set manually)
   - Customer PO (if provided)
   - FishBowl Order Number (if applicable)

6. **Review Pricing**
   - Check the Order Summary panel on the right
   - Verify subtotal, discounts, shipping, and total

7. **Save the Order**
   - Click "Save Draft" to save as a draft order
   - Click "Finalize Order" to move it to the Production Queue

---

## Production Queue

### Viewing the Production Queue

1. **Navigate to Production Queue** - Click "Production Queue" in the navigation menu

2. **View Orders by Department**
   - Orders are organized by their current department/stage
   - Each order shows: Order ID, Customer, Stock Model, Due Date, and Status

3. **Search for Orders**
   - Use the search box to find orders by Order ID or FishBowl Number
   - Filter by status, department, or date range

### Moving Orders Through Production

1. **Select an Order** - Click on the order card to view details

2. **Update Department**
   - Click the appropriate department button to advance the order
   - Common progression: Layup → Plugging → CNC → Finish → Gunsmith → Paint → QC → Shipping

3. **Record Completion**
   - When a department completes their work, click the completion button
   - The order automatically moves to the next department

4. **Handle Kickbacks**
   - If an order needs to go back to a previous department, use the Kickback feature
   - Select the department to return to and provide a reason

---

## Creating a BOM (Bill of Materials)

### Creating a New BOM Definition

1. **Navigate to BOM Management** - Click "BOM" or "Bill of Materials" in the navigation menu

2. **Create New BOM**
   - Click "Create New BOM" or the "+" button
   - Enter a name for the BOM (e.g., "CF Ferrata Standard")

3. **Select the Stock Model**
   - Choose which stock model this BOM applies to
   - This links the BOM to orders using that model

4. **Add Components**
   - Click "Add Component" or "Add Item"
   - For each component:
     - Select the part from inventory
     - Enter the quantity required
     - Set the unit of measure

5. **Organize by Category**
   - Group components by category (e.g., Raw Materials, Hardware, Packaging)
   - This helps with production planning

6. **Set Revision**
   - BOMs support revision control
   - Add notes about changes when creating new revisions

7. **Save and Activate**
   - Click "Save" to store the BOM
   - Set as "Active" to use it for new orders

### Using BOMs with Orders

- When an order is created with a stock model that has a BOM, the system can:
  - Calculate required materials
  - Check inventory availability
  - Generate pick lists for production

---

## Quick Tips

- **Keyboard Shortcuts**: Use Ctrl+E (or Cmd+E on Mac) for global search
- **Draft Orders**: Save frequently - drafts are preserved until finalized
- **Balance Due**: The balance updates automatically as payments are recorded
- **Barcode Scanning**: Use barcode scanners for faster order lookup in Production Queue

---

*For detailed instructions and all options, see the Detailed Reference Guide.*
