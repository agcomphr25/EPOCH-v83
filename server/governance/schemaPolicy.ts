/**
 * Schema Policy
 *
 * Defines CRITICAL columns that can never be dropped automatically and exports
 * an evaluate() function that applies the policy to a set of violations.
 */

import type { GuardViolation } from './migrationGuard';
import type { DriftRecord } from './schemaDrift';

export interface PolicyDecision {
  allowed: boolean;
  explanation: string;
  criticalViolations: string[];
  warnings: string[];
}

/** Columns that are always CRITICAL — can never be auto-dropped. */
export const CRITICAL_COLUMNS: Record<string, Set<string>> = {
  all_orders: new Set([
    'order_id', 'order_date', 'due_date', 'customer_id', 'status', 'status_id',
    'current_department', 'current_department_id', 'is_paid', 'is_cancelled',
    'is_replacement', 'shipping_completed_at', 'tracking_number', 'shipped_date',
    'scrap_date', 'scrap_reason', 'created_at', 'updated_at',
  ]),
  payments: new Set([
    'id', 'order_id', 'payment_type', 'payment_amount', 'payment_date', 'created_at',
    'batch_id',
  ]),
  bulk_payment_batches: new Set([
    'id', 'created_at', 'created_by', 'customer_id', 'total_amount', 'payment_method', 'notes',
  ]),
  followup_orders: new Set([
    'id', 'order_id', 'customer_id', 'customer_email', 'signature_signed',
    'signature_data', 'signed_at', 'moved_to_production', 'created_at',
  ]),
  schema_change_log: new Set([
    'id', 'timestamp', 'actor', 'action_type', 'table_name', 'column_name',
  ]),
  nonconformance_records: new Set([
    'id', 'order_id', 'status', 'created_at',
  ]),
};

/** Tables that are wholly critical — DROP TABLE on them is always a critical violation. */
export const CRITICAL_TABLES: Set<string> = new Set([
  'all_orders',
  'payments',
  'bulk_payment_batches',
  'followup_orders',
  'schema_change_log',
  'nonconformance_records',
  'p2_customers',
  'p2_lot_numbers',
  'p2_final_inspection_results',
  'p2_serialized_items',
]);

function isCriticalColumn(table: string, column: string): boolean {
  return CRITICAL_COLUMNS[table]?.has(column) ?? false;
}

function isCriticalTable(table: string): boolean {
  return CRITICAL_TABLES.has(table);
}

export function evaluate(
  violations: GuardViolation[],
  driftRecords: DriftRecord[] = [],
  overrideFlag = false
): PolicyDecision {
  const criticalViolations: string[] = [];
  const warnings: string[] = [];

  for (const v of violations) {
    if (v.type === 'DROP_TABLE') {
      // Dropping an entire critical table is always a critical violation
      if (isCriticalTable(v.table)) {
        criticalViolations.push(
          `POLICY VIOLATION: Cannot drop critical table "${v.table}" — this table is required for production/compliance integrity.`
        );
        continue;
      }
    }
    if (v.type === 'DROP_COLUMN') {
      const col = v.column ?? '*';
      if (isCriticalColumn(v.table, col)) {
        criticalViolations.push(
          `POLICY VIOLATION: Cannot drop critical column "${v.table}.${col}" — this field is required for production/compliance integrity.`
        );
        continue;
      }
    }
    if (v.blocked) {
      if (v.rowCount > 0) {
        warnings.push(
          `Destructive operation on "${v.table}${v.column ? '.' + v.column : ''}" (${v.rowCount} rows affected).`
        );
      }
    }
  }

  for (const drift of driftRecords) {
    if (drift.severity === 'CRITICAL' && drift.status === 'MISSING_IN_DB') {
      criticalViolations.push(
        `SCHEMA DRIFT: Critical column "${drift.table}.${drift.column}" is in the schema but missing from the database. Fix: ${drift.suggestion}`
      );
    }
  }

  const hasCritical = criticalViolations.length > 0;

  if (hasCritical && !overrideFlag) {
    return {
      allowed: false,
      explanation: `Operation blocked by schema policy. ${criticalViolations.length} critical violation(s) require admin review and explicit override.`,
      criticalViolations,
      warnings,
    };
  }

  if (hasCritical && overrideFlag) {
    return {
      allowed: true,
      explanation: `Override accepted. ${criticalViolations.length} critical violation(s) were bypassed by admin override. All actions will be logged.`,
      criticalViolations,
      warnings,
    };
  }

  if (warnings.length > 0 && !overrideFlag) {
    return {
      allowed: false,
      explanation: `Operation requires override due to ${warnings.length} warning(s) on non-empty tables.`,
      criticalViolations,
      warnings,
    };
  }

  return {
    allowed: true,
    explanation: 'All policy checks passed.',
    criticalViolations: [],
    warnings,
  };
}
