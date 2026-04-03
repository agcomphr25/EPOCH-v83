import express, { type Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { createServer } from 'http';
import { setupVite, serveStatic, log } from './vite';
import { db, pool } from './db';
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
  '/api/cutting-table/fabric-inventory-by-icn', // ICN lookup for P2 traveler material scanner
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

// ─── Early server bind ────────────────────────────────────────────────────────
// Create the HTTP server and start listening BEFORE registerRoutes runs.
// registerRoutes imports 60+ modules via tsx which takes ~15s to compile in
// production.  Replit's health check fires during that window and would fail
// because no port is bound yet.  By listening first, health checks pass
// immediately while route registration finishes in the background.
const port = parseInt(process.env.PORT || '5000', 10);
const earlyServer = createServer(app);

// In production, register static file serving immediately so GET / returns
// the built HTML (200) rather than 404 while routes are still loading.
if (process.env.NODE_ENV !== 'development') {
  serveStatic(app);
}

earlyServer.listen({ port, host: '0.0.0.0' }, () => {
  console.log(`Server started successfully`);
  console.log(`- Port: ${port}`);
  console.log(`- Host: 0.0.0.0`);
  console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
  log(`serving on port ${port}`);
});

(async () => {
  try {
    // Dynamic import defers tsx compilation of routes/index.ts (137 files, 9300 lines)
    // until AFTER the server is already listening.  Static import would block the entire
    // module from running (including earlyServer.listen) for ~13 seconds while tsx
    // compiles — causing Replit's health-check probe to time out during that window.
    const { registerRoutes } = await import('./src/routes/index');

    // Pass the already-listening server so registerRoutes reuses it instead
    // of creating (and returning) a brand-new one.
    const server = await registerRoutes(app, earlyServer);

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

    // In development, set up Vite HMR on the already-running server.
    // In production, static files were already registered above (early bind).
    if (app.get('env') === 'development') {
      await setupVite(app, server);
    }

    // Initialize database and cron jobs (non-blocking background work)
    initializeBackgroundServices();
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

      // ── Pre-deploy: safe integer→uuid / integer→text type fixes ─────────────
      // These run FIRST before any other boot migration so that subsequent
      // drizzle-kit push operations never see a stale integer column where the
      // schema expects uuid/text (which would generate unsafe SET DATA TYPE SQL).
      // Every migration file is idempotent (DO $$ IF EXISTS guards) — running on
      // an already-correct database is a complete no-op.
      // Each file runs in its own try/catch so a failure in one never blocks later migrations.
      {
        const { Pool: MigrPool } = await import('pg');
        const { readFileSync, existsSync } = await import('fs');
        const { join } = await import('path');
        const migrPool = new MigrPool({ connectionString: process.env.DATABASE_URL! });
        const migrationsDir = join(process.cwd(), 'migrations');
        const safeFiles = [
          '0001_fix_cutting_built_packets_category_uuid.sql',
          '0002_fix_fabric_sources_inventory_id_uuid.sql',
          '0003_comprehensive_integer_to_uuid_audit.sql',
          '0004_job_allocations.sql',
          '0005_backfill_production_orders_item_codes.sql',
          '0006_nonconforming_rmas_and_schema_columns.sql',
          '0007_p2_shipping_audit_log.sql',
          '0008_inventory_item_type_category.sql',
          '0009_schema_change_log.sql',
          '0010_all_orders_unique_order_id.sql',
          '0011_fix_finalized_orders_in_production_departments.sql',
          '0012_bulk_payment_batches.sql',
          '0013_add_composite_manufactured_category.sql',
          '0014_receiving_control_center.sql',
          '0015_receiving_fk_constraints.sql',
          '0016_routing_type_enum.sql',
          '0017_routing_operations_tables.sql',
          '0018_routing_templates.sql',
          '0019_routing_dependencies.sql',
          '0020_anodize_jobs.sql',
          '0021_anodize_cert_inspection.sql',
          '0022_routing_dependency_enhancements.sql',
          '0023_traveler_component_associations.sql',
          '0024_add_assigned_technician_to_production_orders.sql',
        ];
        let appliedCount = 0;
        for (const f of safeFiles) {
          const filePath = join(migrationsDir, f);
          if (!existsSync(filePath)) continue;
          try {
            await migrPool.query(readFileSync(filePath, 'utf-8'));
            appliedCount++;
          } catch (fileErr: any) {
            console.warn(`⚠️ Migration ${f} skipped: ${fileErr.message}`);
          }
        }
        try { await migrPool.end(); } catch (_) {}
        console.log(`✅ Pre-deploy migrations: ${appliedCount}/${safeFiles.length} applied (or already correct)`);
      }

      // One-time migration: Reassign Red Hawk Rifles LLC POs from inactive customer 698 to active customer 547
      try {
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`UPDATE purchase_orders SET customer_id = '547' WHERE customer_id = '698'`);
        console.log('✅ One-time migration: Red Hawk Rifles LLC POs reassigned from customer 698 → 547');
      } catch (migError: any) {
        console.warn('⚠️ One-time migration skipped or already applied:', migError.message);
      }

      // Fix: Orders in Shipping Management should always be FULFILLED, not FINALIZED
      try {
        const { pool: fixPool } = await import('./db');
        const { auditUpdateOrders } = await import('./src/services/orderAuditWrapper');
        const eligibleRows = await fixPool.query(
          `SELECT order_id FROM all_orders
           WHERE current_department = 'Shipping Management' AND status = 'FINALIZED'`
        ) as any[];
        const eligibleIds = eligibleRows.map((r: any) => r.order_id);
        if (eligibleIds.length > 0) {
          await auditUpdateOrders({
            db: fixPool as any,
            orderIds: eligibleIds,
            changes: { status: 'FULFILLED' },
            source: 'BOOT_MIGRATION',
            user: null,
            reason: 'Boot migration: Shipping Management FINALIZED → FULFILLED',
            ip: null,
            userAgent: null,
          });
        }
        console.log(`✅ Fixed Shipping Management status: ${eligibleIds.length} orders updated from FINALIZED → FULFILLED`);
      } catch (fixErr: any) {
        console.warn('⚠️ Shipping Management status fix skipped:', fixErr.message);
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

      // Data correction: PO 037517 item 225 (Grace Engineering) — fix cf_privateer → cf_beartooth
      // The specifications snapshot was frozen with the wrong stock model at creation time.
      // This correction updates stockModelId, stockModelName, and specifications.stockModel atomically.
      // Also corrects any production_orders spawned from item 225 that have the same bad snapshot.
      try {
        const { pgPool: corrPgPool } = await import('./db');
        const checkResult = await corrPgPool.query(
          `SELECT id FROM purchase_order_items WHERE id = 225 AND stock_model_id = 'cf_privateer'`
        );
        if (checkResult.rows.length > 0) {
          await corrPgPool.query(`
            UPDATE purchase_order_items
            SET stock_model_id   = 'cf_beartooth',
                stock_model_name = 'Carbon Fiber Beartooth',
                specifications   = jsonb_set(
                  specifications::jsonb,
                  '{stockModel}',
                  '"cf_beartooth"'
                ),
                updated_at = NOW()
            WHERE id = 225 AND stock_model_id = 'cf_privateer'
          `);
          console.log('✅ Data correction: PO item 225 stock model corrected cf_privateer → cf_beartooth');
        } else {
          console.log('✅ Data correction: PO item 225 already correct or not found, skipping');
        }
        // Also fix production_orders that were spawned from PO item 225 with the bad snapshot
        const prodCheckResult = await corrPgPool.query(
          `SELECT id FROM production_orders WHERE po_item_id = 225 AND specifications->>'stockModel' = 'cf_privateer'`
        );
        if (prodCheckResult.rows.length > 0) {
          await corrPgPool.query(`
            UPDATE production_orders
            SET specifications = jsonb_set(
                  specifications::jsonb,
                  '{stockModel}',
                  '"cf_beartooth"'
                ),
                updated_at = NOW()
            WHERE po_item_id = 225 AND specifications->>'stockModel' = 'cf_privateer'
          `);
          console.log(`✅ Data correction: ${prodCheckResult.rows.length} production_orders for PO item 225 corrected cf_privateer → cf_beartooth`);
        }
      } catch (corrErr: any) {
        console.warn('⚠️ PO item 225 data correction skipped:', corrErr.message);
      }

      // Data correction: PO P18665 item 82 — fix duplicate AG-FG-ADJ-AHV105-CDN → AG-FG-AHV105-CDN
      // Item 82 was entered as AG-FG-ADJ-AHV105-CDN (same as item 78) but should be
      // AG-FG-AHV105-CDN (non-adjustable, fg_alpine_hunter, $489). Three-part fix:
      //   1. Correct item_name / item_id on purchase_order_items row (if not yet done)
      //   2. Correct item_name on any production_orders still carrying the old ADJ name
      //   3. Reactivate the newest cancelled order if no active/pending order exists
      try {
        const { pgPool: p18665Pool } = await import('./db');

        // Part 1 – fix item_name if still wrong
        const p18665NameCheck = await p18665Pool.query(
          `SELECT id FROM purchase_order_items WHERE id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'`
        );
        if (p18665NameCheck.rows.length > 0) {
          await p18665Pool.query(`
            UPDATE purchase_order_items
            SET item_name   = 'AG-FG-AHV105-CDN',
                item_id     = '36',
                unit_price  = 489.00,
                total_price = 489.00,
                updated_at  = NOW()
            WHERE id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
          `);
          console.log('✅ Data correction: PO P18665 item 82 item_name corrected ADJ-AHV105-CDN → AHV105-CDN');
        }

        // Part 2 – fix item_id if it was only partially corrected (name fixed but id still 72)
        const p18665IdCheck = await p18665Pool.query(
          `SELECT id FROM purchase_order_items WHERE id = 82 AND item_id = '72' AND item_name = 'AG-FG-AHV105-CDN'`
        );
        if (p18665IdCheck.rows.length > 0) {
          await p18665Pool.query(`
            UPDATE purchase_order_items
            SET item_id = '36', updated_at = NOW()
            WHERE id = 82 AND item_id = '72'
          `);
          console.log('✅ Data correction: PO P18665 item 82 item_id corrected 72 → 36');
        }

        // Part 3 – fix production_orders still carrying the ADJ item name for po_item_id=82
        const p18665ProdCheck = await p18665Pool.query(
          `SELECT id FROM production_orders WHERE po_item_id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'`
        );
        if (p18665ProdCheck.rows.length > 0) {
          await p18665Pool.query(`
            UPDATE production_orders
            SET item_name  = 'AG-FG-AHV105-CDN',
                item_id    = '36',
                item_code  = 'AG-FG-AHV105-CDN',
                specifications = specifications || '{"stockModel": "fg_alpine_hunter"}'::jsonb,
                updated_at = NOW()
            WHERE po_item_id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
          `);
          console.log(`✅ Data correction: ${p18665ProdCheck.rows.length} production_order(s) for PO item 82 renamed ADJ-AHV105-CDN → AHV105-CDN`);
        }

        // Part 4 – if every production order for item 82 is CANCELLED, reactivate the newest one
        const p18665ActiveCheck = await p18665Pool.query(`
          SELECT COUNT(*) AS cnt
          FROM production_orders
          WHERE po_item_id = 82 AND production_status NOT IN ('CANCELLED', 'SHIPPED')
        `);
        const activeCnt = parseInt(p18665ActiveCheck.rows[0]?.cnt ?? '0', 10);
        if (activeCnt === 0) {
          const newestCancelled = await p18665Pool.query(`
            SELECT id, order_id FROM production_orders
            WHERE po_item_id = 82 AND production_status = 'CANCELLED'
            ORDER BY id DESC LIMIT 1
          `);
          if (newestCancelled.rows.length > 0) {
            const { id: ncId, order_id: ncOrderId } = newestCancelled.rows[0];
            await p18665Pool.query(`
              UPDATE production_orders
              SET production_status = 'PENDING',
                  item_name  = 'AG-FG-AHV105-CDN',
                  item_id    = '36',
                  item_code  = 'AG-FG-AHV105-CDN',
                  specifications = specifications || '{"stockModel": "fg_alpine_hunter"}'::jsonb,
                  updated_at = NOW()
              WHERE id = ${ncId}
            `);
            console.log(`✅ Data correction: Reactivated production order ${ncOrderId} (id ${ncId}) for PO P18665 item 82 — set to PENDING`);
          }
        } else {
          console.log(`✅ Data correction: PO P18665 item 82 already has ${activeCnt} active/pending production order(s), no reactivation needed`);
        }
      } catch (corrErr: any) {
        console.warn('⚠️ PO P18665 item 82 data correction skipped:', corrErr.message);
      }

      // Data correction: PO P19802 (Red Hawk) — remove 14 duplicate line items created by
      // multi-click on "Add to Order". User entered 7 items but they were submitted 3 times
      // resulting in 21 rows. Keep the first instance of each unique item_name (IDs 273-278, 284)
      // and delete the 14 extras (IDs 279-293 except 284).
      try {
        const { pgPool: p19802Pool } = await import('./db');
        const dupeCheck = await p19802Pool.query(
          `SELECT COUNT(*) AS cnt FROM purchase_order_items WHERE id IN (279,280,281,282,283,285,286,287,288,289,290,291,292,293)`
        );
        const dupeCount = parseInt(dupeCheck.rows[0]?.cnt ?? '0', 10);
        if (dupeCount > 0) {
          await p19802Pool.query(
            `DELETE FROM purchase_order_items WHERE id IN (279,280,281,282,283,285,286,287,288,289,290,291,292,293)`
          );
          console.log(`✅ Data correction: Removed ${dupeCount} duplicate line items from PO P19802 (Red Hawk)`);
        } else {
          console.log('✅ Data correction: PO P19802 duplicates already cleaned up, skipping');
        }
      } catch (corrErr: any) {
        console.warn('⚠️ PO P19802 duplicate cleanup skipped:', corrErr.message);
      }

      // Data correction (global): production orders where item_name = item_id (e.g. "81", "Alpine Hunter")
      // instead of the real SKU from purchase_order_items. Affects 15 POs (P18321, P18666, P18918, etc.)
      // created before the order-creation bug was fixed. Uses po_item_id FK to find the correct name.
      // Idempotent: only runs when affected rows exist. Also corrects item_id for display-name cases.
      try {
        const { pgPool: itemNamePool } = await import('./db');
        const itemNameCheck = await itemNamePool.query(
          `SELECT COUNT(*) AS cnt
           FROM production_orders po
           JOIN purchase_order_items poi ON po.po_item_id = poi.id
           WHERE po.item_name = po.item_id
             AND poi.item_name LIKE 'AG-%'`
        );
        const itemNameBadCount = parseInt(itemNameCheck.rows[0]?.cnt ?? '0', 10);
        if (itemNameBadCount > 0) {
          const itemNameFix = await itemNamePool.query(
            `UPDATE production_orders po
             SET item_name = poi.item_name,
                 item_id   = poi.item_id
             FROM purchase_order_items poi
             WHERE po.po_item_id = poi.id
               AND po.item_name = po.item_id
               AND poi.item_name LIKE 'AG-%'`
          );
          console.log(`✅ Data correction: Fixed ${itemNameFix.rowCount} production order(s) across all POs — replaced stub item names with correct SKUs`);
        } else {
          console.log('✅ Data correction: All production order item names already correct, skipping');
        }
      } catch (corrErr: any) {
        console.warn('⚠️ Global production order item name correction skipped:', corrErr.message);
      }

      // Data correction: fix production orders where item_id, item_name, or specifications
      // don't match the linked purchase_order_items row (via po_item_id). Excludes SHIPPED orders.
      // Also cancels excess duplicate production orders for PO lines that have more active orders
      // than the line's quantity (keeping the earliest-created one per PO line, excluding SHIPPED).
      // Idempotent: checks before updating.
      try {
        const { pgPool: mismatchPool } = await import('./db');

        // Step 1: fix item_id / item_name / specifications mismatches
        const mismatchCheck = await mismatchPool.query(
          `SELECT COUNT(*) AS cnt
           FROM production_orders po
           JOIN purchase_order_items poi ON po.po_item_id = poi.id
           WHERE po.production_status != 'SHIPPED'
             AND (
               po.item_id       IS DISTINCT FROM poi.item_id
               OR po.item_name  IS DISTINCT FROM poi.item_name
               OR po.specifications IS DISTINCT FROM poi.specifications::jsonb
             )`
        );
        const mismatchCount = parseInt(mismatchCheck.rows[0]?.cnt ?? '0', 10);
        if (mismatchCount > 0) {
          const mismatchFix = await mismatchPool.query(
            `UPDATE production_orders po
             SET item_id        = poi.item_id,
                 item_name      = poi.item_name,
                 specifications = poi.specifications::jsonb,
                 updated_at     = NOW()
             FROM purchase_order_items poi
             WHERE po.po_item_id = poi.id
               AND po.production_status != 'SHIPPED'
               AND (
                 po.item_id       IS DISTINCT FROM poi.item_id
                 OR po.item_name  IS DISTINCT FROM poi.item_name
                 OR po.specifications IS DISTINCT FROM poi.specifications::jsonb
               )`
          );
          console.log(`✅ Data correction: Fixed ${mismatchFix.rowCount} production order(s) with mismatched item_id/item_name/specifications`);
        } else {
          console.log('✅ Data correction: All production order item data matches PO lines, skipping');
        }

        // Step 2: cancel excess duplicate production orders where a PO line has more active
        // orders than its quantity (keep the earliest-created one, cancel the rest)
        const excessResult = await mismatchPool.query(
          `WITH ranked AS (
             SELECT po.id,
                    ROW_NUMBER() OVER (
                      PARTITION BY po.po_item_id
                      ORDER BY po.created_at ASC
                    ) AS rn,
                    poi.quantity
             FROM production_orders po
             JOIN purchase_order_items poi ON po.po_item_id = poi.id
             WHERE po.production_status != 'SHIPPED'
               AND po.production_status != 'CANCELLED'
           ),
           excess AS (
             SELECT id FROM ranked WHERE rn > quantity
           )
           UPDATE production_orders
           SET production_status = 'CANCELLED',
               updated_at        = NOW()
           WHERE id IN (SELECT id FROM excess)`
        );
        if (excessResult.rowCount && excessResult.rowCount > 0) {
          console.log(`✅ Data correction: Cancelled ${excessResult.rowCount} excess duplicate production order(s)`);
        } else {
          console.log('✅ Data correction: No excess duplicate production orders found');
        }
      } catch (mismatchErr: any) {
        console.warn('⚠️ Production order mismatch correction skipped:', mismatchErr.message);
      }

      // Auto-close OPEN POs where every non-cancelled production order is SHIPPED
      // Fixes POs like SWS2501/SWS2502 that show "6/6 Shipped" but remain in Active tab
      try {
        const { pgPool: autoClosePool } = await import('./db');
        const autoCloseResult = await autoClosePool.query(`
          UPDATE purchase_orders po
          SET status = 'CLOSED'
          WHERE po.status = 'OPEN'
            AND EXISTS (
              SELECT 1 FROM production_orders pr WHERE pr.po_id = po.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM production_orders pr
              WHERE pr.po_id = po.id
                AND pr.production_status <> 'SHIPPED'
                AND pr.production_status <> 'CANCELLED'
            )
        `);
        if (autoCloseResult.rowCount && autoCloseResult.rowCount > 0) {
          console.log(`✅ Auto-closed ${autoCloseResult.rowCount} OPEN PO(s) where all production orders are SHIPPED`);
        } else {
          console.log('✅ Auto-close POs: no newly eligible POs found');
        }
      } catch (acErr: any) {
        console.warn('⚠️ Auto-close fully-shipped POs migration skipped:', acErr.message);
      }

      // Sync serialized items stuck at "Pending Layup" with their actual work task progress
      try {
        const { sql: sqlDeptSync } = await import('drizzle-orm');
        const syncResult = await db.execute(sqlDeptSync`
          UPDATE p2_serialized_items si
          SET current_department = latest.department,
              updated_at = NOW()
          FROM (
            SELECT wt.serialized_item_id, 
                   wt.department,
                   wt.completed_at,
                   wt.status as task_status
            FROM p2_work_tasks wt
            WHERE wt.started_at IS NOT NULL
              AND wt.status IN ('IN_PROGRESS', 'COMPLETED')
              AND wt.id = (
              SELECT wt2.id FROM p2_work_tasks wt2
              WHERE wt2.serialized_item_id = wt.serialized_item_id
                AND wt2.started_at IS NOT NULL
                AND wt2.status IN ('IN_PROGRESS', 'COMPLETED')
              ORDER BY wt2.started_at DESC NULLS LAST
              LIMIT 1
            )
          ) latest
          WHERE si.id = latest.serialized_item_id
            AND (si.current_department = 'Pending Layup' OR si.current_department IS NULL OR si.current_department = '')
            AND latest.department IS NOT NULL
            AND latest.department != 'Pending Layup'
        `);
        console.log('✅ Synced stuck "Pending Layup" items with actual work task progress');
      } catch (deptSyncErr: any) {
        console.warn('⚠️ Department sync skipped:', deptSyncErr.message);
      }

      // Also mark items as COMPLETED if all their routing steps have completed work tasks
      try {
        const { sql: sqlComplete } = await import('drizzle-orm');
        await db.execute(sqlComplete`
          UPDATE p2_serialized_items si
          SET status = 'COMPLETED',
              current_department = 'COMPLETED',
              completed_at = latest_completed.completed_at,
              updated_at = NOW()
          FROM (
            SELECT wt.serialized_item_id,
                   MAX(wt.completed_at) as completed_at
            FROM p2_work_tasks wt
            WHERE wt.status = 'COMPLETED'
              AND wt.department IN ('Final QC', 'Quality Control')
            GROUP BY wt.serialized_item_id
          ) latest_completed
          WHERE si.id = latest_completed.serialized_item_id
            AND si.status != 'COMPLETED'
            AND NOT EXISTS (
              SELECT 1 FROM p2_work_tasks wt3
              WHERE wt3.serialized_item_id = si.id
                AND wt3.status != 'COMPLETED'
            )
        `);
        console.log('✅ Marked fully-completed travelers as COMPLETED');
      } catch (completeErr: any) {
        console.warn('⚠️ Completion sync skipped:', completeErr.message);
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

      // Ensure traveler_authorized_notes table exists
      try {
        const { sql: sqlAuthNotes } = await import('drizzle-orm');
        await db.execute(sqlAuthNotes`
          CREATE TABLE IF NOT EXISTS traveler_authorized_notes (
            id VARCHAR(255) PRIMARY KEY DEFAULT (gen_random_uuid())::character varying,
            traveler_id VARCHAR(255) NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
            department VARCHAR(255) NOT NULL,
            note TEXT NOT NULL,
            linked_purchase_order_id VARCHAR(255),
            linked_document_urls JSONB DEFAULT '[]'::jsonb,
            tolerance_change_authorized BOOLEAN DEFAULT false,
            signed_by VARCHAR(255) NOT NULL,
            signed_by_name VARCHAR(255) NOT NULL,
            signature_role VARCHAR(50),
            signature_data TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
          )
        `);
        await db.execute(sqlAuthNotes`CREATE INDEX IF NOT EXISTS traveler_authorized_notes_traveler_id_idx ON traveler_authorized_notes(traveler_id)`);
        await db.execute(sqlAuthNotes`CREATE INDEX IF NOT EXISTS traveler_authorized_notes_department_idx ON traveler_authorized_notes(department)`);
        console.log('✅ Ensured traveler_authorized_notes table exists');
      } catch (authNotesErr: any) {
        console.warn('⚠️ Traveler authorized notes migration skipped:', authNotesErr.message);
      }

      // Ensure shipment_records and shipment_items have required columns for label/packing slip storage
      try {
        const { sql: sqlShip } = await import('drizzle-orm');
        await db.execute(sqlShip`ALTER TABLE shipment_records ADD COLUMN IF NOT EXISTS shipping_label_base64 TEXT`);
        await db.execute(sqlShip`ALTER TABLE shipment_items ADD COLUMN IF NOT EXISTS description TEXT`);
        await db.execute(sqlShip`ALTER TABLE shipment_items ADD COLUMN IF NOT EXISTS po_number TEXT`);
        await db.execute(sqlShip`ALTER TABLE shipment_items ADD COLUMN IF NOT EXISTS packing_slip_base64 TEXT`);
        console.log('✅ Ensured shipment_records.shipping_label_base64 and shipment_items packing slip columns exist');
      } catch (shipErr: any) {
        console.warn('⚠️ Shipment label/packing slip migration skipped:', shipErr.message);
      }

      // Ensure cutting table packet BOM tables exist (needed for scan-start endpoint)
      try {
        const { sql: sqlCut } = await import('drizzle-orm');
        await db.execute(sqlCut`
          CREATE TABLE IF NOT EXISTS cutting_production_lines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            line_name TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
          )
        `);
        await db.execute(sqlCut`
          CREATE TABLE IF NOT EXISTS cutting_product_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            production_line_id UUID REFERENCES cutting_production_lines(id),
            category_name TEXT NOT NULL,
            display_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
          )
        `);
        await db.execute(sqlCut`
          CREATE TABLE IF NOT EXISTS cutting_packet_boms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            packet_type TEXT NOT NULL,
            part_number TEXT NOT NULL,
            description TEXT,
            cuts_config JSONB,
            cut_programs_config JSONB,
            no_ply_schedule BOOLEAN DEFAULT false,
            ply_schedule_config JSONB,
            product_category_id UUID REFERENCES cutting_product_categories(id),
            inventory_item_id INTEGER REFERENCES inventory_items(id),
            square_meters_per_cut REAL NOT NULL DEFAULT 0,
            yield_per_cut INTEGER NOT NULL DEFAULT 4,
            waste_factor REAL NOT NULL DEFAULT 0.05,
            is_p2 BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
          )
        `);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_boms_part_number_idx ON cutting_packet_boms(part_number)`);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_boms_packet_type_idx ON cutting_packet_boms(packet_type)`);
        await db.execute(sqlCut`
          CREATE TABLE IF NOT EXISTS cutting_packet_bom_materials (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            packet_bom_id UUID NOT NULL REFERENCES cutting_packet_boms(id) ON DELETE CASCADE,
            fabric_type TEXT NOT NULL,
            common_name TEXT,
            quantity_needed INTEGER NOT NULL DEFAULT 1,
            rolls_required INTEGER NOT NULL DEFAULT 1,
            square_meters_required REAL,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
          )
        `);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_bom_materials_bom_idx ON cutting_packet_bom_materials(packet_bom_id)`);
        await db.execute(sqlCut`
          CREATE TABLE IF NOT EXISTS cutting_packet_bom_parts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            packet_bom_id UUID NOT NULL REFERENCES cutting_packet_boms(id) ON DELETE CASCADE,
            inventory_item_id INTEGER REFERENCES inventory_items(id),
            part_number TEXT NOT NULL,
            part_description TEXT,
            fabric_type TEXT NOT NULL,
            common_name TEXT,
            quantity_needed INTEGER NOT NULL DEFAULT 1,
            cut_program_name TEXT,
            square_meters_per_cut REAL,
            yield_per_cut INTEGER NOT NULL DEFAULT 1,
            square_meters_per_part REAL,
            sort_order INTEGER DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
          )
        `);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_bom_parts_bom_idx ON cutting_packet_bom_parts(packet_bom_id)`);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_bom_parts_part_number_idx ON cutting_packet_bom_parts(part_number)`);
        await db.execute(sqlCut`
          CREATE TABLE IF NOT EXISTS cutting_packet_bom_cuts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            packet_bom_id UUID NOT NULL REFERENCES cutting_packet_boms(id) ON DELETE CASCADE,
            fabric_inventory_id UUID REFERENCES cutting_fabric_inventory(id),
            mfg_queue_item_id INTEGER,
            cut_date TIMESTAMP NOT NULL DEFAULT now(),
            square_meters_used REAL NOT NULL,
            pieces_yielded INTEGER NOT NULL,
            roll_number TEXT,
            lot_number TEXT,
            operator_name TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT now()
          )
        `);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_bom_cuts_bom_idx ON cutting_packet_bom_cuts(packet_bom_id)`);
        await db.execute(sqlCut`CREATE INDEX IF NOT EXISTS cutting_packet_bom_cuts_date_idx ON cutting_packet_bom_cuts(cut_date)`);
        console.log('✅ Ensured cutting packet BOM tables exist');
      } catch (cutBomErr: any) {
        console.warn('⚠️ Cutting packet BOM tables migration skipped:', cutBomErr.message);
      }

      // Ensure cutting packet traceability tables exist and cutting_built_packets has all columns
      try {
        const { sql: sqlCpT } = await import('drizzle-orm');

        // Create cutting_packet_sessions if it doesn't exist (FK parent for cutting_built_packets.session_id)
        await db.execute(sqlCpT`
          CREATE TABLE IF NOT EXISTS cutting_packet_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            product_category_id UUID REFERENCES cutting_product_categories(id),
            week_date DATE,
            work_date DATE,
            packets_target INTEGER NOT NULL DEFAULT 1,
            created_by TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // Create cutting_packet_session_lots if it doesn't exist
        await db.execute(sqlCpT`
          CREATE TABLE IF NOT EXISTS cutting_packet_session_lots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES cutting_packet_sessions(id) ON DELETE CASCADE,
            component_id UUID REFERENCES cutting_components(id),
            fabric_inventory_id UUID REFERENCES cutting_fabric_inventory(id),
            cuts_planned INTEGER NOT NULL DEFAULT 0,
            quantity_used INTEGER NOT NULL DEFAULT 0,
            waste_factor_applied REAL DEFAULT 0.05,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // Check if cutting_built_packets exists with wrong column types (UUID instead of SERIAL)
        // Only recreate if table is empty to avoid data loss
        const bpColCheck = await db.execute(sqlCpT`
          SELECT data_type FROM information_schema.columns
          WHERE table_name = 'cutting_built_packets' AND column_name = 'id'
        `);
        const bpIdType = (bpColCheck as any)?.rows?.[0]?.data_type;
        if (bpIdType && bpIdType !== 'integer') {
          const bpCount = await db.execute(sqlCpT`SELECT COUNT(*)::int AS cnt FROM cutting_built_packets`);
          const rowCount = (bpCount as any)?.rows?.[0]?.cnt || 0;
          if (rowCount === 0) {
            // Run through migration guard before executing DROP TABLE
            const dropSql = [
              'DROP TABLE IF EXISTS cutting_built_packet_fabric_sources CASCADE',
              'DROP TABLE IF EXISTS cutting_built_packets CASCADE',
            ].join(';\n');
            const { executeSchemaMutation } = await import('./governance/executeMutation');
            const { pgPool: pgPoolForGuard } = await import('./db');
            // DROP cutting_built_packet_fabric_sources via centralized governance wrapper
            const r1 = await executeSchemaMutation(
              pgPoolForGuard,
              'DROP TABLE IF EXISTS cutting_built_packet_fabric_sources CASCADE',
              async () => { await db.execute(sqlCpT`DROP TABLE IF EXISTS cutting_built_packet_fabric_sources CASCADE`); },
              { tableName: 'cutting_built_packet_fabric_sources', actionType: 'DROP_TABLE' },
              { actor: 'boot-migration', overrideReason: `Table had wrong id type (${bpIdType}) and was empty — recreated with SERIAL` }
            );
            if (!r1.executed && r1.blocked) {
              console.warn(`⚠️ Governance guard blocked DROP TABLE on cutting_built_packet_fabric_sources: ${r1.reason}`);
            } else if (r1.executed) {
              console.log(`⚠️ cutting_built_packets.id is '${bpIdType}' (empty table) — recreating with SERIAL (governance guard: allowed)`);
            }
            // DROP cutting_built_packets via centralized governance wrapper
            const r2 = await executeSchemaMutation(
              pgPoolForGuard,
              'DROP TABLE IF EXISTS cutting_built_packets CASCADE',
              async () => { await db.execute(sqlCpT`DROP TABLE IF EXISTS cutting_built_packets CASCADE`); },
              { tableName: 'cutting_built_packets', actionType: 'DROP_TABLE' },
              { actor: 'boot-migration', overrideReason: `Table had wrong id type (${bpIdType}) and was empty — recreated with SERIAL` }
            );
            if (!r2.executed && r2.blocked) {
              console.warn(`⚠️ Governance guard blocked DROP TABLE on cutting_built_packets: ${r2.reason}`);
            }
          } else {
            console.warn(`⚠️ cutting_built_packets.id is '${bpIdType}' with ${rowCount} rows — governance guard: skipping destructive migration (manual fix required)`);
          }
        }

        // Create cutting_built_packets if it doesn't exist
        await db.execute(sqlCpT`
          CREATE TABLE IF NOT EXISTS cutting_built_packets (
            id SERIAL PRIMARY KEY,
            session_id UUID,
            product_category_id UUID NOT NULL REFERENCES cutting_product_categories(id),
            barcode TEXT NOT NULL UNIQUE,
            packet_number INTEGER NOT NULL,
            build_date TIMESTAMP NOT NULL DEFAULT NOW(),
            status TEXT NOT NULL DEFAULT 'AVAILABLE',
            allocated_to_order TEXT,
            consumed_at TIMESTAMP,
            consumed_by TEXT,
            is_mixed_fabric BOOLEAN DEFAULT FALSE,
            fabric_source_count INTEGER DEFAULT 1,
            notes TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // Add missing columns to cutting_built_packets (for tables created before these columns existed)
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS session_id UUID`);
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS is_mixed_fabric BOOLEAN DEFAULT FALSE`);
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS fabric_source_count INTEGER DEFAULT 1`);
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS allocated_to_order TEXT`);
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP`);
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS consumed_by TEXT`);
        await db.execute(sqlCpT`ALTER TABLE cutting_built_packets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

        // Fix product_category_id type: early table creation used integer, but cutting_product_categories.id is uuid
        try {
          await db.execute(sqlCpT`
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'cutting_built_packets'
                  AND column_name = 'product_category_id'
                  AND data_type = 'integer'
              ) THEN
                -- Delete any rows with non-castable integer values before type conversion
                DELETE FROM cutting_built_packet_fabric_sources
                  WHERE built_packet_id IN (
                    SELECT id FROM cutting_built_packets WHERE product_category_id IS NOT NULL
                  );
                DELETE FROM cutting_built_packets WHERE product_category_id IS NOT NULL;
                -- Now safe to convert the empty/null column
                ALTER TABLE cutting_built_packets
                  ALTER COLUMN product_category_id TYPE uuid USING NULL;
              END IF;
            END $$
          `);
        } catch (colFixErr: any) {
          console.warn('⚠️ cutting_built_packets.product_category_id type fix skipped:', colFixErr.message);
        }

        // Create cutting_built_packet_fabric_sources if it doesn't exist
        await db.execute(sqlCpT`
          CREATE TABLE IF NOT EXISTS cutting_built_packet_fabric_sources (
            id SERIAL PRIMARY KEY,
            built_packet_id INTEGER NOT NULL REFERENCES cutting_built_packets(id) ON DELETE CASCADE,
            fabric_inventory_id UUID REFERENCES cutting_fabric_inventory(id),
            component_id UUID,
            fabric_type TEXT,
            lot_number TEXT,
            batch_number TEXT,
            roll_number TEXT,
            supplier_part_number TEXT,
            internal_control_number TEXT,
            expiration_date DATE,
            quantity_used INTEGER NOT NULL DEFAULT 1,
            is_primary BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlCpT`CREATE INDEX IF NOT EXISTS cutting_built_packet_sources_packet_idx ON cutting_built_packet_fabric_sources(built_packet_id)`);
        await db.execute(sqlCpT`CREATE INDEX IF NOT EXISTS cutting_built_packet_sources_inventory_idx ON cutting_built_packet_fabric_sources(fabric_inventory_id)`);

        // Safe migration: fabric_inventory_id integer → uuid (4-step, no data loss)
        // If column is already uuid this block is a no-op (guarded by IF EXISTS check in SQL and pre-check below).
        // Backfill path: old integer FK matched cutting_fabric_inventory.inventory_item_id → maps to cutting_fabric_inventory.id (uuid).
        // Any rows whose integer value has no matching inventory_item_id get fabric_inventory_id = NULL (the reference was already broken).
        // Governance guard runs first — DROP COLUMN is only executed if table is empty OR guard explicitly allows it.
        try {
          // Pre-check: does the column still need migration?
          const fabColCheck = await db.execute(sqlCpT`
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'cutting_built_packet_fabric_sources'
              AND column_name = 'fabric_inventory_id'
              AND data_type = 'integer'
          `);
          const needsMigration = (fabColCheck as any)?.rows?.length > 0;
          if (needsMigration) {
            // Route DROP COLUMN through centralized governance wrapper
            const { executeSchemaMutation: execFabMutation } = await import('./governance/executeMutation');
            const { pgPool: pgPoolFab } = await import('./db');
            const fabDropSql = 'ALTER TABLE cutting_built_packet_fabric_sources DROP COLUMN fabric_inventory_id';
            const fabResult = await execFabMutation(
              pgPoolFab,
              fabDropSql,
              async () => {
                // Full 4-step type rename: backfill uuid, drop integer, rename
                await db.execute(sqlCpT`
                  DO $$
                  BEGIN
                    IF EXISTS (
                      SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'cutting_built_packet_fabric_sources'
                        AND column_name = 'fabric_inventory_id'
                        AND data_type = 'integer'
                    ) THEN
                      -- Step 1: add temporary uuid column alongside the existing integer column
                      ALTER TABLE cutting_built_packet_fabric_sources
                        ADD COLUMN IF NOT EXISTS fabric_inventory_uuid uuid;

                      -- Step 2: backfill — map old integer FK to uuid via cutting_fabric_inventory.inventory_item_id
                      UPDATE cutting_built_packet_fabric_sources cbpfs
                      SET fabric_inventory_uuid = fi.id
                      FROM cutting_fabric_inventory fi
                      WHERE fi.inventory_item_id = cbpfs.fabric_inventory_id
                        AND cbpfs.fabric_inventory_id IS NOT NULL;

                      -- Step 3: drop any FK constraint on the old integer column
                      DO $inner$
                      BEGIN
                        ALTER TABLE cutting_built_packet_fabric_sources
                          DROP CONSTRAINT IF EXISTS cutting_built_packet_fabric_sources_fabric_inventory_id_fkey;
                      EXCEPTION WHEN OTHERS THEN NULL;
                      END $inner$;

                      -- Drop the old integer index
                      DROP INDEX IF EXISTS cutting_built_packet_sources_inventory_idx;

                      -- Step 4: drop old integer column and promote the uuid column
                      ALTER TABLE cutting_built_packet_fabric_sources
                        DROP COLUMN fabric_inventory_id;

                      ALTER TABLE cutting_built_packet_fabric_sources
                        RENAME COLUMN fabric_inventory_uuid TO fabric_inventory_id;

                      -- Re-add FK constraint
                      ALTER TABLE cutting_built_packet_fabric_sources
                        ADD CONSTRAINT cutting_built_packet_fabric_sources_fabric_inventory_id_fkey
                        FOREIGN KEY (fabric_inventory_id)
                        REFERENCES cutting_fabric_inventory(id);

                      -- Recreate the index
                      CREATE INDEX IF NOT EXISTS cutting_built_packet_sources_inventory_idx
                        ON cutting_built_packet_fabric_sources(fabric_inventory_id);
                    END IF;
                  END $$
                `);
              },
              { tableName: 'cutting_built_packet_fabric_sources', columnName: 'fabric_inventory_id', actionType: 'DROP_COLUMN' },
              { actor: 'boot-migration', overrideReason: 'Type rename migration: integer→uuid column (data backfilled, governance guard allowed)' }
            );
            if (!fabResult.executed && fabResult.blocked) {
              console.warn(`⚠️ Governance guard blocked fabric_inventory_id DROP COLUMN (non-empty table): ${fabResult.reason}. Manual override required.`);
            }
          }
        } catch (fabFixErr: any) {
          console.warn('⚠️ fabric_sources.fabric_inventory_id type fix skipped:', fabFixErr.message);
        }

        try {
          await db.execute(sqlCpT`ALTER TABLE cutting_built_packet_fabric_sources ADD COLUMN IF NOT EXISTS component_id UUID`);
          await db.execute(sqlCpT`ALTER TABLE cutting_built_packet_fabric_sources ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
        } catch (colAddErr: any) {
          console.warn('⚠️ fabric_sources column additions skipped:', colAddErr.message);
        }

        console.log('✅ Ensured cutting packet traceability tables exist (sessions, built_packets columns, fabric_sources)');
      } catch (cpTErr: any) {
        console.warn('⚠️ Cutting packet traceability migration skipped:', cpTErr.message);
      }

      // Ensure p2_shipping_audit_log table exists (CMMC/DCAA compliant shipping override history)
      try {
        const { sql: sqlP2Audit } = await import('drizzle-orm');
        await db.execute(sqlP2Audit`
          CREATE TABLE IF NOT EXISTS p2_shipping_audit_log (
            id          SERIAL PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id   TEXT NOT NULL,
            field_name  TEXT NOT NULL,
            old_value   TEXT,
            new_value   TEXT,
            changed_by  TEXT NOT NULL,
            changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            reason      TEXT NOT NULL
          )
        `);
        console.log('✅ Ensured p2_shipping_audit_log table exists');
      } catch (p2AuditErr: any) {
        console.warn('⚠️ p2_shipping_audit_log table migration skipped:', p2AuditErr.message);
      }

      // Ensure cutting_fabric_inventory has all required columns (runs after cutting_production_lines is created)
      try {
        const { sql: sqlFabInv } = await import('drizzle-orm');
        const fabCols = [
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS inventory_item_id INTEGER REFERENCES inventory_items(id)`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS production_line_id UUID REFERENCES cutting_production_lines(id)`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS source TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS fabric_part_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS nickname TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS supplier_part_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS supplier_po_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS manufacturer_po_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS internal_control_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS batch_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS roll_number TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS manufacture_date DATE`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS received_date DATE`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS conformance_document_link TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS square_meters NUMERIC(10,2)`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS barcode TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS depleted_at TIMESTAMP`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS depleted_by TEXT`,
          sqlFabInv`ALTER TABLE cutting_fabric_inventory ADD COLUMN IF NOT EXISTS freezer_number INTEGER`,
        ];
        for (const col of fabCols) {
          try { await db.execute(col); } catch {}
        }
        console.log('✅ Ensured cutting_fabric_inventory has all required columns');
      } catch (fabInvErr: any) {
        console.warn('⚠️ cutting_fabric_inventory columns migration:', fabInvErr.message);
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

      // Ensure p2_customers has all shipping + rfq columns added in later schema revisions
      try {
        const { sql: sqlP2C } = await import('drizzle-orm');
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_company_name TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_contact_name TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_address TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_address_2 TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_city TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_state TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS shipping_zip TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS ship_to_address TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS rfq_prefix TEXT`);
        await db.execute(sqlP2C`ALTER TABLE p2_customers ADD COLUMN IF NOT EXISTS rfq_sequences JSONB DEFAULT '{}'::jsonb`);
        console.log('✅ Ensured p2_customers has all shipping and RFQ columns');
      } catch (p2cErr: any) {
        console.warn('⚠️ p2_customers column migration skipped:', p2cErr.message);
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

      // Ensure p2_lot_numbers has po_id FK column and backfill from po_number
      try {
        const { sql: sqlLot } = await import('drizzle-orm');
        await db.execute(sqlLot`
          ALTER TABLE p2_lot_numbers
          ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES p2_purchase_orders(id)
        `);
        await db.execute(sqlLot`
          UPDATE p2_lot_numbers l
          SET po_id = po.id
          FROM p2_purchase_orders po
          WHERE l.po_number = po.po_number
            AND l.po_id IS NULL
        `);
        console.log('✅ Ensured p2_lot_numbers has po_id FK (backfilled from po_number)');
      } catch (lotPoIdError: any) {
        console.warn('⚠️ p2_lot_numbers po_id migration warning:', lotPoIdError?.message);
      }

      // GIN index on serialized_item_ids for fast JSONB containment lookups
      try {
        const { sql: sqlGin } = await import('drizzle-orm');
        await db.execute(sqlGin`
          CREATE INDEX IF NOT EXISTS p2_lot_numbers_serial_ids_gin
          ON p2_lot_numbers
          USING GIN (serialized_item_ids jsonb_path_ops)
        `);
        console.log('✅ Ensured p2_lot_numbers GIN index on serialized_item_ids');
      } catch (ginError: any) {
        console.warn('⚠️ p2_lot_numbers GIN index warning:', ginError?.message);
      }

      // Ensure production_orders has canonical material + source snapshot columns
      try {
        const { sql: sqlPO } = await import('drizzle-orm');
        await db.execute(sqlPO`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS material_canonical TEXT NOT NULL DEFAULT ''`);
        await db.execute(sqlPO`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS source_snapshot JSONB`);
        await db.execute(sqlPO`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS p2_po_item_id INTEGER`);
        console.log('✅ Ensured production_orders has material_canonical and source_snapshot columns');
      } catch (poError: any) {
        // Columns may already exist
      }

      // Ensure production_orders has canonical item_code column (indexed for fast lookup)
      try {
        const { sql: sqlItemCode } = await import('drizzle-orm');
        await db.execute(sqlItemCode`ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS item_code TEXT`);
        await db.execute(sqlItemCode`CREATE INDEX IF NOT EXISTS idx_production_orders_item_code ON production_orders (item_code)`);
        // Backfill: resolve from purchase_order_items.item_name → item_name → item_id, then UPPER+TRIM
        await db.execute(sqlItemCode`
          UPDATE production_orders po
          SET item_code = UPPER(TRIM(
            COALESCE(
              NULLIF(TRIM(poi.item_name), ''),
              NULLIF(TRIM(po.item_name), ''),
              NULLIF(TRIM(po.item_id), '')
            )
          ))
          FROM purchase_order_items poi
          WHERE po.po_item_id = poi.id
            AND po.item_code IS NULL
        `);
        // Fallback for any rows with no matching poi
        await db.execute(sqlItemCode`
          UPDATE production_orders
          SET item_code = UPPER(TRIM(
            COALESCE(
              NULLIF(TRIM(item_name), ''),
              NULLIF(TRIM(item_id), '')
            )
          ))
          WHERE item_code IS NULL
        `);
        console.log('✅ Ensured production_orders has item_code column (indexed, backfilled)');
      } catch (itemCodeError: any) {
        console.warn('⚠️ production_orders item_code migration warning:', itemCodeError?.message);
      }

      // ── Communication Governance Layer ────────────────────────────────────
      try {
        const { sql: sqlComm } = await import('drizzle-orm');

        // 1. Create email_templates table
        await db.execute(sqlComm`
          CREATE TABLE IF NOT EXISTS email_templates (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            key VARCHAR(255) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            subject TEXT NOT NULL,
            body_html TEXT NOT NULL,
            body_text TEXT,
            allowed_variables JSONB NOT NULL DEFAULT '[]',
            attachment_rules JSONB NOT NULL DEFAULT '{}',
            version INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            updated_by VARCHAR
          )
        `);
        await db.execute(sqlComm`CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates (key)`);
        await db.execute(sqlComm`CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates (is_active)`);

        // 2. Expand communication_logs with governance columns
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS template_key VARCHAR(255)`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS template_version INTEGER`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS triggered_by VARCHAR`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS body_html TEXT`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS recipients JSONB`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS cc JSONB`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS attachments_meta JSONB`);
        await db.execute(sqlComm`ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255)`);

        // 3. Seed vendor email templates (idempotent — skip if already present)
        const { seedVendorEmailTemplates, ensureVendorPOAttachmentRules } = await import('./communication/registry');
        await seedVendorEmailTemplates(db);

        // 3a. Ensure vendor PO templates have the PDF attachment rule enabled.
        //     The seed is insert-only so existing rows with attachment_rules:{}
        //     were never updated when the flag was added to the seed definition.
        await ensureVendorPOAttachmentRules(db);

        // 4. One-shot: migrate vendor_rfq body_text {{items_table}} → {{items_list}}
        await db.execute(sqlComm`
          UPDATE email_templates
          SET body_text = REPLACE(body_text, '{{items_table}}', '{{items_list}}'),
              allowed_variables = '["vendor_name","vendor_contact_person","desired_delivery_date","items_table","items_list"]'
          WHERE key = 'vendor_rfq' AND body_text LIKE '%{{items_table}}%'
        `);

        // 5. Add current_version column to email_templates
        await db.execute(sqlComm`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1`);

        // 6. Create email_template_versions table
        await db.execute(sqlComm`
          CREATE TABLE IF NOT EXISTS email_template_versions (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id VARCHAR NOT NULL REFERENCES email_templates(id),
            version INTEGER NOT NULL,
            subject TEXT,
            body_html TEXT,
            body_text TEXT,
            attachment_rules JSONB,
            allowed_variables JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by VARCHAR,
            change_note TEXT
          )
        `);
        await db.execute(sqlComm`CREATE INDEX IF NOT EXISTS idx_etv_template_version ON email_template_versions (template_id, version)`);

        // 7. Create email_template_edit_logs table
        await db.execute(sqlComm`
          CREATE TABLE IF NOT EXISTS email_template_edit_logs (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id VARCHAR NOT NULL,
            edited_by VARCHAR,
            previous_version INTEGER NOT NULL,
            new_version INTEGER NOT NULL,
            change_note TEXT,
            edited_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await db.execute(sqlComm`CREATE INDEX IF NOT EXISTS idx_etel_template_id ON email_template_edit_logs (template_id)`);

        console.log('✅ Communication governance layer ready (email_templates, email_template_versions, email_template_edit_logs, communication_logs expanded, vendor templates seeded)');
      } catch (commErr: any) {
        console.warn('⚠️ Communication governance layer setup warning:', commErr.message);
      }
      // ─────────────────────────────────────────────────────────────────────

      // Ensure inventory_items has assigned_to_asset column
      try {
        const { sql: sqlAsset } = await import('drizzle-orm');
        await db.execute(sqlAsset`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS assigned_to_asset TEXT`);
        console.log('✅ Ensured inventory_items has assigned_to_asset column');
      } catch (assetErr: any) {
        console.warn('⚠️ assigned_to_asset migration:', assetErr.message);
      }

      // Ensure inventory_items has utilized_in_pl3 column
      try {
        const { sql: sqlPL3 } = await import('drizzle-orm');
        await db.execute(sqlPL3`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS utilized_in_pl3 BOOLEAN DEFAULT FALSE`);
        console.log('✅ Ensured inventory_items has utilized_in_pl3 column');
      } catch (pl3Err: any) {
        console.warn('⚠️ utilized_in_pl3 migration:', pl3Err.message);
      }

      try {
        const { sql: sqlDom } = await import('drizzle-orm');
        await db.execute(sqlDom`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS default_order_method TEXT`);
        console.log('✅ Ensured inventory_items has default_order_method column');
      } catch (domErr: any) {
        console.warn('⚠️ default_order_method migration:', domErr.message);
      }

      // Ensure inventory_item_type, inventory_manufactured_category, inventory_manufacturing_level enums and columns exist
      try {
        const { sql: sqlInvClass } = await import('drizzle-orm');
        await db.execute(sqlInvClass`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_item_type') THEN
              CREATE TYPE inventory_item_type AS ENUM ('PURCHASED', 'MANUFACTURED');
            END IF;
          END $$
        `);
        await db.execute(sqlInvClass`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_manufactured_category') THEN
              CREATE TYPE inventory_manufactured_category AS ENUM ('PACKET', 'KIT', 'MACHINED_PART', 'CORE', 'SUB_ASSEMBLY', 'ASSEMBLY');
            END IF;
          END $$
        `);
        await db.execute(sqlInvClass`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_manufacturing_level') THEN
              CREATE TYPE inventory_manufacturing_level AS ENUM ('COMPONENT', 'INTERMEDIATE', 'FINAL');
            END IF;
          END $$
        `);
        await db.execute(sqlInvClass`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_type inventory_item_type`);
        await db.execute(sqlInvClass`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS manufactured_category inventory_manufactured_category`);
        await db.execute(sqlInvClass`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS manufacturing_level inventory_manufacturing_level`);
        console.log('✅ Ensured inventory_items has item_type, manufactured_category, and manufacturing_level columns');
      } catch (invClassErr: any) {
        console.warn('⚠️ inventory_items classification columns migration:', invClassErr.message);
      }

      try {
        const { sql: sqlMfgQ } = await import('drizzle-orm');
        await db.execute(sqlMfgQ`ALTER TABLE manufacturing_queue ADD COLUMN IF NOT EXISTS parent_production_order_id TEXT`);
        console.log('✅ Ensured manufacturing_queue has parent_production_order_id column');
      } catch (mfgQErr: any) {
        console.warn('⚠️ manufacturing_queue parent_production_order_id migration:', mfgQErr.message);
      }

      try {
        const { sql: sqlFkFix } = await import('drizzle-orm');
        // Drop the wrong FK (points to "departments" table which is empty/unused)
        await db.execute(sqlFkFix`
          ALTER TABLE parts_requests
            DROP CONSTRAINT IF EXISTS parts_requests_department_id_fkey
        `);
        // Add the correct FK pointing to inventory_departments (what the UI uses)
        await db.execute(sqlFkFix`
          ALTER TABLE parts_requests
            ADD CONSTRAINT parts_requests_department_id_fkey
            FOREIGN KEY (department_id) REFERENCES inventory_departments(id)
            ON DELETE SET NULL
            NOT VALID
        `);
        console.log('✅ Fixed parts_requests department_id FK to reference inventory_departments');
      } catch (fkErr: any) {
        console.warn('⚠️ parts_requests department FK migration:', fkErr.message);
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

      // KENTRO-pattern checklist instance engine tables
      try {
        const { sql: sqlCI } = await import('drizzle-orm');
        // Extend checklist_assignments for department/role assignment
        await db.execute(sqlCI`ALTER TABLE checklist_assignments ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'employee'`);
        await db.execute(sqlCI`ALTER TABLE checklist_assignments ADD COLUMN IF NOT EXISTS department_name TEXT`);
        await db.execute(sqlCI`ALTER TABLE checklist_assignments ADD COLUMN IF NOT EXISTS role_key TEXT`);
        // Make employee_id nullable for department/role assignments
        await db.execute(sqlCI`ALTER TABLE checklist_assignments ALTER COLUMN employee_id DROP NOT NULL`);
        // Drop old unique constraint if it still references only (template_id, employee_id)
        await db.execute(sqlCI`ALTER TABLE checklist_assignments DROP CONSTRAINT IF EXISTS checklist_assignments_unique_idx`);

        await db.execute(sqlCI`
          CREATE TABLE IF NOT EXISTS checklist_instances (
            id SERIAL PRIMARY KEY,
            template_id INTEGER NOT NULL REFERENCES checklist_templates(id),
            employee_id INTEGER NOT NULL REFERENCES employees(id),
            context_type TEXT NOT NULL DEFAULT 'daily',
            context_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            completed_at TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewed_by_user_id INTEGER,
            reviewed_by_display_name TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(template_id, employee_id, context_type, context_date)
          )
        `);
        await db.execute(sqlCI`CREATE INDEX IF NOT EXISTS checklist_instances_template_id_idx ON checklist_instances(template_id)`);
        await db.execute(sqlCI`CREATE INDEX IF NOT EXISTS checklist_instances_employee_id_idx ON checklist_instances(employee_id)`);
        await db.execute(sqlCI`CREATE INDEX IF NOT EXISTS checklist_instances_context_date_idx ON checklist_instances(context_date)`);

        await db.execute(sqlCI`
          CREATE TABLE IF NOT EXISTS checklist_instance_items (
            id SERIAL PRIMARY KEY,
            instance_id INTEGER NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
            template_item_id INTEGER NOT NULL REFERENCES checklist_template_items(id),
            label TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'checkbox',
            options JSONB,
            required BOOLEAN NOT NULL DEFAULT false,
            frequency TEXT NOT NULL DEFAULT 'DAILY',
            sort_order INTEGER NOT NULL DEFAULT 0,
            value TEXT,
            completed BOOLEAN NOT NULL DEFAULT false,
            completed_at TIMESTAMP,
            completed_by_user_id INTEGER,
            completed_by_display_name TEXT
          )
        `);
        await db.execute(sqlCI`CREATE INDEX IF NOT EXISTS checklist_instance_items_instance_id_idx ON checklist_instance_items(instance_id)`);

        await db.execute(sqlCI`
          CREATE TABLE IF NOT EXISTS checklist_instance_events (
            id SERIAL PRIMARY KEY,
            instance_id INTEGER NOT NULL REFERENCES checklist_instances(id) ON DELETE CASCADE,
            instance_item_id INTEGER REFERENCES checklist_instance_items(id),
            event_type TEXT NOT NULL,
            actor_user_id INTEGER,
            actor_display_name TEXT,
            previous_value TEXT,
            new_value TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlCI`CREATE INDEX IF NOT EXISTS checklist_instance_events_instance_id_idx ON checklist_instance_events(instance_id)`);

        // Partial unique indexes to prevent duplicate assignments per type
        await db.execute(sqlCI`
          CREATE UNIQUE INDEX IF NOT EXISTS checklist_assignments_unique_employee
          ON checklist_assignments(template_id, employee_id)
          WHERE assignment_type = 'employee' AND employee_id IS NOT NULL
        `);
        await db.execute(sqlCI`
          CREATE UNIQUE INDEX IF NOT EXISTS checklist_assignments_unique_department
          ON checklist_assignments(template_id, department_name)
          WHERE assignment_type = 'department' AND department_name IS NOT NULL
        `);
        await db.execute(sqlCI`
          CREATE UNIQUE INDEX IF NOT EXISTS checklist_assignments_unique_role
          ON checklist_assignments(template_id, role_key)
          WHERE assignment_type = 'role' AND role_key IS NOT NULL
        `);

        console.log('✅ Ensured checklist instance engine tables exist');
      } catch (ciErr: any) {
        console.warn('⚠️ Checklist instance engine migration:', ciErr.message);
      }

      // Ensure project_steps and project_activity_log have display name columns
      try {
        const { sql: sqlProjCols } = await import('drizzle-orm');
        await db.execute(sqlProjCols`ALTER TABLE project_steps ADD COLUMN IF NOT EXISTS completed_by_display_name TEXT`);
        await db.execute(sqlProjCols`ALTER TABLE project_activity_log ADD COLUMN IF NOT EXISTS performed_by_display_name TEXT`);
        console.log('✅ Ensured project tables have display name columns');
      } catch (projColErr: any) {
        console.warn('⚠️ Project display name columns migration:', projColErr.message);
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
        await db.execute(sqlFC`
          CREATE TABLE IF NOT EXISTS forecast_simulation_logs (
            id SERIAL PRIMARY KEY,
            model_id TEXT,
            is_flattop BOOLEAN DEFAULT false,
            estimated_cycle_days NUMERIC,
            suggested_due_date TIMESTAMP,
            csr_user_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlFC`
          CREATE TABLE IF NOT EXISTS model_queue_weights (
            id SERIAL PRIMARY KEY,
            model_id TEXT NOT NULL UNIQUE,
            queue_weight REAL NOT NULL DEFAULT 1.0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        console.log('✅ Ensured production forecast engine tables exist');
      } catch (fcErr: any) {
        console.warn('⚠️ Production forecast tables migration:', fcErr.message);
      }

      try {
        const { sql: sqlCap } = await import('drizzle-orm');
        await db.execute(sqlCap`
          CREATE TABLE IF NOT EXISTS department_capacity (
            id SERIAL PRIMARY KEY,
            department TEXT UNIQUE NOT NULL,
            stations INTEGER NOT NULL DEFAULT 1,
            avg_parallel_efficiency REAL NOT NULL DEFAULT 0.85,
            last_updated TIMESTAMP DEFAULT NOW()
          )
        `);
        const capCheck = await db.execute(sqlCap`SELECT COUNT(*)::int AS cnt FROM department_capacity`);
        const capRows = Array.isArray(capCheck) ? capCheck : (capCheck?.rows ?? []);
        if (!capRows[0]?.cnt || capRows[0].cnt === 0) {
          await db.execute(sqlCap`
            INSERT INTO department_capacity (department, stations, avg_parallel_efficiency) VALUES
              ('P1 Production Queue', 10, 1.0),
              ('Layup/Plugging', 4, 0.85),
              ('Barcode', 2, 0.95),
              ('CNC', 2, 0.90),
              ('Gunsmith', 2, 0.85),
              ('Finish', 3, 0.85),
              ('Finish QC', 2, 0.95),
              ('Paint', 2, 0.85),
              ('Shipping QC', 2, 0.95),
              ('Shipping', 2, 0.90)
            ON CONFLICT (department) DO NOTHING
          `);
        }
        console.log('✅ Ensured department_capacity table exists with seed data');
      } catch (capErr: any) {
        console.warn('⚠️ Department capacity migration:', capErr.message);
      }

      try {
        const { sql: sqlMds } = await import('drizzle-orm');
        await db.execute(sqlMds`
          CREATE TABLE IF NOT EXISTS model_department_stats (
            id SERIAL PRIMARY KEY,
            model_id TEXT NOT NULL,
            department TEXT NOT NULL,
            avg_duration_minutes REAL NOT NULL,
            median_duration_minutes REAL NOT NULL DEFAULT 0,
            p90_duration_minutes REAL NOT NULL DEFAULT 0,
            sample_count INTEGER NOT NULL DEFAULT 0,
            std_dev_minutes REAL DEFAULT 0,
            avg_days REAL NOT NULL DEFAULT 0,
            confidence TEXT NOT NULL DEFAULT 'LOW',
            last_rebuilt TIMESTAMP DEFAULT NOW(),
            UNIQUE(model_id, department)
          )
        `);
        await db.execute(sqlMds`ALTER TABLE model_department_stats ADD COLUMN IF NOT EXISTS p90_duration_minutes REAL NOT NULL DEFAULT 0`);
        await db.execute(sqlMds`ALTER TABLE model_department_stats ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sqlMds`ALTER TABLE model_department_stats ADD COLUMN IF NOT EXISTS std_dev_minutes REAL DEFAULT 0`);
        await db.execute(sqlMds`ALTER TABLE model_department_stats ADD COLUMN IF NOT EXISTS avg_days REAL NOT NULL DEFAULT 0`);
        await db.execute(sqlMds`ALTER TABLE model_department_stats ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'LOW'`);
        await db.execute(sqlMds`ALTER TABLE model_department_stats ADD COLUMN IF NOT EXISTS last_rebuilt TIMESTAMP DEFAULT NOW()`);
        await db.execute(sqlMds`CREATE UNIQUE INDEX IF NOT EXISTS model_dept_stats_model_dept_idx ON model_department_stats(model_id, department)`);
        await db.execute(sqlMds`CREATE INDEX IF NOT EXISTS mds_model_id_idx ON model_department_stats(model_id)`);
        await db.execute(sqlMds`CREATE INDEX IF NOT EXISTS mds_department_idx ON model_department_stats(department)`);
        await db.execute(sqlMds`CREATE INDEX IF NOT EXISTS mds_confidence_idx ON model_department_stats(confidence)`);
        await db.execute(sqlMds`
          CREATE TABLE IF NOT EXISTS cycle_time_drift_log (
            id SERIAL PRIMARY KEY,
            model_id TEXT NOT NULL,
            department TEXT NOT NULL,
            previous_avg_minutes REAL NOT NULL,
            new_avg_minutes REAL NOT NULL,
            drift_percent REAL NOT NULL,
            direction TEXT NOT NULL,
            detected_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlMds`CREATE INDEX IF NOT EXISTS drift_log_detected_at_idx ON cycle_time_drift_log(detected_at)`);
        await db.execute(sqlMds`CREATE INDEX IF NOT EXISTS drift_log_model_id_idx ON cycle_time_drift_log(model_id)`);
        console.log('✅ Ensured self-learning cycle time tables exist');
      } catch (mdsErr: any) {
        console.warn('⚠️ Self-learning cycle time tables migration:', mdsErr.message);
      }

      try {
        const { sql: sqlFat } = await import('drizzle-orm');
        await db.execute(sqlFat`ALTER TABLE all_orders ADD COLUMN IF NOT EXISTS forecast_completion_date TIMESTAMP`);
        await db.execute(sqlFat`ALTER TABLE all_orders ADD COLUMN IF NOT EXISTS actual_completion_date TIMESTAMP`);
        await db.execute(sqlFat`ALTER TABLE all_orders ADD COLUMN IF NOT EXISTS forecast_error_days REAL`);
        console.log('✅ Ensured forecast accuracy tracking columns exist');
      } catch (fatErr: any) {
        console.warn('⚠️ Forecast accuracy columns migration:', fatErr.message);
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

      // Ensure external_po_number column exists on vendor_pos
      try {
        const { sql: sqlVpo } = await import('drizzle-orm');
        await db.execute(sqlVpo`ALTER TABLE vendor_pos ADD COLUMN IF NOT EXISTS external_po_number TEXT`);
        console.log('✅ Ensured vendor_pos has external_po_number column');
      } catch (vpoErr: any) {
        console.warn('⚠️ vendor_pos external_po_number migration:', vpoErr.message);
      }

      // Ensure executive rundown tables exist
      try {
        const { sql: sqlExec } = await import('drizzle-orm');
        await db.execute(sqlExec`
          DO $$ BEGIN
            CREATE TYPE executive_priority AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
        await db.execute(sqlExec`
          CREATE TABLE IF NOT EXISTS executive_rundown_groups (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            group_date DATE NOT NULL,
            title TEXT,
            notes TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await db.execute(sqlExec`
          CREATE INDEX IF NOT EXISTS exec_rundown_group_user_date_idx
            ON executive_rundown_groups (user_id, group_date)
        `);
        await db.execute(sqlExec`
          CREATE TABLE IF NOT EXISTS executive_rundown_items (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL REFERENCES executive_rundown_groups(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT,
            priority executive_priority NOT NULL DEFAULT 'NORMAL',
            category TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_completed BOOLEAN NOT NULL DEFAULT false,
            completed_at TIMESTAMP,
            completed_by INTEGER REFERENCES users(id),
            linked_entity_type TEXT,
            linked_entity_id TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        console.log('✅ Ensured executive rundown tables exist');
      } catch (execErr: any) {
        console.warn('⚠️ Executive rundown tables migration:', execErr.message);
      }

      // Ensure accounting shadow layer tables exist (chart_of_accounts, journal_entries, journal_lines)
      try {
        const { sql: sqlAcct } = await import('drizzle-orm');
        await db.execute(sqlAcct`
          CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id SERIAL PRIMARY KEY,
            account_name TEXT NOT NULL UNIQUE,
            account_type TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlAcct`
          CREATE TABLE IF NOT EXISTS journal_entries (
            id SERIAL PRIMARY KEY,
            transaction_type TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            reference_id INTEGER NOT NULL,
            effective_date TIMESTAMP NOT NULL,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            memo TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            exported_at TIMESTAMP
          )
        `);
        await db.execute(sqlAcct`
          CREATE TABLE IF NOT EXISTS journal_lines (
            id SERIAL PRIMARY KEY,
            journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
            account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
            debit_amount REAL DEFAULT 0,
            credit_amount REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        // Add processing_fee column to payments if not present
        await db.execute(sqlAcct`ALTER TABLE payments ADD COLUMN IF NOT EXISTS processing_fee REAL`);
        // Idempotent seed: insert required chart-of-accounts entries if missing
        await db.execute(sqlAcct`
          INSERT INTO chart_of_accounts (account_name, account_type)
          VALUES
            ('Bank Checking', 'ASSET'),
            ('Accounts Receivable – Other', 'ASSET'),
            ('Bank Service Charges', 'EXPENSE')
          ON CONFLICT (account_name) DO NOTHING
        `);
        console.log('✅ Ensured accounting shadow layer tables and seed accounts exist');
      } catch (acctErr: any) {
        console.warn('⚠️ Accounting shadow layer migration:', acctErr.message);
      }

      // Ensure vendor_po_items.received_quantity is REAL (not integer) to support decimal quantities
      try {
        const { sql: sqlRq } = await import('drizzle-orm');
        await db.execute(sqlRq`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'vendor_po_items'
                AND column_name = 'received_quantity'
                AND data_type = 'integer'
            ) THEN
              ALTER TABLE vendor_po_items ALTER COLUMN received_quantity TYPE real USING received_quantity::real;
            END IF;
          END $$
        `);
        console.log('✅ Ensured vendor_po_items.received_quantity is real (decimal-safe)');
      } catch (rqErr: any) {
        console.warn('⚠️ vendor_po_items received_quantity type migration:', rqErr.message);
      }

      // Ensure cutting_fabric_inventory.quantity_in_stock is REAL (not integer)
      try {
        const { sql: sqlFq } = await import('drizzle-orm');
        await db.execute(sqlFq`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'cutting_fabric_inventory'
                AND column_name = 'quantity_in_stock'
                AND data_type = 'integer'
            ) THEN
              ALTER TABLE cutting_fabric_inventory ALTER COLUMN quantity_in_stock TYPE real USING quantity_in_stock::real;
            END IF;
          END $$
        `);
        console.log('✅ Ensured cutting_fabric_inventory.quantity_in_stock is real (decimal-safe)');
      } catch (fqErr: any) {
        console.warn('⚠️ cutting_fabric_inventory quantity_in_stock type migration:', fqErr.message);
      }

      // Renumber traveler steps from 10/20/30 style to 1/2/3 style
      try {
        const { sql: sqlTsRen } = await import('drizzle-orm');
        await db.execute(sqlTsRen`
          UPDATE traveler_steps ts
          SET step_number = sub.new_number
          FROM (
            SELECT id,
              ROW_NUMBER() OVER (PARTITION BY traveler_id ORDER BY step_number) AS new_number
            FROM traveler_steps
            WHERE step_number >= 10 AND step_number % 10 = 0
          ) sub
          WHERE ts.id = sub.id
            AND ts.step_number != sub.new_number
        `);
        console.log('✅ Ensured traveler steps use sequential numbering (1, 2, 3…)');
      } catch (tsRenErr: any) {
        console.warn('⚠️ Traveler step renumbering migration:', tsRenErr.message);
      }

      // Ensure bom_items.quantity supports decimals (real instead of integer)
      try {
        const { sql: sqlBomQty } = await import('drizzle-orm');
        await db.execute(sqlBomQty`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'bom_items'
                AND column_name = 'quantity'
                AND data_type = 'integer'
            ) THEN
              ALTER TABLE bom_items ALTER COLUMN quantity TYPE real USING quantity::real;
            END IF;
          END $$
        `);
        console.log('✅ Ensured bom_items.quantity supports decimal values');
      } catch (bomQtyErr: any) {
        console.warn('⚠️ bom_items quantity type migration:', bomQtyErr.message);
      }

      // Add log_type to production_programs (tracks what kind of log this program auto-creates)
      try {
        const { sql: sqlProgType } = await import('drizzle-orm');
        await db.execute(sqlProgType`
          ALTER TABLE production_programs ADD COLUMN IF NOT EXISTS log_type VARCHAR(50) DEFAULT 'none' NOT NULL
        `);
        console.log('✅ Ensured production_programs has log_type column');
      } catch (progTypeErr: any) {
        console.warn('⚠️ production_programs.log_type migration:', progTypeErr.message);
      }

      // Add linked_log_id and linked_log_type to production_program_runs
      try {
        const { sql: sqlRunLog } = await import('drizzle-orm');
        await db.execute(sqlRunLog`ALTER TABLE production_program_runs ADD COLUMN IF NOT EXISTS linked_log_id UUID`);
        await db.execute(sqlRunLog`ALTER TABLE production_program_runs ADD COLUMN IF NOT EXISTS linked_log_type VARCHAR(50)`);
        console.log('✅ Ensured production_program_runs has linked_log_id/linked_log_type columns');
      } catch (runLogErr: any) {
        console.warn('⚠️ production_program_runs linked log migration:', runLogErr.message);
      }

      // Normalize legacy traceability field IDs in inventory_items for fabric items
      // Old field IDs ("lot", "batch", "expDate", "part") don't match TRACEABILITY_FIELD_LABELS
      // and cause the receiving form to show raw IDs instead of friendly labels
      try {
        const { sql: sqlTrace } = await import('drizzle-orm');
        const legacyRows = await db.execute(sqlTrace`
          SELECT id, traceability_fields
          FROM inventory_items
          WHERE is_fabric = true
            AND traceability_fields IS NOT NULL
            AND traceability_fields::text != '[]'
            AND (
              traceability_fields::text LIKE '%"lot"%'
              OR traceability_fields::text LIKE '%"batch"%'
              OR traceability_fields::text LIKE '%"expDate"%'
              OR traceability_fields::text LIKE '%"part"%'
            )
        `);
        
        const legacyMap: Record<string, string> = {
          lot: 'batchLotNumber',
          batch: 'aluminumHeat',
          expDate: 'expirationDate',
          part: 'supplierPartNumber',
        };
        
        let fixedCount = 0;
        for (const row of legacyRows.rows as any[]) {
          const fields: string[] = row.traceability_fields || [];
          const normalized = Array.from(new Set(
            fields.map((f: string) => legacyMap[f] || f)
          ));
          if (JSON.stringify(normalized) !== JSON.stringify(fields)) {
            await db.execute(sqlTrace`
              UPDATE inventory_items
              SET traceability_fields = ${JSON.stringify(normalized)}::jsonb
              WHERE id = ${row.id}
            `);
            fixedCount++;
          }
        }
        
        if (fixedCount > 0) {
          console.log(`✅ Normalized legacy traceability field IDs on ${fixedCount} fabric inventory item(s)`);
        } else {
          console.log('✅ Fabric inventory item traceability fields are up to date');
        }
      } catch (traceFieldErr: any) {
        console.warn('⚠️ Traceability field normalization:', traceFieldErr.message);
      }

      // Seed default inventory departments if table is empty
      try {
        const { sql: sqlDept } = await import('drizzle-orm');
        const existing = await db.execute(sqlDept`SELECT COUNT(*) as cnt FROM inventory_departments`);
        const count = Number((existing.rows[0] as any)?.cnt ?? 0);
        if (count === 0) {
          await db.execute(sqlDept`
            INSERT INTO inventory_departments (name, is_active, sort_order) VALUES
              ('Production Queue', true, 1),
              ('Layup', true, 2),
              ('Barcode', true, 3),
              ('CNC', true, 4),
              ('Gunsmith', true, 5),
              ('Paint', true, 6),
              ('Finish', true, 7),
              ('Finish QC', true, 8),
              ('Shipping QC', true, 9),
              ('Shipping', true, 10),
              ('Cutting Table', true, 11),
              ('Office', true, 12)
          `);
          console.log('✅ Seeded default inventory departments (12)');
        }
      } catch (deptSeedErr: any) {
        console.warn('⚠️ Inventory departments seed:', deptSeedErr.message);
      }

      // Fix fabric inventory records where all traceability data was concatenated into supplier_part_number
      // This happened when comma-separated notes were parsed incorrectly (the parser expected pipe-separated)
      try {
        const { sql: sqlFabricFix } = await import('drizzle-orm');
        const fixResult = await db.execute(sqlFabricFix`
          UPDATE cutting_fabric_inventory
          SET
            supplier_part_number = TRIM((regexp_match(supplier_part_number, '^([^,]+)'))[1]),
            roll_number = COALESCE(
              roll_number,
              TRIM((regexp_match(supplier_part_number, 'Roll Number: *([^,|]+)'))[1])
            ),
            lot_number = COALESCE(
              lot_number,
              TRIM((regexp_match(supplier_part_number, 'Batch/Lot #: *([^,|]+)'))[1])
            ),
            expiration_date = CASE
              WHEN expiration_date IS NULL AND TRIM((regexp_match(supplier_part_number, 'Expiration Date: *([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1]) IS NOT NULL
              THEN (TRIM((regexp_match(supplier_part_number, 'Expiration Date: *([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1]))::date
              ELSE expiration_date
            END,
            manufacture_date = CASE
              WHEN manufacture_date IS NULL AND TRIM((regexp_match(supplier_part_number, 'Manufacture Date: *([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1]) IS NOT NULL
              THEN (TRIM((regexp_match(supplier_part_number, 'Manufacture Date: *([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1]))::date
              ELSE manufacture_date
            END
          WHERE supplier_part_number LIKE '%, Roll Number:%'
        `);
        const fixCount = (fixResult as any)?.rowCount ?? 0;
        if (fixCount > 0) {
          console.log(`✅ Fixed ${fixCount} fabric inventory record(s) with concatenated traceability in supplier_part_number`);
        }
      } catch (fabricFixErr: any) {
        console.warn('⚠️ fabric_inventory concatenated field fix:', fabricFixErr.message);
      }

      // Backfill square_meters for fabric inventory records created from PO receipt that are missing it
      try {
        const { sql: sqlFabricSqm } = await import('drizzle-orm');
        const backfillResult = await db.execute(sqlFabricSqm`
          UPDATE cutting_fabric_inventory cfi
          SET square_meters = ii.purchase_quantity
          FROM inventory_items ii
          WHERE cfi.fabric_part_number = ii.ag_part_number
            AND cfi.square_meters IS NULL
            AND cfi.status = 'active'
            AND cfi.quantity_in_stock > 0
            AND LOWER(TRIM(ii.purchase_unit)) IN ('sq m', 'sqm', 'square meters', 'm2', 'm²')
            AND ii.purchase_quantity IS NOT NULL
            AND ii.purchase_quantity > 0
        `);
        const count = (backfillResult as any)?.rowCount ?? 0;
        if (count > 0) {
          console.log(`✅ Backfilled square_meters for ${count} fabric inventory record(s) from inventory item purchase quantities`);
        }
      } catch (fabricSqmErr: any) {
        console.warn('⚠️ fabric_inventory square_meters backfill:', fabricSqmErr.message);
      }

      // Ensure p2_order_id_sequences table exists (separate sequence counter for P2 production orders)
      try {
        const { sql: sqlP2Seq } = await import('drizzle-orm');
        await db.execute(sqlP2Seq`
          CREATE TABLE IF NOT EXISTS p2_order_id_sequences (
            year_month_prefix text PRIMARY KEY,
            current_sequence integer NOT NULL DEFAULT 0,
            updated_at timestamp NOT NULL DEFAULT NOW()
          )
        `);
        console.log('✅ Ensured p2_order_id_sequences table exists');
      } catch (p2SeqErr: any) {
        console.warn('⚠️ p2_order_id_sequences migration:', p2SeqErr.message);
      }

      // Ensure unit_families + units tables exist and are seeded
      try {
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS unit_families (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS units (
            id SERIAL PRIMARY KEY,
            symbol TEXT NOT NULL UNIQUE,
            family_id INTEGER NOT NULL REFERENCES unit_families(id),
            conversion_to_base REAL NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sql`
          ALTER TABLE inventory_items
            ADD COLUMN IF NOT EXISTS purchase_unit_id INTEGER REFERENCES units(id),
            ADD COLUMN IF NOT EXISTS usage_unit_id INTEGER REFERENCES units(id)
        `);
        // Seed families
        await db.execute(sql`
          INSERT INTO unit_families (name) VALUES
            ('mass'), ('volume'), ('length'), ('count'), ('time'), ('area')
          ON CONFLICT (name) DO NOTHING
        `);
        // Seed units
        await db.execute(sql`
          INSERT INTO units (symbol, family_id, conversion_to_base) VALUES
            ('g',     (SELECT id FROM unit_families WHERE name='mass'),   1),
            ('kg',    (SELECT id FROM unit_families WHERE name='mass'),   1000),
            ('lb',    (SELECT id FROM unit_families WHERE name='mass'),   453.592),
            ('oz',    (SELECT id FROM unit_families WHERE name='mass'),   28.3495),
            ('ml',    (SELECT id FROM unit_families WHERE name='volume'), 1),
            ('l',     (SELECT id FROM unit_families WHERE name='volume'), 1000),
            ('gal',   (SELECT id FROM unit_families WHERE name='volume'), 3785.41),
            ('qt',    (SELECT id FROM unit_families WHERE name='volume'), 946.353),
            ('pt',    (SELECT id FROM unit_families WHERE name='volume'), 473.176),
            ('fl oz', (SELECT id FROM unit_families WHERE name='volume'), 29.5735),
            ('mm',    (SELECT id FROM unit_families WHERE name='length'), 1),
            ('cm',    (SELECT id FROM unit_families WHERE name='length'), 10),
            ('m',     (SELECT id FROM unit_families WHERE name='length'), 1000),
            ('ft',    (SELECT id FROM unit_families WHERE name='length'), 304.8),
            ('in',    (SELECT id FROM unit_families WHERE name='length'), 25.4),
            ('ea',    (SELECT id FROM unit_families WHERE name='count'),  1),
            ('pc',    (SELECT id FROM unit_families WHERE name='count'),  1),
            ('hr',    (SELECT id FROM unit_families WHERE name='time'),   1),
            ('min',   (SELECT id FROM unit_families WHERE name='time'),   0.016667),
            ('sq mm', (SELECT id FROM unit_families WHERE name='area'),   1),
            ('sq cm', (SELECT id FROM unit_families WHERE name='area'),   100),
            ('sq m',  (SELECT id FROM unit_families WHERE name='area'),   1000000),
            ('sq ft', (SELECT id FROM unit_families WHERE name='area'),   92903.04),
            ('sq in', (SELECT id FROM unit_families WHERE name='area'),   645.16)
          ON CONFLICT (symbol) DO NOTHING
        `);
        // Backfill unit IDs from existing text columns
        await db.execute(sql`
          UPDATE inventory_items ii
          SET usage_unit_id = u.id
          FROM units u
          WHERE ii.usage_unit_id IS NULL AND ii.usage_unit IS NOT NULL
            AND LOWER(ii.usage_unit) = LOWER(u.symbol)
        `);
        await db.execute(sql`
          UPDATE inventory_items ii
          SET purchase_unit_id = u.id
          FROM units u
          WHERE ii.purchase_unit_id IS NULL AND ii.purchase_unit IS NOT NULL
            AND LOWER(ii.purchase_unit) = LOWER(u.symbol)
        `);
        console.log('✅ Ensured unit_families/units tables exist and inventory_items backfilled');
      } catch (unitErr: any) {
        console.warn('⚠️ unit_families migration:', unitErr.message);
      }

      // Ensure AR invoice/payment tables exist
      try {
        const { sql: sqlAR } = await import('drizzle-orm');
        await db.execute(sqlAR`
          CREATE TABLE IF NOT EXISTS ar_invoices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id TEXT NOT NULL,
            invoice_number TEXT NOT NULL,
            invoice_date DATE NOT NULL,
            due_date DATE,
            terms TEXT,
            po_id TEXT,
            po_override TEXT,
            subtotal NUMERIC NOT NULL,
            tax_amount NUMERIC NOT NULL DEFAULT 0,
            total_amount NUMERIC NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            notes TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlAR`
          CREATE TABLE IF NOT EXISTS ar_invoice_lines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            invoice_id UUID NOT NULL REFERENCES ar_invoices(id) ON DELETE CASCADE,
            inventory_item_id TEXT,
            description TEXT NOT NULL,
            qty NUMERIC NOT NULL,
            unit_price NUMERIC NOT NULL,
            line_total NUMERIC NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlAR`
          CREATE TABLE IF NOT EXISTS ar_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id TEXT NOT NULL,
            payment_date DATE NOT NULL,
            payment_method TEXT NOT NULL,
            reference_number TEXT,
            amount NUMERIC NOT NULL,
            notes TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlAR`
          CREATE TABLE IF NOT EXISTS ar_payment_allocations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            payment_id UUID NOT NULL REFERENCES ar_payments(id) ON DELETE CASCADE,
            invoice_id UUID NOT NULL REFERENCES ar_invoices(id),
            amount_applied NUMERIC NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        console.log('✅ Ensured AR invoice/payment tables exist');
      } catch (arErr: any) {
        console.warn('⚠️ AR tables migration:', arErr.message);
      }

      // Add shipment traceability columns to ar_invoices
      try {
        const { sql: sqlArLink } = await import('drizzle-orm');
        await db.execute(sqlArLink`
          ALTER TABLE ar_invoices
          ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES p2_lot_numbers(id)
        `);
        await db.execute(sqlArLink`
          ALTER TABLE ar_invoices
          ADD COLUMN IF NOT EXISTS packing_slip_id UUID REFERENCES p2_packing_slips(id)
        `);
        await db.execute(sqlArLink`
          CREATE INDEX IF NOT EXISTS ar_invoices_lot_id_idx
          ON ar_invoices (lot_id)
          WHERE lot_id IS NOT NULL
        `);
        console.log('✅ Ensured ar_invoices has lot_id and packing_slip_id traceability columns');
      } catch (arLinkErr: any) {
        console.warn('⚠️ ar_invoices traceability columns warning:', arLinkErr?.message);
      }

      // Ensure Receiving Control Center tables exist (5 tables + receipt_id column on material_lot_transactions)
      try {
        const { sql: sqlRcc } = await import('drizzle-orm');
        // Canonical table: receipts (matches migrations/0013 + server/schema.ts)
        await db.execute(sqlRcc`
          CREATE TABLE IF NOT EXISTS receipts (
            id SERIAL PRIMARY KEY,
            receipt_number TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'open',
            vendor_po_id INTEGER,
            vendor_po_number TEXT,
            vendor_name TEXT,
            carrier TEXT,
            tracking_number TEXT,
            packing_slip_number TEXT,
            condition_on_arrival TEXT NOT NULL DEFAULT 'good',
            notes TEXT,
            received_by_user_id INTEGER,
            received_by_display_name TEXT,
            opened_at TIMESTAMP DEFAULT NOW(),
            closed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS receipts_status_idx ON receipts(status)`);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS receipts_vendor_po_id_idx ON receipts(vendor_po_id)`);

        await db.execute(sqlRcc`
          CREATE TABLE IF NOT EXISTS receipt_lines (
            id SERIAL PRIMARY KEY,
            receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
            vendor_po_item_id INTEGER,
            ag_part_number TEXT,
            description TEXT,
            ordered_qty NUMERIC,
            received_qty NUMERIC DEFAULT 0,
            uom TEXT NOT NULL DEFAULT 'EA',
            unit_price NUMERIC,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS receipt_lines_receipt_id_idx ON receipt_lines(receipt_id)`);

        await db.execute(sqlRcc`
          CREATE TABLE IF NOT EXISTS received_units (
            id SERIAL PRIMARY KEY,
            receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
            receipt_line_id INTEGER NOT NULL REFERENCES receipt_lines(id) ON DELETE CASCADE,
            unit_sequence INTEGER NOT NULL DEFAULT 1,
            barcode TEXT NOT NULL UNIQUE,
            unit_type TEXT DEFAULT 'other',
            quantity NUMERIC NOT NULL DEFAULT 1,
            uom TEXT DEFAULT 'EA',
            lot_number TEXT,
            batch_number TEXT,
            serial_number TEXT,
            internal_control_number TEXT,
            roll_number TEXT,
            heat_lot TEXT,
            manufacture_date DATE,
            expiration_date DATE,
            shelf_life_days INTEGER,
            cert_reference TEXT,
            location TEXT,
            freezer_number INTEGER,
            allocated_to_type TEXT,
            allocated_to_id INTEGER,
            disposition TEXT NOT NULL DEFAULT 'pending_inspection',
            disposition_notes TEXT,
            disposition_by_user_id INTEGER,
            disposition_by_display_name TEXT,
            disposition_at TIMESTAMP,
            material_lot_id UUID,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS received_units_receipt_id_idx ON received_units(receipt_id)`);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS received_units_disposition_idx ON received_units(disposition)`);

        await db.execute(sqlRcc`
          CREATE TABLE IF NOT EXISTS receipt_documents (
            id SERIAL PRIMARY KEY,
            receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
            received_unit_id INTEGER REFERENCES received_units(id) ON DELETE SET NULL,
            media_id UUID,
            doc_type TEXT DEFAULT 'other',
            filename TEXT,
            storage_path TEXT,
            mime_type TEXT,
            notes TEXT,
            uploaded_by_user_id INTEGER,
            uploaded_by_display_name TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS receipt_documents_receipt_id_idx ON receipt_documents(receipt_id)`);

        // Canonical audit log table: receipt_audit_log (matches migration + schema)
        await db.execute(sqlRcc`
          CREATE TABLE IF NOT EXISTS receipt_audit_log (
            id SERIAL PRIMARY KEY,
            receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            actor_user_id INTEGER,
            actor_display_name TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlRcc`CREATE INDEX IF NOT EXISTS receipt_audit_log_receipt_id_idx ON receipt_audit_log(receipt_id)`);

        // Add receipt_id column to material_lot_transactions for explicit traceability FK
        await db.execute(sqlRcc`ALTER TABLE material_lot_transactions ADD COLUMN IF NOT EXISTS receipt_id INTEGER`);

        console.log('✅ Ensured Receiving Control Center tables exist (receipts, receipt_lines, received_units, receipt_documents, receipt_audit_log + receipt_id FK)');
      } catch (rccErr: any) {
        console.warn('⚠️ Receiving Control Center tables migration:', rccErr.message);
      }

      // ── RCC Phase 1 column additions ──────────────────────────────────────────
      try {
        const { sql: sqlRcc1 } = await import('drizzle-orm');
        // receipts: explicit physical-receipt timestamp
        await db.execute(sqlRcc1`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS received_at TIMESTAMP`);
        // inventory_items: required-document enforcement flags
        await db.execute(sqlRcc1`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_sds BOOLEAN NOT NULL DEFAULT FALSE`);
        await db.execute(sqlRcc1`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_tds BOOLEAN NOT NULL DEFAULT FALSE`);
        await db.execute(sqlRcc1`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_coc BOOLEAN NOT NULL DEFAULT FALSE`);
        await db.execute(sqlRcc1`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_test_report BOOLEAN NOT NULL DEFAULT FALSE`);
        await db.execute(sqlRcc1`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_packing_slip_photo BOOLEAN NOT NULL DEFAULT FALSE`);
        console.log('✅ Ensured RCC Phase 1 columns (receipts.received_at + inventory_items doc-requirement flags)');
      } catch (rcc1Err: any) {
        console.warn('⚠️ RCC Phase 1 column migration:', rcc1Err.message);
      }

      // ── RCC Phase 2 column additions ──────────────────────────────────────────
      try {
        const { sql: sqlRcc2 } = await import('drizzle-orm');
        // traveler_material_consumption: link each scan to the physical receiving unit
        await db.execute(sqlRcc2`
          ALTER TABLE traveler_material_consumption
          ADD COLUMN IF NOT EXISTS received_unit_id INTEGER
          REFERENCES received_units(id) ON DELETE SET NULL
        `);
        // Index for genealogy forward-trace queries (unit → traveler)
        await db.execute(sqlRcc2`
          CREATE INDEX IF NOT EXISTS traveler_material_consumption_received_unit_idx
          ON traveler_material_consumption (received_unit_id)
          WHERE received_unit_id IS NOT NULL
        `);
        console.log('✅ Ensured RCC Phase 2 columns (traveler_material_consumption.received_unit_id)');
      } catch (rcc2Err: any) {
        console.warn('⚠️ RCC Phase 2 column migration:', rcc2Err.message);
      }

      // ── RCC Phase 2B: material_lot_reservations table ─────────────────────────
      try {
        const { sql: sqlRes } = await import('drizzle-orm');
        await db.execute(sqlRes`
          CREATE TABLE IF NOT EXISTS material_lot_reservations (
            id SERIAL PRIMARY KEY,
            material_lot_id UUID NOT NULL REFERENCES material_lots(id) ON DELETE CASCADE,
            received_unit_id INTEGER REFERENCES received_units(id) ON DELETE SET NULL,
            traveler_id UUID,
            work_order_id INTEGER,
            quantity_reserved NUMERIC NOT NULL,
            unit_of_measure TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await db.execute(sqlRes`CREATE INDEX IF NOT EXISTS material_lot_reservations_lot_idx ON material_lot_reservations (material_lot_id)`);
        await db.execute(sqlRes`CREATE INDEX IF NOT EXISTS material_lot_reservations_status_idx ON material_lot_reservations (status)`);
        await db.execute(sqlRes`CREATE INDEX IF NOT EXISTS material_lot_reservations_traveler_idx ON material_lot_reservations (traveler_id) WHERE traveler_id IS NOT NULL`);
        await db.execute(sqlRes`CREATE INDEX IF NOT EXISTS material_lot_reservations_ru_idx ON material_lot_reservations (received_unit_id) WHERE received_unit_id IS NOT NULL`);
        console.log('✅ Ensured material_lot_reservations table (Phase 2B)');
      } catch (resErr: any) {
        console.warn('⚠️ material_lot_reservations migration:', resErr.message);
      }

      // Ensure capability-based permission system tables exist
      try {
        const { sql: sqlPerm } = await import('drizzle-orm');
        await db.execute(sqlPerm`
          CREATE TABLE IF NOT EXISTS perm_capabilities (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general'
          )
        `);
        await db.execute(sqlPerm`
          CREATE TABLE IF NOT EXISTS perm_roles (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            is_system BOOLEAN NOT NULL DEFAULT false
          )
        `);
        await db.execute(sqlPerm`
          CREATE TABLE IF NOT EXISTS perm_role_capabilities (
            id SERIAL PRIMARY KEY,
            role_id INTEGER NOT NULL REFERENCES perm_roles(id) ON DELETE CASCADE,
            capability_id INTEGER NOT NULL REFERENCES perm_capabilities(id) ON DELETE CASCADE,
            UNIQUE (role_id, capability_id)
          )
        `);
        await db.execute(sqlPerm`
          CREATE TABLE IF NOT EXISTS perm_user_overrides (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            capability_id INTEGER NOT NULL REFERENCES perm_capabilities(id) ON DELETE CASCADE,
            effect TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (user_id, capability_id)
          )
        `);
        console.log('✅ Ensured perm_ permission tables exist');
      } catch (permErr: any) {
        console.warn('⚠️ perm_ tables migration:', permErr.message);
      }

      // Ensure projects table has pipeline stage columns
      try {
        const { sql: sqlProj } = await import('drizzle-orm');
        // Add new enum values for project_status
        await db.execute(sqlProj`
          DO $$ BEGIN
            ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'inactive';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
        await db.execute(sqlProj`
          DO $$ BEGIN
            ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'won';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
        await db.execute(sqlProj`
          DO $$ BEGIN
            ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'lost';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
        // Add new columns
        await db.execute(sqlProj`ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'rfq_received'`);
        await db.execute(sqlProj`ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMP DEFAULT NOW()`);
        await db.execute(sqlProj`ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES p2_purchase_orders(id)`);
        // Backfill current_stage from current_step_type for existing rows that still have the default
        await db.execute(sqlProj`
          UPDATE projects SET current_stage = CASE current_step_type
            WHEN 'rfq_risk_assessment' THEN 'rfq_received'
            WHEN 'quote' THEN 'quote_preparing'
            WHEN 'purchase_review_checklist' THEN 'purchase_review'
            WHEN 'preproduction_checklist' THEN 'po_received'
            WHEN 'p2_order' THEN 'production'
            ELSE 'rfq_received'
          END
          WHERE current_stage = 'rfq_received' AND current_step_type != 'rfq_risk_assessment'
        `);
        // Backfill completed projects
        await db.execute(sqlProj`
          UPDATE projects SET current_stage = 'completed'
          WHERE status = 'completed' AND current_stage != 'completed'
        `);
        // Backfill po_id from project_steps
        await db.execute(sqlProj`
          UPDATE projects p SET po_id = ps.linked_p2_order_id
          FROM project_steps ps
          WHERE ps.project_id = p.id
            AND ps.step_type = 'p2_order'
            AND ps.linked_p2_order_id IS NOT NULL
            AND p.po_id IS NULL
        `);
        // Add new step status enum values
        await db.execute(sqlProj`
          DO $$ BEGIN
            ALTER TYPE project_step_status ADD VALUE IF NOT EXISTS 'skipped';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
        await db.execute(sqlProj`
          DO $$ BEGIN
            ALTER TYPE project_step_status ADD VALUE IF NOT EXISTS 'not_applicable';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `);
        console.log('✅ Ensured projects table has pipeline stage columns and flexible step statuses');
      } catch (projErr: any) {
        console.warn('⚠️ Projects pipeline migration:', projErr.message);
      }

      // Enforce 1:1 project ↔ PO relationship via unique index on projects.po_id
      // NULL values are always allowed (project not yet linked to a PO);
      // only non-NULL duplicates are rejected.
      try {
        const { sql: sqlProjPO } = await import('drizzle-orm');
        await db.execute(sqlProjPO`
          CREATE UNIQUE INDEX IF NOT EXISTS projects_po_id_unique
          ON projects (po_id)
          WHERE po_id IS NOT NULL
        `);
        console.log('✅ Enforced projects.po_id unique constraint (1:1 with PO)');
      } catch (projPoErr: any) {
        console.warn('⚠️ projects.po_id unique constraint warning:', projPoErr?.message);
      }

      // Backfill missing workflow steps for projects that have fewer than 5 steps
      // (repairs projects created before step-init was reliable, e.g. PRJ-007)
      try {
        const STEP_TYPES = [
          { type: 'rfq_risk_assessment', order: 1 },
          { type: 'quote',               order: 2 },
          { type: 'purchase_review_checklist', order: 3 },
          { type: 'preproduction_checklist',   order: 4 },
          { type: 'p2_order',            order: 5 },
        ];

        const projectsMissingSteps = await pool.query<{ id: string; project_code: string }>(
          `SELECT p.id, p.project_code
           FROM projects p
           WHERE (SELECT COUNT(*) FROM project_steps ps WHERE ps.project_id = p.id) < 5`
        );

        let repairedCount = 0;
        for (const proj of projectsMissingSteps as any[]) {
          const existingSteps = await pool.query<{ step_type: string }>(
            'SELECT step_type FROM project_steps WHERE project_id = $1',
            [proj.id]
          );
          const existingTypes = new Set((existingSteps as any[]).map((r: any) => r.step_type));

          for (const st of STEP_TYPES) {
            if (!existingTypes.has(st.type)) {
              await pool.query(
                `INSERT INTO project_steps (id, project_id, step_type, step_order, status, started_at, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())`,
                [proj.id, st.type, st.order,
                 st.order === 1 ? 'in_progress' : 'pending',
                 st.order === 1 ? new Date() : null]
              );
              repairedCount++;
            }
          }
        }

        if (repairedCount > 0) {
          console.log(`✅ Backfilled ${repairedCount} missing workflow step(s) across ${projectsMissingSteps.length} project(s)`);
        } else {
          console.log('✅ All project workflow steps are intact');
        }
      } catch (stepBackfillErr: any) {
        console.warn('⚠️ Project step backfill warning:', stepBackfillErr?.message);
      }

      // Ensure financial_review_sessions table exists
      try {
        const { sql: sqlFR } = await import('drizzle-orm');
        await db.execute(sqlFR`
          CREATE TABLE IF NOT EXISTS financial_review_sessions (
            id SERIAL PRIMARY KEY,
            month_key TEXT NOT NULL UNIQUE,
            review_date TEXT,
            agenda_text TEXT,
            gross_margin_pct NUMERIC,
            net_income NUMERIC,
            cash_balance NUMERIC,
            cash_forecast_notes TEXT,
            as_revenue NUMERIC,
            as_gross_margin_pct NUMERIC,
            as_net_income NUMERIC,
            action_items JSONB DEFAULT '[]'::jsonb,
            bd_pipeline JSONB DEFAULT '[]'::jsonb,
            risk_opportunity_text TEXT,
            calendar_events JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        console.log('✅ Ensured financial_review_sessions table exists');
      } catch (frErr: any) {
        console.warn('⚠️ financial_review_sessions migration:', frErr.message);
      }

      // Ensure p2_lot_numbers has shipment detail columns
      try {
        await pool.query(`
          ALTER TABLE p2_lot_numbers
            ADD COLUMN IF NOT EXISTS bill_of_lading_url TEXT,
            ADD COLUMN IF NOT EXISTS tracking_number    TEXT,
            ADD COLUMN IF NOT EXISTS carrier            TEXT
        `);
        console.log('✅ Ensured p2_lot_numbers has shipment detail columns (BoL, tracking, carrier)');
      } catch (lotColErr: any) {
        console.warn('⚠️ p2_lot_numbers shipment columns migration:', lotColErr?.message);
      }

      // Ensure p2_lot_numbers has external PDF upload columns
      try {
        await pool.query(`
          ALTER TABLE p2_lot_numbers
            ADD COLUMN IF NOT EXISTS packing_slip_upload_url TEXT,
            ADD COLUMN IF NOT EXISTS certificate_upload_url  TEXT
        `);
        console.log('✅ Ensured p2_lot_numbers has external PDF upload columns (packing slip, certificate)');
      } catch (uploadColErr: any) {
        console.warn('⚠️ p2_lot_numbers upload columns migration:', uploadColErr?.message);
      }

      // Ensure project_documents table exists (manual PDF attachments on traceability tab)
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS project_documents (
            id                SERIAL PRIMARY KEY,
            project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            label             TEXT,
            original_file_name TEXT NOT NULL,
            file_name         TEXT,
            file_path         TEXT,
            media_library_id  INTEGER,
            mime_type         TEXT DEFAULT 'application/pdf',
            file_size         INTEGER,
            uploaded_by       TEXT,
            created_at        TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        console.log('✅ Ensured project_documents table exists');
      } catch (pdErr: any) {
        console.warn('⚠️ project_documents migration:', pdErr?.message);
      }

      // Ensure p2_production_changes and p2_traveler_changes tables exist
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS p2_production_changes (
            id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            change_number              TEXT NOT NULL UNIQUE,
            change_type                TEXT NOT NULL,
            scope                      TEXT NOT NULL DEFAULT 'PO',
            part_number                TEXT,
            po_id                      INTEGER REFERENCES p2_purchase_orders(id),
            routing_id                 UUID,
            current_revision           TEXT,
            proposed_change            TEXT NOT NULL,
            reason                     TEXT NOT NULL,
            risk_assessment            TEXT,
            requires_customer_approval BOOLEAN DEFAULT false,
            status                     TEXT NOT NULL DEFAULT 'DRAFT',
            submitted_by_id            INTEGER REFERENCES employees(id),
            submitted_by_name          TEXT,
            submitted_at               TIMESTAMPTZ,
            approved_by_id             INTEGER REFERENCES employees(id),
            approved_by_name           TEXT,
            approved_at                TIMESTAMPTZ,
            rejected_by_id             INTEGER REFERENCES employees(id),
            rejected_by_name           TEXT,
            rejected_at                TIMESTAMPTZ,
            rejection_reason           TEXT,
            implemented_at             TIMESTAMPTZ,
            effective_date             DATE,
            notes                      TEXT,
            created_at                 TIMESTAMPTZ DEFAULT NOW(),
            updated_at                 TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_prod_changes_po_id_idx ON p2_production_changes(po_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_prod_changes_status_idx ON p2_production_changes(status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_prod_changes_type_idx ON p2_production_changes(change_type)`);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS p2_traveler_changes (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            change_number       TEXT NOT NULL UNIQUE,
            traveler_id         UUID NOT NULL,
            serialized_item_id  UUID REFERENCES p2_serialized_items(id),
            change_category     TEXT NOT NULL,
            description         TEXT NOT NULL,
            affected_step_ids   JSONB DEFAULT '[]'::jsonb,
            justification       TEXT NOT NULL,
            quality_impact      TEXT,
            status              TEXT NOT NULL DEFAULT 'PENDING',
            blocks_traveler     BOOLEAN DEFAULT false,
            authorized_by_id    INTEGER REFERENCES employees(id),
            authorized_by_name  TEXT,
            authorization_date  TIMESTAMPTZ,
            rejected_by_id      INTEGER REFERENCES employees(id),
            rejected_by_name    TEXT,
            rejected_at         TIMESTAMPTZ,
            rejection_reason    TEXT,
            notes               TEXT,
            created_by_id       INTEGER REFERENCES employees(id),
            created_by_name     TEXT,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_traveler_changes_traveler_id_idx ON p2_traveler_changes(traveler_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_traveler_changes_item_id_idx ON p2_traveler_changes(serialized_item_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_traveler_changes_status_idx ON p2_traveler_changes(status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS p2_traveler_changes_category_idx ON p2_traveler_changes(change_category)`);

        console.log('✅ Ensured p2_production_changes and p2_traveler_changes tables exist');
      } catch (p2ChangesErr: any) {
        console.warn('⚠️ p2 changes tables migration:', p2ChangesErr?.message);
      }

      // Ensure admin_audit_log has reason column (added for audit wrapper)
      try {
        await pool.query(`ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS reason TEXT`);
        console.log('✅ Ensured admin_audit_log has reason column');
      } catch (auditReasonErr: any) {
        console.warn('⚠️ admin_audit_log reason column migration:', auditReasonErr?.message);
      }

      // Ensure punch_events has approved column (pay period approval system)
      try {
        await pool.query(`ALTER TABLE punch_events ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false`);
        console.log('✅ Ensured punch_events has approved column');
      } catch (punchApprovedErr: any) {
        console.warn('⚠️ punch_events approved column migration:', punchApprovedErr?.message);
      }

      // Ensure work_buckets table exists and is seeded (work bucket tracking)
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS work_buckets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        const existing = await pool.query(`SELECT COUNT(*) AS cnt FROM work_buckets`);
        if (parseInt(existing[0]?.cnt ?? '0', 10) === 0) {
          await pool.query(`
            INSERT INTO work_buckets (name, type) VALUES
              ('Production - Stocks', 'DIRECT'),
              ('Production - Aerospace', 'DIRECT'),
              ('CNC Work', 'DIRECT'),
              ('Layup Work', 'DIRECT'),
              ('Finishing', 'DIRECT'),
              ('Admin', 'INDIRECT'),
              ('Training / Idle', 'NON_WORK')
          `);
        }
        console.log('✅ Ensured work_buckets table exists with seed data');
      } catch (workBucketsErr: any) {
        console.warn('⚠️ work_buckets migration:', workBucketsErr?.message);
      }

      // Ensure punch_events has work_bucket_id column
      try {
        await pool.query(`ALTER TABLE punch_events ADD COLUMN IF NOT EXISTS work_bucket_id UUID REFERENCES work_buckets(id)`);
        console.log('✅ Ensured punch_events has work_bucket_id column');
      } catch (workBucketIdErr: any) {
        console.warn('⚠️ punch_events work_bucket_id migration:', workBucketIdErr?.message);
      }

      // Ensure punch_events has job_id column (FK to production_orders)
      try {
        await pool.query(`ALTER TABLE punch_events ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES production_orders(id)`);
        console.log('✅ Ensured punch_events has job_id column');
      } catch (jobIdErr: any) {
        console.warn('⚠️ punch_events job_id migration:', jobIdErr?.message);
      }

      // Ensure employees has labor_rate column for job cost calculation
      try {
        await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS labor_rate NUMERIC`);
        console.log('✅ Ensured employees has labor_rate column');
      } catch (lrErr: any) {
        console.warn('⚠️ employees labor_rate migration:', lrErr?.message);
      }


      // Seed default health check types and config if not present
      const { seedDefaultHealthCheckTypes, seedDefaultHealthCheckConfig, ensureSmsHealthCheckExists, ensureTrackingPipelineHealthCheckExists } = await import('./utils/healthCheckService');
      await seedDefaultHealthCheckTypes();
      await seedDefaultHealthCheckConfig();
      await ensureSmsHealthCheckExists();
      await ensureTrackingPipelineHealthCheckExists();

      // Ensure P2 Nonconforming Dispositions and RMAs tables exist
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS p2_nonconforming_dispositions (
            id SERIAL PRIMARY KEY,
            serialized_item_id UUID NOT NULL REFERENCES p2_serialized_items(id) ON DELETE CASCADE,
            disposition_type TEXT NOT NULL,
            po_id INTEGER REFERENCES p2_purchase_orders(id),
            po_number TEXT,
            auth_person TEXT NOT NULL,
            part_number TEXT NOT NULL,
            serial_number TEXT NOT NULL,
            disposition_date DATE NOT NULL,
            reason_type TEXT NOT NULL,
            reason_other TEXT,
            notes TEXT,
            resolved BOOLEAN NOT NULL DEFAULT FALSE,
            resolved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS p2_rmas (
            id SERIAL PRIMARY KEY,
            disposition_id INTEGER NOT NULL REFERENCES p2_nonconforming_dispositions(id) ON DELETE CASCADE,
            serialized_item_id UUID NOT NULL REFERENCES p2_serialized_items(id) ON DELETE CASCADE,
            rma_number TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'open',
            traceable_materials JSONB NOT NULL DEFAULT '[]',
            shipped_at TIMESTAMP,
            completed_at TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        // Add scrap-rate tracking columns to p2_purchase_orders if not yet present
        await pool.query(`
          ALTER TABLE p2_purchase_orders
          ADD COLUMN IF NOT EXISTS scrapped_item_count INTEGER NOT NULL DEFAULT 0
        `);
        await pool.query(`
          ALTER TABLE p2_purchase_orders
          ADD COLUMN IF NOT EXISTS scrap_rate_percent REAL NOT NULL DEFAULT 0
        `);
        await pool.query(`
          ALTER TABLE p2_purchase_orders
          ADD COLUMN IF NOT EXISTS project_name TEXT
        `);
        console.log('✅ Ensured p2_nonconforming_dispositions and p2_rmas tables exist');
      } catch (ncErr: any) {
        console.warn('⚠️ p2_nonconforming_dispositions/p2_rmas migration:', ncErr?.message);
      }

      // Ensure schema governance audit log table exists
      try {
        const { sql: sqlGov } = await import('drizzle-orm');
        await db.execute(sqlGov`
          CREATE TABLE IF NOT EXISTS schema_change_log (
            id          SERIAL PRIMARY KEY,
            timestamp   TIMESTAMP NOT NULL DEFAULT NOW(),
            actor       TEXT NOT NULL,
            action_type TEXT NOT NULL,
            table_name  TEXT NOT NULL,
            column_name TEXT,
            before_state JSONB,
            after_state  JSONB,
            approved_by  TEXT,
            override_reason TEXT
          )
        `);
        await db.execute(sqlGov`CREATE INDEX IF NOT EXISTS idx_schema_change_log_timestamp ON schema_change_log (timestamp DESC)`);
        // Idempotently expand the CHECK constraint to allow all known action_type values
        await db.execute(sqlGov`
          DO $$
          BEGIN
            ALTER TABLE schema_change_log
              DROP CONSTRAINT IF EXISTS schema_change_log_action_type_check;
            ALTER TABLE schema_change_log
              ADD CONSTRAINT schema_change_log_action_type_check
              CHECK (action_type IN (
                'ADD_COLUMN','DROP_COLUMN','DROP_TABLE','ALTER_COLUMN',
                'CREATE_TABLE','RAW_SQL','OVERRIDE','BOOT_MIGRATION','PRE_DEPLOY_MIGRATION'
              ));
          EXCEPTION WHEN OTHERS THEN NULL;
          END $$
        `);
        console.log('✅ Ensured schema_change_log governance table exists');
      } catch (govErr: any) {
        console.warn('⚠️ schema_change_log migration skipped:', govErr?.message);
      }

      // ── Order Activity Events (canonical audit ledger) ──────────────────────
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS order_activity_events (
            id                  SERIAL PRIMARY KEY,
            order_id            TEXT NOT NULL,
            event_type          TEXT NOT NULL,
            event_category      TEXT NOT NULL,
            occurred_at         TIMESTAMP NOT NULL DEFAULT NOW(),
            actor_id            INTEGER,
            actor_type          TEXT,
            actor_display_name  TEXT,
            source              TEXT NOT NULL DEFAULT 'server',
            source_route        TEXT,
            correlation_id      TEXT,
            reason_code         TEXT,
            reason_text         TEXT,
            before_snapshot     JSONB,
            after_snapshot      JSONB,
            field_diff          JSONB,
            status_from         TEXT,
            status_to           TEXT,
            department_from     TEXT,
            department_to       TEXT,
            related_entity_type TEXT,
            related_entity_id   TEXT,
            metadata            JSONB,
            created_at          TIMESTAMP DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_order_id_idx       ON order_activity_events(order_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_event_type_idx     ON order_activity_events(event_type)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_event_category_idx ON order_activity_events(event_category)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_occurred_at_idx    ON order_activity_events(occurred_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_actor_id_idx       ON order_activity_events(actor_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_source_idx         ON order_activity_events(source)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_order_occurred_idx ON order_activity_events(order_id, occurred_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS oae_correlation_id_idx ON order_activity_events(correlation_id)`);
        console.log('✅ Ensured order_activity_events canonical audit ledger exists');
      } catch (oaeErr: any) {
        console.warn('⚠️ order_activity_events migration skipped:', oaeErr?.message);
      }

      // Ensure CNC Dashboard tables exist
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_jobs (
            id SERIAL PRIMARY KEY,
            work_order TEXT NOT NULL,
            part_number TEXT NOT NULL,
            part_name TEXT NOT NULL,
            revision TEXT,
            qty INTEGER NOT NULL DEFAULT 1,
            machine TEXT,
            programmer_user_id INTEGER,
            programmer_display_name TEXT,
            assigned_operator_user_id INTEGER,
            assigned_operator_display_name TEXT,
            due_date DATE,
            estimated_hours REAL,
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'queued',
            linked_traveler_id TEXT,
            material_ready BOOLEAN NOT NULL DEFAULT FALSE,
            qc_hold BOOLEAN NOT NULL DEFAULT FALSE,
            notes TEXT,
            forward_destination TEXT,
            completed_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_job_operations (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES cnc_jobs(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL DEFAULT 10,
            op_name TEXT NOT NULL,
            machine TEXT,
            estimated_setup_minutes REAL,
            estimated_cycle_minutes REAL,
            status TEXT NOT NULL DEFAULT 'pending',
            nc_program_ref TEXT,
            qc_plan TEXT,
            fixture TEXT,
            work_ref_point TEXT,
            raw_stock_orientation TEXT,
            datum_notes TEXT,
            warmup_notes TEXT,
            tribal_knowledge TEXT,
            actual_setup_start_at TIMESTAMP,
            actual_setup_end_at TIMESTAMP,
            actual_run_start_at TIMESTAMP,
            actual_run_end_at TIMESTAMP,
            part_count INTEGER NOT NULL DEFAULT 0,
            scrap_qty INTEGER NOT NULL DEFAULT 0,
            pause_reason TEXT,
            claimed_by_user_id INTEGER,
            claimed_by_display_name TEXT,
            signed_off_by_user_id INTEGER,
            signed_off_by_display_name TEXT,
            operator_notes TEXT,
            completed_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_programs (
            id SERIAL PRIMARY KEY,
            operation_id INTEGER NOT NULL REFERENCES cnc_job_operations(id) ON DELETE CASCADE,
            program_name TEXT NOT NULL,
            program_number TEXT,
            version TEXT,
            machine TEXT,
            estimated_cycle_minutes REAL,
            prove_out_required BOOLEAN NOT NULL DEFAULT FALSE,
            approved_by_user_id INTEGER,
            approved_by_display_name TEXT,
            approved_at TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_tool_lists (
            id SERIAL PRIMARY KEY,
            operation_id INTEGER NOT NULL REFERENCES cnc_job_operations(id) ON DELETE CASCADE,
            tool_number TEXT NOT NULL,
            holder_position TEXT,
            tool_name TEXT NOT NULL,
            diameter REAL,
            offset_notes TEXT,
            replacement_notes TEXT,
            image_url TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_setup_photos (
            id SERIAL PRIMARY KEY,
            operation_id INTEGER NOT NULL REFERENCES cnc_job_operations(id) ON DELETE CASCADE,
            category TEXT NOT NULL DEFAULT 'Workholding',
            url TEXT NOT NULL,
            storage_key TEXT,
            caption TEXT,
            uploaded_by_user_id INTEGER,
            uploaded_by_display_name TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_qc_checkpoints (
            id SERIAL PRIMARY KEY,
            operation_id INTEGER NOT NULL REFERENCES cnc_job_operations(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            characteristic TEXT,
            nominal TEXT,
            tolerance TEXT,
            method TEXT,
            frequency TEXT,
            required BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_qc_results (
            id SERIAL PRIMARY KEY,
            checkpoint_id INTEGER NOT NULL REFERENCES cnc_qc_checkpoints(id) ON DELETE CASCADE,
            operation_id INTEGER NOT NULL REFERENCES cnc_job_operations(id) ON DELETE CASCADE,
            result TEXT NOT NULL,
            measured_value TEXT,
            notes TEXT,
            recorded_by_user_id INTEGER,
            recorded_by_display_name TEXT,
            recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        // Add columns that may be missing from initial table creation
        await pool.query(`ALTER TABLE cnc_jobs ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER`);
        await pool.query(`ALTER TABLE cnc_jobs ADD COLUMN IF NOT EXISTS created_by_display_name TEXT`);
        await pool.query(`ALTER TABLE cnc_jobs ADD COLUMN IF NOT EXISTS customer_po TEXT`);
        await pool.query(`ALTER TABLE cnc_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
        await pool.query(`ALTER TABLE cnc_job_operations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
        await pool.query(`ALTER TABLE cnc_programs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
        await pool.query(`ALTER TABLE cnc_tool_lists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
        await pool.query(`ALTER TABLE cnc_qc_checkpoints ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
        await pool.query(`ALTER TABLE cnc_qc_results ADD COLUMN IF NOT EXISTS photo_url TEXT`);
        await pool.query(`ALTER TABLE cnc_jobs ADD COLUMN IF NOT EXISTS customer_po TEXT`);
        // Phase 2 migrations
        await pool.query(`ALTER TABLE cnc_job_operations ADD COLUMN IF NOT EXISTS op_description TEXT`);
        await pool.query(`ALTER TABLE cnc_job_operations ADD COLUMN IF NOT EXISTS standard_labor_minutes INTEGER`);
        await pool.query(`ALTER TABLE cnc_job_operations ADD COLUMN IF NOT EXISTS proveout_completed BOOLEAN NOT NULL DEFAULT FALSE`);
        await pool.query(`ALTER TABLE cnc_qc_checkpoints ADD COLUMN IF NOT EXISTS photo_required BOOLEAN NOT NULL DEFAULT FALSE`);
        await pool.query(`ALTER TABLE cnc_qc_checkpoints ADD COLUMN IF NOT EXISTS signature_required BOOLEAN NOT NULL DEFAULT FALSE`);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_time_logs (
            id SERIAL PRIMARY KEY,
            operation_id INTEGER NOT NULL REFERENCES cnc_job_operations(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
            reason TEXT,
            created_by_user_id INTEGER,
            created_by_display_name TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS cnc_time_logs_op_idx ON cnc_time_logs(operation_id)`);
        // Phase 3 migrations
        await pool.query(`
          CREATE TABLE IF NOT EXISTS cnc_machines (
            id SERIAL PRIMARY KEY,
            machine_name TEXT NOT NULL,
            machine_number TEXT,
            work_center TEXT,
            capabilities JSONB,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        // Seed default machines if table is empty
        await pool.query(`
          INSERT INTO cnc_machines (machine_name, machine_number, work_center, active)
          SELECT t.machine_name, t.machine_number, t.work_center, true
          FROM (VALUES
            ('Haas VF-2', 'VF2-001', 'Mill'),
            ('Haas VF-4', 'VF4-001', 'Mill'),
            ('Haas ST-20', 'ST20-001', 'Lathe'),
            ('Haas ST-30', 'ST30-001', 'Lathe'),
            ('Mazak Integrex', 'INT-001', 'Turn-Mill'),
            ('Okuma Genos M560', 'GEN-001', 'Mill')
          ) AS t(machine_name, machine_number, work_center)
          WHERE NOT EXISTS (SELECT 1 FROM cnc_machines LIMIT 1)
        `);
        await pool.query(`ALTER TABLE cnc_jobs ADD COLUMN IF NOT EXISTS linked_traveler_step_id TEXT`);

        // ── T3: FK constraints (NOT VALID = skip validation of existing rows) ──
        await pool.query(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_cnc_jobs_traveler'
                AND table_name = 'cnc_jobs'
            ) THEN
              ALTER TABLE cnc_jobs
                ADD CONSTRAINT fk_cnc_jobs_traveler
                FOREIGN KEY (linked_traveler_id)
                REFERENCES travelers(id) ON DELETE SET NULL NOT VALID;
            END IF;
          END $$;
        `);
        await pool.query(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_cnc_jobs_traveler_step'
                AND table_name = 'cnc_jobs'
            ) THEN
              ALTER TABLE cnc_jobs
                ADD CONSTRAINT fk_cnc_jobs_traveler_step
                FOREIGN KEY (linked_traveler_step_id)
                REFERENCES traveler_steps(id) ON DELETE SET NULL NOT VALID;
            END IF;
          END $$;
        `);

        // ── T4: Add source linkage columns to manufacturing_queue ──────────
        await pool.query(`ALTER TABLE manufacturing_queue ADD COLUMN IF NOT EXISTS source_id TEXT`);
        await pool.query(`ALTER TABLE manufacturing_queue ADD COLUMN IF NOT EXISTS source_type TEXT`);

        // ── T4b: UNIQUE constraint so ON CONFLICT (source_type, source_id) works ──
        await pool.query(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'uq_manufacturing_queue_source'
                AND table_name = 'manufacturing_queue'
            ) THEN
              ALTER TABLE manufacturing_queue
                ADD CONSTRAINT uq_manufacturing_queue_source
                UNIQUE (source_type, source_id);
            END IF;
          END $$;
        `);

        // ── T5: Add preferred_machine column to part_routings ──────────────
        await pool.query(`ALTER TABLE part_routings ADD COLUMN IF NOT EXISTS preferred_machine TEXT`);

        console.log('✅ Ensured CNC Dashboard tables exist');
      } catch (cncErr: any) {
        console.warn('⚠️ CNC Dashboard migration skipped:', cncErr?.message);
      }
    }

    // ── T7: CNC ↔ Traveler sync — every 30 minutes ────────────────────────────
    // Recovery net: creates CNC jobs for any IN_PROGRESS CNC steps that missed
    // the real-time hook (e.g. server was down when step was started).
    cron.schedule('*/30 * * * *', async () => {
      try {
        const result = await pool.query(`
          SELECT
            ts.id        AS step_id,
            ts.traveler_id,
            t.part_number,
            t.part_name,
            t.work_order_id,
            t.sales_order_id,
            t.quantity,
            ao.due_date     AS order_due_date,
            ao.customer_po  AS order_customer_po
          FROM traveler_steps ts
          JOIN travelers t ON t.id = ts.traveler_id
          LEFT JOIN all_orders ao ON ao.order_id = t.sales_order_id
          WHERE LOWER(ts.department_name) LIKE '%cnc%'
            AND ts.status = 'IN_PROGRESS'
            AND NOT EXISTS (
              SELECT 1 FROM cnc_jobs j WHERE j.linked_traveler_step_id = ts.id
            )
        `);
        const syncRows = Array.isArray(result) ? result : (result.rows ?? []);
        if (syncRows.length === 0) return;

        console.log(`[CNC Scheduler] ${syncRows.length} CNC step(s) missing jobs — auto-creating…`);
        const { storage: cncStorage } = await import('./storage');
        const { createManufacturingQueueEntryForCncJob } = await import('./src/lib/cncMq');
        for (const row of syncRows) {
          const dueDate = row.order_due_date
            ? new Date(row.order_due_date).toISOString().split('T')[0]
            : null;
          const job = await cncStorage.createCncJob({
            workOrder: row.work_order_id ?? row.sales_order_id ?? 'AUTO',
            partNumber: row.part_number ?? 'UNKNOWN',
            partName: row.part_name ?? 'From Traveler',
            qty: row.quantity ?? 1,
            dueDate: dueDate ?? undefined,
            customerPo: row.order_customer_po ?? undefined,
            priority: 'medium',
            status: 'queued',
            linkedTravelerId: row.traveler_id,
            linkedTravelerStepId: row.step_id,
            createdByDisplayName: 'CNC Scheduler',
          });
          await createManufacturingQueueEntryForCncJob(job);
          console.log(`[CNC Scheduler] Created job ${job.id} for step ${row.step_id}`);
        }
      } catch (err: any) {
        console.warn('[CNC Scheduler] Sync failed:', err?.message);
      }
    });

    // Set up quarterly vendor evaluation reset (runs on Jan 1, Apr 1, Jul 1, Oct 1)
    cron.schedule('1 0 1 1,4,7,10 *', async () => {
      try {
        console.log('🔄 Running quarterly vendor evaluation reset...');
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
    
    console.log('📅 Quarterly vendor evaluation reset scheduled (Jan 1, Apr 1, Jul 1, Oct 1 at 12:01 AM)');

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

    // Start model stats aggregator (rebuilds model-department cycle time stats every 4 hours)
    try {
      const { startModelStatsAggregator } = await import('./services/modelStatsAggregator');
      startModelStatsAggregator();
    } catch (aggErr: any) {
      console.warn('⚠️ Model stats aggregator failed to start:', aggErr.message);
    }

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

    cron.schedule('0 2 * * *', async () => {
      try {
        const { rebuildModelDepartmentStats } = await import('./src/services/cycleTimeLearning');
        const report = await rebuildModelDepartmentStats();
        console.log(`[CycleTimeLearning] Nightly rebuild: ${report.statsInserted + report.statsUpdated} stats, ${report.anomaliesDetected.length} anomalies, ${report.durationMs}ms`);
      } catch (err) {
        console.error('[CycleTimeLearning] Nightly rebuild failed:', err);
      }
    });
    console.log('🧠 Nightly cycle time learning rebuild scheduled (every day at 2:00 AM)');

    // Queue integrity background monitor
    try {
      const { startQueueIntegrityService } = await import('./src/services/queueIntegrityService');
      startQueueIntegrityService();
    } catch (svcError) {
      console.warn('⚠️ Queue integrity service failed to start:', svcError);
    }

    // Pre-warm the production simulation cache so the first page load is instant
    try {
      const { runSimulation } = await import('./src/services/productionSimulator');
      runSimulation().then(() => {
        console.log('✅ Production simulation cache pre-warmed');
      }).catch((err) => {
        console.warn('⚠️ Production simulation cache pre-warm failed:', err);
      });
    } catch (warmErr) {
      console.warn('⚠️ Could not import productionSimulator for pre-warm:', warmErr);
    }
  } catch (error) {
    console.error('Error initializing background services:', error);
  }
}
