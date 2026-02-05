import { Router, Request, Response } from 'express';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  PAGE_SIZES,
  DEFAULT_MARGIN,
  FONT_SIZES,
  SPACING,
  COLORS,
  getCenteredX,
} from '../../utils/pdf/pdfConfig';

const router = Router();

// Generate PDF for Layup Schedule
router.get('/layup-schedule/pdf', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, moldId } = req.query;

    // Get layup schedule data from storage
    const { storage } = await import('../../storage');

    // Get all the data we need for the comprehensive report
    const orders = await storage.getAllOrders();
    const molds = await storage.getAllMolds();
    const employees = await storage.getAllEmployeeLayupSettings();
    const features = await storage.getAllFeatures();
    const stockModels = await storage.getAllStockModels();

    // Get P1 Purchase Orders
    const pos = await storage.getAllPurchaseOrders();
    const activePos = pos.filter((po) => po.status === 'OPEN');

    // Build unified order list similar to the scheduler
    const finalized = orders.filter(
      (order) =>
        order.status === 'FINALIZED' &&
        (order.currentDepartment === 'Layup' || !order.currentDepartment)
    );

    const p1LayupOrders = [];
    for (const po of activePos) {
      const items = await storage.getPurchaseOrderItems(po.id);
      const stockModelItems = items.filter(
        (item) => item.itemId && item.itemId.trim()
      );

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
          updatedAt: po.updatedAt,
        });
      }
    }

    const regularLayupOrders = finalized.map((order) => ({
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
      updatedAt: order.updatedAt || order.orderDate,
    }));

    const allLayupOrders = [...regularLayupOrders, ...p1LayupOrders];

    // Helper functions (same as scheduler)
    const getModelDisplayName = (modelId) => {
      if (!modelId) return 'Unknown Model';

      const model = stockModels.find((m) => m.id === modelId);
      if (model?.displayName) {
        return model.displayName;
      }

      if (modelId.includes('_')) {
        return modelId
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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
      if (
        (!actionLengthValue || actionLengthValue === 'none') &&
        orderFeatures.action_inlet
      ) {
        const actionInlet = orderFeatures.action_inlet;
        const inletToLengthMap = {
          anti_ten_hunter_def: 'SA',
          remington_700: 'SA',
          remington_700_long: 'LA',
          rem_700: 'SA',
          rem_700_short: 'SA',
          rem_700_long: 'LA',
          tikka_t3: 'SA',
          tikka_short: 'SA',
          tikka_long: 'LA',
          savage_short: 'SA',
          savage_long: 'LA',
          savage_110: 'LA',
          winchester_70: 'LA',
          howa_1500: 'SA',
          bergara_b14: 'SA',
          carbon_six_medium: 'MA',
          lone_peak_fuzion: 'SA',
        };

        actionLengthValue = inletToLengthMap[actionInlet];
      }

      if (!actionLengthValue || actionLengthValue === 'none') return null;

      const displayMap = {
        Long: 'LA',
        Medium: 'MA',
        Short: 'SA',
        long: 'LA',
        medium: 'MA',
        short: 'SA',
        LA: 'LA',
        MA: 'MA',
        SA: 'SA',
      };

      return displayMap[actionLengthValue] || actionLengthValue;
    };

    const getLOPDisplay = (orderFeatures) => {
      if (!orderFeatures) return null;

      const lopValue = orderFeatures.length_of_pull;

      // Don't show if empty, none, standard, std, or any variation indicating no extra length
      if (
        !lopValue ||
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
        (typeof lopValue === 'string' &&
          (lopValue.toLowerCase().includes('std') ||
            lopValue.toLowerCase().includes('standard') ||
            lopValue.toLowerCase().includes('no extra')))
      ) {
        return null;
      }

      // Try to find feature definition if available
      if (features) {
        const lopFeature = features.find((f) => f.id === 'length_of_pull');
        if (lopFeature && lopFeature.options) {
          const option = lopFeature.options.find(
            (opt) => opt.value === lopValue
          );
          if (option && option.label) {
            return option.label;
          }
        }
      }

      // Return the raw value if no feature mapping found
      return lopValue;
    };

    const getHeavyFillDisplay = (orderFeatures) => {
      if (!orderFeatures) return false;

      // Check if heavy_fill is in the other_options array
      const otherOptions = orderFeatures.other_options;
      if (Array.isArray(otherOptions) && otherOptions.includes('heavy_fill')) {
        return true;
      }

      // Check direct field for backward compatibility
      const heavyFillValue =
        orderFeatures.heavy_fill ||
        orderFeatures.heavyFill ||
        orderFeatures.heavy_fill_option ||
        orderFeatures['heavy-fill'];

      if (
        heavyFillValue === 'true' ||
        heavyFillValue === true ||
        heavyFillValue === 'yes' ||
        heavyFillValue === 'heavy_fill'
      ) {
        return true;
      }

      return false;
    };

    const getStillerDisplay = (orderFeatures, actionLength) => {
      if (!orderFeatures) return false;
      
      // Only show Stiller badge for Medium Action (MA)
      if (actionLength !== 'MA') return false;
      
      // Get the action inlet value
      const actionInlet = (orderFeatures.action_inlet || '').toLowerCase();
      if (!actionInlet) return false;
      
      // List of inlet patterns that indicate Stiller (same as LayupSchedulePreview.tsx)
      const stillerInlets = [
        'xm+', 'xm_plus', 'xmplus', 
        'lone peak', 'lone_peak', 'lonepeak', 
        'stiller', 
        'bighorn', 'big_horn', 'big horn'
      ];
      
      // Check if the action inlet matches any Stiller pattern
      return stillerInlets.some(pattern => actionInlet.includes(pattern));
    };

    // Create PDF document (landscape for card layout)
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage(PAGE_SIZES.LETTER_LANDSCAPE);
    const { width, height } = page.getSize();
    const margin = DEFAULT_MARGIN;

    // Load fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Header
    const title = 'Detailed Layup Schedule Report';
    const titleX = getCenteredX(title, width, FONT_SIZES.TITLE_LARGE, boldFont);

    page.drawText(title, {
      x: titleX,
      y: height - margin,
      size: FONT_SIZES.TITLE_LARGE,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });

    // Report date and filters
    const reportDate = `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    page.drawText(reportDate, {
      x: margin,
      y: height - margin - SPACING.SECTION_GAP_SMALL,
      size: FONT_SIZES.BODY_LARGE,
      font: regularFont,
      color: COLORS.TEXT_TERTIARY,
    });

    // Summary stats
    const summaryY = height - margin - SPACING.SECTION_GAP_MEDIUM;
    const stats = [
      `Total Orders: ${allLayupOrders.length}`,
      `Active Molds: ${molds.filter((m) => m.enabled).length}`,
      `Employees: ${employees.filter((emp) => emp.isActive).length}`,
      `Regular Orders: ${regularLayupOrders.length}`,
      `P1 Purchase Orders: ${p1LayupOrders.length}`,
    ];

    let statsX = margin;
    stats.forEach((stat) => {
      page.drawText(stat, {
        x: statsX,
        y: summaryY,
        size: FONT_SIZES.BODY_MEDIUM,
        font: regularFont,
        color: COLORS.TEXT_SECONDARY,
      });
      statsX += 140;
    });

    // Card layout header
    const headerY = height - margin - SPACING.SECTION_GAP_LARGE - SPACING.SECTION_GAP_MEDIUM;
    page.drawText(
      'Orders displayed as cards matching the Layup Scheduler format:',
      {
        x: margin,
        y: headerY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      }
    );

    // Card-style layout instead of table
    let currentY = headerY - 20;
    const cardHeight = 80;
    const cardWidth = 180;
    const cardsPerRow = 4;
    const cardSpacing = 10;
    const maxCardsPerPage =
      Math.floor((height - 200) / (cardHeight + cardSpacing)) * cardsPerRow;
    let cardCount = 0;

    // Sort orders by due date
    const sortedOrders = allLayupOrders.sort((a, b) => {
      const aDate = new Date(a.dueDate || a.orderDate);
      const bDate = new Date(b.dueDate || b.orderDate);
      return aDate.getTime() - bDate.getTime();
    });

    sortedOrders.forEach((order, index) => {
      if (cardCount >= maxCardsPerPage) {
        // Add new page
        page = pdfDoc.addPage([792, 612]);
        currentY = height - 50;
        cardCount = 0;
      }

      // Calculate card position
      const row = Math.floor(cardCount / cardsPerRow);
      const col = cardCount % cardsPerRow;
      const cardX = 30 + col * (cardWidth + cardSpacing);
      const cardY = currentY - row * (cardHeight + cardSpacing);

      const modelId = order.stockModelId || order.modelId;
      const materialType = getMaterialType(modelId);
      const actionLength = getActionLength(order.features);
      const lopDisplay = getLOPDisplay(order.features);
      const heavyFill = getHeavyFillDisplay(order.features);
      const showStiller = getStillerDisplay(order.features, actionLength);
      const modelDisplay = getModelDisplayName(modelId);

      // Determine card color based on source (using standard colors where possible)
      let bgColor = COLORS.BG_LIGHT_GRAY; // default
      let borderColor = COLORS.BORDER_GRAY;
      let textColor = COLORS.ACCENT_BLUE;

      if (order.source === 'p1_purchase_order') {
        bgColor = COLORS.BG_LIGHT_GRAY;
        borderColor = COLORS.ACCENT_GREEN;
        textColor = COLORS.ACCENT_GREEN;
      } else if (order.source === 'production_order') {
        bgColor = COLORS.BG_LIGHT_GRAY;
        borderColor = COLORS.ACCENT_RED;
        textColor = COLORS.ACCENT_RED;
      } else {
        bgColor = COLORS.BG_LIGHT_GRAY;
        borderColor = COLORS.ACCENT_BLUE;
        textColor = COLORS.ACCENT_BLUE;
      }

      // Draw card background
      page.drawRectangle({
        x: cardX,
        y: cardY - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: bgColor,
        borderColor: borderColor,
        borderWidth: 1,
      });

      let textY = cardY - 12;
      const lineHeight = 9;

      // Order ID (large, bold)
      const orderId = order.orderId || 'No ID';
      page.drawText(orderId, {
        x: cardX + SPACING.BOX_PADDING_SMALL,
        y: textY,
        size: FONT_SIZES.BODY_LARGE + 1,
        font: boldFont,
        color: textColor,
      });

      // Source badge
      if (order.source === 'p1_purchase_order') {
        page.drawText('P1', {
          x: cardX + cardWidth - 20,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: boldFont,
          color: COLORS.ACCENT_GREEN,
        });
      } else if (order.source === 'production_order') {
        page.drawText('PO', {
          x: cardX + cardWidth - 20,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: boldFont,
          color: COLORS.ACCENT_RED,
        });
      }

      textY -= lineHeight + 2;

      // Model name with material type
      if (modelDisplay) {
        let modelText =
          modelDisplay.length > 18
            ? modelDisplay.substring(0, 16) + '..'
            : modelDisplay;
        if (materialType) {
          modelText = `${materialType} ${modelText}`;
        }
        page.drawText(modelText, {
          x: cardX + SPACING.BOX_PADDING_SMALL,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
      }

      textY -= lineHeight;

      // Action Length
      if (actionLength) {
        page.drawText(`Action: ${actionLength}`, {
          x: cardX + SPACING.BOX_PADDING_SMALL,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
      }

      textY -= lineHeight;

      // Length of Pull (LOP)
      if (lopDisplay) {
        page.drawText(`LOP: ${lopDisplay}`, {
          x: cardX + SPACING.BOX_PADDING_SMALL,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
      }

      textY -= lineHeight;

      // Heavy Fill
      if (heavyFill) {
        page.drawText('Heavy Fill', {
          x: cardX + SPACING.BOX_PADDING_SMALL,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: boldFont,
          color: COLORS.ACCENT_RED,
        });
        textY -= lineHeight;
      }

      // Stiller badge (for Medium Action with specific inlets)
      if (showStiller) {
        page.drawText('Stiller', {
          x: cardX + SPACING.BOX_PADDING_SMALL,
          y: textY,
          size: FONT_SIZES.BODY_SMALL,
          font: boldFont,
          color: COLORS.ACCENT_ORANGE,
        });
        textY -= lineHeight;
      }

      // Customer and Due Date at bottom
      const customer =
        (order.customer || 'Unknown').length > 15
          ? order.customer.substring(0, 13) + '..'
          : order.customer || 'Unknown';
      page.drawText(`${customer}`, {
        x: cardX + SPACING.BOX_PADDING_SMALL,
        y: cardY - cardHeight + 12,
        size: FONT_SIZES.TINY,
        font: regularFont,
        color: COLORS.TEXT_LIGHT,
      });

      if (order.dueDate) {
        const dueDate = new Date(order.dueDate).toLocaleDateString('en-US', {
          month: 'M',
          day: 'd',
        });
        page.drawText(`Due: ${dueDate}`, {
          x: cardX + SPACING.BOX_PADDING_SMALL,
          y: cardY - cardHeight + 4,
          size: FONT_SIZES.TINY,
          font: regularFont,
          color: COLORS.TEXT_LIGHT,
        });
      }

      cardCount++;

      // Move to next row after filling current row
      if (cardCount % cardsPerRow === 0) {
        currentY -= cardHeight + cardSpacing;
      }
    });

    // Add legend on last page
    if (cardCount > 0) {
      currentY -= 60; // Space before legend
    }

    const legendY = Math.max(currentY, 120);
    page.drawText('Card Format Legend:', {
      x: margin,
      y: legendY,
      size: FONT_SIZES.SECTION_HEADER,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });

    const legendItems = [
      'Blue Cards: Regular Orders | Green Cards: P1 Purchase Orders | Orange Cards: Production Orders',
      'Material: CF = Carbon Fiber, FG = Fiberglass',
      'Action: SA = Short Action, LA = Long Action, MA = Medium Action',
      'LOP: Length of Pull (only shown if non-standard)',
      'Heavy Fill: Special manufacturing option requiring extra attention',
      'Stiller: Medium Action with Stiller/XM+/Lone Peak/Bighorn inlet',
      'Each card shows the same information displayed in the Layup Scheduler',
    ];

    legendItems.forEach((item, index) => {
      page.drawText(item, {
        x: margin,
        y: legendY - SPACING.LINE_SPACING_MEDIUM - index * SPACING.LINE_SPACING_COMPACT,
        size: FONT_SIZES.BODY_SMALL,
        font: regularFont,
        color: COLORS.TEXT_SECONDARY,
      });
    });

    // Footer
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const currentPage = pdfDoc.getPage(i);
      const footerText = `Page ${i + 1} of ${pageCount} • Layup Schedule • ${new Date().toLocaleString()}`;
      currentPage.drawText(footerText, {
        x: margin,
        y: SPACING.SECTION_GAP_SMALL - 10,
        size: FONT_SIZES.BODY_SMALL,
        font: regularFont,
        color: COLORS.TEXT_TERTIARY,
      });
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="detailed-layup-schedule-${new Date().toISOString().split('T')[0]}.pdf"`
    );
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
    const utilizationData = molds.map((mold) => {
      const moldSchedules = scheduleData.filter(
        (schedule) => schedule.moldId === mold.moldId
      );
      const totalScheduled = moldSchedules.length;
      const overrides = moldSchedules.filter(
        (schedule) => schedule.isOverride
      ).length;

      return {
        moldId: mold.moldId,
        modelName: mold.modelName,
        totalScheduled,
        overrides,
        utilizationRate: mold.dailyCapacity
          ? (totalScheduled / (mold.dailyCapacity * 30)) * 100
          : 0,
      };
    });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage(PAGE_SIZES.LETTER_PORTRAIT);
    const { width, height } = page.getSize();
    const margin = DEFAULT_MARGIN;

    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Header
    const title = 'Mold Utilization Report';
    const titleX = getCenteredX(title, width, FONT_SIZES.TITLE_LARGE, boldFont);

    page.drawText(title, {
      x: titleX,
      y: height - margin,
      size: FONT_SIZES.TITLE_LARGE,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });

    // Report details
    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: margin,
      y: height - margin - SPACING.SECTION_GAP_MEDIUM,
      size: FONT_SIZES.BODY_LARGE,
      font: regularFont,
      color: COLORS.TEXT_SECONDARY,
    });

    // Table headers
    const headerY = height - margin - SPACING.SECTION_GAP_LARGE - SPACING.SECTION_GAP_SMALL;
    const headers = [
      'Mold ID',
      'Model',
      'Scheduled',
      'Overrides',
      'Utilization %',
    ];
    const columnWidths = [80, 120, 80, 80, 100];
    let currentX = margin;

    headers.forEach((header, index) => {
      page.drawText(header, {
        x: currentX,
        y: headerY,
        size: FONT_SIZES.SECTION_HEADER,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });
      currentX += columnWidths[index];
    });

    // Table data
    let currentY = headerY - SPACING.SECTION_GAP_SMALL;
    utilizationData.forEach((data) => {
      currentX = margin;
      const rowData = [
        data.moldId,
        data.modelName || 'N/A',
        data.totalScheduled.toString(),
        data.overrides.toString(),
        `${data.utilizationRate.toFixed(1)}%`,
      ];

      rowData.forEach((text, colIndex) => {
        page.drawText(text, {
          x: currentX,
          y: currentY,
          size: FONT_SIZES.BODY_LARGE,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
        currentX += columnWidths[colIndex];
      });

      currentY -= SPACING.LINE_SPACING_LARGE;
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mold-utilization-${new Date().toISOString().split('T')[0]}.pdf"`
    );

    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Mold utilization PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate mold utilization PDF' });
  }
});

export default router;
