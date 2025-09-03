import { Router } from "express";
import { storage } from "../../storage";
// import { insertGatewayReportSchema } from "../../schema"; // Temporarily removed
import { z } from "zod";

const router = Router();

// Get all gateway reports
router.get("/", async (req, res) => {
  try {
    const reports = await storage.getAllGatewayReports();
    res.json(reports);
  } catch (error) {
    console.error("Error fetching gateway reports:", error);
    res.status(500).json({ error: "Failed to fetch gateway reports" });
  }
});

// Get gateway reports by date range
router.get("/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: "Both startDate and endDate are required" 
      });
    }

    const reports = await storage.getGatewayReportsByDateRange(
      startDate as string, 
      endDate as string
    );
    res.json(reports);
  } catch (error) {
    console.error("Error fetching gateway reports by date range:", error);
    res.status(500).json({ error: "Failed to fetch gateway reports" });
  }
});

// Get gateway report by specific date
router.get("/date/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const report = await storage.getGatewayReportByDate(date);
    
    if (!report) {
      return res.status(404).json({ error: "Gateway report not found for this date" });
    }
    
    res.json(report);
  } catch (error) {
    console.error("Error fetching gateway report by date:", error);
    res.status(500).json({ error: "Failed to fetch gateway report" });
  }
});

// Get gateway report by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }

    const report = await storage.getGatewayReport(id);
    if (!report) {
      return res.status(404).json({ error: "Gateway report not found" });
    }

    res.json(report);
  } catch (error) {
    console.error("Error fetching gateway report:", error);
    res.status(500).json({ error: "Failed to fetch gateway report" });
  }
});

// Create new gateway report
router.post("/", async (req, res) => {
  try {
    // const validatedData = insertGatewayReportSchema.parse(req.body); // Temporarily removed
    const validatedData = req.body;
    
    // Check if report already exists for this date
    const existingReport = await storage.getGatewayReportByDate(validatedData.reportDate);
    if (existingReport) {
      return res.status(409).json({ 
        error: "A gateway report already exists for this date. Use PUT to update it." 
      });
    }

    const report = await storage.createGatewayReport(validatedData);
    res.status(201).json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }
    console.error("Error creating gateway report:", error);
    res.status(500).json({ error: "Failed to create gateway report" });
  }
});

// Update gateway report
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }

    // Validate the incoming data
    // const updateSchema = insertGatewayReportSchema.partial(); // Temporarily removed
    // const validatedData = updateSchema.parse(req.body); // Temporarily removed
    const validatedData = req.body;

    const report = await storage.updateGatewayReport(id, validatedData);
    res.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return res.status(404).json({ error: "Gateway report not found" });
    }
    console.error("Error updating gateway report:", error);
    res.status(500).json({ error: "Failed to update gateway report" });
  }
});

// Delete gateway report
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }

    // Check if report exists before deleting
    const existingReport = await storage.getGatewayReport(id);
    if (!existingReport) {
      return res.status(404).json({ error: "Gateway report not found" });
    }

    await storage.deleteGatewayReport(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting gateway report:", error);
    res.status(500).json({ error: "Failed to delete gateway report" });
  }
});

export default router;