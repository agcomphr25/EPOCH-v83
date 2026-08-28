import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgPool } from '../db';
import { getDailyTagUp } from '../src/services/dailyTagUpService';

const projectId = '10000000-0000-0000-0000-000000000001';
const oldBaselineId = '20000000-0000-0000-0000-000000000001';
const currentBaselineId = '20000000-0000-0000-0000-000000000002';

describe('Daily Tag Up PostgreSQL read-model certification', () => {
  beforeAll(async () => {
    await pgPool.query(`
      CREATE TABLE projects(id uuid PRIMARY KEY,project_code text,project_name text,status text,target_ship_date date,customer_name_snapshot text,po_id integer);
      CREATE TABLE p2_purchase_orders(id integer PRIMARY KEY,po_number text,customer_name text,expected_delivery date);
      CREATE TABLE p2_frozen_production_demand_baselines(id uuid PRIMARY KEY,project_id uuid,status text,revision_number integer,project_quantity numeric,baseline_checksum text);
      CREATE TABLE production_work_orders(id uuid PRIMARY KEY,work_order_number text,due_date date);
      CREATE TABLE travelers(id varchar PRIMARY KEY,traveler_number text);
      CREATE TABLE p2_manufacturing_work_order_authorities(id uuid PRIMARY KEY,project_id uuid,frozen_demand_baseline_id uuid,parent_authority_id uuid,assembly_path_identity text,inventory_item_id integer,part_number_snapshot text,description_snapshot text,required_quantity numeric,completed_quantity numeric,accepted_quantity numeric,status text,current_department_id integer,current_department_name_snapshot text,traveler_requirement text,traveler_id varchar,production_work_order_id uuid);
      CREATE TABLE p2_manufacturing_work_order_dependencies(predecessor_authority_id uuid,successor_authority_id uuid,status text,dependency_type text,required_quantity numeric);
      CREATE TABLE p2_manufacturing_work_order_material_requirements(successor_authority_id uuid,status text,accepted_quantity numeric,issued_quantity numeric,required_quantity numeric);
      CREATE TABLE inventory_items(id integer PRIMARY KEY,ag_part_number text,name text,lead_time_days integer);
      CREATE TABLE inventory_balances(ag_part_number text,quantity_on_hand numeric,quantity_allocated numeric,quantity_available numeric);
      CREATE TABLE p2_frozen_production_demand_nodes(id uuid PRIMARY KEY,baseline_id uuid,node_identity text,parent_node_identity text,assembly_path_identity text,depth integer,inventory_item_id integer,inventory_item_snapshot jsonb,item_classification text,make_buy_disposition text,required_gross_quantity numeric,unit_of_measure text,quantity_per_parent numeric,bom_id integer,bom_revision_id integer,routing_id integer);
      CREATE TABLE vendors(id integer PRIMARY KEY,name text);
      CREATE TABLE vendor_pos(id integer PRIMARY KEY,vendor_id integer,po_number text,status text,expected_delivery_date date,is_current_revision boolean);
      CREATE TABLE vendor_po_items(vendor_po_id integer,project_id uuid,ag_part_number text,quantity numeric,received_quantity numeric);
    `);
    await pgPool.query(`
      INSERT INTO p2_purchase_orders VALUES (1,'PO-100','Certification Customer','2026-09-15');
      INSERT INTO projects VALUES ('${projectId}','CERT-100','Certification Project','active','2026-09-15','Certification Customer',1);
      INSERT INTO p2_frozen_production_demand_baselines VALUES
        ('${oldBaselineId}','${projectId}','SUPERSEDED',1,99,'old'),('${currentBaselineId}','${projectId}','RELEASED',2,10,'current');
      INSERT INTO production_work_orders VALUES
        ('30000000-0000-0000-0000-000000000001','WO-OLD','2026-09-01'),
        ('30000000-0000-0000-0000-000000000002','WO-CURRENT','2026-09-10');
      INSERT INTO p2_manufacturing_work_order_authorities VALUES
        ('40000000-0000-0000-0000-000000000001','${projectId}','${oldBaselineId}',NULL,'old',10,'OLD','Old authority',99,0,0,'PLANNED',1,'CNC','NOT_REQUIRED_APPROVED',NULL,'30000000-0000-0000-0000-000000000001'),
        ('40000000-0000-0000-0000-000000000002','${projectId}','${currentBaselineId}',NULL,'current',10,'BUY-10','Current authority',10,4,4,'IN_PROGRESS',1,'CNC','NOT_REQUIRED_APPROVED',NULL,'30000000-0000-0000-0000-000000000002');
      INSERT INTO inventory_items VALUES (10,'BUY-10','Purchased Item',7);
      INSERT INTO inventory_balances VALUES ('BUY-10',2,0,2);
      INSERT INTO p2_frozen_production_demand_nodes VALUES ('50000000-0000-0000-0000-000000000001','${currentBaselineId}','root',NULL,'root',0,10,'{}','PURCHASED_COMPONENT','BUY',10,'EA',1,NULL,NULL,NULL);
      INSERT INTO vendors VALUES (1,'Supplier');
      INSERT INTO vendor_pos VALUES (1,1,'DRAFT-PO','Draft','2026-09-05',true),(2,1,'SENT-PO','Sent','2026-09-08',true);
      INSERT INTO vendor_po_items VALUES (1,'${projectId}','BUY-10',50,0),(2,'${projectId}','BUY-10',3,0);
    `);
  });

  afterAll(async () => pgPool.end());

  it('uses only current released work and committed inbound supply', async () => {
    const model = await getDailyTagUp({
      projectId,
      source: 'both',
      attentionDays: null,
    });
    expect(model.projects).toHaveLength(1);
    expect(model.projects[0]).toMatchObject({
      required: 10,
      complete: 4,
      needed: 6,
      purchasingShortages: 1,
    });
    expect(
      model.projects[0].workOrders.map((row: any) => row.workOrderNumber)
    ).toEqual(['WO-CURRENT']);
    expect(model.projects[0].materials[0]).toMatchObject({
      available: 2,
      short: 5,
      supplyStatus: 'OPEN SUPPLY',
    });
    expect(
      model.projects[0].materials[0].supply.map((row: any) => row.poNumber)
    ).toEqual(['SENT-PO']);
  });
});
