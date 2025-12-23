import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

interface SourceConfig {
  apiKey: string;
  name: string;
}

function getSourceConfig(source: string): SourceConfig | null {
  const envKey = `PROTEUS_KEY_${source.toUpperCase()}`;
  const apiKey = process.env[envKey];
  
  if (!apiKey) {
    return null;
  }
  
  return { apiKey, name: source };
}

function validateSignature(payload: string, signature: string, apiKey: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

function isTimestampStale(timestamp: string): boolean {
  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  
  if (isNaN(requestTime)) {
    return true;
  }
  
  return Math.abs(now - requestTime) > TIMESTAMP_TOLERANCE_MS;
}

export interface ProteusRequest extends Request {
  proteusSource?: string;
  proteusValidated?: boolean;
}

export function proteusTrustMiddleware(options?: { required?: boolean }) {
  const required = options?.required ?? true;
  
  return (req: ProteusRequest, res: Response, next: NextFunction) => {
    const source = req.headers['x-proteus-source'] as string;
    const signature = req.headers['x-proteus-signature'] as string;
    const timestamp = req.headers['x-proteus-timestamp'] as string;
    
    const isDev = process.env.NODE_ENV === 'development';
    const hasDevBypass = process.env.DEV_PROTEUS_BYPASS === 'true';
    
    if (isDev && hasDevBypass) {
      req.proteusSource = source || 'dev-bypass';
      req.proteusValidated = true;
      console.log(`[Proteus] Dev bypass enabled for request from: ${req.proteusSource}`);
      return next();
    }
    
    if (!source) {
      if (required) {
        console.warn('[Proteus] Missing X-Proteus-Source header');
        return res.status(401).json({ error: 'Missing source header' });
      }
      return next();
    }
    
    if (!signature) {
      if (required) {
        console.warn(`[Proteus] Missing X-Proteus-Signature for source: ${source}`);
        return res.status(401).json({ error: 'Missing signature' });
      }
      return next();
    }
    
    if (!timestamp) {
      console.warn(`[Proteus] Missing X-Proteus-Timestamp for source: ${source}`);
      return res.status(401).json({ error: 'Missing timestamp' });
    }
    
    if (isTimestampStale(timestamp)) {
      console.warn(`[Proteus] Stale timestamp from source: ${source}, timestamp: ${timestamp}`);
      return res.status(401).json({ error: 'Stale request' });
    }
    
    const sourceConfig = getSourceConfig(source);
    if (!sourceConfig) {
      console.warn(`[Proteus] Unknown source: ${source}`);
      return res.status(401).json({ error: 'Unknown source' });
    }
    
    const rawBody = JSON.stringify(req.body);
    const payloadToSign = `${timestamp}:${rawBody}`;
    
    if (!validateSignature(payloadToSign, signature, sourceConfig.apiKey)) {
      console.warn(`[Proteus] Invalid signature from source: ${source}`);
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    req.proteusSource = source;
    req.proteusValidated = true;
    console.log(`[Proteus] Validated request from source: ${source}`);
    
    next();
  };
}

export function generateProteusSignature(payload: object, apiKey: string): { signature: string; timestamp: string } {
  const timestamp = new Date().toISOString();
  const rawBody = JSON.stringify(payload);
  const payloadToSign = `${timestamp}:${rawBody}`;
  
  const signature = crypto
    .createHmac('sha256', apiKey)
    .update(payloadToSign)
    .digest('hex');
  
  return { signature, timestamp };
}
