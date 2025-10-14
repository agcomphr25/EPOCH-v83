const fs = require('fs'), path = require('path');
const must = [
  'attached_assets/training/AS9100.pdf',
  'attached_assets/training/README.md',
];
const missing = must.filter(p => !fs.existsSync(path.join(process.cwd(), p)));
if (missing.length) {
  console.error('Missing training assets:', missing);
  process.exit(1);
}
process.exit(0);
