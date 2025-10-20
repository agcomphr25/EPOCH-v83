import express, { type Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { registerRoutes } from './src/routes/index';
import { setupVite, serveStatic, log } from './vite';
import { db } from './db';

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

const app = express();

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
// In production, assets are copied to dist/attached_assets
// In development, assets are in the root attached_assets folder
const assetsPath =
  process.env.NODE_ENV === 'production'
    ? path.join(import.meta.dirname, 'attached_assets')
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
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

// Also add express.static as fallback
app.use('/attached_assets', express.static(assetsPath));

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
    // Test database connection first
    const { testDatabaseConnection } = await import('./db');
    const dbConnected = await testDatabaseConnection();

    if (!dbConnected) {
      console.error(
        'Failed to connect to database. Server may not function properly.'
      );
    }

    // Set up monthly vendor evaluation reset
    // Runs at 00:01 (12:01 AM) on the 1st day of every month
    cron.schedule('1 0 1 * *', async () => {
      try {
        console.log('🔄 Running monthly vendor evaluation reset...');
        const { vendors } = await import('./schema');
        const { eq } = await import('drizzle-orm');
        
        // Reset all vendor evaluation statuses
        const result = await db
          .update(vendors)
          .set({
            evaluated: false,
            evaluationDate: null,
          })
          .returning();
        
        console.log(`✅ Monthly reset complete. Reset ${result.length} vendors.`);
      } catch (error) {
        console.error('❌ Failed to reset vendor evaluations:', error);
      }
    });
    
    console.log('📅 Monthly vendor evaluation reset scheduled (1st of each month at 12:01 AM)');

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal Server Error';

      // Enhanced error logging
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

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get('env') === 'development') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Add debug endpoint to help diagnose deployment issues
    app.get('/debug-test', (req, res) => {
      res.sendFile(path.join(__dirname, '../debug-deployment.html'));
    });

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen(
      {
        port,
        host: '0.0.0.0',
        reusePort: true,
      },
      () => {
        console.log(`Server started successfully`);
        console.log(`- Port: ${port}`);
        console.log(`- Host: 0.0.0.0`);
        console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(
          `- Server accessible at: https://${process.env.REPL_ID || 'localhost'}.${process.env.REPL_OWNER || 'local'}.repl.co`
        );
        log(`serving on port ${port}`);
      }
    );
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();
