import express, { type Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { registerRoutes } from './src/routes/index';
import { setupVite, serveStatic, log } from './vite';
import { db } from './db';
import { authenticateToken } from './middleware/auth';
import { notificationManager } from './src/services/notificationManager';

// Build version marker - change this to verify deployment updates
const BUILD_VERSION = '2026-01-27-v2';
console.log(`🚀 EPOCH Server Starting - Build Version: ${BUILD_VERSION}`);

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL'];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
}

// Log available environment variables (without values for security)
console.log('Environment check:', {
  DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Missing',
  NODE_ENV: process.env.NODE_ENV || 'Not set',
  PORT: process.env.PORT || 'Not set (defaulting to 5000)',
});

console.log('🧬 [BOOT] DATABASE_URL:', process.env.DATABASE_URL);
console.log('🧬 [BOOT] NODE_ENV:', process.env.NODE_ENV);
console.log('🧬 [BOOT] APP_ENV:', process.env.APP_ENV);

const app = express();

// CRITICAL: Health check endpoint MUST be registered FIRST, before any middleware
// This ensures Replit deployment health probes get instant responses during initialization
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// CRITICAL: Trust proxy for deployments behind Replit's infrastructure
// This is required for express-rate-limit to work correctly with X-Forwarded-For headers
// Enabled in both development and production since Replit uses a proxy
app.set('trust proxy', 1);
console.log('🔒 Trust proxy enabled');

// CORS configuration - critical for production authentication
// Check if we're on Replit deployment (agcompepoch.xyz) or development
const isReplitDeployment =
  process.env.REPL_DEPLOYMENT === 'true' ||
  process.env.REPLIT_DEPLOYMENT === 'true';
const isProduction =
  process.env.NODE_ENV === 'production' || isReplitDeployment;

const corsOptions = {
  origin: isProduction
    ? ['https://agcompepoch.xyz', 'https://www.agcompepoch.xyz']
    : true, // Allow all origins in development
  credentials: true, // Allow cookies to be sent
  optionsSuccessStatus: 200,
};

console.log('🔒 CORS Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  REPL_DEPLOYMENT: process.env.REPL_DEPLOYMENT,
  isProduction,
  allowedOrigins: corsOptions.origin,
});

app.use(cors(corsOptions));

// Serve attached assets (PDFs, documents, etc.) - Must be before other routes
// In production, assets are copied to dist/attached_assets via build script
// In development, assets are in the root attached_assets folder
const assetsPath = process.env.NODE_ENV === 'production'
  ? path.join(process.cwd(), 'dist', 'attached_assets')
  : path.join(process.cwd(), 'attached_assets');

console.log('📁 Assets path configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  assetsPath,
  dirname: import.meta.dirname,
  cwd: process.cwd(),
});

app.get('/attached_assets/*', (req, res, next) => {
  const fileName = req.path.replace('/attached_assets/', '');
  const filePath = path.join(assetsPath, fileName);

  console.log('📄 Asset request:', {
    fileName,
    filePath,
    exists: fs.existsSync(filePath),
  });

  if (fs.existsSync(filePath)) {
    // Set correct content type for PDFs
    if (filePath.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
    }
    return res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error serving attached asset:', err);
        next(err);
      }
    });
  }
  console.error('❌ Asset not found:', filePath);
  next();
});

app.use(cookieParser());
// Skip JSON parsing for multipart/form-data (file uploads)
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  express.json({ limit: '50mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Also add express.static as fallback
app.use('/attached_assets', express.static(assetsPath));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// GLOBAL AUTHENTICATION MIDDLEWARE
// Apply authentication to ALL /api routes except public endpoints
// Public routes that don't require authentication:
const publicRoutes = [
  '/api/auth',           // Login, logout, session management
  '/api/magic-link',     // Magic link authentication
  '/api/oauth',          // OAuth callbacks
  '/api/calendar/webhook', // Google Calendar webhooks
  '/api/integrations/process-runner', // External timer app integration (uses own token auth)
  '/api/p2-traveler',    // Production floor traveler system (uses badge authentication)
  '/api/p2-traveler-viewer', // P2 traveler viewer - production floor access
  '/api/travelers',      // Traveler execution - production floor access via barcode scan
  '/api/part-routings',  // Part routing data needed by traveler execution
  '/api/routing-documents', // Routing documents needed by traveler execution
  '/api/material-lots',  // Material lot validation needed by traveler execution
  '/api/production/timers', // Production Timer Station - public for floor displays
];

app.use('/api', (req, res, next) => {
  // Skip authentication for public routes
  const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route.replace('/api', '')));
  if (isPublicRoute) {
    return next();
  }
  
  // Apply authentication to all other API routes
  return authenticateToken(req, res, next);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + '…';
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const server = await registerRoutes(app);

    notificationManager.initialize(server);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal Server Error';

      console.error('=== SERVER ERROR ===');
      console.error('Status:', status);
      console.error('Message:', message);
      console.error('Stack:', err.stack);
      console.error('URL:', _req.url);
      console.error('Method:', _req.method);
      console.error('===================');

      log(`Error ${status}: ${message}`);
      res.status(status).json({
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    });

    // Setup vite in development, static serving in production
    if (app.get('env') === 'development') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen(
      {
        port,
        host: '0.0.0.0',
      },
      () => {
        console.log(`Server started successfully`);
        console.log(`- Port: ${port}`);
        console.log(`- Host: 0.0.0.0`);
        console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
        log(`serving on port ${port}`);

        // Initialize database and cron jobs AFTER server is listening
        // This ensures health checks pass while background services initialize
        initializeBackgroundServices();
      }
    );
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

// Background initialization - runs after server is listening
async function initializeBackgroundServices() {
  try {
    // Test database connection (non-blocking)
    console.log('Initializing database connection...');
    const { testDatabaseConnection } = await import('./db');
    const dbConnected = await testDatabaseConnection();

    if (!dbConnected) {
      console.error('Failed to connect to database. Server may not function properly.');
    } else {
      console.log('✅ Database connection successful');

      // One-time migration: Reassign Red Hawk Rifles LLC POs from inactive customer 698 to active customer 547
      try {
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`UPDATE purchase_orders SET customer_id = '547' WHERE customer_id = '698'`);
        console.log('✅ One-time migration: Red Hawk Rifles LLC POs reassigned from customer 698 → 547');
      } catch (migError: any) {
        console.warn('⚠️ One-time migration skipped or already applied:', migError.message);
      }

      // Sync serialized item part numbers to match their PO items
      try {
        const { sql: sqlSync } = await import('drizzle-orm');
        await db.execute(sqlSync`
          UPDATE p2_serialized_items si
          SET part_number = poi.part_number,
              part_name = poi.part_name,
              updated_at = NOW()
          FROM p2_purchase_order_items poi
          WHERE si.po_item_id = poi.id
            AND (si.part_number != poi.part_number OR si.part_name != poi.part_name)
        `);
        console.log('✅ Synced serialized item part numbers to match PO items');
      } catch (syncErr: any) {
        console.warn('⚠️ Serialized item sync skipped:', syncErr.message);
      }

      // Clean up resolved RMAs still showing in shipping queue
      try {
        const { sql: sqlCleanup } = await import('drizzle-orm');
        await db.execute(sqlCleanup`UPDATE nonconformance_records SET shipping_status = 'Shipped', updated_at = NOW() WHERE status = 'Resolved' AND shipping_status = 'Ready to Ship' AND tracking_number IS NOT NULL`);
        await db.execute(sqlCleanup`UPDATE nonconformance_records SET shipping_status = 'Shipped', updated_at = NOW() WHERE status = 'Resolved' AND shipping_status = 'Ready to Ship' AND resolved_at < NOW() - INTERVAL '1 day'`);
        console.log('✅ Cleaned up resolved RMAs from shipping queue');
      } catch (cleanupErr: any) {
        console.warn('⚠️ RMA cleanup skipped:', cleanupErr.message);
      }

      // Ensure traveler_signatures has task-specific columns for role-based signing
      try {
        const { sql: sqlSig } = await import('drizzle-orm');
        await db.execute(sqlSig`ALTER TABLE traveler_signatures ADD COLUMN IF NOT EXISTS traveler_task_id VARCHAR(255)`);
        await db.execute(sqlSig`ALTER TABLE traveler_signatures ADD COLUMN IF NOT EXISTS signature_role VARCHAR(50)`);
        await db.execute(sqlSig`ALTER TABLE traveler_signatures ADD COLUMN IF NOT EXISTS signature_data TEXT`);
        await db.execute(sqlSig`ALTER TABLE traveler_signatures ADD COLUMN IF NOT EXISTS signature_hash TEXT`);
        console.log('✅ Ensured traveler_signatures has task_id, signature_role, signature_data, and signature_hash columns');
      } catch (sigErr: any) {
        console.warn('⚠️ Traveler signatures migration skipped:', sigErr.message);
      }

      // Ensure instruction_pack column exists on traveler_tasks
      try {
        const { sql: sqlInst } = await import('drizzle-orm');
        await db.execute(sqlInst`ALTER TABLE traveler_tasks ADD COLUMN IF NOT EXISTS instruction_pack JSONB`);
        console.log('✅ Ensured traveler_tasks has instruction_pack column');
      } catch (instErr: any) {
        console.warn('⚠️ Traveler tasks instruction_pack migration skipped:', instErr.message);
      }

      // Ensure p2_customers has serial_sequences column and update old-format serial numbers
      try {
        const { sql: sqlSerial } = await import('drizzle-orm');
        await db.execute(sqlSerial`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS serial_sequences JSONB DEFAULT '{}'::jsonb`);
        
        const oldFormatItems = await db.execute(sqlSerial`
          SELECT COUNT(*) as cnt FROM p2_serialized_items 
          WHERE serial_number LIKE '% %'
        `);
        const oldCount = (oldFormatItems.rows[0] as any)?.cnt;
        if (oldCount && parseInt(oldCount) > 0) {
          const customers = await db.execute(sqlSerial`
            SELECT DISTINCT si.customer_id, c.rfq_prefix, c.customer_name
            FROM p2_serialized_items si
            LEFT JOIN p2_customers c ON c.customer_id = si.customer_id
            WHERE si.serial_number LIKE '% %'
          `);
          for (const cust of (customers.rows || []) as any[]) {
            const prefix = cust.rfq_prefix || (cust.customer_name || 'UNK').substring(0, 3).toUpperCase();
            const yearSuffix = new Date().getFullYear().toString().slice(-2);
            await db.execute(sqlSerial`
              UPDATE p2_serialized_items
              SET serial_number = ${prefix + yearSuffix} || LPAD(sequence_number::text, 5, '0'),
                  barcode = ${prefix + yearSuffix} || LPAD(sequence_number::text, 5, '0')
              WHERE customer_id = ${cust.customer_id}
                AND serial_number LIKE '% %'
            `);
            const maxSeq = await db.execute(sqlSerial`
              SELECT MAX(sequence_number) as max_seq FROM p2_serialized_items WHERE customer_id = ${cust.customer_id}
            `);
            const maxSeqNum = (maxSeq.rows[0] as any)?.max_seq || 0;
            await db.execute(sqlSerial`
              UPDATE p2_customers
              SET serial_sequences = COALESCE(serial_sequences, '{}'::jsonb) || jsonb_build_object(${new Date().getFullYear().toString()}::text, ${maxSeqNum}::int)
              WHERE customer_id = ${cust.customer_id}
            `);
          }
          console.log(`✅ Updated ${oldCount} serialized items to new serial number format (PREFIX+YY+NNNNN)`);
        }
      } catch (serialErr: any) {
        console.warn('⚠️ Serial number migration skipped:', serialErr.message);
      }

      // Ensure routing_documents has extracted_text column
      try {
        const { sql: sqlTag } = await import('drizzle-orm');
        await db.execute(sqlTag`ALTER TABLE routing_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT`);
      } catch (colError: any) {
        // Column may already exist
      }

      // Ensure customer_satisfaction_responses has scanned_pdf_path column
      try {
        const { sql: sqlPdf } = await import('drizzle-orm');
        await db.execute(sqlPdf`ALTER TABLE customer_satisfaction_responses ADD COLUMN IF NOT EXISTS scanned_pdf_path TEXT`);
      } catch (colError: any) {
        // Column may already exist
      }

      // Ensure p2_final_inspection_results has tolerance deviation columns
      try {
        const { sql: sqlTol } = await import('drizzle-orm');
        await db.execute(sqlTol`ALTER TABLE p2_final_inspection_results ADD COLUMN IF NOT EXISTS tolerance_deviation_required BOOLEAN DEFAULT false`);
        await db.execute(sqlTol`ALTER TABLE p2_final_inspection_results ADD COLUMN IF NOT EXISTS tolerance_authorizer_id INTEGER`);
        await db.execute(sqlTol`ALTER TABLE p2_final_inspection_results ADD COLUMN IF NOT EXISTS tolerance_authorizer_name TEXT`);
        await db.execute(sqlTol`ALTER TABLE p2_final_inspection_results ADD COLUMN IF NOT EXISTS tolerance_authorizer_signature TEXT`);
        await db.execute(sqlTol`ALTER TABLE p2_final_inspection_results ADD COLUMN IF NOT EXISTS tolerance_authorization_date TIMESTAMP`);
        await db.execute(sqlTol`ALTER TABLE p2_final_inspection_results ADD COLUMN IF NOT EXISTS tolerance_deviation_reason TEXT`);
        console.log('✅ Ensured p2_final_inspection_results has tolerance deviation columns');
      } catch (colError: any) {
        // Columns may already exist
      }

      // Ensure p2_serialized_items has late-finalization columns (build_family_key etc.)
      try {
        const { sql: sqlP2Si } = await import('drizzle-orm');
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS build_family_key TEXT`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS part_routing_id VARCHAR(255)`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS part_routing_revision INTEGER`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS sku TEXT`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS drawing_name TEXT`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS customer_serial_number TEXT`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS customer_serial_assigned_at TIMESTAMP`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS customer_serial_assigned_by TEXT`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP`);
        await db.execute(sqlP2Si`ALTER TABLE p2_serialized_items ADD COLUMN IF NOT EXISTS finalized_by TEXT`);
        console.log('✅ Ensured p2_serialized_items has late-finalization columns');
      } catch (p2SiError: any) {
        // Columns may already exist
      }

      // Ensure production_orders has canonical material + source snapshot columns
      try {
        const { sql: sqlPO } = await import('drizzle-orm');
        await db.execute(sqlPO`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS material_canonical TEXT NOT NULL DEFAULT ''`);
        await db.execute(sqlPO`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS source_snapshot JSONB`);
        console.log('✅ Ensured production_orders has material_canonical and source_snapshot columns');
      } catch (poError: any) {
        // Columns may already exist
      }

      // Ensure routing_document_links table exists
      try {
        const { sql: sqlTag2 } = await import('drizzle-orm');
        await db.execute(sqlTag2`
          CREATE TABLE IF NOT EXISTS routing_document_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            part_routing_id UUID NOT NULL,
            department_name VARCHAR(255),
            document_type VARCHAR(100) NOT NULL,
            document_id UUID NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            sort_order INTEGER DEFAULT 0,
            created_by VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await db.execute(sqlTag2`CREATE INDEX IF NOT EXISTS routing_document_links_routing_idx ON routing_document_links(part_routing_id)`);
        await db.execute(sqlTag2`CREATE INDEX IF NOT EXISTS routing_document_links_document_idx ON routing_document_links(document_id)`);
      } catch (linkTableError: any) {
        console.warn('⚠️ routing_document_links migration:', linkTableError.message);
      }

      // Ensure employment_periods table exists (for onboarding employment tracking)
      try {
        const { sql: sqlTag3 } = await import('drizzle-orm');
        await db.execute(sqlTag3`
          CREATE TABLE IF NOT EXISTS employment_periods (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            start_date TIMESTAMP NOT NULL DEFAULT NOW(),
            end_date TIMESTAMP,
            employment_type TEXT DEFAULT 'FULL_TIME',
            department TEXT,
            job_title TEXT,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            started_via_session_id UUID,
            ended_via_session_id UUID,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlTag3`CREATE INDEX IF NOT EXISTS idx_employment_periods_employee_id ON employment_periods(employee_id)`);
        await db.execute(sqlTag3`CREATE INDEX IF NOT EXISTS idx_employment_periods_status ON employment_periods(status)`);
        console.log('✅ Ensured employment_periods table exists');
      } catch (empPeriodError: any) {
        console.warn('⚠️ employment_periods migration:', empPeriodError.message);
      }

      // Ensure employees have badge_scan_code column for secure badge scanning
      try {
        const { sql: sqlBadge } = await import('drizzle-orm');
        await db.execute(sqlBadge`ALTER TABLE employees ADD COLUMN IF NOT EXISTS badge_scan_code TEXT UNIQUE`);
        // Auto-generate badge scan codes for any employees that don't have one
        const employeesWithoutBadge = await db.execute(sqlBadge`
          SELECT id FROM employees WHERE badge_scan_code IS NULL
        `);
        if (employeesWithoutBadge.rows.length > 0) {
          for (const row of employeesWithoutBadge.rows) {
            await db.execute(sqlBadge`
              UPDATE employees SET badge_scan_code = gen_random_uuid()::text WHERE id = ${(row as any).id}
            `);
          }
          console.log(`✅ Generated badge scan codes for ${employeesWithoutBadge.rows.length} employees`);
        }
      } catch (badgeErr: any) {
        console.warn('⚠️ Badge scan code migration:', badgeErr.message);
      }

      // Fix: Remove "table temp" field from Mold Prep department config (belongs on Layup only)
      try {
        const { sql: sqlRoutingFix } = await import('drizzle-orm');
        const routingResult = await db.execute(sqlRoutingFix`
          SELECT id, department_config FROM part_routings 
          WHERE id = '1673c623-60bd-4787-b2b9-aa4bfe327d06'
        `);
        if (routingResult.rows.length > 0) {
          const row = routingResult.rows[0] as any;
          let deptConfig = typeof row.department_config === 'string' 
            ? JSON.parse(row.department_config) 
            : row.department_config;
          if (deptConfig?.['Mold Prep']?.customDataFields) {
            const originalLen = deptConfig['Mold Prep'].customDataFields.length;
            deptConfig['Mold Prep'].customDataFields = deptConfig['Mold Prep'].customDataFields.filter(
              (f: any) => !f.fieldName?.toLowerCase().includes('temp of the table')
            );
            if (deptConfig['Mold Prep'].customDataFields.length < originalLen) {
              await db.execute(sqlRoutingFix`
                UPDATE part_routings 
                SET department_config = ${JSON.stringify(deptConfig)}::jsonb,
                    updated_at = NOW()
                WHERE id = '1673c623-60bd-4787-b2b9-aa4bfe327d06'
              `);
              console.log('✅ Fixed: Removed table temp field from Mold Prep department config (belongs on Layup only)');
            } else {
              console.log('✅ Mold Prep department config already correct (no table temp field)');
            }
          }
        }
      } catch (routingFixErr: any) {
        console.warn('⚠️ Routing config fix skipped:', routingFixErr.message);
      }

      // Ensure inventory_items has assigned_to_asset column
      try {
        const { sql: sqlAsset } = await import('drizzle-orm');
        await db.execute(sqlAsset`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS assigned_to_asset TEXT`);
        console.log('✅ Ensured inventory_items has assigned_to_asset column');
      } catch (assetErr: any) {
        console.warn('⚠️ assigned_to_asset migration:', assetErr.message);
      }

      // Ensure checklist management tables exist
      try {
        const { sql: sqlCL } = await import('drizzle-orm');
        await db.execute(sqlCL`
          CREATE TABLE IF NOT EXISTS checklist_templates (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            frequency TEXT NOT NULL DEFAULT 'DAILY',
            department TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            enforce_clock_out BOOLEAN NOT NULL DEFAULT true,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlCL`
          CREATE TABLE IF NOT EXISTS checklist_template_items (
            id SERIAL PRIMARY KEY,
            template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'checkbox',
            options JSONB,
            required BOOLEAN NOT NULL DEFAULT false,
            frequency TEXT NOT NULL DEFAULT 'DAILY',
            sort_order INTEGER NOT NULL DEFAULT 0
          )
        `);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_template_items_template_id_idx ON checklist_template_items(template_id)`);
        await db.execute(sqlCL`
          CREATE TABLE IF NOT EXISTS checklist_assignments (
            id SERIAL PRIMARY KEY,
            template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            is_active BOOLEAN NOT NULL DEFAULT true,
            start_date DATE,
            end_date DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(template_id, employee_id)
          )
        `);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_assignments_template_id_idx ON checklist_assignments(template_id)`);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_assignments_employee_id_idx ON checklist_assignments(employee_id)`);
        await db.execute(sqlCL`
          CREATE TABLE IF NOT EXISTS checklist_responses (
            id SERIAL PRIMARY KEY,
            template_id INTEGER NOT NULL REFERENCES checklist_templates(id),
            employee_id INTEGER NOT NULL REFERENCES employees(id),
            period_date DATE NOT NULL,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_responses_template_id_idx ON checklist_responses(template_id)`);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_responses_employee_id_idx ON checklist_responses(employee_id)`);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_responses_period_idx ON checklist_responses(period_date)`);
        await db.execute(sqlCL`
          CREATE TABLE IF NOT EXISTS checklist_response_items (
            id SERIAL PRIMARY KEY,
            response_id INTEGER NOT NULL REFERENCES checklist_responses(id) ON DELETE CASCADE,
            template_item_id INTEGER NOT NULL REFERENCES checklist_template_items(id),
            value TEXT,
            completed BOOLEAN NOT NULL DEFAULT false
          )
        `);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_response_items_response_id_idx ON checklist_response_items(response_id)`);
        await db.execute(sqlCL`CREATE INDEX IF NOT EXISTS checklist_response_items_template_item_id_idx ON checklist_response_items(template_item_id)`);
        console.log('✅ Ensured checklist management tables exist');
      } catch (clErr: any) {
        console.warn('⚠️ Checklist management tables migration:', clErr.message);
      }

      // Ensure production forecast engine tables exist
      try {
        const { sql: sqlFC } = await import('drizzle-orm');
        await db.execute(sqlFC`
          CREATE TABLE IF NOT EXISTS department_forecast_defaults (
            id SERIAL PRIMARY KEY,
            department_name TEXT UNIQUE NOT NULL,
            avg_days REAL NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlFC`
          CREATE TABLE IF NOT EXISTS model_forecast_multiplier (
            id SERIAL PRIMARY KEY,
            model_id TEXT REFERENCES stock_models(id),
            multiplier REAL DEFAULT 1.0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        // Seed default forecast values if table is empty
        const forecastCount = await db.execute(sqlFC`SELECT COUNT(*) as cnt FROM department_forecast_defaults`);
        const cnt = (forecastCount.rows[0] as any)?.cnt;
        if (!cnt || parseInt(cnt) === 0) {
          await db.execute(sqlFC`
            INSERT INTO department_forecast_defaults (department_name, avg_days) VALUES
            ('P1 Production Queue', 1),
            ('Layup/Plugging', 3),
            ('Barcode', 1),
            ('CNC', 2),
            ('Gunsmith', 3),
            ('Finish', 4),
            ('Finish QC', 1),
            ('Shipping QC', 1),
            ('Shipping', 1)
          `);
          console.log('✅ Seeded default department forecast values');
        }
        await db.execute(sqlFC`
          CREATE TABLE IF NOT EXISTS production_forecast_verifications (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL,
            department TEXT NOT NULL,
            week_start_date TIMESTAMP NOT NULL,
            verified_by INTEGER,
            verified_at TIMESTAMP DEFAULT NOW(),
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(order_id, department, week_start_date)
          )
        `);
        console.log('✅ Ensured production forecast engine tables exist');
      } catch (fcErr: any) {
        console.warn('⚠️ Production forecast tables migration:', fcErr.message);
      }

      // Ensure address validation columns exist on customer_addresses and vendors
      try {
        const { sql: sqlAddr } = await import('drizzle-orm');
        await db.execute(sqlAddr`ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS validation_status TEXT`);
        await db.execute(sqlAddr`ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP`);
        await db.execute(sqlAddr`ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS validation_provider TEXT`);
        await db.execute(sqlAddr`ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS dpv_match_code TEXT`);
        await db.execute(sqlAddr`ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS override_reason TEXT`);
        await db.execute(sqlAddr`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS validation_status TEXT`);
        await db.execute(sqlAddr`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP`);
        await db.execute(sqlAddr`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS validation_provider TEXT`);
        await db.execute(sqlAddr`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS dpv_match_code TEXT`);
        await db.execute(sqlAddr`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS override_reason TEXT`);
        console.log('✅ Ensured address validation columns exist');
      } catch (addrErr: any) {
        console.warn('⚠️ Address validation columns migration:', addrErr.message);
      }

      // Seed default health check types and config if not present
      const { seedDefaultHealthCheckTypes, seedDefaultHealthCheckConfig, ensureSmsHealthCheckExists, ensureTrackingPipelineHealthCheckExists } = await import('./utils/healthCheckService');
      await seedDefaultHealthCheckTypes();
      await seedDefaultHealthCheckConfig();
      await ensureSmsHealthCheckExists();
      await ensureTrackingPipelineHealthCheckExists();
    }

    // Set up monthly vendor evaluation reset
    cron.schedule('1 0 1 * *', async () => {
      try {
        console.log('🔄 Running monthly vendor evaluation reset...');
        const { vendors } = await import('./schema');
        
        const result = await db
          .update(vendors)
          .set({
            evaluated: false,
            evaluationDate: null,
            qualityScore: null,
            costScore: null,
            deliveryScore: null,
            responseScore: null,
          })
          .returning();
        
        console.log(`✅ Monthly reset complete. Reset ${result.length} vendors.`);
      } catch (error) {
        console.error('❌ Failed to reset vendor evaluations:', error);
      }
    });
    
    console.log('📅 Monthly vendor evaluation reset scheduled (1st of each month at 12:01 AM)');

    // Set up daily follow-up order reminder check
    cron.schedule('0 9 * * *', async () => {
      try {
        console.log('📧 Running daily follow-up order reminder check...');
        const { sendReminderForOverdueOrders } = await import('./utils/followupOrderReminder.js');
        const result = await sendReminderForOverdueOrders();
        console.log(`✅ Reminder check complete: ${result.sent} sent, ${result.failed || 0} failed`);
      } catch (error) {
        console.error('❌ Failed to send follow-up reminders:', error);
      }
    });
    
    console.log('📧 Daily follow-up order reminders scheduled (every day at 9:00 AM)');

    // Set up ticket stale reminder check (runs daily at 10:00 AM)
    cron.schedule('0 10 * * *', async () => {
      try {
        console.log('🎫 Running daily ticket stale reminder check...');
        const { sendStaleTicketReminders } = await import('./utils/ticketReminder.js');
        const result = await sendStaleTicketReminders();
        console.log(`✅ Ticket reminder check complete: ${result.sent} sent, ${result.skipped} skipped`);
      } catch (error) {
        console.error('❌ Failed to send ticket reminders:', error);
      }
    });
    
    console.log('🎫 Daily ticket stale reminders scheduled (every day at 10:00 AM)');

    // Set up dynamic health checks scheduler (checks every minute if it's time to run)
    // This allows the scheduled time to be changed via the UI without restarting the server
    cron.schedule('* * * * *', async () => {
      try {
        const { runAllEnabledChecks, getHealthCheckConfig } = await import('./utils/healthCheckService');
        
        // Get the configured schedule
        const config = await getHealthCheckConfig();
        if (!config?.isScheduleEnabled) {
          return; // Schedule is disabled, skip silently
        }
        
        // Parse the scheduled time (HH:MM format)
        const scheduledTime = config.scheduledTime || '08:00';
        const [scheduledHour, scheduledMinute] = scheduledTime.split(':').map(Number);
        
        // Get current time
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Only run if current time matches scheduled time (once per day at exact minute)
        if (currentHour === scheduledHour && currentMinute === scheduledMinute) {
          console.log(`🏥 Running scheduled daily health checks at configured time ${scheduledTime}...`);
          
          const results = await runAllEnabledChecks('scheduled');
          const passed = results.filter(r => r.status === 'pass').length;
          const failed = results.filter(r => r.status === 'fail').length;
          const warnings = results.filter(r => r.status === 'warning').length;
          
          console.log(`✅ Health checks complete: ${passed} passed, ${failed} failed, ${warnings} warnings`);
          
          // Log any failures
          results.filter(r => r.status === 'fail').forEach(r => {
            console.error(`  ❌ ${r.checkName}: ${r.message}`);
          });
        }
      } catch (error) {
        // Only log errors if it's a real failure, not just skipped checks
        if (error instanceof Error && !error.message.includes('skip')) {
          console.error('❌ Failed to run scheduled health checks:', error);
        }
      }
    });
    
    console.log('🏥 Daily system health checks scheduler active (runs at configured time from UI)');
  } catch (error) {
    console.error('Error initializing background services:', error);
  }
}
