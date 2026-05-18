import express from 'express';
import { getStorageErrorResponse, uploadSupabaseObjectFromSignedToken } from '../services/fileStorageProvider';

const router = express.Router();

const uploadLimit = process.env.FILE_UPLOAD_MAX_BYTES || '100mb';

router.put('/upload', express.raw({ type: '*/*', limit: uploadLimit }), async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!token) {
      return res.status(400).json({ error: 'Missing upload token', reason: 'missing_upload_token' });
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const objectPath = await uploadSupabaseObjectFromSignedToken(token, body, req.get('content-type') || undefined);
    res.json({ objectPath });
  } catch (error) {
    const { status, reason, message } = getStorageErrorResponse(error);
    console.error('[storage/upload] Upload failed:', { reason, message, status });
    res.status(status).json({
      error: status === 403 ? 'Upload token rejected' : 'Failed to upload file',
      reason,
      details: message,
    });
  }
});

export default router;
