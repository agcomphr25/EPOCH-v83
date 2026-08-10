import type { NextFunction, Request, Response } from 'express';

import {
  assertControlledDocumentRecoverySchemaReady,
  ControlledDocumentRecoverySchemaNotReadyError,
  requiredControlledDocumentRecoveryMigration,
} from './controlledDocumentRecoverySchemaReadiness';
import { isControlledDocumentRecoveryExplicitlyEnabledValue } from './controlledDocumentRecoveryService';

export const CONTROLLED_DOCUMENT_RECOVERY_DISABLED =
  'CONTROLLED_DOCUMENT_RECOVERY_DISABLED';

export function isControlledDocumentRecoveryExplicitlyEnabled(
  value = process.env.CONTROLLED_DOCUMENT_RECOVERY_ENABLED
) {
  return isControlledDocumentRecoveryExplicitlyEnabledValue(value);
}

export async function getControlledDocumentRecoveryAvailability() {
  try {
    await assertControlledDocumentRecoverySchemaReady();
  } catch (error) {
    if (error instanceof ControlledDocumentRecoverySchemaNotReadyError) {
      return {
        schemaReady: false,
        executionEnabled: false,
        error: error.code,
        message: error.message,
        requiredMigration: requiredControlledDocumentRecoveryMigration,
        missingObjects: error.missingObjects,
      } as const;
    }
    throw error;
  }
  const executionEnabled = isControlledDocumentRecoveryExplicitlyEnabled();
  return {
    schemaReady: true,
    executionEnabled,
    error: executionEnabled ? null : CONTROLLED_DOCUMENT_RECOVERY_DISABLED,
    message: executionEnabled
      ? 'Document File Recovery execution is available.'
      : 'Document File Recovery execution is disabled pending authorization and certification.',
  } as const;
}

export async function requireControlledDocumentRecoverySchema(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const availability = await getControlledDocumentRecoveryAvailability();
  if (!availability.schemaReady) return res.status(503).json(availability);
  next();
}

export async function requireControlledDocumentRecoveryExecution(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const availability = await getControlledDocumentRecoveryAvailability();
  if (!availability.schemaReady || !availability.executionEnabled)
    return res.status(503).json(availability);
  next();
}
