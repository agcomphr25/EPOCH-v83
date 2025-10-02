import { db } from '../db';
import { 
  trainingModules, 
  trainingQuizQuestions, 
  trainingQuizAnswers 
} from '../schema';

export async function seedPreservationTraining() {
  console.log('🌱 Seeding Preservation & FOD Training module...');

  try {
    // Insert training module
    const [module] = await db
      .insert(trainingModules)
      .values({
        title: 'Preservation & Foreign Object Debris (FOD) Training',
        description: 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.',
        pdfUrl: '/attached_assets/preservation-training.pdf',
        passingScore: 80,
        isActive: true
      })
      .returning();

    console.log(`✅ Created module: ${module.title} (ID: ${module.id})`);

    // Insert quiz questions covering ALL steps from both procedures
    const questions = [
      {
        question: 'According to step 1 of the Preservation procedure, what must you ensure before using components?',
        answers: [
          { text: 'Ensure components are not expired or out-of-date', correct: true },
          { text: 'Check the color and appearance', correct: false },
          { text: 'Verify the supplier name only', correct: false },
          { text: 'Check the weight only', correct: false }
        ]
      },
      {
        question: 'According to step 2 of the Preservation procedure, what should be checked for any material with a shelf life?',
        answers: [
          { text: 'Any material with a shelf life should be checked', correct: true },
          { text: 'Only check if it looks damaged', correct: false },
          { text: 'Materials never need shelf life checks', correct: false },
          { text: 'Only check once per year', correct: false }
        ]
      },
      {
        question: 'According to step 2 of the FOD procedure, what should you do to clear the work area?',
        answers: [
          { text: 'Clear the work area of any extra material and hardware that could be accidentally used', correct: true },
          { text: 'Add extra materials for convenience', correct: false },
          { text: 'Only remove broken items', correct: false },
          { text: 'Leave materials if they might be needed', correct: false }
        ]
      },
      {
        question: 'According to the preservation procedure, what should items with a shelf life have listed?',
        answers: [
          { text: 'An expiration date', correct: true },
          { text: 'Only the purchase date', correct: false },
          { text: 'The manufacturer name only', correct: false },
          { text: 'No marking is required', correct: false }
        ]
      },
      {
        question: 'What should you do FIRST before starting a job according to the FOD procedure?',
        answers: [
          { text: 'Check for any special cleanliness requirements', correct: true },
          { text: 'Clean the entire facility', correct: false },
          { text: 'Package all parts immediately', correct: false },
          { text: 'Remove all hardware from the area', correct: false }
        ]
      },
      {
        question: 'What happens to expired materials according to the preservation procedure?',
        answers: [
          { text: 'Placed in collection area and leaders submit waste management form', correct: true },
          { text: 'They can be used if they look okay', correct: false },
          { text: 'Employees dispose of them directly', correct: false },
          { text: 'They are stored separately for future use', correct: false }
        ]
      },
      {
        question: 'According to the FOD procedure, what should you do when finished with a job?',
        answers: [
          { text: 'Package or segregate parts to prevent damage, contamination, or loss of traceability', correct: true },
          { text: 'Leave parts on the work surface for inspection', correct: false },
          { text: 'Only clean visible debris', correct: false },
          { text: 'Move parts to any available location', correct: false }
        ]
      },
      {
        question: 'According to step 5 of the Preservation procedure, who determines the disposal of expired items?',
        answers: [
          { text: 'Management', correct: true },
          { text: 'The employee who found them', correct: false },
          { text: 'The collection area supervisor', correct: false },
          { text: 'External waste management', correct: false }
        ]
      },
      {
        question: 'According to step 3 of the FOD procedure, why should you clean the work area?',
        answers: [
          { text: 'To prevent damage from dirt or chemicals', correct: true },
          { text: 'To make the area look presentable', correct: false },
          { text: 'Only to remove large debris', correct: false },
          { text: 'Cleaning is optional if careful', correct: false }
        ]
      },
      {
        question: 'According to step 4 of the FOD procedure, what should you check parts for when complete?',
        answers: [
          { text: 'Check for any unnecessary debris such as poly, shavings, bolts, nuts, etc. and remove any debris', correct: true },
          { text: 'Only check for large visible defects', correct: false },
          { text: 'Visual inspection is sufficient', correct: false },
          { text: 'No inspection needed if work area was clean', correct: false }
        ]
      }
    ];

    for (let i = 0; i < questions.length; i++) {
      const questionData = questions[i];
      
      // Find the correct answer text
      const correctAnswer = questionData.answers.find(a => a.correct)?.text || '';
      
      // Insert question
      const [insertedQuestion] = await db
        .insert(trainingQuizQuestions)
        .values({
          moduleId: module.id,
          question: questionData.question,
          correctAnswer: correctAnswer,
          sortOrder: i + 1,
          isActive: true
        })
        .returning();

      // Insert answers
      for (let j = 0; j < questionData.answers.length; j++) {
        await db
          .insert(trainingQuizAnswers)
          .values({
            questionId: insertedQuestion.id,
            answerText: questionData.answers[j].text,
            sortOrder: j + 1
          });
      }

      console.log(`  ✅ Question ${i + 1}: ${questionData.question.substring(0, 50)}...`);
    }

    console.log('🎉 Preservation Training seeded successfully!');
    return module;
  } catch (error) {
    console.error('❌ Error seeding Preservation Training:', error);
    throw error;
  }
}

// Run if called directly
seedPreservationTraining()
  .then(() => {
    console.log('✅ Seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
