import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          const status = isTransientStorageError(err) ? 503 : 500;
          const message = status === 503
            ? "Storage temporarily unavailable, please try again later"
            : "Error streaming file";
          res.status(status).json({ error: message });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        const status = isTransientStorageError(error) ? 503 : 500;
        const message = status === 503
          ? "Storage temporarily unavailable, please try again later"
          : "Error downloading file";
        res.status(status).json({ error: message });
      }
    }
  }

  // Gets a presigned GET URL for downloading an object after server-side ACL check.
  async getObjectEntityDownloadURL(file: File, ttlSec: number = 900): Promise<string> {
    return signObjectURL({
      bucketName: file.bucket.name,
      objectName: file.name,
      method: "GET",
      ttlSec,
    });
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  // Uploads a buffer to object storage and returns the normalized path
  async uploadBuffer(buffer: Buffer, filename: string, contentType: string = 'application/octet-stream', prefix: string = 'pdf-templates'): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      if (!privateObjectDir) {
        throw new Error('PRIVATE_OBJECT_DIR not set');
      }

      const objectId = randomUUID();
      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fullPath = `${privateObjectDir}/${prefix}/${objectId}-${safeFilename}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(buffer, {
        contentType,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });

      // Return normalized path that can be used with getObjectEntityFile
      return `/objects/${prefix}/${objectId}-${safeFilename}`;
    } catch (error) {
      console.error('[ObjectStorage] Error uploading buffer:', error);
      throw error;
    }
  }

  // Deletes an object from storage by its /objects/... path (best-effort, does not throw)
  async deleteByStoragePath(storagePath: string): Promise<void> {
    try {
      const file = await this.getObjectEntityFile(storagePath);
      await file.delete();
    } catch (err) {
      console.warn('[ObjectStorage] deleteByStoragePath — object may already be gone:', err instanceof Error ? err.message : err);
    }
  }

  // Downloads an object as a buffer by storage path
  async downloadAsBuffer(storagePath: string): Promise<Buffer> {
    try {
      // Handle both /objects/ paths and direct bucket paths
      let objectFile: File;
      
      if (storagePath.startsWith('/objects/')) {
        objectFile = await this.getObjectEntityFile(storagePath);
      } else {
        // Direct path format: /bucket-name/path/to/file
        const { bucketName, objectName } = parseObjectPath(storagePath);
        const bucket = objectStorageClient.bucket(bucketName);
        objectFile = bucket.file(objectName);
        
        const [exists] = await objectFile.exists();
        if (!exists) {
          throw new ObjectNotFoundError();
        }
      }
      
      const [contents] = await objectFile.download();
      return contents;
    } catch (error) {
      console.error('[ObjectStorage] Error downloading as buffer:', error);
      throw error;
    }
  }
}

function isTransientStorageError(error: unknown): boolean {
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

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // ignore body read failure
    }
    const truncated = body.length > 500 ? `${body.slice(0, 500)}...` : body;
    console.error(
      `[ObjectStorage] signObjectURL failed: status=${response.status} ` +
        `method=${method} bucket=${bucketName} body=${truncated || "<empty>"}`
    );
    const reason =
      response.status === 401 || response.status === 403
        ? "storage signing unauthorized"
        : response.status >= 500
          ? "storage signing service error"
          : "storage signing error";
    const err = new Error(
      `Failed to sign object URL: ${reason} (status ${response.status})`
    );
    (err as any).status = response.status;
    (err as any).reason = reason;
    throw err;
  }

  const data = await response.json() as { signed_url: string };
  return data.signed_url;
}

