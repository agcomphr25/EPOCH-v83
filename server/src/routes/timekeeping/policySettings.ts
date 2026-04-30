import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import { authenticateToken, requireRole } from "../../../middleware/auth";
import { actorFromUser } from "../../services/timekeeping/audit.service";
import * as svc from "../../services/timekeeping/policySettings.service";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/policy-settings]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

const UpdatePolicyBody = z.object({
  certificationRequired: z.boolean().optional(),
  correctionApprovalRequired: z.boolean().optional(),
  minimumHoursPerWeek: z.number().min(0).max(168).nullable().optional(),
  lateSubmissionGraceDays: z.number().int().min(0).nullable().optional(),
  lateSubmissionBlock: z.boolean().optional(),
  certificationStatement: z.string().min(10).optional(),
  certificationVersion: z.number().int().min(1).optional(),
});

const router: IRouter = Router();

router.get(
  "/policy-settings",
  authenticateToken as RequestHandler,
  requireRole("ADMIN", "OWNER") as RequestHandler,
  h(async (_req, res) => {
    const policy = await svc.getOrCreatePolicySettings();
    res.json(policy);
  })
);

router.put(
  "/policy-settings",
  authenticateToken as RequestHandler,
  requireRole("ADMIN", "OWNER") as RequestHandler,
  h(async (req, res) => {
    const parsed = UpdatePolicyBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const actor = actorFromUser(
      (req as Request & { user?: Parameters<typeof actorFromUser>[0] }).user ?? null,
      req.ip ?? null
    );

    const result = await svc.updatePolicySettings(parsed.data, actor);
    if ("error" in result) {
      return void res.status(400).json({ error: result.error });
    }
    res.json(result);
  })
);

export default router;
