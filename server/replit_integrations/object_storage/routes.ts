import type { Express, Request, Response } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { canAccessObject, ObjectPermission } from "./objectAcl";
import { pool } from "../../db";
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
  isSupabaseObjectPath,
} from "../../src/services/fileStorageProvider";

/**
 * Register object storage routes for file uploads.
 *
 * Security model for GET /objects/*:
 * - Vault document paths are blocked entirely — clients must use
 *   GET /api/vault/documents/:id/download which enforces vault ACL.
 *   This ensures CUI/ITAR explicit-grant enforcement cannot be bypassed
 *   by accessing the object path directly, even if the path is somehow known.
 * - Non-vault objects use canAccessObject ACL policy (public or private).
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * POST /api/uploads/request-url — Get a presigned PUT URL for uploading.
   */
  app.post("/api/uploads/request-url", async (req: Request, res: Response) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      const provider = getFileStorageProvider();
      const target = await provider.createUploadTarget({
        fileName: name,
        contentType,
        scope: "uploads",
      });

      res.json({
        uploadURL: target.uploadURL,
        objectPath: target.objectPath,
        provider: target.provider,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      const err = error as { status?: number; reason?: string; message?: string };
      console.error(
        "[uploads/request-url] Error generating upload URL:",
        err?.message ?? error,
        err?.status ? `(sidecar status ${err.status})` : ""
      );
      const { status, reason, message } = getStorageErrorResponse(error);
      const httpStatus = status === 401 || status === 403 ? 503 : status;
      res.status(httpStatus).json({
        error: "Failed to generate upload URL",
        reason,
        details: message,
      });
    }
  });

  /**
   * GET /api/uploads/diagnostics - Summarize upload storage health without exposing secrets.
   */
  app.get("/api/uploads/diagnostics", async (_req: Request, res: Response) => {
    const configuredProvider = process.env.FILE_STORAGE_PROVIDER || null;
    const hasSupabaseConfig = Boolean(
      process.env.SUPABASE_URL &&
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) &&
        (process.env.SUPABASE_STORAGE_BUCKET || process.env.FILE_STORAGE_BUCKET)
    );
    const hasReplitPrivateDir = Boolean(process.env.PRIVATE_OBJECT_DIR);
    const provider = getFileStorageProvider();

    try {
      const target = await provider.createUploadTarget({
        fileName: "diagnostic.txt",
        contentType: "text/plain",
        scope: "diagnostics",
        entityId: "healthcheck",
      });

      res.json({
        ok: true,
        provider: provider.name,
        configuredProvider,
        hasSupabaseConfig,
        hasReplitPrivateDir,
        canCreateUploadTarget: true,
        targetProvider: target.provider,
        objectPathPrefix: target.objectPath.split("/").slice(0, 4).join("/"),
      });
    } catch (error) {
      const { status, reason, message } = getStorageErrorResponse(error);
      res.status(status === 401 || status === 403 ? 503 : status).json({
        ok: false,
        provider: provider.name,
        configuredProvider,
        hasSupabaseConfig,
        hasReplitPrivateDir,
        canCreateUploadTarget: false,
        reason,
        details: message,
      });
    }
  });

  /**
   * GET /objects/:objectPath(*) — Serve stored objects with ACL enforcement.
   *
   * Vault document paths are blocked — use /api/vault/documents/:id/download instead.
   * Non-vault objects: canAccessObject checks the stored ACL policy.
   *   - Public objects are served to any caller.
   *   - Private objects require the caller's userId to match the ACL.
   */
  app.get("/objects/:objectPath(*)", async (req: Request, res: Response) => {
    try {
      // Block vault document paths — force use of /api/vault/documents/:id/download
      const vaultRows = await pool.query(
        "SELECT 1 FROM vault_documents WHERE object_path = $1 LIMIT 1",
        [req.path]
      );
      if ((vaultRows as any[]).length > 0) {
        return res.status(403).json({
          error: "Vault documents must be accessed via /api/vault/documents/:id/download",
          reason: "vault_controlled",
        });
      }

      const user = (req as any).user;
      if (isSupabaseObjectPath(req.path)) {
        await getFileStorageProviderForObjectPath(req.path).downloadObject(req.path, res);
        return;
      }

      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      const allowed = await canAccessObject({
        userId: user ? String(user.id) : undefined,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });

      if (!allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      if (!res.headersSent) {
        if (isStorageUnavailableError(error)) {
          return res.status(503).json({ error: "Storage temporarily unavailable, please try again later" });
        }
        return res.status(500).json({ error: "Failed to serve object" });
      }
    }
  });
}

function isStorageUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string | number; message?: string };
  const transientCodes = [503, "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "UNAVAILABLE"];
  if (err.code !== undefined && transientCodes.includes(err.code as string)) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("unavailable") ||
    msg.includes("service unavailable") ||
    msg.includes("connection refused")
  );
}
