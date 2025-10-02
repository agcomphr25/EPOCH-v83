import type { Express } from "express";
import { db } from "../db";
import { trainingModules, trainingQuizQuestions, trainingQuizAnswers } from "../schema";
import { authenticateToken, requireRole } from "../middleware/auth";

export function registerTrainingSyncRoutes(app: Express) {
  
  // Admin-only endpoint to sync training data to production
  app.post("/api/admin/sync-training-data", authenticateToken, requireRole('ADMIN'), async (req, res) => {
    try {
      console.log('🔄 Starting training data sync...');
      
      // Training Modules Data
      const modulesData = [
        {
          id: 2,
          title: 'Preservation & Foreign Object Debris (FOD) Training',
          description: 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.',
          pdfUrl: '/attached_assets/preservation-training.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 3,
          title: 'Chemical Handling, Storage, & Disposal',
          description: 'Comprehensive training on safe chemical handling procedures, proper storage requirements, and disposal protocols to ensure employee safety and environmental compliance.',
          pdfUrl: '/attached_assets/Leader Training Topic Chemical Handling_1759351634113.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 4,
          title: 'Fire Safety Training',
          description: 'Essential fire safety training for composite manufacturing environments. Learn to recognize fire hazards, implement prevention measures, respond to emergencies, and follow proper evacuation procedures.',
          pdfUrl: '/attached_assets/Pasted--Fire-Safety-Training-AG-Composites-Training-Objective-To-ensure-all-AG-Composites-employees-un-1759351941754_1759351941754.txt',
          passingScore: 80,
          isActive: true
        },
        {
          id: 5,
          title: 'ITAR Compliance Training',
          description: 'Annual International Traffic in Arms Regulations (ITAR) training covering export control regulations, employee responsibilities, technical data safeguarding, and compliance requirements for defense-related products.',
          pdfUrl: '/attached_assets/Annual ITAR Training.docx - Google Docs_1759352442796.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 6,
          title: 'AS9100 Employee Orientation Training',
          description: 'Quality management system orientation for aviation, space, and defense manufacturing. Learn about AG Composites quality policy, objectives, document management, and your role in maintaining quality standards.',
          pdfUrl: '/attached_assets/AS9100 Employee Training_1759352917898.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 7,
          title: 'Counterfeit Materials Prevention Training',
          description: 'Learn to identify, prevent, and respond to counterfeit materials in the supply chain. Covers avoidance strategies, detection red flags, mitigation procedures, and AG Composites supplier requirements to protect product integrity and safety.',
          pdfUrl: '/attached_assets/Counterfeit Prevention Training_1759353475520.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 8,
          title: 'Ethics in Aerospace Quality Systems',
          description: 'Essential ethical behavior training for aerospace manufacturing. Learn about falsification consequences, handling non-conforming materials, counterfeit prevention, employee/supplier responsibilities, and whistleblower protections.',
          pdfUrl: '/attached_assets/Ethics - Google Docs_1759353564278.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 9,
          title: 'Leader Training: Nonconforming Items',
          description: 'Essential training for leaders on managing nonconforming items. Learn the three categories (scrap, returns, counterfeit), proper handling procedures, red tagging requirements, and disposition authorization protocols.',
          pdfUrl: '/attached_assets/Leader Training Topic_ Nonconforming Items_1759353723875.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 10,
          title: 'Leader Training: Shut Down Procedures',
          description: 'Essential daily shut down procedures for facility leaders. Covers proper closing procedures for CNC, Gunsmith, Plugging & Layup, Paint departments, and general facility tasks including security, lighting, equipment shutdown, and lock-up protocols.',
          pdfUrl: '/attached_assets/Leader Training Shut Down Procedures_1759353935946.pdf',
          passingScore: 80,
          isActive: true
        }
      ];

      // Insert modules
      let modulesInserted = 0;
      for (const module of modulesData) {
        try {
          await db.insert(trainingModules).values(module).onConflictDoNothing();
          modulesInserted++;
        } catch (error) {
          console.error(`Error inserting module ${module.id}:`, error);
        }
      }

      console.log(`✅ Inserted ${modulesInserted} training modules`);

      res.json({
        success: true,
        message: 'Training data sync completed',
        stats: {
          modulesInserted
        }
      });

    } catch (error: any) {
      console.error('❌ Error syncing training data:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Check sync status
  app.get("/api/admin/training-sync-status", authenticateToken, requireRole('ADMIN'), async (req, res) => {
    try {
      const modules = await db.select().from(trainingModules);
      
      res.json({
        modulesCount: modules.length,
        modules: modules.map(m => ({ id: m.id, title: m.title }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
