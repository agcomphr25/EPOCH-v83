import { sql } from 'drizzle-orm';

import { db } from '../../db';

type DbClient = typeof db;

let ensurePromise: Promise<void> | null = null;

async function executeStatements(client: DbClient, statements: string[]) {
  for (const statement of statements) {
    await client.execute(sql.raw(statement));
  }
}

export async function ensureDesignControlSchema(client: DbClient = db) {
  if (client === db && ensurePromise) return ensurePromise;

  const run = async () => {
    await executeStatements(client, [
      `CREATE TABLE IF NOT EXISTS design_control_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_number text,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
        p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
        form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
        attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        submitted_at timestamp,
        released_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS record_number text`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Design Control Record'`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS approvals jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS submitted_at timestamp`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS released_at timestamp`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`,
      `ALTER TABLE design_control_records ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
      `CREATE INDEX IF NOT EXISTS design_control_records_project_id_idx ON design_control_records(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_records_rd_project_id_idx ON design_control_records(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_records_pwo_id_idx ON design_control_records(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_records_p2_po_id_idx ON design_control_records(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_records_status_idx ON design_control_records(status)`,
    ]);

    const traceColumns = `
      rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
      p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
      form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
      approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
      attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    `;

    await executeStatements(client, [
      `CREATE TABLE IF NOT EXISTS design_control_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        step_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'incomplete',
        ${traceColumns},
        approved_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        CONSTRAINT design_control_steps_record_step_unique UNIQUE (record_id, step_key)
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        requirement_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        ${traceColumns},
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_risks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        risk_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        ${traceColumns},
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        review_type text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'planned',
        ${traceColumns},
        reviewed_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_verification (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        verification_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'planned',
        ${traceColumns},
        verified_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_validation (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        validation_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'planned',
        ${traceColumns},
        validated_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        change_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        ${traceColumns},
        approved_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_release_gate (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        gate_status text NOT NULL DEFAULT 'not_ready',
        rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL,
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
        p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
        form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
        attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        submitted_at timestamp,
        released_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        CONSTRAINT design_control_release_gate_record_unique UNIQUE (record_id)
      )`,
      `CREATE TABLE IF NOT EXISTS design_control_requirement_applicability (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
        rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL,
        requirement_key text NOT NULL,
        applicable boolean NOT NULL DEFAULT true,
        justification text,
        approved_by text,
        approved_role text,
        approved_at timestamp,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now(),
        CONSTRAINT design_control_requirement_applicability_record_requirement_unique UNIQUE (record_id, requirement_key)
      )`,
    ]);

    const childTables = [
      'design_control_steps',
      'design_control_requirements',
      'design_control_risks',
      'design_control_reviews',
      'design_control_verification',
      'design_control_validation',
      'design_control_changes',
    ];
    for (const table of childTables) {
      await executeStatements(client, [
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS record_id uuid REFERENCES design_control_records(id) ON DELETE CASCADE`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS title text`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'::jsonb`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS approvals jsonb NOT NULL DEFAULT '{}'::jsonb`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`,
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
      ]);
    }
    await executeStatements(client, [
      `ALTER TABLE design_control_steps ADD COLUMN IF NOT EXISTS step_key text`,
      `ALTER TABLE design_control_requirements ADD COLUMN IF NOT EXISTS requirement_key text`,
      `ALTER TABLE design_control_risks ADD COLUMN IF NOT EXISTS risk_key text`,
      `ALTER TABLE design_control_reviews ADD COLUMN IF NOT EXISTS review_type text`,
      `ALTER TABLE design_control_verification ADD COLUMN IF NOT EXISTS verification_key text`,
      `ALTER TABLE design_control_validation ADD COLUMN IF NOT EXISTS validation_key text`,
      `ALTER TABLE design_control_changes ADD COLUMN IF NOT EXISTS change_key text`,
      `ALTER TABLE design_control_steps ADD COLUMN IF NOT EXISTS approved_at timestamp`,
      `ALTER TABLE design_control_reviews ADD COLUMN IF NOT EXISTS reviewed_at timestamp`,
      `ALTER TABLE design_control_verification ADD COLUMN IF NOT EXISTS verified_at timestamp`,
      `ALTER TABLE design_control_validation ADD COLUMN IF NOT EXISTS validated_at timestamp`,
      `ALTER TABLE design_control_changes ADD COLUMN IF NOT EXISTS approved_at timestamp`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS record_id uuid REFERENCES design_control_records(id) ON DELETE CASCADE`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS gate_status text NOT NULL DEFAULT 'not_ready'`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS approvals jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS submitted_at timestamp`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS released_at timestamp`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`,
      `ALTER TABLE design_control_release_gate ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS record_id uuid REFERENCES design_control_records(id) ON DELETE CASCADE`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS requirement_key text`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS applicable boolean NOT NULL DEFAULT true`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS justification text`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS approved_by text`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS approved_role text`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS approved_at timestamp`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`,
      `ALTER TABLE design_control_requirement_applicability ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()`,
    ]);

    await executeStatements(client, [
      `CREATE INDEX IF NOT EXISTS design_control_steps_record_id_idx ON design_control_steps(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_steps_status_idx ON design_control_steps(status)`,
      `CREATE INDEX IF NOT EXISTS design_control_steps_rd_project_id_idx ON design_control_steps(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_steps_project_id_idx ON design_control_steps(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_steps_pwo_id_idx ON design_control_steps(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_steps_p2_po_id_idx ON design_control_steps(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_requirements_record_id_idx ON design_control_requirements(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_requirements_rd_project_id_idx ON design_control_requirements(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_requirements_project_id_idx ON design_control_requirements(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_requirements_pwo_id_idx ON design_control_requirements(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_requirements_p2_po_id_idx ON design_control_requirements(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_risks_record_id_idx ON design_control_risks(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_risks_rd_project_id_idx ON design_control_risks(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_risks_project_id_idx ON design_control_risks(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_risks_pwo_id_idx ON design_control_risks(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_risks_p2_po_id_idx ON design_control_risks(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_reviews_record_id_idx ON design_control_reviews(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_reviews_rd_project_id_idx ON design_control_reviews(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_reviews_project_id_idx ON design_control_reviews(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_reviews_pwo_id_idx ON design_control_reviews(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_reviews_p2_po_id_idx ON design_control_reviews(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_verification_record_id_idx ON design_control_verification(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_verification_rd_project_id_idx ON design_control_verification(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_verification_project_id_idx ON design_control_verification(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_verification_pwo_id_idx ON design_control_verification(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_verification_p2_po_id_idx ON design_control_verification(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_validation_record_id_idx ON design_control_validation(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_validation_rd_project_id_idx ON design_control_validation(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_validation_project_id_idx ON design_control_validation(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_validation_pwo_id_idx ON design_control_validation(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_validation_p2_po_id_idx ON design_control_validation(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_changes_record_id_idx ON design_control_changes(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_changes_rd_project_id_idx ON design_control_changes(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_changes_project_id_idx ON design_control_changes(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_changes_pwo_id_idx ON design_control_changes(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_changes_p2_po_id_idx ON design_control_changes(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_release_gate_record_id_idx ON design_control_release_gate(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_release_gate_status_idx ON design_control_release_gate(gate_status)`,
      `CREATE INDEX IF NOT EXISTS design_control_release_gate_rd_project_id_idx ON design_control_release_gate(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_release_gate_project_id_idx ON design_control_release_gate(project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_release_gate_pwo_id_idx ON design_control_release_gate(production_work_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_release_gate_p2_po_id_idx ON design_control_release_gate(p2_purchase_order_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_req_app_record_id_idx ON design_control_requirement_applicability(record_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_req_app_rd_project_id_idx ON design_control_requirement_applicability(rd_project_id)`,
      `CREATE INDEX IF NOT EXISTS design_control_req_app_requirement_key_idx ON design_control_requirement_applicability(requirement_key)`,
      `CREATE INDEX IF NOT EXISTS design_control_req_app_applicable_idx ON design_control_requirement_applicability(applicable)`,
    ]);
  };

  if (client === db) {
    ensurePromise = run().catch((error) => {
      ensurePromise = null;
      throw error;
    });
    return ensurePromise;
  }

  return run();
}
