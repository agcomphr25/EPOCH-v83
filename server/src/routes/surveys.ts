import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertSurveySchema } from '../../schema';
import { z } from 'zod';

const router = Router();

// Get all surveys with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = req.query;
    const surveys = await storage.getSurveys(filters);
    res.json(surveys);
  } catch (error) {
    console.error('Error retrieving surveys:', error);
    res.status(500).json({ error: "Failed to fetch surveys", details: (error as any).message });
  }
});

// Get survey analytics
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const filters = req.query;
    const analytics = await storage.getSurveyAnalytics(filters);
    res.json(analytics);
  } catch (error) {
    console.error('Error retrieving survey analytics:', error);
    res.status(500).json({ error: "Failed to fetch survey analytics", details: (error as any).message });
  }
});

// Get specific survey by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid survey ID" });
    }
    
    const survey = await storage.getSurvey(id);
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    
    res.json(survey);
  } catch (error) {
    console.error('Error retrieving survey:', error);
    res.status(500).json({ error: "Failed to fetch survey", details: (error as any).message });
  }
});

// Create new survey
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body using Zod schema
    const validatedData = insertSurveySchema.parse(req.body);
    
    // Calculate scores automatically
    const likertAvg = (validatedData.overall + validatedData.quality + validatedData.communications + validatedData.onTime + validatedData.value) / 5;
    const csatScore = likertAvg;

    const npsType = validatedData.nps <= 6 ? 'Detractor' : validatedData.nps <= 8 ? 'Passive' : 'Promoter';

    // Calculate total score (weighted combination)
    const npsNormalized = (validatedData.nps / 10) * 100; 
    const totalScore = ((csatScore - 1) / 4) * 70 + (npsNormalized / 100) * 30;

    const surveyData = {
      ...validatedData,
      csatScore,
      npsType,
      totalScore,
    };

    const newSurvey = await storage.createSurvey(surveyData);
    res.status(201).json(newSurvey);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }
    console.error('Error creating survey:', error);
    res.status(500).json({ error: "Failed to create survey", details: (error as any).message });
  }
});

// Update survey
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid survey ID" });
    }

    // Validate partial update data
    const validatedData = insertSurveySchema.partial().parse(req.body);
    
    // Recalculate scores if Likert ratings or NPS changed
    if (validatedData.overall || validatedData.quality || validatedData.communications || 
        validatedData.onTime || validatedData.value || validatedData.nps) {
      
      // Get existing survey to merge values
      const existingSurvey = await storage.getSurvey(id);
      if (!existingSurvey) {
        return res.status(404).json({ error: "Survey not found" });
      }

      // Merge values for calculation
      const mergedData = { ...existingSurvey, ...validatedData };
      
      const likertAvg = (mergedData.overall + mergedData.quality + mergedData.communications + mergedData.onTime + mergedData.value) / 5;
      const csatScore = likertAvg;
      const npsType = mergedData.nps <= 6 ? 'Detractor' : mergedData.nps <= 8 ? 'Passive' : 'Promoter';
      const npsNormalized = (mergedData.nps / 10) * 100; 
      const totalScore = ((csatScore - 1) / 4) * 70 + (npsNormalized / 100) * 30;

      validatedData.csatScore = csatScore;
      validatedData.npsType = npsType;
      validatedData.totalScore = totalScore;
    }

    const updatedSurvey = await storage.updateSurvey(id, validatedData);
    if (!updatedSurvey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    
    res.json(updatedSurvey);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }
    console.error('Error updating survey:', error);
    res.status(500).json({ error: "Failed to update survey", details: (error as any).message });
  }
});

// Delete survey
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid survey ID" });
    }

    const success = await storage.deleteSurvey(id);
    if (!success) {
      return res.status(404).json({ error: "Survey not found" });
    }
    
    res.json({ message: "Survey deleted successfully" });
  } catch (error) {
    console.error('Error deleting survey:', error);
    res.status(500).json({ error: "Failed to delete survey", details: (error as any).message });
  }
});

export default router;