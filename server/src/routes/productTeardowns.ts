import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { pool } from '../../db';

const router = Router();
const asyncRoute = (handler: any) => (req: any, res: any, next: any) => Promise.resolve(handler(req, res, next)).catch(next);
const uploadDirectory = path.join(process.cwd(), 'uploads', 'product-teardowns');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const teardownSchema = z.object({
  productName: z.string().trim().min(1), modelNumber: z.string().optional(),
  productPartNumber: z.string().optional(), revision: z.string().optional(),
  customer: z.string().optional(), notes: z.string().optional(),
});
const itemSchema = z.object({
  itemName: z.string().trim().min(1), enteredPartNumber: z.string().optional(),
  quantity: z.coerce.number().positive(), assemblyName: z.string().optional(),
  parentAssemblyName: z.string().optional(), physicalLocation: z.string().optional(),
  observationKind: z.enum(['part', 'characteristic']).default('part'),
  characteristicName: z.string().optional(), characteristicValue: z.string().optional(),
  characteristicUnit: z.string().optional(), quantityBasis: z.string().optional(),
  classification: z.enum(['unclassified', 'manufactured', 'purchased', 'feature']).default('unclassified'),
  includeInBomComparison: z.boolean().default(true),
  threadSize: z.string().optional(), length: z.string().optional(), headStyle: z.string().optional(),
  driveStyle: z.string().optional(), materialFinish: z.string().optional(),
  additionalDetails: z.string().optional(), notes: z.string().optional(),
});

const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = new Set(left.split(' ').filter(Boolean));
  const b = new Set(right.split(' ').filter(Boolean));
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size, 1);
}
async function inventoryMatch(name: string, partNumber?: string) {
  const inventory = await pool.query<{ id: number; name: string; ag_part_number: string; description: string | null }>(
    `SELECT id, name, ag_part_number, description FROM inventory_items WHERE COALESCE(is_active, TRUE) = TRUE`
  );
  const wanted = normalize(name);
  const fallbackPart = normalize(partNumber);
  const ranked = inventory.map((row) => {
    const nameScore = Math.max(similarity(wanted, normalize(row.name)), similarity(wanted, normalize(row.description)));
    const partMatch = Boolean(fallbackPart && fallbackPart === normalize(row.ag_part_number));
    return { ...row, score: partMatch ? 1 : nameScore };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.45) return { state: 'not_found', match: null, suggestions: [] };
  const state = best.score >= 0.94 ? 'found' : 'possible';
  return { state, match: best, suggestions: ranked.filter((row) => row.score >= 0.35).slice(0, 5) };
}

router.get('/', asyncRoute(async (_req: any, res: any) => {
  const rows = await pool.query(`SELECT * FROM product_teardowns ORDER BY updated_at DESC`);
  res.json(rows);
}));

router.post('/', asyncRoute(async (req: any, res: any) => {
  const body = teardownSchema.parse(req.body);
  const user = req.user ?? req.session?.user;
  const rows = await pool.query(
    `INSERT INTO product_teardowns (product_name, model_number, product_part_number, revision, customer, notes, created_by_user_id, created_by_display_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [body.productName, body.modelNumber || null, body.productPartNumber || null, body.revision || null,
      body.customer || null, body.notes || null, user?.id ?? null, user?.username ?? 'Admin']
  );
  res.status(201).json(rows[0]);
}));

router.get('/suggestions', asyncRoute(async (_req: any, res: any) => {
  const [names, assemblies, locations, parts, characteristics, units] = await Promise.all([
    pool.query(`SELECT DISTINCT item_name AS value FROM product_teardown_items ORDER BY value`),
    pool.query(`SELECT DISTINCT assembly_name AS value FROM product_teardown_items WHERE assembly_name IS NOT NULL ORDER BY value`),
    pool.query(`SELECT DISTINCT physical_location AS value FROM product_teardown_items WHERE physical_location IS NOT NULL ORDER BY value`),
    pool.query(`SELECT DISTINCT entered_part_number AS value FROM product_teardown_items WHERE entered_part_number IS NOT NULL ORDER BY value`),
    pool.query(`SELECT DISTINCT characteristic_name AS value FROM product_teardown_items WHERE characteristic_name IS NOT NULL ORDER BY value`),
    pool.query(`SELECT DISTINCT characteristic_unit AS value FROM product_teardown_items WHERE characteristic_unit IS NOT NULL ORDER BY value`),
  ]);
  res.json({ names, assemblies, locations, partNumbers: parts, characteristics, units });
}));

router.get('/:id', asyncRoute(async (req: any, res: any) => {
  const teardown = await pool.query(`SELECT * FROM product_teardowns WHERE id=$1`, [req.params.id]);
  if (!teardown[0]) return res.status(404).json({ error: 'Product teardown not found' });
  const items = await pool.query(
    `SELECT i.*, COALESCE(json_agg(p ORDER BY p.uploaded_at) FILTER (WHERE p.id IS NOT NULL), '[]') AS photos
     FROM product_teardown_items i LEFT JOIN product_teardown_photos p ON p.teardown_item_id=i.id
     WHERE i.teardown_id=$1 GROUP BY i.id ORDER BY i.created_at`, [req.params.id]
  );
  const photos = await pool.query(`SELECT * FROM product_teardown_photos WHERE teardown_id=$1 AND teardown_item_id IS NULL`, [req.params.id]);
  res.json({ ...teardown[0], items, photos });
}));

router.post('/:id/items', asyncRoute(async (req: any, res: any) => {
  const body = itemSchema.parse(req.body);
  const match = body.includeInBomComparison
    ? await inventoryMatch(body.itemName, body.enteredPartNumber)
    : { state: 'not_found', match: null, suggestions: [] };
  const matched = match.match;
  const rows = await pool.query(
    `INSERT INTO product_teardown_items
      (teardown_id,item_name,entered_part_number,quantity,assembly_name,parent_assembly_name,physical_location,
       observation_kind,characteristic_name,characteristic_value,characteristic_unit,quantity_basis,
       classification,include_in_bom_comparison,
       thread_size,length,head_style,drive_style,material_finish,additional_details,notes,inventory_item_id,
       inventory_part_number,inventory_match_state,inventory_match_confirmed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
    [req.params.id, body.itemName, body.enteredPartNumber || null, body.quantity, body.assemblyName || null,
      body.parentAssemblyName || null, body.physicalLocation || null, body.observationKind,
      body.characteristicName || null, body.characteristicValue || null, body.characteristicUnit || null,
      body.quantityBasis || null, body.classification, body.includeInBomComparison,
      body.threadSize || null, body.length || null, body.headStyle || null, body.driveStyle || null,
      body.materialFinish || null, body.additionalDetails || null, body.notes || null,
      matched?.id ?? null, matched?.ag_part_number ?? null, match.state, match.state === 'found']
  );
  res.status(201).json({ item: rows[0], suggestions: match.suggestions });
}));

router.patch('/:id/items/:itemId', asyncRoute(async (req: any, res: any) => {
  const body = z.object({
    classification: z.enum(['unclassified', 'manufactured', 'purchased', 'feature']).optional(),
    includeInBomComparison: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(req.body);
  const existing = await pool.query<{ item_name: string; entered_part_number: string | null }>(
    `SELECT item_name, entered_part_number
       FROM product_teardown_items
      WHERE id=$1 AND teardown_id=$2`,
    [req.params.itemId, req.params.id]
  );
  if (!existing[0]) return res.status(404).json({ error: 'Captured item not found' });
  const rematch = body.includeInBomComparison === true
    ? await inventoryMatch(existing[0].item_name, existing[0].entered_part_number ?? undefined)
    : null;
  const rows = await pool.query(
    `UPDATE product_teardown_items
        SET classification = COALESCE($1, classification),
            include_in_bom_comparison = COALESCE($2, include_in_bom_comparison),
            inventory_item_id = CASE WHEN $2 = TRUE THEN $3 WHEN $2 = FALSE THEN NULL ELSE inventory_item_id END,
            inventory_part_number = CASE WHEN $2 = TRUE THEN $4 WHEN $2 = FALSE THEN NULL ELSE inventory_part_number END,
            inventory_match_state = CASE WHEN $2 = TRUE THEN $5 WHEN $2 = FALSE THEN 'not_found' ELSE inventory_match_state END,
            inventory_match_confirmed = CASE WHEN $2 = TRUE THEN $6 WHEN $2 = FALSE THEN FALSE ELSE inventory_match_confirmed END,
            updated_at = NOW()
      WHERE id=$7 AND teardown_id=$8
      RETURNING *`,
    [body.classification ?? null, body.includeInBomComparison ?? null,
      rematch?.match?.id ?? null, rematch?.match?.ag_part_number ?? null,
      rematch?.state ?? 'not_found', rematch?.state === 'found',
      req.params.itemId, req.params.id]
  );
  res.json(rows[0]);
}));

router.get('/:id/items/:itemId/matches', asyncRoute(async (req: any, res: any) => {
  const items = await pool.query<{ item_name: string; entered_part_number: string | null }>(
    `SELECT item_name, entered_part_number FROM product_teardown_items WHERE id=$1 AND teardown_id=$2`,
    [req.params.itemId, req.params.id]
  );
  if (!items[0]) return res.status(404).json({ error: 'Captured item not found' });
  const match = await inventoryMatch(items[0].item_name, items[0].entered_part_number ?? undefined);
  res.json(match.suggestions);
}));

router.patch('/:id/items/:itemId/match', asyncRoute(async (req: any, res: any) => {
  const body = z.object({ inventoryItemId: z.number().int().nullable(), confirmed: z.boolean() }).parse(req.body);
  const inventory = body.inventoryItemId == null ? [] : await pool.query<{ id:number; ag_part_number:string }>(
    `SELECT id, ag_part_number FROM inventory_items WHERE id=$1`, [body.inventoryItemId]);
  const match = inventory[0];
  const rows = await pool.query(
    `UPDATE product_teardown_items SET inventory_item_id=$1, inventory_part_number=$2,
       inventory_match_state=$3, inventory_match_confirmed=$4, updated_at=NOW()
     WHERE id=$5 AND teardown_id=$6 RETURNING *`,
    [match?.id ?? null, match?.ag_part_number ?? null, match ? 'found' : 'not_found', body.confirmed && Boolean(match), req.params.itemId, req.params.id]
  );
  res.json(rows[0]);
}));

router.post('/:id/photos', upload.single('photo'), asyncRoute(async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'Photo is required' });
  const itemId = typeof req.body.itemId === 'string' && req.body.itemId ? req.body.itemId : null;
  const rows = await pool.query(
    `INSERT INTO product_teardown_photos (teardown_id,teardown_item_id,file_url,original_name,is_primary)
     VALUES ($1,$2,$3,$4,NOT EXISTS (SELECT 1 FROM product_teardown_photos WHERE teardown_id=$1 AND teardown_item_id IS NOT DISTINCT FROM $2)) RETURNING *`,
    [req.params.id, itemId, `/uploads/product-teardowns/${req.file.filename}`, req.file.originalname]
  );
  res.status(201).json(rows[0]);
}));

router.get('/:id/bom-comparison', asyncRoute(async (req: any, res: any) => {
  const teardown = await pool.query<{ product_part_number: string | null }>(`SELECT product_part_number FROM product_teardowns WHERE id=$1`, [req.params.id]);
  const productPartNumber = teardown[0]?.product_part_number;
  if (!productPartNumber) return res.json({ revision: null, missingFromBom: [], bomOnly: [], possible: [] });
  const revision = await pool.query<{ id:string; rev_code:string }>(
    `SELECT br.id, br.rev_code FROM boms b JOIN bom_revisions br ON br.bom_id=b.id
     WHERE b.parent_part_ag_number=$1 AND br.is_released=TRUE ORDER BY COALESCE(br.effective_from,br.updated_at,br.created_at) DESC LIMIT 1`, [productPartNumber]
  );
  if (!revision[0]) return res.json({ revision: null, missingFromBom: [], bomOnly: [], possible: [] });
  const bomLines = await pool.query(`SELECT child_part_ag_number, child_name_snapshot, qty_per FROM bom_lines WHERE revision_id=$1`, [revision[0].id]);
  const items = await pool.query(
    `SELECT id,item_name,inventory_part_number
       FROM product_teardown_items
      WHERE teardown_id=$1 AND include_in_bom_comparison=TRUE`,
    [req.params.id]
  );
  const matchedBom = new Set<string>();
  const missingFromBom:any[] = []; const possible:any[] = [];
  for (const item of items) {
    const exact = bomLines.find((line:any) => item.inventory_part_number && line.child_part_ag_number === item.inventory_part_number);
    if (exact) { matchedBom.add(exact.child_part_ag_number); continue; }
    const ranked = bomLines.map((line:any) => ({ line, score: similarity(normalize(item.item_name), normalize(line.child_name_snapshot)) })).sort((a:any,b:any)=>b.score-a.score);
    if (ranked[0]?.score >= .45) {
      possible.push({ item, bomLine: ranked[0].line, score: ranked[0].score });
      matchedBom.add(ranked[0].line.child_part_ag_number);
    }
    else missingFromBom.push(item);
  }
  const bomOnly = bomLines.filter((line:any) => !matchedBom.has(line.child_part_ag_number));
  res.json({ revision: revision[0].rev_code, missingFromBom, bomOnly, possible });
}));

router.use((error: any, _req: any, res: any, _next: any) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid product teardown data', issues: error.issues });
  console.error('[product-teardowns]', error);
  res.status(500).json({ error: error?.message ?? 'Product teardown request failed' });
});

export default router;
