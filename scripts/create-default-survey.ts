import { db } from '../server/db';
import { customerSatisfactionSurveys } from '../server/schema';

async function createDefaultSurvey() {
  try {
    const surveyData = {
      title: 'Customer Satisfaction Evaluation',
      description:
        'Six question customer satisfaction survey to evaluate product quality, delivery, service, and gather feedback',
      isActive: true,
      questions: [
        {
          id: 'question_1',
          type: 'rating',
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
          id: 'question_1_comments',
          type: 'textarea',
          question: 'Comments on product quality:',
          required: false,
        },
        {
          id: 'question_2',
          type: 'rating',
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
          id: 'question_2_comments',
          type: 'textarea',
          question: 'Comments on delivery timeframe:',
          required: false,
        },
        {
          id: 'question_3',
          type: 'rating',
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
          id: 'question_3_comments',
          type: 'textarea',
          question: 'Comments on customer service:',
          required: false,
        },
        {
          id: 'question_4',
          type: 'rating',
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
          id: 'question_4_comments',
          type: 'textarea',
          question: 'Comments on fit and function:',
          required: false,
        },
        {
          id: 'question_5_nps',
          type: 'nps',
          question:
            'How likely are you to recommend our company and products to others?',
          required: true,
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Highly Unlikely',
            maxLabel: 'Very Likely',
          },
        },
        {
          id: 'question_5_comments',
          type: 'textarea',
          question: 'Comments on recommendation:',
          required: false,
        },
        {
          id: 'question_6',
          type: 'textarea',
          question:
            'What is one other inlet or product you would be interested in seeing us offer?',
          required: false,
        },
      ],
      settings: {
        allowAnonymous: false,
        sendEmailReminders: false,
        showProgressBar: true,
        autoSave: true,
      },
      createdBy: 'system',
    };

    const result = await db
      .insert(customerSatisfactionSurveys)
      .values(surveyData)
      .returning();

    console.log('✅ Default survey created successfully!');
    console.log('Survey ID:', result[0].id);
    console.log('Survey Title:', result[0].title);
    console.log('Total Questions:', result[0].questions.length);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating survey:', error);
    process.exit(1);
  }
}

createDefaultSurvey();
