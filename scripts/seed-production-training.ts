import { db } from '../server/db';
import { trainingModules, trainingQuizQuestions, trainingQuizAnswers } from '../server/schema';

/**
 * Seed script to populate production database with training modules
 * Run this against your PRODUCTION database to add training data
 */

async function seedProductionTraining() {
  console.log('🌱 Starting production training data seed...');

  try {
    // Insert all 9 training modules
    const modules = await db.insert(trainingModules).values([
      {
        id: 2,
        title: 'Preservation & Foreign Object Debris (FOD) Training',
        description: 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.',
        pdfUrl: '/attached_assets/Preservation Training-1_1759352156313.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 3,
        title: 'Chemical Handling, Storage, & Disposal',
        description: 'Essential training on safe chemical handling, proper storage procedures, and disposal requirements.',
        pdfUrl: '/attached_assets/Employee Chemical Handling Training_1759351845055.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 4,
        title: 'Fire Safety Training',
        description: 'Critical fire safety procedures, emergency response, and prevention strategies.',
        pdfUrl: '/attached_assets/Fire Safety Training_1759352218878.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 5,
        title: 'ITAR Compliance Training',
        description: 'International Traffic in Arms Regulations (ITAR) compliance and export control requirements.',
        pdfUrl: '/attached_assets/Annual ITAR Training.docx - Google Docs_1759352442796.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 6,
        title: 'AS9100 Employee Orientation Training',
        description: 'Introduction to AS9100 quality management system requirements for aerospace manufacturing.',
        pdfUrl: '/attached_assets/AS9100 Employee Training_1759352917898.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 7,
        title: 'Counterfeit Materials Prevention Training',
        description: 'Training on identifying and preventing counterfeit materials in aerospace supply chain.',
        pdfUrl: '/attached_assets/Counterfeit Prevention Training_1759353475520.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 8,
        title: 'Ethics in Aerospace Quality Systems',
        description: 'Ethical standards and responsibilities in aerospace quality management.',
        pdfUrl: '/attached_assets/Ethics - Google Docs_1759353564278.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 9,
        title: 'Leader Training: Nonconforming Items',
        description: 'Leadership training on managing and addressing nonconforming items in production.',
        pdfUrl: '/attached_assets/Nonconforming Items - Google Docs_1759353680422.pdf',
        passingScore: 80,
        isActive: true
      },
      {
        id: 10,
        title: 'Leader Training: Shut Down Procedures',
        description: 'Leadership training on proper facility shut down procedures and safety protocols.',
        pdfUrl: '/attached_assets/AG Shutdown Procedures - Google Docs_1759353753638.pdf',
        passingScore: 80,
        isActive: true
      }
    ]).returning();

    console.log(`✅ Inserted ${modules.length} training modules`);

    // Note: Quiz questions and answers should also be seeded
    // This is a simplified version - you may need to export and import all quiz data
    
    console.log('🎉 Production training data seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding production training data:', error);
    process.exit(1);
  }
}

seedProductionTraining();
