/**
 * REQUIRED_CAPABILITY_KEYS
 *
 * A curated list of every capability key that the server routes enforce via
 * requirePermission(). This list is used as a cross-check against the live
 * route-file scan in validateCapabilities.ts — if the two sets diverge (e.g.
 * a key is added to a route but not here, or vice-versa), a warning is logged
 * at startup.
 *
 * IMPORTANT: The authoritative startup gate is the route-file scanner in
 * server/src/validateCapabilities.ts, which extracts keys directly from route
 * source files and compares them against perm_capabilities in the DB. This
 * list does NOT need to be updated for the gate to catch mismatches, but it
 * should be kept in sync as documentation and for static analysis.
 *
 * When adding a new requirePermission('some.key') call:
 *  1. Add the key to the epochCapabilities seed in server/index.ts.
 *  2. No file list update needed — the validator auto-scans all .ts files under
 *     server/src/routes/ and modules/ at startup.
 *  3. Add the key here so this list stays accurate.
 *
 * Note: requirePermission() calls must use string literals (not variables) so the
 * regex-based scanner in validateCapabilities.ts can discover them at startup.
 */
export const REQUIRED_CAPABILITY_KEYS: readonly string[] = [
  // Work-order management
  'work_orders.release',
  'work_orders.approve_overrun',
  'work_orders.override_charges',
  'p2.work_orders.view',
  'p2.work_orders.materialize',
  'p2.work_orders.manage',
  'p2.work_orders.execute',
  'p2.work_orders.complete_operation',
  'p2.work_orders.accept',
  'p2.material_consumption.record',
  'p2.material_consumption.reverse',
  'p2.manufactured_output.record',
  'p2.manufactured_output.release',
  'p2.manufactured_output.custody_receive',
  'p2.manufactured_output.custody_reverse',
  'p2.manufactured_component.issue',
  'p2.manufactured_component.issue_reverse',
  'p2.manufactured_output.quality_accept',
  'p2.manufactured_output.shipment_release',
  'manufacturing.stock_build.view',
  'manufacturing.stock_build.create',
  'manufacturing.stock_build.release',

  // Traveler lifecycle
  'travelers.start',
  'travelers.finish',
  'travelers.sign_qc',
  'travelers.sign_qc_preproduction',

  // Timekeeping
  'time.edit_entry',
  'time.approve',

  // Project closings
  'projects.close',
  'projects.approve_closing',

  // Controlled documents
  'documents.view',
  'documents.create',
  'documents.edit_draft',
  'documents.submit',
  'documents.approve',
  'spec_sheets.history.view',
  'documents.release',
  'documents.revise',
  'documents.supersede',
  'documents.obsolete',
  'documents.void',
  'documents.number_admin',
  'documents.reconciliation_view',
  'documents.reconciliation_preview',
  'documents.reconciliation_execute',
  'documents.reconciliation_resolve',
  'documents.recovery_view',
  'documents.recovery_preview',
  'documents.recovery_import',
  'documents.recovery_execute',
  'documents.recovery_disposition',
  'documents.template.create',
  'documents.template.revise',
  'documents.template.release',
  'documents.template.obsolete',
  'design.forms.view',
  'design.forms.create',
  'design.forms.edit',
  'design.forms.submit',
  'design.forms.approve',
  'design.forms.upload_paper',
  'design.forms.supersede',
  'engineering.ecr.view',
  'engineering.ecr.create',
  'engineering.ecr.edit',
  'engineering.ecr.submit',
  'engineering.ecr.review',
  'engineering.ecr.disposition',
  'engineering.ecr.admin',
  'engineering.ecn.view',
  'engineering.ecn.create',
  'engineering.ecn.edit',
  'engineering.ecn.submit',
  'engineering.ecn.approve',
  'engineering.ecn.implement',
  'engineering.ecn.verify',
  'engineering.ecn.validate',
  'engineering.ecn.admin',
  'qms.change_control.view',
  'qms.change_control.create',
  'qms.change_control.import',
  'qms.change_control.submit',
  'qms.change_control.review',
  'qms.change_control.approve',
  'qms.change_control.implement',
  'qms.change_control.verify',
  'qms.change_control.close',
  'qms.change_control.reopen',
  'qms.change_control.admin',
  'qms.quality_action.ncr_create',
  'qms.quality_action.car_create',
  'qms.quality_action.pcr_create',
  'qms.quality_action.screen',
  'qms.quality_action.assign_investigation',
  'qms.quality_action.investigate',
  'qms.quality_action.assess_impact',
  'qms.quality_action.approve_quality',
  'qms.quality_action.approve_production',
  'qms.quality_action.approve_engineering',
  'qms.quality_action.approve_program_contracts',
  'qms.quality_action.approve_technical_authority',
  'qms.quality_action.approve_finance',
  'qms.quality_action.production_hold',
  'qms.quality_action.authorize_implementation',
  'qms.quality_action.verify_implementation',
  'qms.quality_action.close',
  'qms.quality_action.verify_effectiveness',
  'qms.quality_action.duplicate_admin',
  'qms.quality_action.workflow_admin',
  'engineering.release.view',
  'engineering.release.preview',
  'engineering.release.create',
  'engineering.release.approve',
  'engineering.release.admin',
  'documents.controlled_copy.view',
  'documents.controlled_copy.issue',
  'documents.controlled_copy.return',
  'documents.controlled_copy.reconcile',
  'documents.controlled_copy.destroy',
  'documents.controlled_copy.report_lost',
  'documents.controlled_copy.admin',
  'design.dhf.view',
  'design.dhf.preview',
  'design.dhf.generate',
  'design.dhf.approve',
  'design.dhf.export',
  'design.dhf.verify',
  'design.dhf.admin',
  'engineering.package.view',
  'engineering.package.generate',
  'design.control.view',
  'design.control.create',
  'design.control.admin',
  'design.control.edit',
  'design.control.submit',
  'design.control.approve',
  'design.requirement.approve',
  'design.risk.accept',
  'design.verify',
  'design.validate',
  'design.release',

  // Employee qualifications
  'employees.manage_qualifications',

  // Orders
  'orders.create',
  'orders.cancel',
  'orders.department_transfer',

  // Finance
  'finance.view',
  'finance.post_invoice',
  'finance.void_invoice',
  'finance.manage_payments',

  // Inventory
  'inventory.adjust',
  'inventory.manage_requests',
  'inventory.approve_parts_requests',
  'inventory.traceability.view',
  'inventory.approve_high_risk',

  // Inventory — Cycle Count subsystem (Task #142)
  'inventory.cycleCount.view',
  'inventory.cycleCount.create',
  'inventory.cycleCount.perform',
  'inventory.cycleCount.approve',
  'inventory.cycleCount.postAdjustments',

  // Shipping
  'shipping.mark_shipped',
  'shipping.create_label',

  // Quality
  'quality.manage_definitions',
  'quality.manage_capa',
  'quality.manage_calibration',

  // Purchasing
  'purchasing.manage_pos',
  'purchasing.approve_po',
  'purchasing.view_requisitions',
  'purchasing.create_requisition',
  'purchasing.approve_requisition',
  'purchasing.admin_chain',
  'purchasing.record_debarment_check',
  'purchasing.direct_po_exception',

  // Assets
  'assets.manage',

  // Training
  'training.manage_content',
  'training.record_completion',

  // P2 V2 controlled pilot readiness
  'projects.pilot_v2.view',
  'projects.pilot_v2.manage',
  'projects.pilot_v2.quality_approve',
  'projects.pilot_v2.operations_approve',
  'projects.pilot_v2.pm_approve',
  'projects.pilot_v2.rollout_approve',
  'projects.pilot_v2.issue_manage',
  'projects.pilot_v2.training_record',

  // Admin
  'admin.manage_users',
  'admin.order_lookup',

  // Scheduling
  'scheduling.manage',

  // Reports
  'reports.export',
  'reports.manage_presets',

  // PTO lifecycle
  'timekeeping.pto.submit_self',
  'timekeeping.pto.submit_on_behalf',
  'timekeeping.pto.approve_supervisor',
  'timekeeping.pto.approve_hr',
  'timekeeping.pto.approve_vp',
  'timekeeping.pto.view_all',
  'timekeeping.pto.cancel_request',
  'timekeeping.time_clock_admin.access',

  // Improvement Notes (workflow improvement capture)
  // Note: 'improvement_notes.create' is seeded in perm_capabilities for future
  // use but POST is intentionally auth-only (any logged-in user can submit a
  // note), so it is not listed here as a requirePermission() callsite.
  'improvement_notes.view',
  'improvement_notes.manage',
] as const;

/**
 * ─── APPROVAL-AUTHORITY REGISTRY ─────────────────────────────────────────────
 *
 * Maps every named capability key to its governance meaning, the route(s) it
 * protects, and the roles that are seeded with it by default.  This replaces
 * tribal knowledge with inline documentation so future developers know exactly
 * which permission governs each authority action.
 *
 * Format per entry:
 *   capability key
 *     Governance: what authority this grants
 *     Routes:     HTTP verb + path pattern(s) protected by this key
 *     Seeded to:  roles that receive this capability during boot-time seeding
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * work_orders.release
 *   Governance: Release a WAD to the production floor and create traveler packages
 *   Routes:     POST /api/work-orders/:id/release
 *   Seeded to:  ADMIN, OWNER
 *
 * work_orders.approve_overrun
 *   Governance: Approve or deny a labor budget override request (allows clock-in past exhausted WAD budget)
 *   Routes:     PATCH /api/work-orders/production/:id/budget-overrides/:overrideId
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR, MANAGER
 *
 * work_orders.override_charges
 *   Governance: Override labor charge codes, approve cost overruns, and bypass traveler start gates
 *   Routes:     POST /api/work-orders/:id/approve-overrun
 *               POST /api/travelers/:travelerId/steps/:stepId/start/override
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR
 *
 * travelers.start
 *   Governance: Start a traveler (transition DRAFT → IN_PROGRESS)
 *   Routes:     POST /api/travelers/:id/start
 *   Seeded to:  ADMIN, OWNER, FLOOR_OPERATOR
 *
 * travelers.finish
 *   Governance: Mark a traveler as complete (transition IN_PROGRESS → COMPLETED)
 *   Routes:     POST /api/travelers/:id/finish
 *   Seeded to:  ADMIN, OWNER, FLOOR_OPERATOR
 *
 * travelers.sign_qc
 *   Governance: Sign off / QC-approve a traveler step or CNC program
 *   Routes:     POST /api/travelers/:id/steps/:stepId/sign
 *               POST /api/cnc/programs/:id/approve
 *   Seeded to:  ADMIN, OWNER, FLOOR_OPERATOR
 *
 * travelers.sign_qc_preproduction
 *   Governance: Sign off pre-production checklists before production begins
 *   Routes:     POST /api/preproduction-checklists/:id/sign-off
 *   Seeded to:  ADMIN, OWNER
 *
 * time.edit_entry
 *   Governance: Edit an existing timesheet entry
 *   Routes:     PATCH /api/timesheets/:id
 *   Seeded to:  ADMIN, OWNER
 *
 * time.approve
 *   Governance: Approve or reject submitted timesheets; close labor sessions
 *   Routes:     POST /api/timesheets/:id/approve
 *               POST /api/timesheets/:id/reject
 *               POST /api/labor/sessions/:id/close
 *   Seeded to:  ADMIN, OWNER
 *
 * projects.close
 *   Governance: Create or submit a project closing record and its sub-records
 *   Routes:     POST /api/projects/:id/closing
 *               POST /api/projects/:projectId/closing/risks
 *               POST /api/projects/:projectId/closing/actions
 *   Seeded to:  ADMIN, OWNER
 *
 * projects.approve_closing
 *   Governance: Formally approve a project closing record
 *   Routes:     POST /api/projects/:id/closing/approve
 *   Seeded to:  ADMIN, OWNER
 *
 * documents.approve
 *   Governance: Approve controlled documents (replaces the hardcoded lauriet username guard)
 *   Routes:     POST /api/controlled-documents/:id/approve
 *   Seeded to:  ADMIN, OWNER, DOCUMENT_MANAGER
 *
 * employees.manage_qualifications
 *   Governance: Grant or revoke machine-class and operation-type qualifications for employees
 *   Routes:     POST /api/employees/:employeeId/qualifications
 *               DELETE /api/employees/:employeeId/qualifications/:id
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR
 *
 * orders.create
 *   Governance: Create draft orders and finalize them into production
 *   Routes:     POST /api/orders/draft
 *               POST /api/orders/draft/:id/finalize
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * orders.cancel
 *   Governance: Cancel a finalized order
 *   Routes:     POST /api/orders/cancel/:orderId
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * orders.department_transfer
 *   Governance: Manually reassign an order to a different production department (corrections and emergency moves only)
 *   Routes:     PATCH /api/orders/:orderId/department
 *   Seeded to:  ADMIN, OWNER
 *
 * finance.view
 *   Governance: Read AR invoices, payments, aging reports, and customer summaries
 *   Routes:     GET /api/ar-invoices/*
 *               GET /api/ar-payments/*
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * finance.post_invoice
 *   Governance: Create, edit, send, and formally post AR invoices to the general ledger
 *   Routes:     POST /api/ar-invoices/
 *               PUT /api/ar-invoices/:id
 *               POST /api/ar-invoices/:id/send
 *               POST /api/ar-invoices/:id/post
 *   Seeded to:  ADMIN, OWNER
 *
 * finance.void_invoice
 *   Governance: Void or delete an AR invoice
 *   Routes:     POST /api/ar-invoices/:id/void
 *               DELETE /api/ar-invoices/:id
 *   Seeded to:  ADMIN, OWNER
 *
 * finance.manage_payments
 *   Governance: Record, allocate, and delete AR payments
 *   Routes:     POST /api/ar-payments/
 *               POST /api/ar-payments/:id/allocate
 *               DELETE /api/ar-payments/:id
 *               POST /api/orders/bulk-payment
 *               POST /api/payments/batch
 *               POST /api/payments/bulk-live
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * inventory.adjust
 *   Governance: Update and delete inventory items and balances
 *   Routes:     PUT /api/inventory/items/:id
 *               DELETE /api/inventory/items/:id
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * inventory.manage_requests
 *   Governance: Receive or reject inventory parts requests
 *   Routes:     POST /api/inventory/parts-requests/receive
 *               POST /api/inventory/parts-requests/:id/reject
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR, MANAGER
 *
 * inventory.approve_parts_requests
 *   Governance: Approve inventory parts requests before they enter RFQ or Vendor PO flow
 *   Routes:     PUT /api/inventory/parts-requests/:id when status is APPROVED
 *               POST /api/inventory/parts-requests/:id/approve
 *   Seeded to:  ADMIN, OWNER, INVENTORY_MANAGER
 *
 * shipping.mark_shipped
 *   Governance: Mark an order as shipped and record tracking information
 *   Routes:     POST /api/shipping/mark-shipped/:orderId
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR, MANAGER, FLOOR_OPERATOR
 *
 * shipping.create_label
 *   Governance: Create carrier shipping labels via UPS API
 *   Routes:     POST /api/shipping/create-label
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * quality.manage_definitions
 *   Governance: Create, update, and delete quality check definitions
 *   Routes:     POST /api/quality/definitions
 *               PUT /api/quality/definitions/:id
 *               DELETE /api/quality/definitions/:id
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR, MANAGER
 *
 * purchasing.manage_pos
 *   Governance: Create, update, and delete vendor purchase orders
 *   Routes:     POST /api/vendor-pos/
 *               PUT /api/vendor-pos/:id
 *               DELETE /api/vendor-pos/:id
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * purchasing.approve_po
 *   Governance: Issue and formally approve a vendor purchase order
 *   Routes:     POST /api/vendor-pos/:id/issue
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * assets.manage
 *   Governance: Create, update, and delete assets
 *   Routes:     POST /api/assets/
 *               PUT /api/assets/:id
 *               DELETE /api/assets/:id
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * training.manage_content
 *   Governance: Create, edit, and delete training modules and plans
 *   Routes:     POST /api/training/modules
 *               PATCH /api/training/modules/:id
 *               DELETE /api/training/modules/:id
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR, MANAGER
 *
 * training.record_completion
 *   Governance: Record employee training completions and quiz submissions
 *   Routes:     POST /api/training/employee/records
 *               POST /api/training/quiz/submit
 *   Seeded to:  ADMIN, OWNER, SUPERVISOR, MANAGER, FLOOR_OPERATOR
 *
 * admin.manage_users
 *   Governance: Create, update, and deactivate user accounts
 *   Routes:     POST /api/users/
 *               PUT /api/users/:id
 *               DELETE /api/users/:id
 *   Seeded to:  ADMIN, OWNER
 *
 * admin.order_lookup
 *   Governance: Look up a production order by ID to view its full status, department history, and item codes
 *   Routes:     GET /api/admin/order-lookup
 *   Seeded to:  ADMIN, OWNER
 *
 * scheduling.manage
 *   Governance: Create, update, and delete weekly schedule assignments
 *   Routes:     POST /api/weekly-schedule/
 *               POST /api/weekly-schedule/batch
 *               PATCH /api/weekly-schedule/:id
 *               DELETE /api/weekly-schedule/:id
 *               DELETE /api/weekly-schedule/week/:weekStartDate
 *   Seeded to:  ADMIN, OWNER, MANAGER, SUPERVISOR
 *
 * reports.export
 *   Governance: Execute custom order reports and export data to CSV
 *   Routes:     POST /api/reports/query
 *               POST /api/reports/export-csv
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * reports.manage_presets
 *   Governance: Save and delete report filter presets
 *   Routes:     POST /api/reports/presets
 *               DELETE /api/reports/presets/:id
 *   Seeded to:  ADMIN, OWNER, MANAGER
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
