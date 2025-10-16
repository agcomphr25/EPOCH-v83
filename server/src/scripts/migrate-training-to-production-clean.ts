import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import {
  trainingModules,
  trainingQuestions,
  trainingQuestionOptions,
} from '../../schema';
import { sql } from 'drizzle-orm';

// WebSocket for Neon serverless
neonConfig.webSocketConstructor = ws;

// Database URLs
const DEV_DATABASE_URL =
  'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb';
const PROD_DATABASE_URL =
  'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb';

async function migrateTrainingData() {
  console.log(
    '🚀 Starting clean training data migration from development to production...\n'
  );

  // Connect to development database
  const devPool = new Pool({ connectionString: DEV_DATABASE_URL });
  const devDb = drizzle(devPool);
  console.log('✅ Connected to development database');

  // Connect to production database
  const prodPool = new Pool({ connectionString: PROD_DATABASE_URL });
  const prodDb = drizzle(prodPool);
  console.log('✅ Connected to production database\n');

  try {
    // Step 1: Delete all existing training data from production
    console.log('🗑️  Step 1: Cleaning production database...');

    await prodDb.delete(trainingQuestionOptions);
    console.log('   ✅ Deleted all question options');

    await prodDb.delete(trainingQuestions);
    console.log('   ✅ Deleted all questions');

    await prodDb.delete(trainingModules);
    console.log('   ✅ Deleted all training modules');

    // Reset sequences
    await prodDb.execute(
      sql`ALTER SEQUENCE training_modules_id_seq RESTART WITH 1`
    );
    await prodDb.execute(
      sql`ALTER SEQUENCE training_questions_id_seq RESTART WITH 1`
    );
    await prodDb.execute(
      sql`ALTER SEQUENCE training_question_options_id_seq RESTART WITH 1`
    );
    console.log('   ✅ Reset ID sequences\n');

    // Step 2: Fetch all training modules from development
    console.log('📥 Step 2: Fetching data from development...');
    const devModules = await devDb.select().from(trainingModules);
    console.log(`   ✅ Found ${devModules.length} training modules\n`);

    // Step 3: Migrate training modules
    console.log('📤 Step 3: Migrating training modules...');
    const moduleIdMapping: { [key: number]: number } = {};

    for (const module of devModules) {
      const { id, ...moduleData } = module;

      const [newModule] = await prodDb
        .insert(trainingModules)
        .values(moduleData as any)
        .returning();

      moduleIdMapping[id] = newModule.id;
      console.log(`   ✅ Migrated: ${module.title} (${id} → ${newModule.id})`);
    }
    console.log(`   ✅ Successfully migrated ${devModules.length} modules\n`);

    // Step 4: Migrate training questions
    console.log('📤 Step 4: Migrating training questions...');
    const devQuestions = await devDb.select().from(trainingQuestions);
    console.log(`   ✅ Found ${devQuestions.length} questions`);

    const questionIdMapping: { [key: number]: number } = {};
    let questionsCount = 0;

    for (const question of devQuestions) {
      const { id, ...questionData } = question;
      const newModuleId = moduleIdMapping[question.moduleId];

      if (!newModuleId) {
        console.log(`   ⚠️  Skipping question ${id} - module not found`);
        continue;
      }

      const [newQuestion] = await prodDb
        .insert(trainingQuestions)
        .values({
          ...questionData,
          moduleId: newModuleId,
        } as any)
        .returning();

      questionIdMapping[id] = newQuestion.id;
      questionsCount++;
    }
    console.log(`   ✅ Successfully migrated ${questionsCount} questions\n`);

    // Step 5: Migrate question options
    console.log('📤 Step 5: Migrating question options...');
    const devOptions = await devDb.select().from(trainingQuestionOptions);
    console.log(`   ✅ Found ${devOptions.length} options`);

    let optionsCount = 0;

    for (const option of devOptions) {
      const { id, ...optionData } = option;
      const newQuestionId = questionIdMapping[option.questionId];

      if (!newQuestionId) {
        console.log(`   ⚠️  Skipping option ${id} - question not found`);
        continue;
      }

      await prodDb.insert(trainingQuestionOptions).values({
        ...optionData,
        questionId: newQuestionId,
      } as any);

      optionsCount++;
    }
    console.log(`   ✅ Successfully migrated ${optionsCount} options\n`);

    // Step 6: Verify migration
    console.log('✅ Step 6: Verifying migration...');
    const prodModules = await prodDb.select().from(trainingModules);
    const prodQuestions = await prodDb.select().from(trainingQuestions);
    const prodOptions = await prodDb.select().from(trainingQuestionOptions);

    console.log('\n📊 Migration Summary:');
    console.log('══════════════════════════════════════════');
    console.log(`   Training Modules: ${prodModules.length}`);
    console.log(`   Questions: ${prodQuestions.length}`);
    console.log(`   Question Options: ${prodOptions.length}`);
    console.log('══════════════════════════════════════════\n');

    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY! 🎉\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await devPool.end();
    await prodPool.end();
    console.log('🔌 Database connections closed');
  }
}

// Run migration
migrateTrainingData()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
