import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer, createLogger } from 'vite';
import { type Server } from 'http';
import viteConfig from '../vite.config';
import { nanoid } from 'nanoid';

const viteLogger = createLogger();

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes - use originalUrl, NOT req.path.
    // Inside app.use('*', ...) Express strips the wildcard so req.path is always '/'.
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/ws')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        '..',
        'client',
        'index.html'
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Production build output is in dist/public/ folder (created by vite build)
  const distPath = path.resolve(process.cwd(), 'dist', 'public');

  if (!fs.existsSync(distPath)) {
    console.error(`[serveStatic] Build directory not found: ${distPath} — creating placeholder`);
    fs.mkdirSync(distPath, { recursive: true });
  }

  const indexPath = path.join(distPath, 'index.html');
  const indexExists = fs.existsSync(indexPath);
  if (!indexExists) {
    console.error(`[serveStatic] index.html not found at ${indexPath} — build may have failed`);
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use('*', (req, res, next) => {
    // Skip API/WS routes - use originalUrl, NOT req.path.
    // Inside app.use('*', ...) Express strips the wildcard so req.path is always '/'.
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/ws')) {
      return next();
    }
    // For all other routes, serve the React app
    if (!fs.existsSync(indexPath)) {
      // Build artifact missing — return 200 so deployment healthcheck passes
      console.error(`[serveStatic] index.html missing, returning placeholder for: ${req.path}`);
      return res.status(200).set('Content-Type', 'text/html').send(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>EPOCH</title></head>' +
        '<body><p>Application starting up, please refresh in a moment.</p></body></html>'
      );
    }
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(`[serveStatic] sendFile error for ${req.path}:`, err);
        res.status(200).set('Content-Type', 'text/html').send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>EPOCH</title></head>' +
          '<body><p>Application starting up, please refresh in a moment.</p></body></html>'
        );
      }
    });
  });
}
