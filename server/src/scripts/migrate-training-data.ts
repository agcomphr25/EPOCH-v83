import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../schema';

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

interface IdMapping {
  [oldId: number]: number;
}

async function migrateTrainingData() {
  console.log('🚀 Starting training data migration from DEV to PROD...\n');

  const devSql = neon(DEV_DATABASE_URL);
  const devDb = drizzle(devSql, { schema });

  const prodSql = neon(PROD_DATABASE_URL);
  const prodDb = drizzle(prodSql, { schema });

  try {
    // Step 1: Export training modules from DEV
    console.log('📦 Step 1: Exporting training modules from DEV database...');
    const devModules = await devDb.select().from(schema.trainingModules);
    console.log(`   Found ${devModules.length} training modules`);

    // Step 2: Export training questions from DEV
    console.log('📦 Step 2: Exporting training questions from DEV database...');
    const devQuestions = await devDb.select().from(schema.trainingQuestions);
    console.log(`   Found ${devQuestions.length} training questions`);

    // Step 3: Export training question options from DEV
    console.log('📦 Step 3: Exporting training question options from DEV database...');
    const devOptions = await devDb.select().from(schema.trainingQuestionOptions);
    console.log(`   Found ${devOptions.length} training question options`);

    // Step 4: Export employee training records from DEV
    console.log('📦 Step 4: Exporting employee training records from DEV database...');
    const devRecords = await devDb.select().from(schema.employeeTrainingRecords);
    console.log(`   Found ${devRecords.length} employee training records`);

    // Step 5: Export employee quiz attempts from DEV
    console.log('📦 Step 5: Exporting employee quiz attempts from DEV database...');
    const devAttempts = await devDb.select().from(schema.employeeQuizAttempts);
    console.log(`   Found ${devAttempts.length} employee quiz attempts`);

    // Step 6: Export training matrix from DEV
    console.log('📦 Step 6: Exporting training matrix from DEV database...');
    const devMatrix = await devDb.select().from(schema.trainingMatrix);
    console.log(`   Found ${devMatrix.length} training matrix entries\n`);

    // ID Mappings to preserve relationships
    const moduleIdMap: IdMapping = {};
    const questionIdMap: IdMapping = {};
    const recordIdMap: IdMapping = {};

    // Step 7: Import training modules to PROD
    console.log('📥 Step 7: Importing training modules to PROD database...');
    for (const module of devModules) {
      const { id, ...moduleData } = module;
      const [inserted] = await prodDb.insert(schema.trainingModules)
        .values(moduleData)
        .returning({ id: schema.trainingModules.id });
      moduleIdMap[id] = inserted.id;
      console.log(`   Migrated module ID ${id} → ${inserted.id}: ${module.title}`);
    }

    // Step 8: Import training questions to PROD with updated moduleId references
    console.log('\n📥 Step 8: Importing training questions to PROD database...');
    for (const question of devQuestions) {
      const { id, moduleId, ...questionData } = question;
      const newModuleId = moduleIdMap[moduleId];
      
      if (!newModuleId) {
        console.error(`   ⚠️  Skipping question ${id} - module ${moduleId} not found in mapping`);
        continue;
      }

      const [inserted] = await prodDb.insert(schema.trainingQuestions)
        .values({ ...questionData, moduleId: newModuleId })
        .returning({ id: schema.trainingQuestions.id });
      questionIdMap[id] = inserted.id;
      console.log(`   Migrated question ID ${id} → ${inserted.id} (module ${moduleId} → ${newModuleId})`);
    }

    // Step 9: Import training question options to PROD with updated questionId references
    console.log('\n📥 Step 9: Importing training question options to PROD database...');
    for (const option of devOptions) {
      const { id, questionId, ...optionData } = option;
      const newQuestionId = questionIdMap[questionId];
      
      if (!newQuestionId) {
        console.error(`   ⚠️  Skipping option ${id} - question ${questionId} not found in mapping`);
        continue;
      }

      await prodDb.insert(schema.trainingQuestionOptions)
        .values({ ...optionData, questionId: newQuestionId });
      console.log(`   Migrated option ID ${id} (question ${questionId} → ${newQuestionId})`);
    }

    // Step 10: Import employee training records to PROD
    console.log('\n📥 Step 10: Importing employee training records to PROD database...');
    for (const record of devRecords) {
      const { id, moduleId, ...recordData } = record;
      const newModuleId = moduleIdMap[moduleId];
      
      if (!newModuleId) {
        console.error(`   ⚠️  Skipping record ${id} - module ${moduleId} not found in mapping`);
        continue;
      }

      const [inserted] = await prodDb.insert(schema.employeeTrainingRecords)
        .values({ ...recordData, moduleId: newModuleId })
        .returning({ id: schema.employeeTrainingRecords.id });
      recordIdMap[id] = inserted.id;
      console.log(`   Migrated record ID ${id} → ${inserted.id} (module ${moduleId} → ${newModuleId})`);
    }

    // Step 11: Import employee quiz attempts to PROD
    console.log('\n📥 Step 11: Importing employee quiz attempts to PROD database...');
    for (const attempt of devAttempts) {
      const { id, trainingRecordId, moduleId, ...attemptData } = attempt;
      const newRecordId = recordIdMap[trainingRecordId];
      const newModuleId = moduleIdMap[moduleId];
      
      if (!newRecordId || !newModuleId) {
        console.error(`   ⚠️  Skipping attempt ${id} - record ${trainingRecordId} or module ${moduleId} not found`);
        continue;
      }

      await prodDb.insert(schema.employeeQuizAttempts)
        .values({ ...attemptData, trainingRecordId: newRecordId, moduleId: newModuleId });
      console.log(`   Migrated attempt ID ${id} (record ${trainingRecordId} → ${newRecordId})`);
    }

    // Step 12: Import training matrix to PROD
    console.log('\n📥 Step 12: Importing training matrix to PROD database...');
    for (const entry of devMatrix) {
      const { id, ...matrixData } = entry;
      await prodDb.insert(schema.trainingMatrix)
        .values(matrixData);
      console.log(`   Migrated matrix entry ID ${id}: ${entry.trainingName}`);
    }

    // Step 13: Verify migration
    console.log('\n✅ Step 13: Verifying migration...');
    const prodModulesCount = await prodDb.select().from(schema.trainingModules);
    const prodQuestionsCount = await prodDb.select().from(schema.trainingQuestions);
    const prodOptionsCount = await prodDb.select().from(schema.trainingQuestionOptions);
    const prodRecordsCount = await prodDb.select().from(schema.employeeTrainingRecords);
    const prodAttemptsCount = await prodDb.select().from(schema.employeeQuizAttempts);
    const prodMatrixCount = await prodDb.select().from(schema.trainingMatrix);

    console.log('\n📊 Migration Summary:');
    console.log('═'.repeat(60));
    console.log(`Training Modules:        ${devModules.length} → ${prodModulesCount.length}`);
    console.log(`Training Questions:      ${devQuestions.length} → ${prodQuestionsCount.length}`);
    console.log(`Question Options:        ${devOptions.length} → ${prodOptionsCount.length}`);
    console.log(`Employee Records:        ${devRecords.length} → ${prodRecordsCount.length}`);
    console.log(`Quiz Attempts:           ${devAttempts.length} → ${prodAttemptsCount.length}`);
    console.log(`Training Matrix Entries: ${devMatrix.length} → ${prodMatrixCount.length}`);
    console.log('═'.repeat(60));

    const allMatch = 
      devModules.length === prodModulesCount.length &&
      devQuestions.length === prodQuestionsCount.length &&
      devOptions.length === prodOptionsCount.length &&
      devRecords.length === prodRecordsCount.length &&
      devAttempts.length === prodAttemptsCount.length &&
      devMatrix.length === prodMatrixCount.length;

    if (allMatch) {
      console.log('\n✅ SUCCESS: All training data migrated successfully!');
    } else {
      console.log('\n⚠️  WARNING: Record counts do not match. Please review the migration logs.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

migrateTrainingData()
  .then(() => {
    console.log('\n🎉 Training data migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
