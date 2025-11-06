-- Carbon Fiber Stock Kit BOM - Sample Data
-- This creates a complete BOM for a carbon fiber rifle stock kit with materials and labor

-- First, insert the BOM definition
INSERT INTO bom_definitions (model_name, sku, revision, description, is_active, created_at, updated_at)
VALUES (
  'AR-15 Carbon Fiber Stock Kit',
  'AR15-CF-KIT',
  'A',
  'Complete carbon fiber rifle stock kit with materials and labor for layup, CNC, finish, and optional paint',
  true,
  NOW(),
  NOW()
)
RETURNING id;

-- Note: Replace {BOM_ID} below with the ID returned from the above insert

-- Materials (Base Components)
INSERT INTO bom_items (bom_id, part_name, quantity, first_dept, item_type, is_optional, assembly_level, notes, is_active, created_at, updated_at)
VALUES
  -- Core Materials (Required)
  ({BOM_ID}, 'Foam Core Blank', 1, 'Layup', 'material', false, 1, 'High-density foam for stock core', true, NOW(), NOW()),
  ({BOM_ID}, 'Carbon Fiber Sheet 12x24', 4, 'Layup', 'material', false, 1, '2x2 twill weave carbon fiber', true, NOW(), NOW()),
  ({BOM_ID}, 'Epoxy Resin - Quart', 1, 'Layup', 'material', false, 1, 'West System 105 or equivalent', true, NOW(), NOW()),
  ({BOM_ID}, 'Hardener - Pint', 1, 'Layup', 'material', false, 1, 'West System 206 or equivalent', true, NOW(), NOW()),
  
  -- Hardware (Required)
  ({BOM_ID}, 'QD Sling Mount', 2, 'Assembly/Disassembly', 'manufactured', false, 1, 'Quick-detach sling mounting points', true, NOW(), NOW()),
  ({BOM_ID}, 'Bottom Metal - AICS Style', 1, 'Assembly/Disassembly', 'manufactured', false, 1, 'Aluminum bottom metal for magazine', true, NOW(), NOW()),
  ({BOM_ID}, 'Stock Bedding Screws (4-pack)', 1, 'Assembly/Disassembly', 'manufactured', false, 1, 'Stainless steel action screws', true, NOW(), NOW()),
  
  -- Optional Components
  ({BOM_ID}, 'Picatinny Rail Section 3-slot', 2, 'Assembly/Disassembly', 'manufactured', true, 1, 'Optional M-LOK to Picatinny rails', true, NOW(), NOW()),
  ({BOM_ID}, 'Paint - Custom Color', 1, 'Paint', 'material', true, 1, 'Cerakote or Duracoat finish', true, NOW(), NOW());

-- Labor Operations
INSERT INTO bom_items (bom_id, part_name, quantity, first_dept, item_type, is_optional, labor_hours, hourly_rate, assembly_level, notes, is_active, created_at, updated_at)
VALUES
  -- Required Labor
  ({BOM_ID}, 'Layup Labor', 1, 'Layup', 'labor', false, 3.5, 35.00, 2, 'Carbon fiber layup and vacuum bagging', true, NOW(), NOW()),
  ({BOM_ID}, 'CNC Machining', 1, 'Layup', 'labor', false, 2.0, 45.00, 2, 'CNC router work for stock shaping and inletting', true, NOW(), NOW()),
  ({BOM_ID}, 'Finish Sanding & QC', 1, 'Finish', 'labor', false, 1.5, 30.00, 2, 'Final sanding, inspection, and quality control', true, NOW(), NOW()),
  
  -- Optional Labor
  ({BOM_ID}, 'Paint Application', 1, 'Paint', 'labor', true, 2.0, 35.00, 2, 'Custom paint/coating application and curing', true, NOW(), NOW());

-- View the results
SELECT 
  bd.id,
  bd.model_name,
  bd.sku,
  bd.revision,
  COUNT(bi.id) as total_items,
  COUNT(CASE WHEN bi.item_type = 'material' AND NOT bi.is_optional THEN 1 END) as required_materials,
  COUNT(CASE WHEN bi.item_type = 'material' AND bi.is_optional THEN 1 END) as optional_materials,
  COUNT(CASE WHEN bi.item_type = 'labor' AND NOT bi.is_optional THEN 1 END) as required_labor,
  COUNT(CASE WHEN bi.item_type = 'labor' AND bi.is_optional THEN 1 END) as optional_labor
FROM bom_definitions bd
LEFT JOIN bom_items bi ON bi.bom_id = bd.id AND bi.is_active = true
WHERE bd.model_name = 'AR-15 Carbon Fiber Stock Kit'
GROUP BY bd.id, bd.model_name, bd.sku, bd.revision;
