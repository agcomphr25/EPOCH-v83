import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertFormSchema,
  insertFormSubmissionSchema,
  insertPurchaseReviewChecklistSchema,
  insertManufacturersCertificateSchema
} from '@shared/schema';

const router = Router();

// Enhanced Forms Management
router.get('/enhanced', async (req: Request, res: Response) => {
  try {
    const forms = await storage.getAllEnhancedForms();
    res.json(forms);
  } catch (error) {
    console.error('Get enhanced forms error:', error);
    res.status(500).json({ error: "Failed to fetch enhanced forms" });
  }
});

router.get('/enhanced/:id', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const form = await storage.getEnhancedFormById(formId);
    
    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }
    
    res.json(form);
  } catch (error) {
    console.error('Get enhanced form error:', error);
    res.status(500).json({ error: "Failed to fetch enhanced form" });
  }
});

router.post('/enhanced', authenticateToken, async (req: Request, res: Response) => {
  try {
    const formData = insertFormSchema.parse(req.body);
    const newForm = await storage.createEnhancedForm(formData);
    res.status(201).json(newForm);
  } catch (error) {
    console.error('Create enhanced form error:', error);
    res.status(500).json({ error: "Failed to create enhanced form" });
  }
});

router.put('/enhanced/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const updates = req.body;
    const updatedForm = await storage.updateEnhancedForm(formId, updates);
    res.json(updatedForm);
  } catch (error) {
    console.error('Update enhanced form error:', error);
    res.status(500).json({ error: "Failed to update enhanced form" });
  }
});

router.delete('/enhanced/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    await storage.deleteEnhancedForm(formId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete enhanced form error:', error);
    res.status(500).json({ error: "Failed to delete enhanced form" });
  }
});

// Form Submissions
router.get('/enhanced/:id/submissions', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const submissions = await storage.getFormSubmissions(formId);
    res.json(submissions);
  } catch (error) {
    console.error('Get form submissions error:', error);
    res.status(500).json({ error: "Failed to fetch form submissions" });
  }
});

router.post('/enhanced/:id/submissions', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const submissionData = insertFormSubmissionSchema.parse({
      ...req.body,
      formId
    });
    const newSubmission = await storage.createFormSubmission(submissionData);
    res.status(201).json(newSubmission);
  } catch (error) {
    console.error('Create form submission error:', error);
    res.status(500).json({ error: "Failed to create form submission" });
  }
});

// Purchase Review Checklist
router.get('/purchase-review-checklists', async (req: Request, res: Response) => {
  try {
    const checklists = await storage.getAllPurchaseReviewChecklists();
    res.json(checklists);
  } catch (error) {
    console.error('Get purchase review checklists error:', error);
    res.status(500).json({ error: "Failed to fetch purchase review checklists" });
  }
});

router.get('/purchase-review-checklists/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const checklist = await storage.getPurchaseReviewChecklistById(id);
    
    if (!checklist) {
      return res.status(404).json({ error: "Purchase review checklist not found" });
    }
    
    res.json(checklist);
  } catch (error) {
    console.error('Get purchase review checklist error:', error);
    res.status(500).json({ error: "Failed to fetch purchase review checklist" });
  }
});

router.post('/purchase-review-checklists', async (req: Request, res: Response) => {
  try {
    const checklistData = insertPurchaseReviewChecklistSchema.parse(req.body);
    const newChecklist = await storage.createPurchaseReviewChecklist(checklistData);
    res.status(201).json(newChecklist);
  } catch (error) {
    console.error('Create purchase review checklist error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create purchase review checklist" });
  }
});

router.put('/purchase-review-checklists/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    const updatedChecklist = await storage.updatePurchaseReviewChecklist(id, updates);
    res.json(updatedChecklist);
  } catch (error) {
    console.error('Update purchase review checklist error:', error);
    res.status(500).json({ error: "Failed to update purchase review checklist" });
  }
});

router.delete('/purchase-review-checklists/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deletePurchaseReviewChecklist(id);
    res.status(204).end();
  } catch (error) {
    console.error('Delete purchase review checklist error:', error);
    res.status(500).json({ error: "Failed to delete purchase review checklist" });
  }
});

// Manufacturer's Certificate of Conformance routes
router.get('/manufacturers-certificates', async (req: Request, res: Response) => {
  try {
    const certificates = await storage.getAllManufacturersCertificates();
    res.json(certificates);
  } catch (error) {
    console.error('Get manufacturers certificates error:', error);
    res.status(500).json({ error: "Failed to fetch manufacturers certificates" });
  }
});

router.get('/manufacturers-certificates/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const certificate = await storage.getManufacturersCertificate(id);
    
    if (!certificate) {
      return res.status(404).json({ error: "Manufacturer's certificate not found" });
    }
    
    res.json(certificate);
  } catch (error) {
    console.error('Get manufacturers certificate error:', error);
    res.status(500).json({ error: "Failed to fetch manufacturers certificate" });
  }
});

router.post('/manufacturers-certificates', async (req: Request, res: Response) => {
  try {
    const certificateData = insertManufacturersCertificateSchema.parse(req.body);
    const newCertificate = await storage.createManufacturersCertificate(certificateData);
    res.status(201).json(newCertificate);
  } catch (error) {
    console.error('Create manufacturers certificate error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create manufacturers certificate" });
  }
});

router.put('/manufacturers-certificates/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    const updatedCertificate = await storage.updateManufacturersCertificate(id, updates);
    res.json(updatedCertificate);
  } catch (error) {
    console.error('Update manufacturers certificate error:', error);
    res.status(500).json({ error: "Failed to update manufacturers certificate" });
  }
});

router.delete('/manufacturers-certificates/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteManufacturersCertificate(id);
    res.status(204).end();
  } catch (error) {
    console.error('Delete manufacturers certificate error:', error);
    res.status(500).json({ error: "Failed to delete manufacturers certificate" });
  }
});

export default router;