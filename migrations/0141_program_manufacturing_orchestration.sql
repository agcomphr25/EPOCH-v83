CREATE TABLE IF NOT EXISTS program_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  program_code text NOT NULL UNIQUE,
  program_name text NOT NULL,
  build_name text NOT NULL,
  build_type text NOT NULL DEFAULT 'program',
  status text NOT NULL DEFAULT 'PLANNED',
  priority integer NOT NULL DEFAULT 50,
  target_ship_date date,
  customer_name text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS program_builds_project_id_idx ON program_builds(project_id);
CREATE INDEX IF NOT EXISTS program_builds_po_id_idx ON program_builds(p2_purchase_order_id);
CREATE INDEX IF NOT EXISTS program_builds_status_idx ON program_builds(status);

CREATE TABLE IF NOT EXISTS program_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_build_id uuid NOT NULL REFERENCES program_builds(id) ON DELETE CASCADE,
  parent_assembly_id uuid REFERENCES program_assemblies(id) ON DELETE CASCADE,
  assembly_code text NOT NULL,
  assembly_name text NOT NULL,
  level integer NOT NULL DEFAULT 0,
  sequence integer NOT NULL DEFAULT 0,
  assembly_type text NOT NULL DEFAULT 'assembly',
  part_number text,
  required_quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PLANNED',
  planned_start_date date,
  planned_finish_date date,
  target_ship_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT program_assemblies_build_code_unique UNIQUE (program_build_id, assembly_code)
);

CREATE INDEX IF NOT EXISTS program_assemblies_build_idx ON program_assemblies(program_build_id);
CREATE INDEX IF NOT EXISTS program_assemblies_parent_idx ON program_assemblies(parent_assembly_id);

CREATE TABLE IF NOT EXISTS program_assembly_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES program_assemblies(id) ON DELETE CASCADE,
  manufacturing_queue_id integer REFERENCES manufacturing_queue(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  traveler_id varchar(255) REFERENCES travelers(id) ON DELETE SET NULL,
  p2_serialized_item_id uuid REFERENCES p2_serialized_items(id) ON DELETE SET NULL,
  link_type text NOT NULL DEFAULT 'queue_item',
  required_quantity integer NOT NULL DEFAULT 1,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS program_assembly_links_assembly_idx ON program_assembly_links(assembly_id);
CREATE INDEX IF NOT EXISTS program_assembly_links_queue_idx ON program_assembly_links(manufacturing_queue_id);
CREATE INDEX IF NOT EXISTS program_assembly_links_traveler_idx ON program_assembly_links(traveler_id);

CREATE TABLE IF NOT EXISTS program_assembly_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES program_assemblies(id) ON DELETE CASCADE,
  depends_on_assembly_id uuid NOT NULL REFERENCES program_assemblies(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'finish_to_start',
  is_blocking boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp DEFAULT now(),
  CONSTRAINT program_assembly_dependencies_unique UNIQUE (assembly_id, depends_on_assembly_id)
);

CREATE INDEX IF NOT EXISTS program_assembly_dependencies_assembly_idx ON program_assembly_dependencies(assembly_id);
CREATE INDEX IF NOT EXISTS program_assembly_dependencies_depends_on_idx ON program_assembly_dependencies(depends_on_assembly_id);

DO $$
DECLARE
  v_build_id uuid;
  v_airframe uuid;
  v_propulsion uuid;
  v_avionics uuid;
  v_wing_left uuid;
  v_wing_right uuid;
  v_fuselage uuid;
  v_motor_pods uuid;
  v_harness uuid;
  v_final_assembly uuid;
BEGIN
  INSERT INTO program_builds (
    program_code,
    program_name,
    build_name,
    build_type,
    status,
    priority,
    target_ship_date,
    customer_name,
    notes,
    metadata
  )
  VALUES (
    'DRONE-BUILD-ALPHA',
    'Drone Build Alpha',
    'Drone Build Alpha - Sample Aircraft',
    'drone',
    'IN_PROGRESS',
    20,
    CURRENT_DATE + INTERVAL '45 days',
    'Sample Aerospace Customer',
    'Seed/sample orchestration build for validating program swimlane and assembly dependency logic.',
    '{"sample": true, "aircraftType": "composite multirotor"}'::jsonb
  )
  ON CONFLICT (program_code) DO UPDATE SET
    program_name = EXCLUDED.program_name,
    build_name = EXCLUDED.build_name,
    build_type = EXCLUDED.build_type,
    status = EXCLUDED.status,
    priority = EXCLUDED.priority,
    target_ship_date = EXCLUDED.target_ship_date,
    customer_name = EXCLUDED.customer_name,
    notes = EXCLUDED.notes,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_build_id;

  INSERT INTO program_assemblies (program_build_id, assembly_code, assembly_name, level, sequence, assembly_type, status, metadata)
  VALUES
    (v_build_id, 'AIRFRAME', 'Airframe', 0, 10, 'major_assembly', 'IN_PROGRESS', '{"swimlane":"Structures"}'::jsonb),
    (v_build_id, 'PROPULSION', 'Propulsion System', 0, 20, 'major_assembly', 'BLOCKED', '{"swimlane":"Assembly"}'::jsonb),
    (v_build_id, 'AVIONICS', 'Avionics Bay', 0, 30, 'major_assembly', 'READY', '{"swimlane":"Electrical"}'::jsonb),
    (v_build_id, 'FINAL-ASSY', 'Final Aircraft Assembly', 0, 40, 'final_assembly', 'BLOCKED', '{"swimlane":"Final Assembly"}'::jsonb)
  ON CONFLICT (program_build_id, assembly_code) DO UPDATE SET
    assembly_name = EXCLUDED.assembly_name,
    level = EXCLUDED.level,
    sequence = EXCLUDED.sequence,
    assembly_type = EXCLUDED.assembly_type,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  SELECT id INTO v_airframe FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'AIRFRAME';
  SELECT id INTO v_propulsion FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'PROPULSION';
  SELECT id INTO v_avionics FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'AVIONICS';
  SELECT id INTO v_final_assembly FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'FINAL-ASSY';

  INSERT INTO program_assemblies (program_build_id, parent_assembly_id, assembly_code, assembly_name, level, sequence, assembly_type, part_number, status, metadata)
  VALUES
    (v_build_id, v_airframe, 'WING-L', 'Left Wing Assembly', 1, 10, 'subassembly', 'DRN-WING-L', 'COMPLETE', '{"swimlane":"Layup"}'::jsonb),
    (v_build_id, v_airframe, 'WING-R', 'Right Wing Assembly', 1, 20, 'subassembly', 'DRN-WING-R', 'IN_PROGRESS', '{"swimlane":"Layup"}'::jsonb),
    (v_build_id, v_airframe, 'FUSELAGE', 'Composite Fuselage', 1, 30, 'subassembly', 'DRN-FUSE-001', 'IN_PROGRESS', '{"swimlane":"CNC"}'::jsonb),
    (v_build_id, v_propulsion, 'MOTOR-PODS', 'Motor Pod Set', 1, 10, 'subassembly', 'DRN-MP-SET', 'BLOCKED', '{"swimlane":"Assembly"}'::jsonb),
    (v_build_id, v_avionics, 'WIRE-HARNESS', 'Flight Control Harness', 1, 10, 'part', 'DRN-HARNESS-001', 'READY', '{"swimlane":"Electrical"}'::jsonb)
  ON CONFLICT (program_build_id, assembly_code) DO UPDATE SET
    parent_assembly_id = EXCLUDED.parent_assembly_id,
    assembly_name = EXCLUDED.assembly_name,
    level = EXCLUDED.level,
    sequence = EXCLUDED.sequence,
    assembly_type = EXCLUDED.assembly_type,
    part_number = EXCLUDED.part_number,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  SELECT id INTO v_wing_left FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'WING-L';
  SELECT id INTO v_wing_right FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'WING-R';
  SELECT id INTO v_fuselage FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'FUSELAGE';
  SELECT id INTO v_motor_pods FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'MOTOR-PODS';
  SELECT id INTO v_harness FROM program_assemblies WHERE program_build_id = v_build_id AND assembly_code = 'WIRE-HARNESS';

  INSERT INTO program_assembly_dependencies (assembly_id, depends_on_assembly_id, dependency_type, is_blocking, notes)
  VALUES
    (v_airframe, v_wing_left, 'children_complete', true, 'Airframe cannot complete until left wing is complete.'),
    (v_airframe, v_wing_right, 'children_complete', true, 'Airframe cannot complete until right wing is complete.'),
    (v_airframe, v_fuselage, 'children_complete', true, 'Airframe cannot complete until fuselage is complete.'),
    (v_propulsion, v_motor_pods, 'children_complete', true, 'Propulsion is blocked until motor pods are released.'),
    (v_final_assembly, v_airframe, 'finish_to_start', true, 'Final assembly waits on airframe.'),
    (v_final_assembly, v_propulsion, 'finish_to_start', true, 'Final assembly waits on propulsion.'),
    (v_final_assembly, v_avionics, 'finish_to_start', true, 'Final assembly waits on avionics.')
  ON CONFLICT (assembly_id, depends_on_assembly_id) DO UPDATE SET
    dependency_type = EXCLUDED.dependency_type,
    is_blocking = EXCLUDED.is_blocking,
    notes = EXCLUDED.notes;
END $$;
