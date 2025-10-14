import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const must = [
  'attached_assets/training/AS9100.pdf',
  'attached_assets/training/README.md',
];

const missing = must.filter(p => !fs.existsSync(path.join(rootDir, p)));

if (missing.length) {
  console.error('Missing training assets:', missing);
  process.exit(1);
}

console.log('✅ All required training assets verified');
process.exit(0);
