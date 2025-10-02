import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { trainingModules, trainingQuizQuestions, trainingQuizAnswers } from '../shared/schema';

neonConfig.webSocketConstructor = ws;

async function syncTrainingData() {
  const devDatabaseUrl = process.env.DEV_DATABASE_URL;
  const prodDatabaseUrl = process.env.PROD_DATABASE_URL;

  if (!devDatabaseUrl || !prodDatabaseUrl) {
    console.error('❌ Missing database URLs!');
    console.error('Set DEV_DATABASE_URL and PROD_DATABASE_URL environment variables');
    process.exit(1);
  }

  console.log('🔄 Starting training data sync...\n');

  // Connect to both databases
  const devPool = new Pool({ connectionString: devDatabaseUrl });
  const prodPool = new Pool({ connectionString: prodDatabaseUrl });

  const devDb = drizzle(devPool);
  const prodDb = drizzle(prodPool);

  try {
    // Step 1: Read all training data from development database
    console.log('📖 Reading training data from development database...');
    
    const modules = await devDb.select().from(trainingModules);
    const questions = await devDb.select().from(trainingQuizQuestions);
    const answers = await devDb.select().from(trainingQuizAnswers);

    console.log(`   ✓ Found ${modules.length} training modules`);
    console.log(`   ✓ Found ${questions.length} quiz questions`);
    console.log(`   ✓ Found ${answers.length} quiz answers\n`);

    if (modules.length === 0) {
      console.log('⚠️  No training modules found in development database!');
      return;
    }

    // Step 2: Insert into production database
    console.log('💾 Inserting into production database...');

    // Insert modules
    for (const module of modules) {
      await prodDb.insert(trainingModules)
        .values(module)
        .onConflictDoUpdate({
          target: trainingModules.id,
          set: {
            title: module.title,
            description: module.description,
            pdfPath: module.pdfPath,
            passingScore: module.passingScore,
            certificateTemplate: module.certificateTemplate,
          }
        });
    }
    console.log(`   ✓ Synced ${modules.length} modules`);

    // Insert questions
    for (const question of questions) {
      await prodDb.insert(trainingQuizQuestions)
        .values(question)
        .onConflictDoUpdate({
          target: trainingQuizQuestions.id,
          set: {
            moduleId: question.moduleId,
            questionText: question.questionText,
            questionOrder: question.questionOrder,
          }
        });
    }
    console.log(`   ✓ Synced ${questions.length} questions`);

    // Insert answers
    for (const answer of answers) {
      await prodDb.insert(trainingQuizAnswers)
        .values(answer)
        .onConflictDoUpdate({
          target: trainingQuizAnswers.id,
          set: {
            questionId: answer.questionId,
            answerText: answer.answerText,
            isCorrect: answer.isCorrect,
            answerOrder: answer.answerOrder,
          }
        });
    }
    console.log(`   ✓ Synced ${answers.length} answers\n`);

    // Step 3: Verify production data
    console.log('🔍 Verifying production database...');
    const prodModules = await prodDb.select().from(trainingModules);
    const prodQuestions = await prodDb.select().from(trainingQuizQuestions);
    const prodAnswers = await prodDb.select().from(trainingQuizAnswers);

    console.log(`   ✓ Production has ${prodModules.length} modules`);
    console.log(`   ✓ Production has ${prodQuestions.length} questions`);
    console.log(`   ✓ Production has ${prodAnswers.length} answers\n`);

    console.log('✅ Training data sync completed successfully!');

  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

syncTrainingData().catch(console.error);
