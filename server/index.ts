import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./src/routes/index";
import { setupVite, serveStatic, log } from "./vite";

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
}

// Log available environment variables (without values for security)
console.log('Environment check:', {
  DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Missing',
  NODE_ENV: process.env.NODE_ENV || 'Not set',
  PORT: process.env.PORT || 'Not set (defaulting to 5000)'
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Test database connection first
    const { testDatabaseConnection } = await import("./db");
    const dbConnected = await testDatabaseConnection();
    
    if (!dbConnected) {
      console.error("Failed to connect to database. Server may not function properly.");
    }
    
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

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
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
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
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      console.log(`Server started successfully`);
      console.log(`- Port: ${port}`);
      console.log(`- Host: 0.0.0.0`);
      console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`- Server accessible at: https://${process.env.REPL_ID || 'localhost'}.${process.env.REPL_OWNER || 'local'}.repl.co`);
      log(`serving on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();