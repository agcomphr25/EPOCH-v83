
import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const router = Router();

// Generate PDF for Layup Schedule
router.get('/layup-schedule/pdf', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, moldId } = req.query;
    
    // Get layup schedule data from storage
    const { storage } = await import('../../storage');
    
    // Get all the data we need for the comprehensive report
    const orders = await storage.getAllOrderDrafts();
    const molds = await storage.getAllMolds();
    const employees = await storage.getAllEmployeeLayupSettings();
    const features = await storage.getAllFeatures();
    const stockModels = await storage.getAllStockModels();
    
    // Get P1 Purchase Orders
    const pos = await storage.getAllPurchaseOrders();
    const activePos = pos.filter(po => po.status === 'OPEN');
    
    // Build unified order list similar to the scheduler
    const finalized = orders.filter(order => 
      order.status === 'FINALIZED' && 
      (order.currentDepartment === 'Layup' || !order.currentDepartment)
    );
    
    const p1LayupOrders = [];
    for (const po of activePos) {
      const items = await storage.getPurchaseOrderItems(po.id);
      const stockModelItems = items.filter(item => item.itemId && item.itemId.trim());
      
      for (const item of stockModelItems) {
        p1LayupOrders.push({
          id: `p1-${po.id}-${item.id}`,
          orderId: `P1-${po.poNumber}-${item.id}`,
          orderDate: po.poDate,
          customer: po.customerName,
          product: item.itemId,
          quantity: item.quantity,
          status: 'PENDING',
          department: 'Layup',
          currentDepartment: 'Layup',
          dueDate: po.expectedDelivery,
          source: 'p1_purchase_order',
          stockModelId: item.itemId,
          modelId: item.itemId,
          features: item.specifications || {},
          createdAt: po.createdAt,
          updatedAt: po.updatedAt
        });
      }
    }

    const regularLayupOrders = finalized.map(order => ({
      id: order.id?.toString() || order.orderId,
      orderId: order.orderId,
      orderDate: order.orderDate,
      customer: order.customerId || 'Unknown',
      product: order.modelId || 'Unknown',
      quantity: 1,
      status: order.status,
      department: 'Layup',
      currentDepartment: 'Layup',
      dueDate: order.dueDate,
      source: 'main_orders',
      stockModelId: order.modelId,
      modelId: order.modelId,
      features: order.features || {},
      createdAt: order.orderDate,
      updatedAt: order.updatedAt || order.orderDate
    }));

    const allLayupOrders = [...regularLayupOrders, ...p1LayupOrders];

    // Helper functions (same as scheduler)
    const getModelDisplayName = (modelId) => {
      if (!modelId) return 'Unknown Model';
      
      const model = stockModels.find(m => m.id === modelId);
      if (model?.displayName) {
        return model.displayName;
      }
      
      if (modelId.includes('_')) {
        return modelId
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      return model?.name || modelId;
    };

    const getMaterialType = (modelId) => {
      if (!modelId) return null;
      if (modelId.startsWith('cf_')) return 'CF';
      if (modelId.startsWith('fg_')) return 'FG';
      if (modelId.includes('carbon')) return 'CF';
      if (modelId.includes('fiberglass')) return 'FG';
      return null;
    };

    const getActionLength = (orderFeatures) => {
      if (!orderFeatures) return null;
      
      let actionLengthValue = orderFeatures.action_length;
      
      // If no direct action_length, try to derive from action_inlet
      if ((!actionLengthValue || actionLengthValue === 'none') && orderFeatures.action_inlet) {
        const actionInlet = orderFeatures.action_inlet;
        const inletToLengthMap = {
          'anti_ten_hunter_def': 'SA',
          'remington_700': 'SA',
          'remington_700_long': 'LA',
          'rem_700': 'SA',
          'rem_700_short': 'SA',
          'rem_700_long': 'LA', 
          'tikka_t3': 'SA',
          'tikka_short': 'SA',
          'tikka_long': 'LA',
          'savage_short': 'SA',
          'savage_long': 'LA',
          'savage_110': 'LA',
          'winchester_70': 'LA',
          'howa_1500': 'SA',
          'bergara_b14': 'SA',
          'carbon_six_medium': 'MA',
          'lone_peak_fuzion': 'SA'  // Added missing mapping
        };
        
        actionLengthValue = inletToLengthMap[actionInlet];
      }
      
      if (!actionLengthValue || actionLengthValue === 'none') return null;
      
      const displayMap = {
        'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
        'long': 'LA', 'medium': 'MA', 'short': 'SA',
        'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
      };
      
      return displayMap[actionLengthValue] || actionLengthValue;
    };

    const getLOPDisplay = (orderFeatures) => {
      if (!orderFeatures || !features) return null;
      
      const lopValue = orderFeatures.length_of_pull;
      
      if (!lopValue || 
          lopValue === 'none' || 
          lopValue === 'standard' || 
          lopValue === 'std' ||
          lopValue === 'std_length' ||
          lopValue === 'standard_length' ||
          lopValue === 'no_extra_length' ||
          lopValue === 'std_no_extra_length' ||
          lopValue === 'no_lop_change' ||
          lopValue === '' || 
          lopValue === '0' ||
          lopValue === 'normal' ||
          lopValue.toLowerCase().includes('std') ||
          lopValue.toLowerCase().includes('standard') ||
          lopValue.toLowerCase().includes('no extra')) {
        return null;
      }
      
      const lopFeature = features.find(f => f.id === 'length_of_pull');
      
      if (lopFeature && lopFeature.options) {
        const option = lopFeature.options.find(opt => opt.value === lopValue);
        if (option && option.label) {
          return option.label;
        }
      }
      
      // Return the raw value if no feature mapping found
      return lopValue;
    };

    const getHeavyFillDisplay = (orderFeatures) => {
      if (!orderFeatures) return null;
      
      const otherOptions = orderFeatures.other_options;
      if (Array.isArray(otherOptions) && otherOptions.includes('heavy_fill')) {
        return 'Heavy Fill';
      }
      
      const heavyFillValue = orderFeatures.heavy_fill || 
                             orderFeatures.heavyFill || 
                             orderFeatures.heavy_fill_option ||
                             orderFeatures['heavy-fill'];
      
      if (heavyFillValue === 'true' || 
          heavyFillValue === true || 
          heavyFillValue === 'yes' ||
          heavyFillValue === 'heavy_fill') {
        return 'Heavy Fill';
      }
      
      return null;
    };

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([792, 612]); // Landscape orientation for more space
    const { width, height } = page.getSize();
    
    // Load fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const smallFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Header
    const title = 'Detailed Layup Schedule Report';
    const titleSize = 18;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 40,
      size: titleSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Report date and filters
    const reportDate = `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    page.drawText(reportDate, {
      x: 50,
      y: height - 70,
      size: 10,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Summary stats
    const summaryY = height - 100;
    const stats = [
      `Total Orders: ${allLayupOrders.length}`,
      `Active Molds: ${molds.filter(m => m.enabled).length}`,
      `Employees: ${employees.filter(emp => emp.isActive).length}`,
      `Regular Orders: ${regularLayupOrders.length}`,
      `P1 Purchase Orders: ${p1LayupOrders.length}`
    ];

    let statsX = 50;
    stats.forEach((stat, index) => {
      page.drawText(stat, {
        x: statsX,
        y: summaryY,
        size: 9,
        font: regularFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      statsX += 140;
    });

    // Table headers
    const headerY = height - 140;
    const headers = ['Order ID', 'Model', 'Material', 'Action', 'LOP', 'Heavy Fill', 'Customer', 'Due Date', 'Source'];
    const columnWidths = [85, 100, 45, 40, 60, 55, 90, 70, 50];
    let currentX = 30;

    headers.forEach((header, index) => {
      page.drawText(header, {
        x: currentX,
        y: headerY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      currentX += columnWidths[index];
    });

    // Draw header underline
    page.drawLine({
      start: { x: 30, y: headerY - 5 },
      end: { x: width - 30, y: headerY - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    // Table data
    let currentY = headerY - 20;
    const rowHeight = 16;
    const maxRowsPerPage = Math.floor((height - 200) / rowHeight);
    let rowCount = 0;

    // Sort orders by due date
    const sortedOrders = allLayupOrders.sort((a, b) => {
      const aDate = new Date(a.dueDate || a.orderDate);
      const bDate = new Date(b.dueDate || b.orderDate);
      return aDate.getTime() - bDate.getTime();
    });

    sortedOrders.forEach((order, index) => {
      if (rowCount >= maxRowsPerPage) {
        // Add new page
        page = pdfDoc.addPage([792, 612]);
        currentY = height - 50;
        rowCount = 0;
        
        // Repeat headers on new page
        currentX = 30;
        headers.forEach((header, headerIndex) => {
          page.drawText(header, {
            x: currentX,
            y: currentY,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          currentX += columnWidths[headerIndex];
        });
        
        page.drawLine({
          start: { x: 30, y: currentY - 5 },
          end: { x: width - 30, y: currentY - 5 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        currentY -= 20;
      }

      currentX = 30;
      const modelId = order.stockModelId || order.modelId;
      const materialType = getMaterialType(modelId) || '';
      const actionLength = getActionLength(order.features) || '';
      const lopDisplay = getLOPDisplay(order.features) || '';
      const heavyFill = getHeavyFillDisplay(order.features) || '';
      const modelDisplay = getModelDisplayName(modelId);
      
      // Debug logging for missing data
      console.log(`PDF Debug - Order ${order.orderId}:`, {
        modelId,
        materialType,
        actionLength,
        lopDisplay,
        heavyFill,
        features: order.features
      });
      
      // Determine row color based on source
      let bgColor = rgb(1, 1, 1); // white
      if (order.source === 'p1_purchase_order') {
        bgColor = rgb(0.95, 1, 0.95); // light green
      }
      
      // Draw background
      page.drawRectangle({
        x: 30,
        y: currentY - 3,
        width: width - 60,
        height: rowHeight - 2,
        color: bgColor,
        borderColor: rgb(0.9, 0.9, 0.9),
        borderWidth: 0.5,
      });

      const rowData = [
        order.orderId || 'No ID',
        modelDisplay.length > 15 ? modelDisplay.substring(0, 12) + '...' : modelDisplay,
        materialType || '-',
        actionLength || '-',
        (lopDisplay && lopDisplay.length > 8) ? lopDisplay.substring(0, 6) + '...' : (lopDisplay || '-'),
        heavyFill ? 'Yes' : '-',
        (order.customer || 'Unknown').length > 12 ? order.customer.substring(0, 10) + '...' : (order.customer || 'Unknown'),
        order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-US', { month: 'M', day: 'd' }) : '-',
        order.source === 'p1_purchase_order' ? 'P1 PO' : 'Regular'
      ];

      rowData.forEach((data, colIndex) => {
        const textColor = order.source === 'p1_purchase_order' ? rgb(0, 0.5, 0) : rgb(0, 0, 0);
        const fontSize = colIndex === 1 ? 8 : 9; // Smaller font for model names
        
        page.drawText(data.toString(), {
          x: currentX + 2,
          y: currentY,
          size: fontSize,
          font: regularFont,
          color: textColor,
        });
        currentX += columnWidths[colIndex];
      });

      currentY -= rowHeight;
      rowCount++;
    });

    // Legend
    const legendY = Math.max(currentY - 30, 80);
    page.drawText('Legend:', {
      x: 50,
      y: legendY,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const legendItems = [
      'Material: CF = Carbon Fiber, FG = Fiberglass',
      'Action: SA = Short Action, LA = Long Action, MA = Medium Action',
      'LOP: Length of Pull (only shown if non-standard)',
      'Heavy Fill: Special manufacturing option',
      'Source: P1 PO = P1 Purchase Order, Regular = Standard Order'
    ];

    legendItems.forEach((item, index) => {
      page.drawText(item, {
        x: 50,
        y: legendY - 15 - (index * 12),
        size: 8,
        font: regularFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    });

    // Footer
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const currentPage = pdfDoc.getPage(i);
      const footerText = `Page ${i + 1} of ${pageCount} • Layup Schedule • ${new Date().toLocaleString()}`;
      currentPage.drawText(footerText, {
        x: 50,
        y: 30,
        size: 8,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="detailed-layup-schedule-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    
    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// Generate detailed mold utilization report
router.get('/mold-utilization/pdf', async (req: Request, res: Response) => {
  try {
    const { storage } = await import('../../storage');
    const molds = await storage.getAllMolds();
    const scheduleData = await storage.getAllLayupSchedule();
    
    // Calculate utilization metrics
    const utilizationData = molds.map(mold => {
      const moldSchedules = scheduleData.filter(schedule => schedule.moldId === mold.moldId);
      const totalScheduled = moldSchedules.length;
      const overrides = moldSchedules.filter(schedule => schedule.isOverride).length;
      
      return {
        moldId: mold.moldId,
        modelName: mold.modelName,
        totalScheduled,
        overrides,
        utilizationRate: mold.dailyCapacity ? (totalScheduled / (mold.dailyCapacity * 30)) * 100 : 0
      };
    });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Header
    const title = 'Mold Utilization Report';
    const titleSize = 20;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 50,
      size: titleSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Report details
    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: height - 90,
      size: 10,
      font: regularFont,
    });

    // Table headers
    const headerY = height - 130;
    const headers = ['Mold ID', 'Model', 'Scheduled', 'Overrides', 'Utilization %'];
    const columnWidths = [80, 120, 80, 80, 100];
    let currentX = 50;

    headers.forEach((header, index) => {
      page.drawText(header, {
        x: currentX,
        y: headerY,
        size: 12,
        font: boldFont,
      });
      currentX += columnWidths[index];
    });

    // Table data
    let currentY = headerY - 25;
    utilizationData.forEach(data => {
      currentX = 50;
      const rowData = [
        data.moldId,
        data.modelName || 'N/A',
        data.totalScheduled.toString(),
        data.overrides.toString(),
        `${data.utilizationRate.toFixed(1)}%`
      ];

      rowData.forEach((text, colIndex) => {
        page.drawText(text, {
          x: currentX,
          y: currentY,
          size: 10,
          font: regularFont,
        });
        currentX += columnWidths[colIndex];
      });

      currentY -= 20;
    });

    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mold-utilization-${new Date().toISOString().split('T')[0]}.pdf"`);
    
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('Mold utilization PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate mold utilization PDF' });
  }
});

export default router;
