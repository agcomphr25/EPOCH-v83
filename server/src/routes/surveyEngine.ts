import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

import { db } from '../../db';
import {
  surveys,
  surveyResponses,
  insertSurveySchema,
  insertSurveyResponseSchema,
} from '../../schema';

const router = Router();

// Get all surveys
router.get('/surveys', async (req, res) => {
  try {
    const allSurveys = await db
      .select()
      .from(surveys)
      .orderBy(desc(surveys.createdAt));

    res.json(allSurveys);
  } catch (error) {
    console.error('Error fetching surveys:', error);
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

// Get a specific survey by ID
router.get('/surveys/:id', async (req, res) => {
  try {
    const surveyId = req.params.id;

    const survey = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
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

// Create a new survey
router.post('/surveys', async (req, res) => {
  try {
    const validatedData = insertSurveySchema.parse(req.body);

    const newSurvey = await db
      .insert(surveys)
      .values(validatedData)
      .returning();

    res.status(201).json(newSurvey[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Error creating survey:', error);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// Update a survey
router.put('/surveys/:id', async (req, res) => {
  try {
    const surveyId = req.params.id;
    const validatedData = insertSurveySchema.parse(req.body);

    const updatedSurvey = await db
      .update(surveys)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(surveys.id, surveyId))
      .returning();

    if (updatedSurvey.length === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json(updatedSurvey[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Error updating survey:', error);
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

// Delete a survey
router.delete('/surveys/:id', async (req, res) => {
  try {
    const surveyId = req.params.id;

    // First, delete any associated responses
    await db
      .delete(surveyResponses)
      .where(eq(surveyResponses.surveyId, surveyId));

    // Then delete the survey
    const deletedSurvey = await db
      .delete(surveys)
      .where(eq(surveys.id, surveyId))
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
    const surveyId = req.params.id;

    const responses = await db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.surveyId, surveyId))
      .orderBy(desc(surveyResponses.createdAt));

    res.json(responses);
  } catch (error) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

// Get all survey responses
router.get('/responses', async (req, res) => {
  try {
    const responses = await db
      .select({
        id: surveyResponses.id,
        surveyId: surveyResponses.surveyId,
        respondentId: surveyResponses.respondentId,
        respondentType: surveyResponses.respondentType,
        respondentName: surveyResponses.respondentName,
        respondentEmail: surveyResponses.respondentEmail,
        contextId: surveyResponses.contextId,
        contextType: surveyResponses.contextType,
        responses: surveyResponses.responses,
        overallSatisfaction: surveyResponses.overallSatisfaction,
        npsScore: surveyResponses.npsScore,
        aggregateScore: surveyResponses.aggregateScore,
        responseTimeSeconds: surveyResponses.responseTimeSeconds,
        submittedBy: surveyResponses.submittedBy,
        surveyDate: surveyResponses.surveyDate,
        isComplete: surveyResponses.isComplete,
        submittedAt: surveyResponses.submittedAt,
        createdAt: surveyResponses.createdAt,
        updatedAt: surveyResponses.updatedAt,
        surveyTitle: surveys.title,
      })
      .from(surveyResponses)
      .leftJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .orderBy(desc(surveyResponses.createdAt));

    res.json(responses);
  } catch (error) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

// Submit a survey response
router.post('/responses', async (req, res) => {
  try {
    const validatedData = insertSurveyResponseSchema.parse(req.body);

    // Convert date strings to Date objects if provided
    const dataToInsert = {
      ...validatedData,
      submittedAt: validatedData.submittedAt
        ? new Date(validatedData.submittedAt)
        : new Date(),
      surveyDate: validatedData.surveyDate
        ? new Date(validatedData.surveyDate)
        : undefined,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    };

    const newResponse = await db
      .insert(surveyResponses)
      .values(dataToInsert)
      .returning();

    res.status(201).json(newResponse[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Error creating response:', error);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// Update a survey response
router.put('/responses/:id', async (req, res) => {
  try {
    const responseId = req.params.id;
    const validatedData = insertSurveyResponseSchema.parse(req.body);

    const dataToUpdate = {
      ...validatedData,
      submittedAt: validatedData.submittedAt
        ? new Date(validatedData.submittedAt)
        : undefined,
      surveyDate: validatedData.surveyDate
        ? new Date(validatedData.surveyDate)
        : undefined,
      updatedAt: new Date(),
    };

    const updatedResponse = await db
      .update(surveyResponses)
      .set(dataToUpdate)
      .where(eq(surveyResponses.id, responseId))
      .returning();

    if (updatedResponse.length === 0) {
      return res.status(404).json({ error: 'Response not found' });
    }

    res.json(updatedResponse[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    console.error('Error updating response:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

// Delete a survey response
router.delete('/responses/:id', async (req, res) => {
  try {
    const responseId = req.params.id;

    const deletedResponse = await db
      .delete(surveyResponses)
      .where(eq(surveyResponses.id, responseId))
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

// Get survey analytics
router.get('/analytics', async (req, res) => {
  try {
    const { surveyId, startDate, endDate } = req.query;

    const whereConditions = [];

    if (surveyId) {
      whereConditions.push(
        eq(surveyResponses.surveyId, surveyId as string)
      );
    }

    if (startDate) {
      whereConditions.push(
        gte(surveyResponses.createdAt, new Date(startDate as string))
      );
    }

    if (endDate) {
      whereConditions.push(
        lte(surveyResponses.createdAt, new Date(endDate as string))
      );
    }

    // Get all responses for analytics
    const responses = await db
      .select()
      .from(surveyResponses)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    // Calculate analytics
    const totalResponses = responses.length;
    const completedResponses = responses.filter((r) => r.isComplete).length;

    // Calculate average satisfaction score out of 50 (5 questions * 10 points each)
    let totalScores = 0;
    let responseCount = 0;

    responses.forEach((response) => {
      if (response.responses && typeof response.responses === 'object') {
        let responseScore = 0;
        Object.entries(response.responses as Record<string, any>).forEach(([key, value]) => {
          if (typeof value === 'number' && value >= 1 && value <= 10) {
            responseScore += value;
          }
        });
        if (responseScore > 0) {
          totalScores += responseScore;
          responseCount++;
        }
      }
    });

    const averageOverallSatisfaction =
      responseCount > 0 ? totalScores / responseCount : 0;

    const averageNpsScore =
      responses
        .filter((r) => r.npsScore !== null)
        .reduce((sum, r) => sum + (r.npsScore || 0), 0) /
        responses.filter((r) => r.npsScore !== null).length || 0;

    // Calculate NPS categories
    const promoters = responses.filter(
      (r) => r.npsScore && r.npsScore >= 9
    ).length;
    const passives = responses.filter(
      (r) => r.npsScore && r.npsScore >= 7 && r.npsScore <= 8
    ).length;
    const detractors = responses.filter(
      (r) => r.npsScore && r.npsScore <= 6
    ).length;
    const npsScore = totalResponses > 0 ? ((promoters - detractors) / totalResponses) * 100 : 0;

    const averageResponseTime =
      responses
        .filter((r) => r.responseTimeSeconds !== null)
        .reduce((sum, r) => sum + (r.responseTimeSeconds || 0), 0) /
        responses.filter((r) => r.responseTimeSeconds !== null).length || 0;

    // Calculate question-level analytics
    const questionScores: Record<
      string,
      {
        question: string;
        averageScore: number;
        responseCount: number;
        monthlyTrends: Array<{
          month: string;
          averageScore: number;
          count: number;
        }>;
      }
    > = {};

    // Get the survey to extract question text
    let surveyToAnalyze;
    if (surveyId) {
      const filteredSurvey = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, surveyId as string))
        .limit(1);
      surveyToAnalyze = filteredSurvey[0];
    } else {
      const activeSurvey = await db
        .select()
        .from(surveys)
        .where(eq(surveys.isActive, true))
        .limit(1);
      surveyToAnalyze = activeSurvey[0];
    }

    const surveyQuestions = (surveyToAnalyze?.questions as any[]) || [];
    const questionMap = new Map(
      surveyQuestions.map((q: any) => [q.id, q.question])
    );

    // Track scores by question ID
    const questionData: Record<string, number[]> = {};

    responses.forEach((response) => {
      if (response.responses && typeof response.responses === 'object') {
        Object.entries(response.responses as Record<string, any>).forEach(([questionId, value]) => {
          if (typeof value === 'number' && value >= 1 && value <= 10) {
            if (!questionData[questionId]) {
              questionData[questionId] = [];
            }
            questionData[questionId].push(value);
          }
        });
      }
    });

    // Calculate averages for each question
    Object.entries(questionData).forEach(([questionId, scores]) => {
      const avgScore =
        scores.reduce((sum, score) => sum + score, 0) / scores.length;
      questionScores[questionId] = {
        question: questionMap.get(questionId) || questionId,
        averageScore: Math.round(avgScore * 100) / 100,
        responseCount: scores.length,
        monthlyTrends: [],
      };
    });

    // Calculate 3-month trends for each question
    const now = new Date();

    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const monthDate = new Date(
        now.getFullYear(),
        now.getMonth() - monthOffset,
        1
      );
      const monthStart = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        1
      );
      const nextMonthStart = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        1
      );
      const monthLabel = monthDate.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const monthResponses = responses.filter((r) => {
        const responseDate = new Date(r.createdAt!);
        return responseDate >= monthStart && responseDate < nextMonthStart;
      });

      Object.keys(questionScores).forEach((questionId) => {
        const monthScores: number[] = [];

        monthResponses.forEach((response) => {
          if (response.responses && typeof response.responses === 'object') {
            const value = (response.responses as Record<string, any>)[questionId];
            if (typeof value === 'number' && value >= 1 && value <= 10) {
              monthScores.push(value);
            }
          }
        });

        const avgScore =
          monthScores.length > 0
            ? monthScores.reduce((sum, score) => sum + score, 0) /
              monthScores.length
            : 0;

        questionScores[questionId].monthlyTrends.unshift({
          month: monthLabel,
          averageScore: Math.round(avgScore * 100) / 100,
          count: monthScores.length,
        });
      });
    }

    const analytics = {
      totalResponses,
      completedResponses,
      completionRate:
        totalResponses > 0 ? (completedResponses / totalResponses) * 100 : 0,
      averageOverallSatisfaction:
        Math.round(averageOverallSatisfaction * 100) / 100,
      averageNpsScore: Math.round(averageNpsScore * 100) / 100,
      netPromoterScore: Math.round(npsScore * 100) / 100,
      npsBreakdown: {
        promoters,
        passives,
        detractors,
      },
      averageResponseTimeMinutes:
        Math.round((averageResponseTime / 60) * 100) / 100,
      questionScores: Object.entries(questionScores).map(([id, data]) => ({
        questionId: id,
        ...data,
      })),
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
      title: 'Customer Satisfaction Evaluation Form',
      description:
        'On a scale from 1 to 10, One is the lowest level (very dissatisfied), while ten is the highest level (very satisfied), how would you rate the following:',
      isActive: true,
      questions: [
        {
          id: 'product-quality',
          type: 'rating' as const,
          question: 'How would you rate the overall quality of our products?',
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Very Dissatisfied',
            maxLabel: 'Very Satisfied',
          },
        },
        {
          id: 'product-quality-comments',
          type: 'textarea' as const,
          question: 'Comments on product quality:',
          required: false,
        },
        {
          id: 'delivery-timeframe',
          type: 'rating' as const,
          question:
            'How would you rate the delivery timeframe for our products?',
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Very Dissatisfied',
            maxLabel: 'Very Satisfied',
          },
        },
        {
          id: 'delivery-timeframe-comments',
          type: 'textarea' as const,
          question: 'Comments on delivery timeframe:',
          required: false,
        },
        {
          id: 'customer-service',
          type: 'rating' as const,
          question: 'How would you rate our customer service?',
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Very Dissatisfied',
            maxLabel: 'Very Satisfied',
          },
        },
        {
          id: 'customer-service-comments',
          type: 'textarea' as const,
          question: 'Comments on customer service:',
          required: false,
        },
        {
          id: 'fit-function',
          type: 'rating' as const,
          question:
            'How satisfied are you with the overall fit and function of our products?',
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Very Dissatisfied',
            maxLabel: 'Very Satisfied',
          },
        },
        {
          id: 'fit-function-comments',
          type: 'textarea' as const,
          question: 'Comments on fit and function:',
          required: false,
        },
        {
          id: 'recommendation-likelihood',
          type: 'rating' as const,
          question:
            'How likely are you to recommend our company and products to others? (1 is Highly Unlikely, 10 is Very Likely)',
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Highly Unlikely',
            maxLabel: 'Very Likely',
          },
        },
        {
          id: 'recommendation-comments',
          type: 'textarea' as const,
          question: 'Comments on recommendation likelihood:',
          required: false,
        },
        {
          id: 'other-products',
          type: 'textarea' as const,
          question:
            'What is one other inlet or product you would be interested in seeing us offer?',
          required: false,
        },
      ],
      settings: {
        allowAnonymous: false,
        sendEmailReminders: true,
        showProgressBar: true,
        autoSave: true,
      },
    };

    const newSurvey = await db
      .insert(surveys)
      .values(defaultSurvey)
      .returning();

    res.status(201).json(newSurvey[0]);
  } catch (error) {
    console.error('Error creating default survey:', error);
    res.status(500).json({ error: 'Failed to create default survey' });
  }
});

export default router;
