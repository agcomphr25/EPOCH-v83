import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { pathToFileURL } from 'url';

const connectionString = process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing required database environment variable: FORCE_DATABASE_URL or DATABASE_URL');
  process.exit(1);
}

const safeFiles = [
  '0000_shiny_amazoness.sql',
  '0001_fix_cutting_built_packets_category_uuid.sql',
  '0002_fix_fabric_sources_inventory_id_uuid.sql',
  '0003_comprehensive_integer_to_uuid_audit.sql',
  '0004_job_allocations.sql',
  '0005_backfill_production_orders_item_codes.sql',
  '0006_nonconforming_rmas_and_schema_columns.sql',
  '0007_p2_shipping_audit_log.sql',
  '0008_inventory_item_type_category.sql',
  '0009_schema_change_log.sql',
  '0010_all_orders_unique_order_id.sql',
  '0011_fix_finalized_orders_in_production_departments.sql',
  '0012_bulk_payment_batches.sql',
  '0013_add_composite_manufactured_category.sql',
  '0014_receiving_control_center.sql',
  '0015_receiving_fk_constraints.sql',
  '0016_routing_type_enum.sql',
  '0017_routing_operations_tables.sql',
  '0018_routing_templates.sql',
  '0019_routing_dependencies.sql',
  '0020_anodize_jobs.sql',
  '0021_anodize_cert_inspection.sql',
  '0022_routing_dependency_enhancements.sql',
  '0023_traveler_component_associations.sql',
  '0024_add_assigned_technician_to_production_orders.sql',
  '0025_fix_production_daily_checklist_seed.sql',
  '0026_manufacturing_queue_released_at.sql',
  '0027_brian_ramirez_account_fix.sql',
  '0028_packing_slip_external_pdf.sql',
  '0029_add_component_manufactured_category.sql',
  '0030_p2_invoicing_phase1_schema.sql',
  '0031_p2_replacement_shipment_linkage.sql',
  '0032_canonical_customer_key.sql',
  '0033_v_all_shipments.sql',
  '0034_labor_gl_posting.sql',
  '0035_labor_cost_records_journal_entry_id.sql',
  '0036_project_closing_lessons_learned.sql',
  '0037_cycle_count_sessions.sql',
  '0037_project_closing_approval_fields.sql',
  '0038_labor_schema_phase1.sql',
  '0039_routing_operation_certification_id.sql',
  '0040_timestamptz_time_clock_entries.sql',
  '0041_perm_user_capability_scopes.sql',
  '0042_perm_ucs_unique_constraint.sql',
  '0043_perm_ucs_fk_and_constraints.sql',
  '0044_perm_ucs_strict_scope_constraint.sql',
  '0045_refund_requests_last_reminded_at.sql',
  '0046_dcaa_audit_findings.sql',
  '0047_timekeeper_pin_and_timezone.sql',
  '0048_drop_punch_events.sql',
  '0049_retire_timekeeping_identity_columns.sql',
  '0049_settings_table.sql',
  '0049_timekeeping_schema.sql',
  '0050_replace_perm_ucs_coalesce_index.sql',
  '0051_dcaa_enable_kiosk_pin.sql',
  '0052_dcaa_missing_tables.sql',
  '0052_dcaa_scheduler_state.sql',
  '0053_seed_labor_charge_codes.sql',
  '0054_add_project_id_to_quotes.sql',
  '0055_customer_integer_id_bridge.sql',
  '0055_labor_session_request_ref.sql',
  '0056_backfill_fulfilled_orders_shipped_date.sql',
  '0057_p2_cert_hardening.sql',
  '0058_backfill_training_cert_part_numbers.sql',
  '0059_native_charge_codes.sql',
  '0060_punch_ledger.sql',
  '0061_punch_ledger_pwo_fk.sql',
  '0062_punch_ledger_check_constraints.sql',
  '0063_vendor_pos_archived_column.sql',
  '0064_punch_ledger_wad_traceability.sql',
  '0065_vendor_date_columns_proper_type.sql',
  '0066_drop_timekeeping_deprecated_columns.sql',
  '0067_project_closing_approval_fields.sql',
  '0068_settings_table.sql',
  '0069_timekeeping_schema.sql',
  '0070_dcaa_scheduler_state.sql',
  '0071_training_certifications_cert_id.sql',
  '0072_labor_session_request_ref.sql',
  '0073_vendor_doc_migration_flags.sql',
  '0074_vendor_po_confirmed_fields.sql',
  '0075_cutting_documents_table.sql',
  '0075_time_off_requests.sql',
  '0076_vendor_po_compliance_reviews.sql',
  '0077_compliance_requires_attention.sql',
  '0077_phase_a_salaried_labor_capture.sql',
  '0078_historical_backfill_flag.sql',
  '0079_procurement_compliance_effective_date.sql',
  '0080_link_users_to_employees.sql',
  '0081_proteus_labs.sql',
  '0082_pto_three_stage_approval.sql',
  '0083_proteus_executions_cascade.sql',
  '0084_pto_payroll_blockers.sql',
  '0085_labor_capture_suggestions.sql',
  '0086_p2_serialized_items_barcode_printed_at.sql',
  '0087_pin_rate_limit.sql',
  '0088_oem_invoice_number.sql',
  '0089_vendor_po_compliance_legacy_exception.sql',
  '0090_labor_allocations.sql',
  '0091_timesheet_corrections.sql',
  '0092_timesheet_status_extended.sql',
  '0093_timekeeping_policy_settings.sql',
  '0094_enable_salaried_timesheets.sql',
  '0094_labor_entry_drafts.sql',
  '0095_production_control_templates.sql',
  '0096_wad_document_links.sql',
  '0097_wad_wizard_data.sql',
  '0098_payroll_export_batches.sql',
  '0099_audit_evidence_hardening.sql',
  '0099_employee_payroll_control.sql',
  '0099_policies_library.sql',
  '0099_punch_ledger_pending_approval.sql',
  '0100_audit_ledger_privilege_hardening.sql',
  '0100_burden_rates_engine.sql',
  '0101_burden_rate_accumulation.sql',
  '0101_audit_tamper_attempts_durable.sql',
  '0102_traveler_off_system_completion_link.sql',
  '0103_accounting_control_center.sql',
  '0104_improvement_notes.sql',
  '0106_employee_payroll_item_attachments.sql',
  '0107_accounting_expense_attachments.sql',
  '0108_parts_request_project_line_budget.sql',
  '0109_inventory_transaction_ledger.sql',
  '0109_vendor_pos_purchasing_controls_columns.sql',
  '0110_purchasing_controls_tables_and_vendor_pos_parity.sql',
  '0111_approval_escalation_engine.sql',
  '0111_critical_schema_health_repairs.sql',
  '0111_digital_signatures.sql',
  '0111_inventory_anomaly_detection.sql',
  '0111_routing_step_enforcement.sql',
  '0112_cycle_count_subsystem.sql',
  '0112_inventory_traceability_capability.sql',
  '0112_material_issue_approvals.sql',
  '0113_routing_step_intent_backfill.sql',
  '0114_inventory_high_risk_approvals.sql',
  '0114_shelf_life_out_time_enforcement.sql',
  '0115_vendor_pos_production_line.sql',
  '0116_parts_request_po_approvals.sql',
  '0117_vendor_po_items_purchasing_unit_columns.sql',
  '0117_vendor_po_line_project_traceability.sql',
  '0118_vendor_po_traceability_columns_safe.sql',
  '0119_inventory_item_shelf_life_columns_safe.sql',
  '0120_project_far_flowdowns.sql',
  '0121_p2_invoice_review_send_structure.sql',
  '0121_quote_snapshots_and_po_reconciliation.sql',
  '0122_payment_void_audit_controls.sql',
  '0123_charge_code_cost_handling.sql',
  '0124_chart_of_accounts_foundation.sql',
  '0125_employee_onboarding_invites.sql',
  '0126_rfq_estimating_controls.sql',
  '0127_contract_po_review_flowdown.sql',
  '0127_quote_contract_snapshot_release_gates.sql',
  '0128_engineering_control_revision_eco.sql',
  '0128_procurement_section6_supplier_controls.sql',
  '0129_manufacturing_section8_execution_controls.sql',
  '0129_quality_section9_ncr_capa_calibration.sql',
  '0129_receiving_inspection_plans.sql',
  '0130_vendor_po_support_tables_safe.sql',
  '0130_audit_dcaa_security_section11.sql',
  '0131_user_sessions_login_compatibility.sql',
  '0132_daily_time_certifications.sql',
  '0133_voice_notes_persistence.sql',
  '0134_conversational_rfq_risk_sessions.sql',
  '0135_pto_balances_and_schedules.sql',
  '0142_punch_correction_requests.sql',
  'investigation_308_order_duplication.sql',
];

const criticalMigrations = new Set([
  '0060_punch_ledger.sql',
  '0061_punch_ledger_pwo_fk.sql',
  '0062_punch_ledger_check_constraints.sql',
  '0063_vendor_pos_archived_column.sql',
  '0064_punch_ledger_wad_traceability.sql',
  '0065_vendor_date_columns_proper_type.sql',
  '0090_labor_allocations.sql',
]);

export async function runSafeBootMigrations() {
  const migrPool = new Pool({ connectionString });
  const migrationsDir = join(process.cwd(), 'migrations');
  let appliedCount = 0;

  try {
    for (const f of safeFiles) {
      const filePath = join(migrationsDir, f);
      if (!existsSync(filePath)) {
        if (criticalMigrations.has(f)) {
          throw new Error(`Critical migration file not found on disk: ${f}`);
        }
        continue;
      }
      try {
        await migrPool.query(readFileSync(filePath, 'utf-8'));
        appliedCount++;
      } catch (fileErr: any) {
        if (criticalMigrations.has(f)) {
          console.error(`❌ Critical migration ${f} failed: ${fileErr.message}`);
          throw fileErr;
        }
        console.warn(`⚠️ Migration ${f} skipped: ${fileErr.message}`);
      }
    }
  } finally {
    try {
      await migrPool.end();
    } catch (_) {}
  }

  console.log(`✅ Pre-deploy migrations: ${appliedCount}/${safeFiles.length} applied (or already correct)`);

  try {
    const { logCriticalSchemaHealth } = await import('../../utils/schemaHealth');
    await logCriticalSchemaHealth();
  } catch (schemaHealthErr: any) {
    console.warn('Critical schema health check skipped:', schemaHealthErr.message);
  }

  try {
    const { migrateVendorDocumentUrls } = await import('../../src/routes/vendors');
    await migrateVendorDocumentUrls();
  } catch (vendorMigrErr: any) {
    console.warn('⚠️ Vendor document URL migration failed:', vendorMigrErr.message);
  }

  try {
    const diskFiles = readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql'));
    const safeSet = new Set(safeFiles);
    const missing = diskFiles.filter((f: string) => !safeSet.has(f));
    if (missing.length > 0) {
      for (const f of missing) {
        console.warn(`⚠️ Migration file on disk is NOT in safeFiles and will be skipped: ${f}`);
      }
    }
  } catch (scanErr: any) {
    console.warn('⚠️ Could not scan migrations directory for unlisted files:', scanErr.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSafeBootMigrations().catch((err) => {
    console.error('Safe boot migration runner failed:', err);
    process.exit(1);
  });
}
