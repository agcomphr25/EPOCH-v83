import { db } from '../../db';
import { mediaLibrary } from '../../schema';

export interface RegisterMediaLibraryFileInput {
  filename: string;
  storagePath: string;
  mimeType?: string | null;
  fileSize?: number | null;
  folderId?: string | null;
  capturedById?: number | null;
  capturedByName?: string | null;
  title?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  category?: string | null;
}

export async function registerMediaLibraryFile(input: RegisterMediaLibraryFileInput) {
  const [media] = await db.insert(mediaLibrary).values({
    filename: input.filename,
    storagePath: input.storagePath,
    mimeType: input.mimeType || 'application/octet-stream',
    fileSize: input.fileSize || 0,
    folderId: input.folderId || null,
    capturedById: input.capturedById || null,
    capturedByName: input.capturedByName || 'Unknown',
    title: input.title || input.filename,
    notes: input.notes || null,
    tags: input.tags || [],
    category: input.category || 'other',
  }).returning();

  return media;
}

