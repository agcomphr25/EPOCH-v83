import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
const employeeDocsDir = path.join(uploadsDir, 'employee-documents');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(employeeDocsDir)) {
  fs.mkdirSync(employeeDocsDir, { recursive: true });
}

// Configure multer for employee document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, employeeDocsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random hash
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${timestamp}_${hash}_${name}${ext}`);
  }
});

// File filter for allowed document types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: PDF, Word, Excel, Images, Text files.`));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per upload
  }
});

// Helper function to get file info
export function getFileInfo(file: Express.Multer.File) {
  return {
    fileName: file.filename,
    originalFileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    filePath: file.path
  };
}

// Helper function to delete uploaded file
export function deleteUploadedFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

// Get file URL for serving
export function getFileUrl(req: any, fileName: string): string {
  return `${req.protocol}://${req.get('host')}/api/files/employee-documents/${fileName}`;
}

// Validate employee access to document
export function validateEmployeeDocumentAccess(
  userType: string, 
  userEmployeeId: number | undefined, 
  documentEmployeeId: number
): boolean {
  // Admins can access all documents
  if (userType === 'ADMIN') {
    return true;
  }
  
  // Employees can only access their own documents
  return userEmployeeId === documentEmployeeId;
}

// Get document type from filename or mimetype
export function getDocumentType(originalName: string, mimeType: string): string {
  const name = originalName.toLowerCase();
  
  if (name.includes('certificate') || name.includes('cert')) {
    return 'CERTIFICATE';
  } else if (name.includes('handbook') || name.includes('manual')) {
    return 'HANDBOOK';
  } else if (name.includes('contract') || name.includes('agreement')) {
    return 'CONTRACT';
  } else if (name.includes('id') || name.includes('identification')) {
    return 'ID';
  } else if (name.includes('resume') || name.includes('cv')) {
    return 'RESUME';
  } else if (name.includes('training')) {
    return 'TRAINING';
  } else if (mimeType.startsWith('image/')) {
    return 'IMAGE';
  } else {
    return 'OTHER';
  }
}