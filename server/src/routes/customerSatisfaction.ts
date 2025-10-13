import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { db } from '../../db';
import { 
  customerSatisfactionSurveys, 
  customerSatisfactionResponses,
  insertCustomerSatisfactionSurveySchema,
  insertCustomerSatisfactionResponseSchema,
  customers
} from '../../schema';

const router = Router();

// Get all customer satisfaction surveys
router.get('/surveys', async (req, res) => {
  try {
    const surveys = await db
      .select()
      .from(customerSatisfactionSurveys)
      .orderBy(desc(customerSatisfactionSurveys.createdAt));
    
    res.json(surveys);
  } catch (error) {
    console.error('Error fetching customer satisfaction surveys:', error);
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

// Get a specific survey by ID
router.get('/surveys/:id', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);
    
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID' });
    }

    const survey = await db
      .select()
      .from(customerSatisfactionSurveys)
      .where(eq(customerSatisfactionSurveys.id, surveyId))
      .limit(1);

    if (survey.length === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json(survey[0]);
  } catch (error) {
    console.error('Error fetching survey:', error);
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// Create a new customer satisfaction survey
router.post('/surveys', async (req, res) => {
  try {
    const validatedData = insertCustomerSatisfactionSurveySchema.parse(req.body);
    
    const newSurvey = await db
      .insert(customerSatisfactionSurveys)
      .values(validatedData)
      .returning();

    res.status(201).json(newSurvey[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error creating survey:', error);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// Update a customer satisfaction survey
router.put('/surveys/:id', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);
    
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID' });
    }

    const validatedData = insertCustomerSatisfactionSurveySchema.parse(req.body);
    
    const updatedSurvey = await db
      .update(customerSatisfactionSurveys)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(customerSatisfactionSurveys.id, surveyId))
      .returning();

    if (updatedSurvey.length === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json(updatedSurvey[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error updating survey:', error);
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

// Delete a customer satisfaction survey
router.delete('/surveys/:id', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);
    
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID' });
    }

    // First, delete any associated responses
    await db
      .delete(customerSatisfactionResponses)
      .where(eq(customerSatisfactionResponses.surveyId, surveyId));

    // Then delete the survey
    const deletedSurvey = await db
      .delete(customerSatisfactionSurveys)
      .where(eq(customerSatisfactionSurveys.id, surveyId))
      .returning();

    if (deletedSurvey.length === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json({ message: 'Survey deleted successfully' });
  } catch (error) {
    console.error('Error deleting survey:', error);
    res.status(500).json({ error: 'Failed to delete survey' });
  }
});

// Get all responses for a survey
router.get('/surveys/:id/responses', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);
    
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: 'Invalid survey ID' });
    }

    const responses = await db
      .select({
        id: customerSatisfactionResponses.id,
        surveyId: customerSatisfactionResponses.surveyId,
        customerId: customerSatisfactionResponses.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        orderId: customerSatisfactionResponses.orderId,
        responses: customerSatisfactionResponses.responses,
        overallSatisfaction: customerSatisfactionResponses.overallSatisfaction,
        npsScore: customerSatisfactionResponses.npsScore,
        responseTimeSeconds: customerSatisfactionResponses.responseTimeSeconds,
        isComplete: customerSatisfactionResponses.isComplete,
        submittedAt: customerSatisfactionResponses.submittedAt,
        createdAt: customerSatisfactionResponses.createdAt,
        updatedAt: customerSatisfactionResponses.updatedAt,
      })
      .from(customerSatisfactionResponses)
      .leftJoin(customers, eq(customerSatisfactionResponses.customerId, customers.id))
      .where(eq(customerSatisfactionResponses.surveyId, surveyId))
      .orderBy(desc(customerSatisfactionResponses.createdAt));

    res.json(responses);
  } catch (error) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

// Get all customer satisfaction responses
router.get('/responses', async (req, res) => {
  try {
    const responses = await db
      .select({
        id: customerSatisfactionResponses.id,
        surveyId: customerSatisfactionResponses.surveyId,
        surveyTitle: customerSatisfactionSurveys.title,
        customerId: customerSatisfactionResponses.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        orderId: customerSatisfactionResponses.orderId,
        responses: customerSatisfactionResponses.responses,
        overallSatisfaction: customerSatisfactionResponses.overallSatisfaction,
        npsScore: customerSatisfactionResponses.npsScore,
        responseTimeSeconds: customerSatisfactionResponses.responseTimeSeconds,
        isComplete: customerSatisfactionResponses.isComplete,
        submittedAt: customerSatisfactionResponses.submittedAt,
        createdAt: customerSatisfactionResponses.createdAt,
        updatedAt: customerSatisfactionResponses.updatedAt,
      })
      .from(customerSatisfactionResponses)
      .leftJoin(customers, eq(customerSatisfactionResponses.customerId, customers.id))
      .leftJoin(customerSatisfactionSurveys, eq(customerSatisfactionResponses.surveyId, customerSatisfactionSurveys.id))
      .orderBy(desc(customerSatisfactionResponses.createdAt));

    res.json(responses);
  } catch (error) {
    console.error('Error fetching customer satisfaction responses:', error);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

// Submit a customer satisfaction response
router.post('/responses', async (req, res) => {
  try {
    const validatedData = insertCustomerSatisfactionResponseSchema.parse(req.body);
    
    // Convert submittedAt string to Date if provided
    const dataToInsert = {
      ...validatedData,
      submittedAt: validatedData.submittedAt ? new Date(validatedData.submittedAt) : new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    };

    const newResponse = await db
      .insert(customerSatisfactionResponses)
      .values(dataToInsert)
      .returning();

    res.status(201).json(newResponse[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error creating response:', error);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// Update a customer satisfaction response
router.put('/responses/:id', async (req, res) => {
  try {
    const responseId = parseInt(req.params.id);
    
    if (isNaN(responseId)) {
      return res.status(400).json({ error: 'Invalid response ID' });
    }

    const validatedData = insertCustomerSatisfactionResponseSchema.parse(req.body);
    
    const dataToUpdate = {
      ...validatedData,
      submittedAt: validatedData.submittedAt ? new Date(validatedData.submittedAt) : undefined,
      updatedAt: new Date(),
    };

    const updatedResponse = await db
      .update(customerSatisfactionResponses)
      .set(dataToUpdate)
      .where(eq(customerSatisfactionResponses.id, responseId))
      .returning();

    if (updatedResponse.length === 0) {
      return res.status(404).json({ error: 'Response not found' });
    }

    res.json(updatedResponse[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error updating response:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Delete a customer satisfaction response
router.delete('/responses/:id', async (req, res) => {
  try {
    const responseId = parseInt(req.params.id);
    
    if (isNaN(responseId)) {
      return res.status(400).json({ error: 'Invalid response ID' });
    }

    const deletedResponse = await db
      .delete(customerSatisfactionResponses)
      .where(eq(customerSatisfactionResponses.id, responseId))
      .returning();

    if (deletedResponse.length === 0) {
      return res.status(404).json({ error: 'Response not found' });
    }

    res.json({ message: 'Response deleted successfully' });
  } catch (error) {
    console.error('Error deleting response:', error);
    res.status(500).json({ error: 'Failed to delete response' });
  }
});

// Get customer satisfaction analytics
router.get('/analytics', async (req, res) => {
  try {
    const { surveyId, startDate, endDate } = req.query;

    let whereConditions = [];

    if (surveyId) {
      whereConditions.push(eq(customerSatisfactionResponses.surveyId, parseInt(surveyId as string)));
    }

    if (startDate) {
      whereConditions.push(gte(customerSatisfactionResponses.createdAt, new Date(startDate as string)));
    }

    if (endDate) {
      whereConditions.push(lte(customerSatisfactionResponses.createdAt, new Date(endDate as string)));
    }

    // Get all responses for analytics
    const responses = await db
      .select()
      .from(customerSatisfactionResponses)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    // Calculate analytics
    const totalResponses = responses.length;
    const completedResponses = responses.filter(r => r.isComplete).length;
    const averageOverallSatisfaction = responses
      .filter(r => r.overallSatisfaction !== null)
      .reduce((sum, r) => sum + (r.overallSatisfaction || 0), 0) / 
      responses.filter(r => r.overallSatisfaction !== null).length || 0;

    const averageNpsScore = responses
      .filter(r => r.npsScore !== null)
      .reduce((sum, r) => sum + (r.npsScore || 0), 0) / 
      responses.filter(r => r.npsScore !== null).length || 0;

    // Calculate NPS categories
    const promoters = responses.filter(r => r.npsScore && r.npsScore >= 9).length;
    const passives = responses.filter(r => r.npsScore && r.npsScore >= 7 && r.npsScore <= 8).length;
    const detractors = responses.filter(r => r.npsScore && r.npsScore <= 6).length;
    const npsScore = ((promoters - detractors) / totalResponses) * 100;

    const averageResponseTime = responses
      .filter(r => r.responseTimeSeconds !== null)
      .reduce((sum, r) => sum + (r.responseTimeSeconds || 0), 0) / 
      responses.filter(r => r.responseTimeSeconds !== null).length || 0;

    const analytics = {
      totalResponses,
      completedResponses,
      completionRate: totalResponses > 0 ? (completedResponses / totalResponses) * 100 : 0,
      averageOverallSatisfaction: Math.round(averageOverallSatisfaction * 100) / 100,
      averageNpsScore: Math.round(averageNpsScore * 100) / 100,
      netPromoterScore: Math.round(npsScore * 100) / 100,
      npsBreakdown: {
        promoters,
        passives,
        detractors
      },
      averageResponseTimeMinutes: Math.round((averageResponseTime / 60) * 100) / 100,
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Create default survey template
router.post('/surveys/create-default', async (req, res) => {
  try {
    const defaultSurvey = {
      title: "Customer Satisfaction Evaluation Form",
      description: "On a scale from 1 to 10, One is the lowest level (very dissatisfied), while ten is the highest level (very satisfied), how would you rate the following:",
      isActive: true,
      questions: [
        {
          id: "product-quality",
          type: "rating",
          question: "How would you rate the overall quality of our products?",
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: "Very Dissatisfied",
            maxLabel: "Very Satisfied"
          }
        },
        {
          id: "product-quality-comments",
          type: "textarea",
          question: "Comments on product quality:",
          required: false
        },
        {
          id: "delivery-timeframe",
          type: "rating",
          question: "How would you rate the delivery timeframe for our products?",
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: "Very Dissatisfied",
            maxLabel: "Very Satisfied"
          }
        },
        {
          id: "delivery-timeframe-comments",
          type: "textarea",
          question: "Comments on delivery timeframe:",
          required: false
        },
        {
          id: "customer-service",
          type: "rating",
          question: "How would you rate our customer service?",
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: "Very Dissatisfied",
            maxLabel: "Very Satisfied"
          }
        },
        {
          id: "customer-service-comments",
          type: "textarea",
          question: "Comments on customer service:",
          required: false
        },
        {
          id: "fit-function",
          type: "rating",
          question: "How satisfied are you with the overall fit and function of our products?",
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: "Very Dissatisfied",
            maxLabel: "Very Satisfied"
          }
        },
        {
          id: "fit-function-comments",
          type: "textarea",
          question: "Comments on fit and function:",
          required: false
        },
        {
          id: "recommendation-likelihood",
          type: "rating",
          question: "How likely are you to recommend our company and products to others? (1 is Highly Unlikely, 10 is Very Likely)",
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: "Highly Unlikely",
            maxLabel: "Very Likely"
          }
        },
        {
          id: "recommendation-comments",
          type: "textarea",
          question: "Comments on recommendation likelihood:",
          required: false
        },
        {
          id: "other-products",
          type: "textarea",
          question: "What is one other inlet or product you would be interested in seeing us offer?",
          required: false
        }
      ],
      settings: {
        allowAnonymous: false,
        sendEmailReminders: true,
        showProgressBar: true,
        autoSave: true
      }
    };

    const newSurvey = await db
      .insert(customerSatisfactionSurveys)
      .values(defaultSurvey)
      .returning();

    res.status(201).json(newSurvey[0]);
  } catch (error) {
    console.error('Error creating default survey:', error);
    res.status(500).json({ error: 'Failed to create default survey' });
  }
});

export default router;