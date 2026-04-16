import { Router, type IRouter } from "express";
import { kioskSurface } from "../middlewares/surface";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import employeesRouter from "./employees";
import punchesRouter from "./punches";
import timesheetsRouter from "./timesheets";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import costCodesRouter from "./cost-codes";
import amendmentsRouter from "./amendments";
import leaveRouter from "./leave";

const router: IRouter = Router();

router.use(healthRouter);

router.use(authRouter);

router.use("/kiosk", kioskSurface);

router.use("/employees", requireAdmin);
router.use("/timesheets", requireAuth);
router.use("/dashboard", requireAdmin);
router.use("/punches", requireAdmin);
router.use("/cost-codes", requireAdmin);
router.use("/leave-entries", requireAuth);

router.use(employeesRouter);
router.use(punchesRouter);
router.use(timesheetsRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(costCodesRouter);
router.use(amendmentsRouter);
router.use(leaveRouter);

export default router;
