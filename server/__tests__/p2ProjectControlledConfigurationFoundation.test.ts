import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
const root=resolve(__dirname,'../..'); const read=(p:string)=>readFileSync(resolve(root,p),'utf8');
describe('Phase 3 P2 project controlled configuration foundation',()=>{
 const migration=read('migrations/0296_p2_project_controlled_configuration_foundation.sql');
 const service=read('server/src/services/p2ProjectControlledConfigurationService.ts');
 const route=read('server/src/routes/p2ProjectControlledConfigurations.ts');
 const flags=read('server/src/lib/featureFlags.ts');
 const runner=read('server/scripts/migrations/runSafeBootMigrations.ts');
 it('is additive, prospective and registered after Phase 2',()=>{expect(migration).not.toMatch(/UPDATE\s+(projects|inventory_items|boms|bom_revisions|part_routings)/i);expect(migration).not.toMatch(/DELETE FROM|TRUNCATE/i);expect(runner.match(/0296_p2_project_controlled_configuration_foundation\.sql/g)).toHaveLength(2);expect(runner.indexOf('0295_inventory')).toBeLessThan(runner.indexOf('0296_p2_project'));});
 it('requires matching released stable identities',()=>{expect(service).toContain("br.lifecycle_status='RELEASED'");expect(service).toContain("pr.lifecycle_status='RELEASED'");expect(service).toContain('b.parent_inventory_item_id=i.id');expect(service).toContain('pr.inventory_item_fk=i.id');expect(service).toContain('RELEASED_CONFIGURATION_REQUIRED');});
 it('captures frozen selection evidence and prevents released mutation',()=>{for(const value of ['inventory_part_number_snapshot','bom_revision_snapshot','bom_checksum_snapshot','routing_revision_snapshot','routing_snapshot','effectivity','customer_configuration','content_checksum'])expect(migration).toContain(value);expect(migration).toContain('Released project configuration snapshots are immutable');expect(service).toContain('expectedVersion');expect(service).toContain('created_by<>$3');});
 it('uses narrow server permissions and actor snapshots',()=>{expect(route).toContain("requirePermission('projects.controlled_configuration.view')");expect(route.match(/requirePermission\('projects\.controlled_configuration\.manage'\)/g)).toHaveLength(2);expect(route).toContain('resolveUserSnapshot');expect(migration).toContain("r.name IN ('ADMIN','OWNER')");});
 it('keeps Phase 3 disabled by default',()=>{expect(flags).toContain("envBool('P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED', false)");expect(flags).toContain("envBool('P2_PROJECT_CONTROLLED_CONFIGURATION_WRITES_ENABLED', false)");});
 it('creates no execution records',()=>{for(const table of ['work_orders','travelers','inventory_transactions','inventory_balances','receiving','barcodes','genealogy'])expect(service).not.toMatch(new RegExp(`INSERT INTO ${table}`,'i'));});
});
