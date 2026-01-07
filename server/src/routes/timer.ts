import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";

const router = Router();

router.use(authenticateToken);

const DISABLED_MSG = { error: "Timer feature disabled" };

router.get("/runs", (_req, res) => res.status(501).json(DISABLED_MSG));
router.post("/start", (_req, res) => res.status(501).json(DISABLED_MSG));
router.post("/advance/:id", (_req, res) => res.status(501).json(DISABLED_MSG));
router.post("/pause/:id", (_req, res) => res.status(501).json(DISABLED_MSG));
router.post("/resume/:id", (_req, res) => res.status(501).json(DISABLED_MSG));
router.post("/stop/:id", (_req, res) => res.status(501).json(DISABLED_MSG));
router.post("/run-complete", (_req, res) => res.status(501).json(DISABLED_MSG));

export default router;
