import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

import { pool } from '../../db';

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const moldIdSchema = z.string().regex(/^[1-9]\d*$/, 'Mold ID must be a positive integer');

const updateMoldSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    multiplier: z.number().int().positive('multiplier must be a positive integer').optional(),
    stockModels: z.array(z.string().trim().min(1)).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one supported mold field is required',
  });

function moldRowToApi(row: Record<string, unknown>) {
  return {
    id: row.id,
    moldId: row.mold_id,
    modelName: row.model_name,
    stockModels: row.stock_models ?? [],
    instanceNumber: row.instance_number,
    enabled: row.enabled,
    multiplier: row.multiplier,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function createUpdateMoldSettingsHandler(database: Queryable = pool): RequestHandler {
  return async (req: Request, res: Response, _next: NextFunction) => {
    const idResult = moldIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      return res.status(400).json({ success: false, error: idResult.error.issues[0].message });
    }

    const bodyResult = updateMoldSettingsSchema.safeParse(req.body);
    if (!bodyResult.success) {
      const issue = bodyResult.error.issues[0];
      const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return res.status(400).json({ success: false, error: `${field}${issue.message}` });
    }

    const update = bodyResult.data;
    const requestedStockModels = update.stockModels === null ? [] : update.stockModels;

    try {
      if (requestedStockModels) {
        const uniqueStockModels = [...new Set(requestedStockModels)];
        if (uniqueStockModels.length !== requestedStockModels.length) {
          return res.status(400).json({
            success: false,
            error: 'stockModels must not contain duplicate IDs',
          });
        }

        if (uniqueStockModels.length > 0) {
          const stockModelResult = await database.query(
            'SELECT id FROM stock_models WHERE id = ANY($1::text[])',
            [uniqueStockModels],
          );
          const existingIds = new Set(stockModelResult.rows.map((row) => String(row.id)));
          const missingIds = uniqueStockModels.filter((stockModelId) => !existingIds.has(stockModelId));
          if (missingIds.length > 0) {
            return res.status(400).json({
              success: false,
              error: `Stock model not found: ${missingIds.join(', ')}`,
            });
          }
        }
      }

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      const addValue = (column: string, value: unknown, cast = '') => {
        params.push(value);
        setClauses.push(`${column} = $${params.length}${cast}`);
      };

      if (update.enabled !== undefined) addValue('enabled', update.enabled);
      if (update.isActive !== undefined) addValue('is_active', update.isActive);
      if (update.multiplier !== undefined) addValue('multiplier', update.multiplier);
      if (requestedStockModels !== undefined) {
        addValue('stock_models', requestedStockModels, '::text[]');
      }

      params.push(Number(idResult.data));
      const result = await database.query(
        `UPDATE molds
         SET ${setClauses.join(', ')}
         WHERE id = $${params.length}
         RETURNING *`,
        params,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Mold not found' });
      }

      return res.json({ success: true, mold: moldRowToApi(result.rows[0]) });
    } catch (error) {
      console.error('Error updating mold settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update mold settings',
      });
    }
  };
}
