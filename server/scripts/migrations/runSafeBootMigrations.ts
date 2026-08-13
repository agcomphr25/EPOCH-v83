import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

import { Pool } from 'pg';

type MigrationError = Error & {
  code?: string;
};

export function getSafeBootMigrationConnectionString() {
  return process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL;
}

export const safeMigrationFiles = [
  '0000_shiny_amazoness.sql',
  '0001_fix_cutting_built_packets_category_uuid.sql',
  '0002_fix_fabric_sources_inventory_id_uuid.sql',
  '0003_comprehensive_integer_to_uuid_audit.sql',
  '0004_job_allocations.sql',
  '0006_nonconforming_rmas_and_schema_columns.sql',
  '0007_p2_shipping_audit_log.sql',
  '0008_inventory_item_type_category.sql',
  '0009_schema_change_log.sql',
  '0010_all_orders_unique_order_id.sql',
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
  '0050_replace_perm_ucs_coalesce_index.sql',
  '0051_dcaa_enable_kiosk_pin.sql',
  '0052_dcaa_missing_tables.sql',
  '0053_seed_labor_charge_codes.sql',
  '0054_add_project_id_to_quotes.sql',
  '0055_customer_integer_id_bridge.sql',
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
  '0101_audit_tamper_attempts_durable.sql',
  '0101_burden_rate_accumulation.sql',
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
  '0114_inventory_high_risk_approvals.sql',
  '0114_shelf_life_out_time_enforcement.sql',
  '0115_receiving_project_material_acceptance.sql',
  '0115_vendor_pos_production_line.sql',
  '0116_parts_request_po_approvals.sql',
  '0116_po_project_links.sql',
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
  '0129_phase1_foundation_closure.sql',
  '0129_quality_section9_ncr_capa_calibration.sql',
  '0129_receiving_inspection_plans.sql',
  '0129_vendor_default_order_method.sql',
  '0130_audit_dcaa_security_section11.sql',
  '0130_cmmc_itar_security_vault.sql',
  '0130_vendor_po_support_tables_safe.sql',
  '0131_nonconformance_schema_alignment.sql',
  '0131_user_sessions_login_compatibility.sql',
  '0132_daily_time_certifications.sql',
  '0133_voice_notes_persistence.sql',
  '0134_conversational_rfq_risk_sessions.sql',
  '0134_knowledge_capture_enrichment.sql',
  '0134_project_revisions.sql',
  '0135_p2_po_contract_review_role.sql',
  '0135_pto_balances_and_schedules.sql',
  '0136_p1_fulfillment_attempts.sql',
  '0136_p2_production_change_form_approvals.sql',
  '0138_production_item_audit_records.sql',
  '0139_p2_production_orders_project_id.sql',
  '0139_wad_dashboard_assignment.sql',
  '0140_edri_supporting_documents.sql',
  '0141_program_manufacturing_orchestration.sql',
  '0142_punch_correction_requests.sql',
  '0143_internal_messages_nullable_sender.sql',
  '0145_timetrakgo_import_punch_source.sql',
  '0146_final_assembly_manufactured_category.sql',
  '0147_controlled_document_template_metadata.sql',
  '0148_darleneb_payment_permissions.sql',
  '0149_p1_payment_accounting_approval_workflow.sql',
  '0150_admin_punch_source.sql',
  '0151_non_conforming_items.sql',
  '0153_user_finish_technician_flag.sql',
  '0154_p1_department_notes.sql',
  '0155_repair_punch_correction_request_constraints.sql',
  '0156_p1_customer_contacts.sql',
  '0157_travelers_completed_at.sql',
  '0158_inventory_receipt_grni_accounting.sql',
  '0159_epoch_copilot_phase1.sql',
  '0160_po_project_links_safe.sql',
  '0161_employee_termination_access_controls.sql',
  '0162_p2_project_revision_type_po_change.sql',
  '0163_parts_request_requested_for.sql',
  '0164_charge_code_production_line_controls.sql',
  '0165_p2_billing_task_snoozes.sql',
  '0166_p2_packing_slip_invoice_number.sql',
  '0172_p2_invoice_numbering.sql',
  '0173_nonconformance_records_runtime_alignment.sql',
  '0174_repair_p2_po_revision_work_transfer.sql',
  '0176_part_routings_project_id.sql',
  '0177_inventory_item_primary_image.sql',
  '0178_employee_notification_preferences.sql',
  '0179_inventory_item_order_url.sql',
  '0180_wad_revisions.sql',
  '0181_project_rom_drafts.sql',
  '0182_repair_rock_west_p2_customer_year_serials.sql',
  '0183_wad_charge_code_requests.sql',
  '0184_cnc_operation_batches.sql',
  '0185_draft_bom_drafts.sql',
  '0186_draft_bom_draft_access_controls.sql',
  '0186_inventory_items_machined_part_fields.sql',
  '0186_p2_bom_definition_inventory_link.sql',
  '0187_cnc_operation_batch_labor_links.sql',
  '0187_repair_p2_po_unit_serials.sql',
  '0188_rd_projects.sql',
  '0188b_design_control_add_rd_project_id.sql',
  '0189_design_control_workflow.sql',
  '0190_design_control_requirement_applicability.sql',
  '0191_engineering_releases.sql',
  '0192_engineering_packages.sql',
  '0193_rts_ready_to_sell_item_identity.sql',
  '0194_layup_schedule_history.sql',
  '0195_production_order_transition_history.sql',
  '0196_document_template_builder_tables.sql',
  '0199_project_workflow_version.sql',
  '0201_freezer_temperature_logs.sql',
  '0202_project_workflow_instances.sql',
  '0203_project_design_applicability_decisions.sql',
  '0204_project_production_plans.sql',
  '0205_project_wad_authorizations.sql',
  '0206_project_commercial_stage_reviews.sql',
  '0207_design_control_authority_foundation.sql',
  '0208_design_control_authenticated_approvals.sql',
  '0209_project_technical_configuration_reviews.sql',
  '0210_master_document_control_hardening.sql',
  '0210_project_preproduction_readiness.sql',
  '0210_repair_freezer_temperature_tracking.sql',
  '0211_design_control_form_templates.sql',
  '0212_project_preproduction_launch_safety.sql',
  '0213_design_control_project_form_instances.sql',
  '0214_engineering_change_requests.sql',
  '0215_engineering_change_notices.sql',
  '0216_post_release_design_change_gating.sql',
  '0217_freezer_na_readings.sql',
  '0218_as9100_audit_readiness.sql',
  '0219_controlled_printed_copies.sql',
  '0220_p2_v2_production_execution.sql',
  '0221_design_history_files.sql',
  '0222_p2_v2_quality_product_release.sql',
  '0222_vendor_scope_approved_for.sql',
  '0223_project_production_launch_status_repair.sql',
  '0224_p2_v2_quality_release_hardening.sql',
  '0225_p2_v2_shipping_project_closeout.sql',
  '0226_project_production_launch_composite_key.sql',
  '0227_receiving_rd_project_targets.sql',
  '0228_vendor_po_void_control.sql',
  '0229_epoch_software_validation.sql',
  '0230_qms_change_control_register.sql',
  '0231_p1_po_item_quantity_adjustments.sql',
  '0232_p2_v2_controlled_pilot_readiness.sql',
  '0233a_spec_sheets_base_table.sql',
  '0233_part_specification_sheet_control.sql',
  '0234_epoch_validation_readiness_controls.sql',
  '0129a_capa_records_base_table.sql',
  '0235_quality_action_change_control.sql',
  '0236_salaried_holiday_calendar.sql',
  '0241_rom_builder_approval_authority.sql',
  '0242_epoch_validation_create_idempotency.sql',
  '0245_controlled_document_legacy_reconciliation.sql',
  '0237_freezer_temperature_log_crud.sql',
  '0248_design_project_manufacturing_configuration.sql',
  '0249_prior_month_payment_entry_grace.sql',
  '0250_epoch_validation_wizard_phase1.sql',
  '0251_design_project_configuration_workspace.sql',
  '0252_potential_order_duplicate_reviews.sql',
  '0254_controlled_document_reconciliation_certification_controls.sql',
  '0255_p2_v2_definition_v3_handoff.sql',
  '0256_controlled_document_atomic_approval_release.sql',
  '0258_design_control_structured_lifecycle.sql',
  '0259_design_control_form_template_database_artifacts.sql',
  '0260_controlled_document_source_recovery.sql',
  '0261_payment_aware_refund_completion.sql',
  '0262_p2_customer_demand_quantity_ledger.sql',
  '0263_p1_customer_po_document_imports.sql',
  '0264_p2_recursive_production_demand_foundation.sql',
  '0265_p2_demand_planning_foundation.sql',
  '0266_p2_production_launch_persistence.sql',
  '0267_reconcile_p18380_persisted_shipment.sql',
  '0268_replit_p2_demand_composite_fk_repair.sql',
  '0269_repair_composite_po_item_demand_fks.sql',
  '0270_certification_authorization_matrix.sql',
  '0271_p2_execution_authorization_event.sql',
  '0272_p2_production_order_provisioning_event.sql',
  '0273_p2_serialized_unit_provisioning.sql',
];

export const criticalMigrationFiles = new Set([
  '0060_punch_ledger.sql',
  '0061_punch_ledger_pwo_fk.sql',
  '0062_punch_ledger_check_constraints.sql',
  '0063_vendor_pos_archived_column.sql',
  '0064_punch_ledger_wad_traceability.sql',
  '0065_vendor_date_columns_proper_type.sql',
  '0090_labor_allocations.sql',
  '0188_rd_projects.sql',
  '0188b_design_control_add_rd_project_id.sql',
  '0189_design_control_workflow.sql',
  '0190_design_control_requirement_applicability.sql',
  '0191_engineering_releases.sql',
  '0192_engineering_packages.sql',
  '0196_document_template_builder_tables.sql',
  '0207_design_control_authority_foundation.sql',
  '0208_design_control_authenticated_approvals.sql',
  '0210_master_document_control_hardening.sql',
  '0210_project_preproduction_readiness.sql',
  '0210_repair_freezer_temperature_tracking.sql',
  '0211_design_control_form_templates.sql',
  '0212_project_preproduction_launch_safety.sql',
  '0213_design_control_project_form_instances.sql',
  '0214_engineering_change_requests.sql',
  '0215_engineering_change_notices.sql',
  '0216_post_release_design_change_gating.sql',
  '0217_freezer_na_readings.sql',
  '0218_as9100_audit_readiness.sql',
  '0219_controlled_printed_copies.sql',
  '0220_p2_v2_production_execution.sql',
  '0221_design_history_files.sql',
  '0222_p2_v2_quality_product_release.sql',
  '0222_vendor_scope_approved_for.sql',
  '0223_project_production_launch_status_repair.sql',
  '0224_p2_v2_quality_release_hardening.sql',
  '0225_p2_v2_shipping_project_closeout.sql',
  '0226_project_production_launch_composite_key.sql',
  '0229_epoch_software_validation.sql',
  '0230_qms_change_control_register.sql',
  '0235_quality_action_change_control.sql',
  '0236_salaried_holiday_calendar.sql',
  '0237_freezer_temperature_log_crud.sql',
  '0248_design_project_manufacturing_configuration.sql',
  '0249_prior_month_payment_entry_grace.sql',
  '0251_design_project_configuration_workspace.sql',
  '0252_potential_order_duplicate_reviews.sql',
  '0254_controlled_document_reconciliation_certification_controls.sql',
  '0256_controlled_document_atomic_approval_release.sql',
  '0231_p1_po_item_quantity_adjustments.sql',
  '0232_p2_v2_controlled_pilot_readiness.sql',
  '0233a_spec_sheets_base_table.sql',
  '0233_part_specification_sheet_control.sql',
  '0234_epoch_validation_readiness_controls.sql',
  '0129a_capa_records_base_table.sql',
  '0235_quality_action_change_control.sql',
  '0241_rom_builder_approval_authority.sql',
  '0242_epoch_validation_create_idempotency.sql',
  '0245_controlled_document_legacy_reconciliation.sql',
  '0250_epoch_validation_wizard_phase1.sql',
  '0255_p2_v2_definition_v3_handoff.sql',
  '0258_design_control_structured_lifecycle.sql',
  '0259_design_control_form_template_database_artifacts.sql',
  '0260_controlled_document_source_recovery.sql',
  '0261_payment_aware_refund_completion.sql',
  '0262_p2_customer_demand_quantity_ledger.sql',
  '0263_p1_customer_po_document_imports.sql',
  '0264_p2_recursive_production_demand_foundation.sql',
  '0265_p2_demand_planning_foundation.sql',
  '0266_p2_production_launch_persistence.sql',
  '0267_reconcile_p18380_persisted_shipment.sql',
  '0268_replit_p2_demand_composite_fk_repair.sql',
  '0269_repair_composite_po_item_demand_fks.sql',
  '0270_certification_authorization_matrix.sql',
  '0271_p2_execution_authorization_event.sql',
  '0272_p2_production_order_provisioning_event.sql',
  '0273_p2_serialized_unit_provisioning.sql',
]);

export async function runSafeBootMigrations() {
  const connectionString = getSafeBootMigrationConnectionString();
  if (!connectionString) {
    throw new Error(
      'Missing required database environment variable: FORCE_DATABASE_URL or DATABASE_URL'
    );
  }

  const migrPool = new Pool({ connectionString });
  const migrationsDir = join(process.cwd(), 'migrations');
  let appliedCount = 0;

  try {
    for (const f of safeMigrationFiles) {
      const filePath = join(migrationsDir, f);
      if (!existsSync(filePath)) {
        if (criticalMigrationFiles.has(f)) {
          throw new Error(`Critical migration file not found on disk: ${f}`);
        }
        continue;
      }
      try {
        await migrPool.query(readFileSync(filePath, 'utf-8'));
        appliedCount++;
      } catch (caughtFileErr: unknown) {
        const fileErr = caughtFileErr as MigrationError;
        if (criticalMigrationFiles.has(f)) {
          console.error(
            `❌ Critical migration ${f} failed: ${fileErr.message}`
          );
          throw fileErr;
        }
        console.warn(`⚠️ Migration ${f} skipped: ${fileErr.message}`);
      }
    }
  } finally {
    try {
      await migrPool.end();
    } catch {
      // Pool shutdown is best-effort after migration completion.
    }
  }

  console.log(
    `✅ Pre-deploy migrations: ${appliedCount}/${safeMigrationFiles.length} applied (or already correct)`
  );

  // Certification replays only the migration mechanism. The remaining helpers
  // are application-startup maintenance and may retain long-lived resources.
  if (process.env.SAFE_BOOT_MIGRATIONS_ONLY === 'true') return;

  try {
    const { logCriticalSchemaHealth } = await import(
      '../../utils/schemaHealth'
    );
    await logCriticalSchemaHealth();
  } catch (caughtSchemaHealthErr: unknown) {
    const schemaHealthErr = caughtSchemaHealthErr as MigrationError;
    console.warn(
      'Critical schema health check skipped:',
      schemaHealthErr.message
    );
  }

  try {
    const { migrateVendorDocumentUrls } = await import(
      '../../src/routes/vendors'
    );
    await migrateVendorDocumentUrls();
  } catch (caughtVendorMigrErr: unknown) {
    const vendorMigrErr = caughtVendorMigrErr as MigrationError;
    console.warn(
      '⚠️ Vendor document URL migration failed:',
      vendorMigrErr.message
    );
  }

  try {
    const diskFiles = readdirSync(migrationsDir).filter((f: string) =>
      f.endsWith('.sql')
    );
    const safeSet = new Set(safeMigrationFiles);
    const missing = diskFiles.filter((f: string) => !safeSet.has(f));
    if (missing.length > 0) {
      for (const f of missing) {
        console.warn(
          `⚠️ Migration file on disk is NOT in safeMigrationFiles and will be skipped: ${f}`
        );
      }
    }
  } catch (caughtScanErr: unknown) {
    const scanErr = caughtScanErr as MigrationError;
    console.warn(
      '⚠️ Could not scan migrations directory for unlisted files:',
      scanErr.message
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runSafeBootMigrations().catch((err) => {
    console.error('Safe boot migration runner failed:', err);
    process.exit(1);
  });
}
