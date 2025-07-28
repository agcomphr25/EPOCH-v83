
import { Router, Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const router = Router();

// Generate PDF for Layup Schedule
router.get('/layup-schedule/pdf', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, moldId } = req.query;
    
    // Get layup schedule data from storage
    const { storage } = await import('../../storage');
    const scheduleData = await storage.getAllLayupSchedule();
    
    // Filter data based on query parameters
    let filteredData = scheduleData;
    if (startDate) {
      filteredData = filteredData.filter(item => 
        new Date(item.scheduledDate) >= new Date(startDate as string)
      );
    }
    if (endDate) {
      filteredData = filteredData.filter(item => 
        new Date(item.scheduledDate) <= new Date(endDate as string)
      );
    }
    if (moldId) {
      filteredData = filteredData.filter(item => item.moldId === moldId);
    }

    // Get additional data for comprehensive report
    const orders = await storage.getAllOrderDrafts();
    const molds = await storage.getAllMolds();
    const employees = await storage.getAllEmployeeLayupSettings();

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();
    
    // Load fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Header
    const title = 'Layup Schedule Report';
    const titleSize = 20;
    const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
    
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 50,
      size: titleSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Report date
    const reportDate = `Generated: ${new Date().toLocaleDateString()}`;
    page.drawText(reportDate, {
      x: 50,
      y: height - 90,
      size: 10,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Filter info
    let filterInfo = 'Filters: ';
    if (startDate || endDate || moldId) {
      if (startDate) filterInfo += `Start: ${startDate} `;
      if (endDate) filterInfo += `End: ${endDate} `;
      if (moldId) filterInfo += `Mold: ${moldId}`;
    } else {
      filterInfo += 'None (All records)';
    }
    
    page.drawText(filterInfo, {
      x: 50,
      y: height - 110,
      size: 10,
      font: regularFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Table headers
    const headerY = height - 150;
    const headers = ['Order ID', 'Scheduled Date', 'Mold ID', 'Status'];
    const columnWidths = [120, 120, 100, 100];
    let currentX = 50;

    headers.forEach((header, index) => {
      page.drawText(header, {
        x: currentX,
        y: headerY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      currentX += columnWidths[index];
    });

    // Draw header underline
    page.drawLine({
      start: { x: 50, y: headerY - 5 },
      end: { x: 490, y: headerY - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    // Table data
    let currentY = headerY - 25;
    const maxRowsPerPage = 30;
    let rowCount = 0;

    filteredData.forEach((item, index) => {
      if (rowCount >= maxRowsPerPage) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([612, 792]);
        currentY = height - 50;
        rowCount = 0;
      }

      currentX = 50;
      const rowData = [
        item.orderId || 'N/A',
        new Date(item.scheduledDate).toLocaleDateString(),
        item.moldId || 'N/A',
        item.isOverride ? 'Override' : 'Scheduled'
      ];

      rowData.forEach((data, colIndex) => {
        page.drawText(data.toString(), {
          x: currentX,
          y: currentY,
          size: 10,
          font: regularFont,
          color: rgb(0, 0, 0),
        });
        currentX += columnWidths[colIndex];
      });

      currentY -= 20;
      rowCount++;
    });

    // Summary section
    const summaryY = Math.max(currentY - 30, 100);
    page.drawText('Summary:', {
      x: 50,
      y: summaryY,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const totalScheduled = filteredData.length;
    const overrideCount = filteredData.filter(item => item.isOverride).length;
    const moldCount = new Set(filteredData.map(item => item.moldId)).size;

    const summaryText = [
      `Total Scheduled Orders: ${totalScheduled}`,
      `Override Orders: ${overrideCount}`,
      `Unique Molds Used: ${moldCount}`,
      `Active Employees: ${employees.filter(emp => emp.isActive).length}`
    ];

    summaryText.forEach((text, index) => {
      page.drawText(text, {
        x: 50,
        y: summaryY - 20 - (index * 15),
        size: 10,
        font: regularFont,
        color: rgb(0, 0, 0),
      });
    });

    // Footer
    const footerText = `Page 1 of 1 • Generated by Layup Scheduler • ${new Date().toLocaleString()}`;
    page.drawText(footerText, {
      x: 50,
      y: 30,
      size: 8,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="layup-schedule-${new Date().toISOString().split('T')[0]}.pdf"`);
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
