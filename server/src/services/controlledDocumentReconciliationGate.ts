import type { NextFunction, Request, Response } from 'express';

import { pool } from '../../db';
import {
  assertControlledDocumentReconciliationSchemaReady,
  ControlledDocumentSchemaNotReadyError,
  requiredControlledDocumentReconciliationCorrectiveMigration,
  requiredControlledDocumentReconciliationMigration,
} from './controlledDocumentSchemaReadiness';

export const CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED =
  'CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED';

export function isControlledDocumentReconciliationExplicitlyEnabled(
  value = process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED
): boolean {
  return value === 'true';
}

export async function getControlledDocumentReconciliationAvailability() {
  if (!isControlledDocumentReconciliationExplicitlyEnabled()) {
    return {
      enabled: false,
      error: CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED,
      message: 'Phase 1B reconciliation is unavailable pending certification.',
    } as const;
  }
  try {
    await assertControlledDocumentReconciliationSchemaReady(pool);
    return { enabled: true } as const;
  } catch (error) {
    if (error instanceof ControlledDocumentSchemaNotReadyError) {
      return {
        enabled: false,
        error: error.code,
        message: error.message,
        requiredMigration: requiredControlledDocumentReconciliationMigration,
        requiredMigrations: [
          requiredControlledDocumentReconciliationMigration,
          requiredControlledDocumentReconciliationCorrectiveMigration,
        ],
        missingObjects: error.missingObjects,
      } as const;
    }
    throw error;
  }
}

export async function requireControlledDocumentReconciliationEnabled(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const availability = await getControlledDocumentReconciliationAvailability();
  if (!availability.enabled) return res.status(503).json(availability);
  next();
}
